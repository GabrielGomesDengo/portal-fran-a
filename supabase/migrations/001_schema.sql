-- =============================================================
-- Portal de Pedidos França — esquema base (Fase 0)
-- Datas de negócio em `date`; dinheiro em numeric; códigos = SAP.
-- =============================================================

create type perfil_acesso as enum ('franca', 'supply', 'pcp', 'operacoes', 'admin');

create type status_pedido as enum (
  'rascunho', 'enviado', 'em_validacao_supply', 'ajustado_supply', 'recusado_supply',
  'aguardando_fr', 'aprovado', 'cancelado', 'em_planejamento_pcp', 'plano_concluido',
  'em_recebimento', 'packing_list', 'invoice_gerada', 'concluido'
);

create type atendimento_pcp as enum ('sim', 'avaliar', 'nao');

-- ---------- usuários ----------
create table perfil_usuario (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  perfil perfil_acesso not null default 'franca',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create or replace function on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfil_usuario (user_id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function on_auth_user_created();

-- ---------- parâmetros ----------
create table parametro (
  chave text primary key,
  valor text not null,
  descricao text
);
insert into parametro values
  ('antecedencia_dias', '60', 'Dias mínimos entre o pedido e a data de embarque'),
  ('transit_dias', '3', 'Dias entre embarque na fábrica e chegada na França (sai 2ª, chega 4ª)'),
  ('lead_time_interno_dias', '0', 'Dias entre produção e embarque (qualidade, paletização) — a confirmar'),
  ('janela_portfolio_meses', '10', 'Meses de histórico que definem o portfólio ativo'),
  ('tara_pallet_kg', '15', 'Peso do pallet vazio'),
  ('tara_master_box_kg', '21', 'Master box + wrapping por pallet (5 + 16)'),
  ('dimensoes_pallet', '1,00 X 1,20 X 1,10', 'Dimensões padrão do pallet (m)'),
  ('incoterm', 'EXW', 'Incoterm padrão da invoice'),
  ('moeda_invoice', 'EUR', 'Moeda da invoice');

-- ---------- produtos ----------
create table produto (
  sku text primary key,                       -- código SAP
  descricao_br text not null,
  descricao_en text,
  descricao_fr text,
  familia text,
  categoria text,
  cost_type text,
  unidade text not null default 'Unit',       -- Unit | Kg
  multiplo_caixa numeric,                     -- unidades (ou kg) por caixa
  shelf_life_dias integer,                    -- fonte oficial: SAP
  shelf_life_dias_franca integer,             -- referência (PMD), gera alerta se divergir
  preco_interco_eur numeric,
  cogs_eur numeric,
  peso_liq_un_kg numeric,
  peso_bruto_caixa_kg numeric,
  hs_code text,
  ativo boolean not null default false,
  qtd_10_meses numeric,
  num_embarques_10_meses integer,
  ultimo_embarque date,
  atualizado_em timestamptz not null default now()
);

create table produto_codigo (
  sku text not null references produto(sku) on delete cascade,
  sistema text not null,                      -- 'fr_item' | 'fr_ordering_tool'
  codigo text not null,
  primary key (sku, sistema)
);

-- ---------- contract date ----------
create table contract_date_regra (
  versao integer not null,
  shelf_life_dias integer not null,
  minimo_dias_chegada integer not null,
  vigente boolean not null default true,
  primary key (versao, shelf_life_dias)
);
insert into contract_date_regra (versao, shelf_life_dias, minimo_dias_chegada) values
  (1, 90, 63), (1, 120, 77), (1, 150, 91), (1, 180, 105), (1, 210, 119), (1, 365, 196);

-- Espelho SQL de src/dominio/contractDate.ts (mesma regra proporcional).
create or replace function minimo_dias_chegada(p_shelf integer, p_versao integer default null)
returns integer language plpgsql stable as $$
declare
  v integer; r_exata integer; lo record; hi record; frac numeric;
begin
  if p_shelf is null or p_shelf <= 0 then return null; end if;
  v := coalesce(p_versao, (select max(versao) from contract_date_regra where vigente));
  select minimo_dias_chegada into r_exata from contract_date_regra where versao = v and shelf_life_dias = p_shelf;
  if found then return r_exata; end if;
  select * into lo from contract_date_regra where versao = v and shelf_life_dias < p_shelf order by shelf_life_dias desc limit 1;
  select * into hi from contract_date_regra where versao = v and shelf_life_dias > p_shelf order by shelf_life_dias asc limit 1;
  if lo is null and hi is null then return null; end if;
  if lo is null then return ceil(p_shelf::numeric * hi.minimo_dias_chegada / hi.shelf_life_dias); end if;
  if hi is null then return ceil(p_shelf::numeric * lo.minimo_dias_chegada / lo.shelf_life_dias); end if;
  frac := (p_shelf - lo.shelf_life_dias)::numeric / (hi.shelf_life_dias - lo.shelf_life_dias);
  return ceil(lo.minimo_dias_chegada + frac * (hi.minimo_dias_chegada - lo.minimo_dias_chegada));
end $$;

-- ---------- pedido ----------
create sequence pedido_numero_seq start 1;
create table pedido (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique default 'FR-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('pedido_numero_seq')::text, 4, '0'),
  po_franca text,
  criado_por uuid not null references auth.users(id),
  data_embarque date not null,
  transit_dias integer not null default 3,
  data_chegada_fr date generated always as (data_embarque + transit_dias) stored,
  contract_versao integer not null default 1,
  status status_pedido not null default 'rascunho',
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table pedido_item (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedido(id) on delete cascade,
  sku text not null references produto(sku),
  qtd_solicitada numeric not null check (qtd_solicitada >= 0),
  qtd_aprovada numeric,                       -- preenchido por Supply
  caixas_solicitadas numeric,
  preco_eur numeric,                          -- congelado na data do pedido
  observacao text,
  unique (pedido_id, sku)
);

create table pedido_evento (
  id bigserial primary key,
  pedido_id uuid not null references pedido(id) on delete cascade,
  de_status status_pedido,
  para_status status_pedido not null,
  usuario uuid references auth.users(id),
  motivo text,
  criado_em timestamptz not null default now()
);

create table pedido_alteracao (
  id bigserial primary key,
  pedido_id uuid not null references pedido(id) on delete cascade,
  sku text,
  campo text not null,
  valor_antigo text,
  valor_novo text,
  usuario uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

-- ---------- plano de produção (PCP) ----------
create table plano_producao (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedido(id) on delete cascade,
  sku text not null references produto(sku),
  lote_seq integer not null default 1,
  atendimento atendimento_pcp,
  qtd_planejada numeric,
  semana_producao integer,                    -- semana ISO
  data_producao date,
  motivo text,
  unique (pedido_id, sku, lote_seq)
);

-- ---------- recebimento (Operações) ----------
create table recebimento (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedido(id) on delete cascade,
  sku text not null references produto(sku),
  lote text,
  qtd_recebida numeric not null,
  data_fabricacao date,
  validade date,
  data_recebimento date not null default current_date,
  usuario uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

-- ---------- packing list / invoice ----------
create table packing_list (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedido(id) on delete cascade,
  numero text,
  data date not null default current_date,
  tara_pallet_kg numeric not null default 15,
  tara_master_box_kg numeric not null default 21
);
create table packing_list_pallet (
  id uuid primary key default gen_random_uuid(),
  packing_list_id uuid not null references packing_list(id) on delete cascade,
  numero integer not null,
  dimensoes text,
  unique (packing_list_id, numero)
);
create table packing_list_linha (
  id uuid primary key default gen_random_uuid(),
  pallet_id uuid not null references packing_list_pallet(id) on delete cascade,
  sku text not null references produto(sku),
  lote text not null,
  qtd numeric not null,
  caixas numeric not null,
  peso_liq_un_kg numeric,
  peso_bruto_caixa_kg numeric
);

create table invoice (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedido(id) on delete cascade,
  numero text not null,
  data date not null default current_date,
  due_date date,
  incoterm text not null default 'EXW',
  moeda text not null default 'EUR',
  ptax numeric,
  delivery_date date,
  criado_em timestamptz not null default now()
);
create table invoice_linha (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoice(id) on delete cascade,
  sku text not null references produto(sku),
  lote text not null,
  bbe date,
  hs_code text,
  qtd numeric not null,
  caixas numeric,
  peso_liq_kg numeric,
  peso_bruto_kg numeric,
  preco_eur numeric,
  cogs_eur numeric
);
create table credit_note (
  invoice_linha_id uuid primary key references invoice_linha(id) on delete cascade,
  aceite_franca boolean,
  valor_credito_eur numeric
);

-- ---------- estoque por lote (import SAP, aba BBE) ----------
create table lote_estoque (
  sku text not null references produto(sku),
  lote text not null,
  qtd numeric,
  unidade text,
  fabricacao date,
  validade date,
  importado_em timestamptz not null default now(),
  primary key (sku, lote)
);

-- ---------- histórico de embarques (NFs SAP) ----------
create table embarque_historico (
  id bigserial primary key,
  nf text not null,
  data_nf date not null,
  sku text not null,
  descricao text,
  lote text,
  producao date,
  vencimento date,
  qtd numeric,
  shelf_life_dias integer
);

-- ---------- updated_at ----------
create or replace function set_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;
create trigger pedido_atualizado before update on pedido for each row execute function set_atualizado_em();
create trigger produto_atualizado before update on produto for each row execute function set_atualizado_em();
