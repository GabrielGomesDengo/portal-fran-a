-- Fase 3 (PCP): parâmetros da janela de produção e permissão do PCP para reabrir o plano.
insert into parametro values
  ('lead_time_estoque_dias', '1', 'Dias entre a produção e a disponibilidade no estoque (desce em D+1)'),
  ('antecedencia_estoque_dias', '7', 'Dias antes do embarque em que o item precisa estar no estoque')
on conflict (chave) do update set valor = excluded.valor, descricao = excluded.descricao;
delete from parametro where chave = 'lead_time_interno_dias';

drop policy "editar pedido" on pedido;
create policy "editar pedido" on pedido for update
  using (
    sou('{supply,admin}')
    or (sou('{franca}') and status in ('rascunho','aguardando_fr','recusado_supply'))
    or (sou('{pcp}') and status in ('aprovado','em_planejamento_pcp','plano_concluido'))
    or (sou('{operacoes}') and status in ('plano_concluido','em_recebimento','packing_list','invoice_gerada'))
  )
  with check (auth.uid() is not null);
