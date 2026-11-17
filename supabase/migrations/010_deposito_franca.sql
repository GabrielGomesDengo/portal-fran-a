-- Depósito SAP onde a Operação coloca a produção do pedido da França.
-- O recebimento lê o relatório de estoque desse depósito (saldo disponível = recebido).
insert into parametro values
  ('deposito_expedicao_franca', '', 'Depósito SAP da França: o recebimento usa o saldo deste depósito no relatório de estoque')
on conflict (chave) do nothing;
