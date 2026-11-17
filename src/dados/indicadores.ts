import { supabase } from '../lib/supabase'
import { listarPedidos, listarTodosEventos, listarTodosItens } from './pedidos'
import { listarProdutos } from './produtos'
import { carregarParametros } from './parametros'
import { carregarTabelaContract } from './contractDate'
import type { Pedido, PedidoItem, Produto, StatusPedido } from '../tipos/dominio'
import type { FaixaContractDate } from '../dominio/contractDate'

export type InvoiceResumo = { id: string; pedido_id: string; numero: string; data: string; delivery_date: string | null; linhas: { sku: string; lote: string; bbe: string | null; qtd: number; preco_eur: number | null }[] }
export type BaseIndicadores = {
  pedidos: Pedido[]; itens: PedidoItem[]; produtos: Produto[]; params: Record<string, string>; contract: FaixaContractDate[]
  eventos: { pedido_id: string; para_status: StatusPedido; criado_em: string }[]
  plano: { pedido_id: string; sku: string; atendimento: string | null; qtd_planejada: number | null; data_producao: string | null }[]
  recebimentos: { pedido_id: string; sku: string; lote: string | null; qtd_recebida: number; validade: string | null; data_recebimento: string; qtd_planejada: number | null }[]
  invoices: InvoiceResumo[]
}

export async function carregarBaseIndicadores(): Promise<BaseIndicadores> {
  const [pedidos, itens, produtos, params, c, eventos, plano, rec, inv] = await Promise.all([
    listarPedidos(), listarTodosItens(), listarProdutos(), carregarParametros(), carregarTabelaContract(), listarTodosEventos(),
    supabase.from('plano_producao').select('pedido_id, sku, atendimento, qtd_planejada, data_producao'),
    supabase.from('recebimento').select('pedido_id, sku, lote, qtd_recebida, validade, data_recebimento, qtd_planejada'),
    supabase.from('invoice').select('id, pedido_id, numero, data, delivery_date, invoice_linha(sku, lote, bbe, qtd, preco_eur)'),
  ])
  for (const r of [plano, rec, inv]) if (r.error) throw r.error
  return {
    pedidos, itens, produtos, params, contract: c.tabela, eventos,
    plano: (plano.data ?? []) as BaseIndicadores['plano'],
    recebimentos: ((rec.data ?? []) as BaseIndicadores['recebimentos']).map((r) => ({ ...r, qtd_recebida: Number(r.qtd_recebida) })),
    invoices: (inv.data ?? []).map((i) => ({ id: i.id, pedido_id: i.pedido_id, numero: i.numero, data: i.data, delivery_date: i.delivery_date,
      linhas: ((i.invoice_linha ?? []) as InvoiceResumo['linhas']).map((l) => ({ ...l, qtd: Number(l.qtd) })) })),
  }
}
