-- =============================================================
-- Itens sazonais (Páscoa e Natal) liberados só em campanhas.
--  * produto.sazonalidade: subcategoria sazonal (null = item regular)
--  * campanha: janela de pedidos + janela de embarque por subcategoria
--  * trigger: a França não consegue incluir item sazonal fora de campanha
--    aberta (Supply/Admin podem, ex.: ajuste de pedido)
-- =============================================================

alter table produto add column if not exists sazonalidade text check (sazonalidade in ('pascoa', 'natal'));

-- Classificação inicial pela família (nomenclatura atual do cadastro: "SAZONAL - NATAL", "SAZONAL - PASCOA";
-- nomes antigos do PMD como reserva). Itens de outras famílias com cara de sazonal NÃO entram aqui:
-- ficam para o admin confirmar (Campanhas, Portfólio ou coluna Sazonal da tabela mestre).
update produto set sazonalidade = 'pascoa'
where upper(trim(familia)) in ('SAZONAL - PASCOA', 'SAZONAL - PÁSCOA', 'PASCOA', 'PÁSCOA')
   or trim(familia) in ('Classic Egg', 'MINI QQ EGG', 'QQ Egg', 'Stuffed EGG');
update produto set sazonalidade = 'natal'
where upper(trim(familia)) in ('SAZONAL - NATAL', 'NATAL')
   or trim(familia) in ('CHRISTMAS TO GO', 'PANETTONE CLASSIQUE', 'PANETTONE CUBES', 'PANETTONE GARNIS', 'PANETTONE QQ', 'TREE ORNAMENT');

-- SKU novo ou que muda para uma família "SAZONAL - ..." já entra na subcategoria (só preenche se estiver vazia).
create or replace function sazonal_pela_familia() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.sazonalidade is null and (tg_op = 'INSERT' or new.familia is distinct from old.familia) then
    new.sazonalidade := case
      when upper(trim(new.familia)) in ('SAZONAL - PASCOA', 'SAZONAL - PÁSCOA', 'PASCOA', 'PÁSCOA') then 'pascoa'
      when upper(trim(new.familia)) in ('SAZONAL - NATAL', 'NATAL') then 'natal'
    end;
  end if;
  return new;
end $$;
create trigger sazonal_pela_familia before insert or update on produto for each row execute function sazonal_pela_familia();

create table campanha (
  id uuid primary key default gen_random_uuid(),
  sazonalidade text not null check (sazonalidade in ('pascoa', 'natal')),
  nome text not null,
  pedidos_de date not null,
  pedidos_ate date not null,
  embarque_de date,
  embarque_ate date,
  observacao text,
  criado_por uuid references auth.users(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  check (pedidos_ate >= pedidos_de),
  check (embarque_ate is null or embarque_de is null or embarque_ate >= embarque_de)
);
create index on campanha (sazonalidade, pedidos_de, pedidos_ate);

alter table campanha enable row level security;
create policy "ler campanhas" on campanha for select using (auth.uid() is not null);
create policy "admin e supply campanhas" on campanha for all using (sou('{admin,supply}')) with check (sou('{admin,supply}'));

-- Item sazonal liberado? (mesma regra do portal, em src/dominio/campanhas.ts)
create or replace function item_sazonal_liberado(p_sku text, p_embarque date) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when (select sazonalidade from produto where sku = p_sku) is null then true
    else exists (
      select 1 from campanha c
      where c.sazonalidade = (select sazonalidade from produto where sku = p_sku)
        and (now() at time zone 'America/Sao_Paulo')::date between c.pedidos_de and c.pedidos_ate
        and (c.embarque_de is null or p_embarque >= c.embarque_de)
        and (c.embarque_ate is null or p_embarque <= c.embarque_ate))
  end
$$;

create or replace function validar_item_sazonal() returns trigger
language plpgsql security definer set search_path = public as $$
declare emb date; saz text;
begin
  if not sou('{franca}') then return new; end if;
  if tg_op = 'UPDATE' and new.sku = old.sku and new.qtd_solicitada <= old.qtd_solicitada then return new; end if;
  select data_embarque into emb from pedido where id = new.pedido_id;
  if not item_sazonal_liberado(new.sku, emb) then
    select sazonalidade into saz from produto where sku = new.sku;
    raise exception 'O item % é sazonal (%) e só pode ser pedido durante uma campanha aberta, com embarque dentro da janela da campanha.',
      new.sku, case saz when 'pascoa' then 'Páscoa' else 'Natal' end;
  end if;
  return new;
end $$;
create trigger validar_item_sazonal before insert or update on pedido_item for each row execute function validar_item_sazonal();

-- Auditoria também das campanhas
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
    when 'campanha' then array['id']
  end
$$;
create trigger auditar_campanha after insert or update or delete on campanha for each row execute function auditar();

revoke all on function validar_item_sazonal() from public, anon, authenticated;
revoke all on function item_sazonal_liberado(text, date) from public, anon;
grant execute on function item_sazonal_liberado(text, date) to authenticated;
