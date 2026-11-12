import { supabase } from '../lib/supabase'

export type Atendimento = 'sim' | 'avaliar' | 'nao'
export type LotePlano = {
  id?: string; pedido_id: string; sku: string; lote_seq: number
  atendimento: Atendimento | null; qtd_planejada: number | null; semana_producao: number | null; data_producao: string | null; motivo: string | null
}

export async function listarPlano(pedidoId: string): Promise<LotePlano[]> {
  const { data, error } = await supabase.from('plano_producao').select('*').eq('pedido_id', pedidoId).order('sku').order('lote_seq')
  if (error) throw error
  return (data ?? []) as LotePlano[]
}

/** Substitui o plano inteiro do pedido (apaga e regrava). */
export async function salvarPlano(pedidoId: string, lotes: LotePlano[]) {
  const { error: e1 } = await supabase.from('plano_producao').delete().eq('pedido_id', pedidoId)
  if (e1) throw e1
  if (lotes.length === 0) return
  const { error } = await supabase.from('plano_producao').insert(lotes.map(({ id: _id, ...l }) => ({ ...l, pedido_id: pedidoId })))
  if (error) throw error
}
