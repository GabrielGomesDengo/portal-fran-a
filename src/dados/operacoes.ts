import { supabase } from '../lib/supabase'

export type Recebimento = {
  id?: string; pedido_id: string; plano_id: string | null; sku: string; lote: string | null
  qtd_planejada: number | null; qtd_recebida: number; data_fabricacao: string | null; validade: string | null
  data_recebimento: string; confirmado: boolean; usuario?: string | null
}
export async function listarRecebimentos(pedidoId: string): Promise<Recebimento[]> {
  const { data, error } = await supabase.from('recebimento').select('*').eq('pedido_id', pedidoId).order('sku').order('criado_em')
  if (error) throw error
  return (data ?? []) as Recebimento[]
}
export async function salvarRecebimentos(pedidoId: string, linhas: Recebimento[], usuario: string) {
  // O plano pode ter sido alterado pelo PCP enquanto esta tela estava aberta: vínculo a lote que não existe mais vira "lote extra".
  const { data: plano, error: e0 } = await supabase.from('plano_producao').select('id').eq('pedido_id', pedidoId)
  if (e0) throw e0
  const validos = new Set((plano ?? []).map((p) => p.id as string))
  linhas = linhas.map((l) => (l.plano_id && !validos.has(l.plano_id) ? { ...l, plano_id: null } : l))
  const { error: e1 } = await supabase.from('recebimento').delete().eq('pedido_id', pedidoId)
  if (e1) throw e1
  if (linhas.length === 0) return
  const { error } = await supabase.from('recebimento').insert(linhas.map(({ id: _i, ...l }) => ({ ...l, pedido_id: pedidoId, usuario })))
  if (error) throw error
}

export type PackingList = { id?: string; pedido_id: string; numero: string | null; data: string; tara_pallet_kg: number; tara_master_box_kg: number }
export type Pallet = { id?: string; numero: number; dimensoes: string | null; linhas: PalletLinha[] }
export type PalletLinha = { id?: string; sku: string; lote: string; qtd: number; caixas: number }

export async function carregarPackingList(pedidoId: string): Promise<{ pl: PackingList; pallets: Pallet[] } | null> {
  const { data: pl, error } = await supabase.from('packing_list').select('*').eq('pedido_id', pedidoId).maybeSingle()
  if (error) throw error
  if (!pl) return null
  const { data: pallets, error: e2 } = await supabase.from('packing_list_pallet').select('*, packing_list_linha(*)').eq('packing_list_id', pl.id).order('numero')
  if (e2) throw e2
  return { pl: pl as PackingList, pallets: (pallets ?? []).map((p) => ({ id: p.id, numero: p.numero, dimensoes: p.dimensoes, linhas: (p.packing_list_linha as PalletLinha[]).map((l) => ({ id: l.id, sku: l.sku, lote: l.lote, qtd: Number(l.qtd), caixas: Number(l.caixas) })) })) }
}
export async function salvarPackingList(pedidoId: string, pl: PackingList, pallets: Pallet[]) {
  const { data: salvo, error } = await supabase.from('packing_list').upsert({ ...pl, id: pl.id, pedido_id: pedidoId }, { onConflict: 'pedido_id' }).select('id').single()
  if (error) throw error
  const plId = salvo.id as string
  const { error: e2 } = await supabase.from('packing_list_pallet').delete().eq('packing_list_id', plId)
  if (e2) throw e2
  for (const p of pallets) {
    const { data: pal, error: e3 } = await supabase.from('packing_list_pallet').insert({ packing_list_id: plId, numero: p.numero, dimensoes: p.dimensoes }).select('id').single()
    if (e3) throw e3
    if (p.linhas.length === 0) continue
    const { error: e4 } = await supabase.from('packing_list_linha').insert(p.linhas.map((l) => ({ pallet_id: pal.id, sku: l.sku, lote: l.lote, qtd: l.qtd, caixas: l.caixas })))
    if (e4) throw e4
  }
}

export type Invoice = { id?: string; pedido_id: string; numero: string; data: string; due_date: string | null; incoterm: string; moeda: string; ptax: number | null; delivery_date: string | null; numero_packing_list: string | null; observacao: string | null }
export type InvoiceLinha = { id?: string; sku: string; lote: string; bbe: string | null; hs_code: string | null; qtd: number; caixas: number | null; peso_liq_kg: number | null; peso_bruto_kg: number | null; preco_eur: number | null; cogs_eur: number | null }
export type CreditNote = { invoice_linha_id: string; aceite_franca: boolean | null; valor_credito_eur: number | null }

export async function carregarInvoice(pedidoId: string): Promise<{ invoice: Invoice; linhas: InvoiceLinha[]; creditNotes: CreditNote[] } | null> {
  const { data: inv, error } = await supabase.from('invoice').select('*').eq('pedido_id', pedidoId).maybeSingle()
  if (error) throw error
  if (!inv) return null
  const { data: linhas, error: e2 } = await supabase.from('invoice_linha').select('*').eq('invoice_id', inv.id).order('sku').order('lote')
  if (e2) throw e2
  const ids = (linhas ?? []).map((l) => l.id)
  const { data: cns } = ids.length ? await supabase.from('credit_note').select('*').in('invoice_linha_id', ids) : { data: [] }
  return { invoice: inv as Invoice, linhas: (linhas ?? []) as InvoiceLinha[], creditNotes: (cns ?? []) as CreditNote[] }
}
export async function salvarInvoice(pedidoId: string, inv: Invoice, linhas: InvoiceLinha[], creditNotes: Map<string, CreditNote>) {
  const { data: salvo, error } = await supabase.from('invoice').upsert({ ...inv, id: inv.id, pedido_id: pedidoId }, { onConflict: 'pedido_id' }).select('id').single()
  if (error) throw error
  const invId = salvo.id as string
  const { error: e2 } = await supabase.from('invoice_linha').delete().eq('invoice_id', invId)
  if (e2) throw e2
  if (linhas.length === 0) return
  const { data: novas, error: e3 } = await supabase.from('invoice_linha').insert(linhas.map(({ id: _i, ...l }) => ({ ...l, invoice_id: invId }))).select('id, sku, lote')
  if (e3) throw e3
  const cn = (novas ?? []).map((n) => { const c = creditNotes.get(`${n.sku}|${n.lote}`); return c ? { invoice_linha_id: n.id as string, aceite_franca: c.aceite_franca, valor_credito_eur: c.valor_credito_eur } : null }).filter((x): x is { invoice_linha_id: string; aceite_franca: boolean | null; valor_credito_eur: number | null } => x !== null)
  if (cn.length) { const { error: e4 } = await supabase.from('credit_note').insert(cn); if (e4) throw e4 }
}
