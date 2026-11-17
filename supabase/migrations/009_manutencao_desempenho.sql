-- Desempenho: as colunas da tabela são lidas uma vez por carga (e não a cada linha),
-- para cargas grandes (estoque, histórico de NFs) caberem no tempo limite da API.
create or replace function importar_base(
  p_base text, p_tabela text, p_modo text, p_linhas jsonb, p_arquivo text default null, p_observacao text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  k text[] := chave_da_tabela(p_tabela);
  imp bigint; linha jsonb; ch jsonb; antes jsonb; depois jsonb; mescla jsonb;
  cols text[]; cond text; c text; validas text[];
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

  select array_agg(column_name::text) into validas from information_schema.columns
    where table_schema = 'public' and table_name = p_tabela and is_generated = 'NEVER';

  cond := (select string_agg(format('t.%1$I = r.%1$I', x), ' and ') from unnest(k) x);

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

    execute format('select to_jsonb(t) from %1$I t, jsonb_populate_record(null::%1$I, $1) r where %2$s', p_tabela, cond) into antes using ch;

    mescla := coalesce(antes, '{}') || linha;
    select array_agg(key) into cols from jsonb_object_keys(mescla) key
      where key = any(validas) and key not in ('atualizado_em', 'importado_em');
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

    execute format('select to_jsonb(t) from %1$I t, jsonb_populate_record(null::%1$I, $1) r where %2$s', p_tabela, cond) into depois using ch;
    insert into importacao_linha (importacao_id, chave, acao, antes, depois)
      values (imp, ch, case when antes is null then 'novo' else 'alterado' end, antes, depois);
    if antes is null then n_novo := n_novo + 1; else n_alt := n_alt + 1; end if;
  end loop;

  if p_modo = 'substituir' then
    for antes in execute format('select to_jsonb(t) from %I t', p_tabela) loop
      ch := '{}';
      foreach c in array k loop ch := ch || jsonb_build_object(c, antes -> c); end loop;
      if not exists (select 1 from _chaves_carga where chave = ch) then
        execute format('delete from %1$I t using jsonb_populate_record(null::%1$I, $1) r where %2$s', p_tabela, cond) using ch;
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
  imp importacao; l importacao_linha; cond text; cols text[]; k text[]; validas text[];
begin
  if not sou('{admin}') then raise exception 'Somente o admin pode desfazer cargas.'; end if;
  select * into imp from importacao where id = p_id for update;
  if imp.id is null then raise exception 'Carga % não encontrada.', p_id; end if;
  if imp.desfeita_em is not null then raise exception 'Esta carga já foi desfeita.'; end if;
  if exists (select 1 from importacao where tabela = imp.tabela and id > imp.id and desfeita_em is null) then
    raise exception 'Existe uma carga mais recente nesta base. Desfaça a mais recente primeiro.';
  end if;
  k := chave_da_tabela(imp.tabela);
  select array_agg(column_name::text) into validas from information_schema.columns
    where table_schema = 'public' and table_name = imp.tabela and is_generated = 'NEVER';
  perform set_config('portal.importacao', imp.id::text, true);

  cond := (select string_agg(format('t.%1$I = r.%1$I', x), ' and ') from unnest(k) x);

  for l in select * from importacao_linha where importacao_id = p_id order by id desc loop
    if l.acao = 'novo' then
      execute format('delete from %1$I t using jsonb_populate_record(null::%1$I, $1) r where %2$s', imp.tabela, cond) using l.chave;
    else
      select array_agg(key) into cols from jsonb_object_keys(l.antes) key
        where key = any(validas);
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

