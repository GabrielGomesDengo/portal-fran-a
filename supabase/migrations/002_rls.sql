-- =============================================================
-- RLS: cada perfil só enxerga e mexe no que lhe cabe.
-- =============================================================
create or replace function meu_perfil() returns perfil_acesso
language sql stable security definer set search_path = public as $$
  select perfil from perfil_usuario where user_id = auth.uid() and ativo
$$;
create or replace function sou(p perfil_acesso[]) returns boolean
language sql stable as $$ select meu_perfil() = any(p) $$;

alter table perfil_usuario enable row level security;
create policy "ver perfil" on perfil_usuario for select using (user_id = auth.uid() or sou('{admin}'));
create policy "admin edita perfis" on perfil_usuario for update using (sou('{admin}'));

alter table parametro enable row level security;
create policy "ler parametros" on parametro for select using (auth.uid() is not null);
create policy "admin parametros" on parametro for all using (sou('{admin}'));

alter table produto enable row level security;
create policy "ler produtos" on produto for select using (auth.uid() is not null);
create policy "admin e supply editam produtos" on produto for all using (sou('{admin,supply}'));

alter table produto_codigo enable row level security;
create policy "ler codigos" on produto_codigo for select using (auth.uid() is not null);
create policy "admin codigos" on produto_codigo for all using (sou('{admin}'));

alter table contract_date_regra enable row level security;
create policy "ler regras" on contract_date_regra for select using (auth.uid() is not null);
create policy "admin regras" on contract_date_regra for all using (sou('{admin}'));

alter table pedido enable row level security;
create policy "ler pedidos" on pedido for select using (auth.uid() is not null);
create policy "fr cria pedido" on pedido for insert with check (sou('{franca,supply,admin}') and criado_por = auth.uid());
create policy "editar pedido" on pedido for update using (
  sou('{supply,admin}') or (sou('{franca}') and status in ('rascunho','aguardando_fr'))
  or (sou('{pcp}') and status in ('aprovado','em_planejamento_pcp'))
  or (sou('{operacoes}') and status in ('plano_concluido','em_recebimento','packing_list','invoice_gerada'))
);

alter table pedido_item enable row level security;
create policy "ler itens" on pedido_item for select using (auth.uid() is not null);
create policy "editar itens" on pedido_item for all using (
  sou('{supply,admin}') or (sou('{franca}') and exists (
    select 1 from pedido p where p.id = pedido_id and p.status in ('rascunho','aguardando_fr')))
);

alter table pedido_evento enable row level security;
create policy "ler eventos" on pedido_evento for select using (auth.uid() is not null);
create policy "gravar eventos" on pedido_evento for insert with check (auth.uid() is not null);

alter table pedido_alteracao enable row level security;
create policy "ler alteracoes" on pedido_alteracao for select using (auth.uid() is not null);
create policy "gravar alteracoes" on pedido_alteracao for insert with check (auth.uid() is not null);

alter table plano_producao enable row level security;
create policy "ler plano" on plano_producao for select using (auth.uid() is not null);
create policy "pcp edita plano" on plano_producao for all using (sou('{pcp,admin}'));

alter table recebimento enable row level security;
create policy "ler recebimento" on recebimento for select using (auth.uid() is not null);
create policy "operacoes recebe" on recebimento for all using (sou('{operacoes,admin}'));

alter table packing_list enable row level security;
alter table packing_list_pallet enable row level security;
alter table packing_list_linha enable row level security;
alter table invoice enable row level security;
alter table invoice_linha enable row level security;
alter table credit_note enable row level security;
create policy "ler pl" on packing_list for select using (auth.uid() is not null);
create policy "ops pl" on packing_list for all using (sou('{operacoes,admin}'));
create policy "ler pallet" on packing_list_pallet for select using (auth.uid() is not null);
create policy "ops pallet" on packing_list_pallet for all using (sou('{operacoes,admin}'));
create policy "ler pl linha" on packing_list_linha for select using (auth.uid() is not null);
create policy "ops pl linha" on packing_list_linha for all using (sou('{operacoes,admin}'));
create policy "ler invoice" on invoice for select using (auth.uid() is not null);
create policy "ops invoice" on invoice for all using (sou('{operacoes,admin}'));
create policy "ler invoice linha" on invoice_linha for select using (auth.uid() is not null);
create policy "ops invoice linha" on invoice_linha for all using (sou('{operacoes,admin}'));
create policy "ler credit note" on credit_note for select using (auth.uid() is not null);
create policy "ops credit note" on credit_note for all using (sou('{operacoes,supply,admin}'));

alter table lote_estoque enable row level security;
create policy "ler lotes" on lote_estoque for select using (auth.uid() is not null);
create policy "ops lotes" on lote_estoque for all using (sou('{operacoes,admin}'));

alter table embarque_historico enable row level security;
create policy "ler historico" on embarque_historico for select using (auth.uid() is not null);
create policy "admin historico" on embarque_historico for all using (sou('{admin}'));
