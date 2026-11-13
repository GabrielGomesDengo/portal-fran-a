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

/**
 * Salva o plano preservando o ID de cada lote existente. Antes o plano era apagado e
 * regravado, o que trocava os IDs e quebrava o vínculo com o recebimento (FK plano_id).
 */
export async function salvarPlano(pedidoId: string, lotes: LotePlano[]): Promise<LotePlano[]> {
  const { data: atuais, error: e0 } = await supabase.from('plano_producao').select('id').eq('pedido_id', pedidoId)
  if (e0) throw e0
  const manter = new Set(lotes.filter((l) => l.id).map((l) => l.id!))
  const remover = (atuais ?? []).map((a) => a.id as string).filter((id) => !manter.has(id))
  if (remover.length) {
    const { error } = await supabase.from('plano_producao').delete().in('id', remover)
    if (error) throw error
  }
  const campos = (l: LotePlano) => ({ pedido_id: pedidoId, sku: l.sku, lote_seq: l.lote_seq, atendimento: l.atendimento, qtd_planejada: l.qtd_planejada, semana_producao: l.semana_producao, data_producao: l.data_producao, motivo: l.motivo })
  // lote_seq é único por (pedido, sku): atualiza primeiro com seq temporária para evitar colisão ao renumerar
  const existentes = lotes.filter((l) => l.id)
  for (const l of existentes) {
    const { error } = await supabase.from('plano_producao').update({ lote_seq: -l.lote_seq - 1000 }).eq('id', l.id!)
    if (error) throw error
  }
  for (const l of existentes) {
    const { data, error } = await supabase.from('plano_producao').update(campos(l)).eq('id', l.id!).select('id')
    if (error) throw error
    if (!data?.length) throw new Error('Sem permissão para alterar o plano de produção.')
  }
  const novos = lotes.filter((l) => !l.id)
  if (novos.length) {
    const { error } = await supabase.from('plano_producao').insert(novos.map(campos))
    if (error) throw error
  }
  return listarPlano(pedidoId)
}
