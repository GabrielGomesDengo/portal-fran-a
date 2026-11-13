-- Fase de ajustes 1: modal de envio (aéreo/marítimo) e pedido fora do prazo.
alter table pedido
  add column modal text not null default 'aereo' check (modal in ('aereo','maritimo')),
  add column antecedencia_dias integer,
  add column fora_prazo boolean not null default false,
  add column justificativa_prazo text;

update pedido set antecedencia_dias = data_embarque - criado_em::date where antecedencia_dias is null;

insert into parametro values
  ('transit_dias_maritimo', '28', 'Marítimo: dias entre embarque no Brasil e chegada na França (4 semanas)'),
  ('antecedencia_estoque_dias_maritimo', '12', 'Marítimo: dias antes do embarque em que a carga precisa estar no estoque'),
  ('antecedencia_dias_maritimo', '60', 'Marítimo: antecedência mínima do pedido (dias)'),
  ('dimensoes_pallet_maritimo', '1,00 X 1,20 X 1,70', 'Marítimo: dimensões do pallet (m)'),
  ('tara_master_box_kg_maritimo', '0', 'Marítimo: sem master box'),
  ('tara_pallet_kg_maritimo', '21', 'Marítimo: peso do pallet (kg)')
on conflict (chave) do nothing;
