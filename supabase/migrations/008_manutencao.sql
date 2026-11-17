-- =============================================================
-- Manutenção de bases (somente admin)
--  * importacao / importacao_linha: cada carga vira um lote com foto
--    "antes" e "depois" de cada linha, o que permite desfazer.
--  * auditoria: toda alteração de cadastro (manual ou por carga),
--    campo a campo, com usuário, data e origem.
--  * importar_base(): aplica a carga inteira em uma transação; se
--    uma linha falhar, nada é gravado.
-- =============================================================

-- Chave natural para o histórico de NFs (permite atualizar uma NF recarregada)
alter table embarque_historico alter column lote set default '';
update embarque_historico set lote = '' where lote is null;
alter table embarque_historico alter column lote set not null;
alter table embarque_historico add constraint embarque_historico_chave unique (nf, sku, lote);
alter table embarque_historico add column if not exists importado_em timestamptz not null default now();

-- ---------- cargas ----------
create table importacao (
  id bigserial primary key,
  base text not null,
  tabela text not null,
  modo text not null check (modo in ('atualizar', 'substituir')),
  arquivo text,
  observacao text,
  usuario uuid references auth.users(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  novos integer not null default 0,
  alterados integer not null default 0,
  removidos integer not null default 0,
  iguais integer not null default 0,
  desfeita_em timestamptz,
  desfeita_por uuid references auth.users(id)
);
create index on importacao (tabela, criado_em desc);

create table importacao_linha (
  id bigserial primary key,
  importacao_id bigint not null references importacao(id) on delete cascade,
  chave jsonb not null,
  acao text not null check (acao in ('novo', 'alterado', 'removido')),
  antes jsonb,
  depois jsonb
);
create index on importacao_linha (importacao_id);

-- ---------- auditoria ----------
create table auditoria (
  id bigserial primary key,
  tabela text not null,
  chave jsonb not null,
  acao text not null,                 -- insert | update | delete
  campo text,                         -- null em insert/delete
  valor_antigo text,
  valor_novo text,
  usuario uuid default auth.uid(),
  importacao_id bigint references importacao(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index on auditoria (tabela, criado_em desc);
create index on auditoria using gin (chave);

-- Chave primária de cada tabela auditável/importável
create or replace function chave_da_tabela(p_tabela text) returns text[]
language sql immutable set search_path = public as $$
  select case p_tabela
    when 'produto' then array['sku']
    when 'produto_codigo' then array['sku', 'sistema']
    when 'parametro' then array['chave']
    when 'contract_date_regra' then array['versao', 'shelf_life_dias']
    when 'lote_estoque' then array['sku', 'lote']
    when 'embarque_historico' then array['nf', 'sku', 'lote']
    when 'perfil_usuario' then array['user_id']
  end
$$;

create or replace function auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k text[] := chave_da_tabela(tg_table_name);
  novo jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  velho jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  base jsonb := coalesce(novo, velho);
  ch jsonb := '{}'; c text; imp bigint;
begin
  foreach c in array k loop ch := ch || jsonb_build_object(c, base -> c); end loop;
  imp := nullif(current_setting('portal.importacao', true), '')::bigint;
  if tg_op = 'UPDATE' then
    insert into auditoria (tabela, chave, acao, campo, valor_antigo, valor_novo, importacao_id)
    select tg_table_name, ch, 'update', n.key, velho ->> n.key, n.value #>> '{}', imp
    from jsonb_each(novo) n
    where n.key not in ('atualizado_em', 'importado_em') and (velho -> n.key) is distinct from n.value;
  else
    insert into auditoria (tabela, chave, acao, valor_antigo, valor_novo, importacao_id)
    values (tg_table_name, ch, lower(tg_op),
            case when tg_op = 'DELETE' then velho::text end,
            case when tg_op = 'INSERT' then novo::text end, imp);
  end if;
  return null;
end $$;

create trigger auditar_produto after insert or update or delete on produto for each row execute function auditar();
create trigger auditar_produto_codigo after insert or update or delete on produto_codigo for each row execute function auditar();
create trigger auditar_parametro after insert or update or delete on parametro for each row execute function auditar();
create trigger auditar_contract after insert or update or delete on contract_date_regra for each row execute function auditar();
create trigger auditar_perfil after update on perfil_usuario for each row execute function auditar();

-- ---------- aplicar uma carga ----------
-- p_linhas: array de objetos já validados no portal (campo → valor).
-- Campos ausentes no objeto ficam como estão (modo atualizar).
-- modo 'substituir': o que não vier na carga é removido (bases "foto", ex. estoque).
create or replace function importar_base(
  p_base text, p_tabela text, p_modo text, p_linhas jsonb, p_arquivo text default null, p_observacao text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  k text[] := chave_da_tabela(p_tabela);
  imp bigint; linha jsonb; ch jsonb; antes jsonb; depois jsonb; mescla jsonb;
  cols text[]; cond text; c text;
  n_novo int := 0; n_alt int := 0; n_rem int := 0; n_igual int := 0;
begin
  if not sou('{admin}') then raise exception 'Somente o admin pode importar bases.'; end if;
  if k is null or p_tabela not in ('produto', 'produto_codigo', 'parametro', 'contract_date_regra', 'lote_estoque', 'embarque_historico') then
    raise exception 'Tabela % não pode ser importada.', p_tabela;
  end if;
  if p_modo not in ('atualizar', 'substituir') then raise exception 'Modo inválido: %', p_modo; end if;
  -- Cadastros referenciados por pedidos nunca são substituídos por inteiro.
  if p_modo = 'substituir' and p_tabela not in ('lote_estoque', 'embarque_historico', 'produto_codigo') then
    raise exception 'A base % só aceita o modo atualizar.', p_tabela;
  end if;

  insert into importacao (base, tabela, modo, arquivo, observacao) values (p_base, p_tabela, p_modo, p_arquivo, p_observacao) returning id into imp;
  perform set_config('portal.importacao', imp::text, true);

  create temp table if not exists _chaves_carga (chave jsonb primary key) on commit drop;
  truncate _chaves_carga;

  for linha in select * from jsonb_array_elements(p_linhas) loop
    ch := '{}';
    foreach c in array k loop
      if linha -> c is null or linha ->> c is null then raise exception 'Linha sem o campo-chave "%": %', c, linha; end if;
      ch := ch || jsonb_build_object(c, linha -> c);
    end loop;
    insert into _chaves_carga values (ch) on conflict do nothing;
    if not found then raise exception 'Chave repetida na carga: %', ch; end if;

    cond := (select string_agg(format('%I::text = %L', x, ch ->> x), ' and ') from unnest(k) x);
    execute format('select to_jsonb(t) from %I t where %s', p_tabela, cond) into antes;

    mescla := coalesce(antes, '{}') || linha;
    select array_agg(key) into cols from jsonb_object_keys(mescla) key
      where key in (select column_name from information_schema.columns where table_schema = 'public' and table_name = p_tabela and is_generated = 'NEVER')
        and key not in ('atualizado_em', 'importado_em');
    if antes is not null and antes - 'atualizado_em' - 'importado_em' = (antes || linha) - 'atualizado_em' - 'importado_em' then
      n_igual := n_igual + 1; continue;
    end if;

    execute format(
      'insert into %1$I (%2$s) select %2$s from jsonb_populate_record(null::%1$I, $1) on conflict (%3$s) do update set %4$s',
      p_tabela,
      (select string_agg(format('%I', x), ',') from unnest(cols) x),
      (select string_agg(format('%I', x), ',') from unnest(k) x),
      coalesce((select string_agg(format('%1$I = excluded.%1$I', x), ',') from unnest(cols) x where x <> all(k)), format('%1$I = excluded.%1$I', k[1]))
        || case when p_tabela = 'produto' then ', atualizado_em = now()' when p_tabela in ('lote_estoque', 'embarque_historico') then ', importado_em = now()' else '' end
    ) using mescla;

    execute format('select to_jsonb(t) from %I t where %s', p_tabela, cond) into depois;
    insert into importacao_linha (importacao_id, chave, acao, antes, depois)
      values (imp, ch, case when antes is null then 'novo' else 'alterado' end, antes, depois);
    if antes is null then n_novo := n_novo + 1; else n_alt := n_alt + 1; end if;
  end loop;

  if p_modo = 'substituir' then
    for antes in execute format('select to_jsonb(t) from %I t', p_tabela) loop
      ch := '{}';
      foreach c in array k loop ch := ch || jsonb_build_object(c, antes -> c); end loop;
      if not exists (select 1 from _chaves_carga where chave = ch) then
        cond := (select string_agg(format('%I::text = %L', x, ch ->> x), ' and ') from unnest(k) x);
        execute format('delete from %I where %s', p_tabela, cond);
        insert into importacao_linha (importacao_id, chave, acao, antes) values (imp, ch, 'removido', antes);
        n_rem := n_rem + 1;
      end if;
    end loop;
  end if;

  update importacao set novos = n_novo, alterados = n_alt, removidos = n_rem, iguais = n_igual where id = imp;
  return imp;
end $$;

-- ---------- desfazer uma carga ----------
-- Só a carga mais recente (não desfeita) de cada tabela, para não pisar em cargas posteriores.
create or replace function desfazer_importacao(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  imp importacao; l importacao_linha; cond text; cols text[]; k text[];
begin
  if not sou('{admin}') then raise exception 'Somente o admin pode desfazer cargas.'; end if;
  select * into imp from importacao where id = p_id for update;
  if imp.id is null then raise exception 'Carga % não encontrada.', p_id; end if;
  if imp.desfeita_em is not null then raise exception 'Esta carga já foi desfeita.'; end if;
  if exists (select 1 from importacao where tabela = imp.tabela and id > imp.id and desfeita_em is null) then
    raise exception 'Existe uma carga mais recente nesta base. Desfaça a mais recente primeiro.';
  end if;
  k := chave_da_tabela(imp.tabela);
  perform set_config('portal.importacao', imp.id::text, true);

  for l in select * from importacao_linha where importacao_id = p_id order by id desc loop
    cond := (select string_agg(format('%I::text = %L', x, l.chave ->> x), ' and ') from unnest(k) x);
    if l.acao = 'novo' then
      execute format('delete from %I where %s', imp.tabela, cond);
    else
      select array_agg(key) into cols from jsonb_object_keys(l.antes) key
        where key in (select column_name from information_schema.columns where table_schema = 'public' and table_name = imp.tabela and is_generated = 'NEVER');
      execute format(
        'insert into %1$I (%2$s) select %2$s from jsonb_populate_record(null::%1$I, $1) on conflict (%3$s) do update set %4$s',
        imp.tabela,
        (select string_agg(format('%I', x), ',') from unnest(cols) x),
        (select string_agg(format('%I', x), ',') from unnest(k) x),
        coalesce((select string_agg(format('%1$I = excluded.%1$I', x), ',') from unnest(cols) x where x <> all(k)), format('%1$I = excluded.%1$I', k[1]))
      ) using l.antes;
    end if;
  end loop;
  update importacao set desfeita_em = now(), desfeita_por = auth.uid() where id = p_id;
end $$;

-- ---------- acesso ----------
alter table importacao enable row level security;
alter table importacao_linha enable row level security;
alter table auditoria enable row level security;
create policy "admin le cargas" on importacao for select using (sou('{admin}'));
create policy "admin le linhas de carga" on importacao_linha for select using (sou('{admin}'));
create policy "admin le auditoria" on auditoria for select using (sou('{admin}'));
-- Gravação só pelas funções acima (security definer); nenhuma política de escrita.

revoke all on function importar_base(text, text, text, jsonb, text, text) from public, anon;
revoke all on function desfazer_importacao(bigint) from public, anon;
revoke all on function auditar() from public, anon, authenticated;
grant execute on function importar_base(text, text, text, jsonb, text, text) to authenticated;
grant execute on function desfazer_importacao(bigint) to authenticated;

-- Resumo das bases para o painel (contagem + última carga)
create or replace function resumo_bases() returns table (tabela text, linhas bigint, ultima_carga timestamptz, ultima_carga_id bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not sou('{admin}') then raise exception 'Somente o admin.'; end if;
  return query
  select t.tabela, t.linhas,
    (select max(i.criado_em) from importacao i where i.tabela = t.tabela and i.desfeita_em is null),
    (select max(i.id) from importacao i where i.tabela = t.tabela and i.desfeita_em is null)
  from (values
    ('produto', (select count(*) from produto)), ('produto_codigo', (select count(*) from produto_codigo)),
    ('parametro', (select count(*) from parametro)), ('contract_date_regra', (select count(*) from contract_date_regra)),
    ('lote_estoque', (select count(*) from lote_estoque)), ('embarque_historico', (select count(*) from embarque_historico))
  ) t(tabela, linhas);
end $$;
revoke all on function resumo_bases() from public, anon;
grant execute on function resumo_bases() to authenticated;
