import { supabase } from '../lib/supabase'
import type { Pedido, PedidoItem, StatusPedido } from '../tipos/dominio'

export type ItemCarrinho = { sku: string; qtd: number; caixas: number; preco_eur: number | null }

export async function listarPedidos(): Promise<Pedido[]> {
  const { data, error } = await supabase.from('pedido').select('*').order('criado_em', { ascending: false })
  if (error) throw error
  return (data ?? []) as Pedido[]
}

export async function carregarPedido(id: string): Promise<{ pedido: Pedido; itens: PedidoItem[] }> {
  const [{ data: pedido, error: e1 }, { data: itens, error: e2 }] = await Promise.all([
    supabase.from('pedido').select('*').eq('id', id).single(),
    supabase.from('pedido_item').select('*').eq('pedido_id', id).order('sku'),
  ])
  if (e1) throw e1
  if (e2) throw e2
  return { pedido: pedido as Pedido, itens: (itens ?? []) as PedidoItem[] }
}

/** Cria o pedido já com os itens e o marca como enviado (gera evento). */
export async function criarPedido(args: {
  userId: string; dataEmbarque: string; transitDias: number; contractVersao: number;
  poFranca: string | null; observacao: string | null; itens: ItemCarrinho[]
}): Promise<Pedido> {
  const { data: pedido, error } = await supabase.from('pedido').insert({
    criado_por: args.userId, data_embarque: args.dataEmbarque, transit_dias: args.transitDias,
    contract_versao: args.contractVersao, po_franca: args.poFranca, observacao: args.observacao, status: 'enviado',
  }).select('*').single()
  if (error) throw error
  const p = pedido as Pedido
  const { error: e2 } = await supabase.from('pedido_item').insert(args.itens.map((i) => ({
    pedido_id: p.id, sku: i.sku, qtd_solicitada: i.qtd, caixas_solicitadas: i.caixas, preco_eur: i.preco_eur,
  })))
  if (e2) throw e2
  await registrarEvento(p.id, null, 'enviado', args.userId, null)
  return p
}

export async function registrarEvento(pedidoId: string, de: StatusPedido | null, para: StatusPedido, usuario: string, motivo: string | null) {
  const { error } = await supabase.from('pedido_evento').insert({ pedido_id: pedidoId, de_status: de, para_status: para, usuario, motivo })
  if (error) throw error
}

export async function mudarStatus(pedido: Pedido, para: StatusPedido, usuario: string, motivo: string | null = null) {
  const { error } = await supabase.from('pedido').update({ status: para }).eq('id', pedido.id)
  if (error) throw error
  await registrarEvento(pedido.id, pedido.status, para, usuario, motivo)
}

export async function listarEventos(pedidoId: string) {
  const { data, error } = await supabase.from('pedido_evento').select('*').eq('pedido_id', pedidoId).order('criado_em')
  if (error) throw error
  return data ?? []
}
