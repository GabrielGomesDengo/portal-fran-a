import { supabase } from '../lib/supabase'
import type { FaixaContractDate } from '../dominio/contractDate'

export async function carregarTabelaContract(): Promise<{ versao: number; tabela: FaixaContractDate[] }> {
  const { data, error } = await supabase.from('contract_date_regra').select('*').eq('vigente', true).order('versao', { ascending: false }).order('shelf_life_dias')
  if (error) throw error
  const versao = data?.[0]?.versao ?? 1
  const tabela = (data ?? []).filter((r) => r.versao === versao).map((r) => ({ shelfLifeDias: r.shelf_life_dias, minimoDiasChegada: r.minimo_dias_chegada }))
  return { versao, tabela }
}
