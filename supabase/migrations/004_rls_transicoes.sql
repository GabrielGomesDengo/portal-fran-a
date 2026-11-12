-- A política "editar pedido" não tinha WITH CHECK, então o USING valia também para a linha
-- nova: a França não conseguia mudar aguardando_fr → aprovado, nem o PCP concluir o plano.
-- Agora: USING controla QUEM pode mexer (pelo status atual); WITH CHECK só exige login.
drop policy "editar pedido" on pedido;
create policy "editar pedido" on pedido for update
  using (
    sou('{supply,admin}')
    or (sou('{franca}') and status in ('rascunho','aguardando_fr','recusado_supply'))
    or (sou('{pcp}') and status in ('aprovado','em_planejamento_pcp'))
    or (sou('{operacoes}') and status in ('plano_concluido','em_recebimento','packing_list','invoice_gerada'))
  )
  with check (auth.uid() is not null);

drop policy "editar itens" on pedido_item;
create policy "editar itens" on pedido_item for all
  using (
    sou('{supply,admin}') or (sou('{franca}') and exists (
      select 1 from pedido p where p.id = pedido_id and p.status in ('rascunho','aguardando_fr')))
  )
  with check (
    sou('{supply,admin}') or (sou('{franca}') and exists (
      select 1 from pedido p where p.id = pedido_id and p.status in ('rascunho','enviado','aguardando_fr')))
  );
