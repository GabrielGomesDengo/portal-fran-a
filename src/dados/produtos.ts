import { supabase } from '../lib/supabase'
import type { Produto } from '../tipos/dominio'

export async function listarProdutos(apenasAtivos = false): Promise<Produto[]> {
  let q = supabase.from('produto').select('*').order('familia').order('descricao_br')
  if (apenasAtivos) q = q.eq('ativo', true)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Produto[]
}
export async function salvarProduto(sku: string, campos: Partial<Produto>) {
  const { error } = await supabase.from('produto').update(campos).eq('sku', sku)
  if (error) throw error
}
