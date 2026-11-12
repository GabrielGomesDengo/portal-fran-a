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

// ---------------- Supply: edição com trilha de alterações ----------------

export type Alteracao = { id: number; sku: string | null; campo: string; valor_antigo: string | null; valor_novo: string | null; usuario: string | null; criado_em: string }

export async function listarAlteracoes(pedidoId: string): Promise<Alteracao[]> {
  const { data, error } = await supabase.from('pedido_alteracao').select('*').eq('pedido_id', pedidoId).order('criado_em')
  if (error) throw error
  return (data ?? []) as Alteracao[]
}

async function logar(pedidoId: string, usuario: string, sku: string | null, campo: string, de: unknown, para: unknown) {
  const s = (v: unknown) => (v === null || v === undefined ? null : String(v))
  if (s(de) === s(para)) return
  const { error } = await supabase.from('pedido_alteracao').insert({ pedido_id: pedidoId, usuario, sku, campo, valor_antigo: s(de), valor_novo: s(para) })
  if (error) throw error
}

export type EdicaoSupply = {
  dataEmbarque: string
  observacao: string | null
  itens: { sku: string; qtd_aprovada: number; observacao: string | null }[]   // lista final (inclui novos)
}

/** Aplica as edições do Supply e grava cada diferença em pedido_alteracao. Devolve se houve mudança. */
export async function aplicarEdicaoSupply(pedido: Pedido, itensAtuais: PedidoItem[], ed: EdicaoSupply, usuario: string): Promise<boolean> {
  let mudou = false
  if (ed.dataEmbarque !== pedido.data_embarque || (ed.observacao ?? '') !== (pedido.observacao ?? '')) {
    const { error } = await supabase.from('pedido').update({ data_embarque: ed.dataEmbarque, observacao: ed.observacao }).eq('id', pedido.id)
    if (error) throw error
    await logar(pedido.id, usuario, null, 'data_embarque', pedido.data_embarque, ed.dataEmbarque)
    await logar(pedido.id, usuario, null, 'observacao', pedido.observacao, ed.observacao)
    mudou = mudou || ed.dataEmbarque !== pedido.data_embarque
  }
  const atuais = new Map(itensAtuais.map((i) => [i.sku, i]))
  for (const it of ed.itens) {
    const a = atuais.get(it.sku)
    if (!a) {
      const { error } = await supabase.from('pedido_item').insert({ pedido_id: pedido.id, sku: it.sku, qtd_solicitada: 0, qtd_aprovada: it.qtd_aprovada, observacao: it.observacao })
      if (error) throw error
      await logar(pedido.id, usuario, it.sku, 'item_incluido', null, it.qtd_aprovada); mudou = true
    } else {
      const antes = a.qtd_aprovada ?? a.qtd_solicitada
      if (antes !== it.qtd_aprovada || (a.observacao ?? '') !== (it.observacao ?? '')) {
        const { error } = await supabase.from('pedido_item').update({ qtd_aprovada: it.qtd_aprovada, observacao: it.observacao }).eq('id', a.id)
        if (error) throw error
        await logar(pedido.id, usuario, it.sku, 'quantidade', antes, it.qtd_aprovada)
        if (antes !== it.qtd_aprovada) mudou = true
      }
      atuais.delete(it.sku)
    }
  }
  for (const [sku, a] of atuais) {
    const { error } = await supabase.from('pedido_item').delete().eq('id', a.id)
    if (error) throw error
    await logar(pedido.id, usuario, sku, 'item_removido', a.qtd_aprovada ?? a.qtd_solicitada, null); mudou = true
  }
  return mudou
}
