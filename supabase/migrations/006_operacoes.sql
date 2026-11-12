-- Fase 4 (Operações): recebimento ligado ao lote do plano, com confirmação explícita.
alter table recebimento
  add column plano_id uuid references plano_producao(id) on delete set null,
  add column qtd_planejada numeric,
  add column confirmado boolean not null default false;
alter table invoice add column numero_packing_list text, add column observacao text;
alter table invoice add constraint invoice_pedido_unico unique (pedido_id);
alter table packing_list add constraint packing_list_pedido_unico unique (pedido_id);
