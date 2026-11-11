import { supabase } from '../lib/supabase'

export type Parametros = Record<string, string>

export async function carregarParametros(): Promise<Parametros> {
  const { data, error } = await supabase.from('parametro').select('chave, valor')
  if (error) throw error
  return Object.fromEntries((data ?? []).map((p) => [p.chave, p.valor]))
}
export function numero(p: Parametros, chave: string, padrao: number): number {
  const v = Number(p[chave])
  return Number.isFinite(v) ? v : padrao
}
export async function salvarParametro(chave: string, valor: string) {
  const { error } = await supabase.from('parametro').update({ valor }).eq('chave', chave)
  if (error) throw error
}
