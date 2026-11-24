import { supabase } from '../lib/supabase'
import type { Campanha } from '../dominio/campanhas'

/** Lista as campanhas. Se a tabela ainda não existir no banco, devolve lista vazia (portal segue funcionando). */
export async function listarCampanhas(): Promise<Campanha[]> {
  const { data, error } = await supabase.from('campanha').select('*').order('pedidos_de', { ascending: false })
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) return []
    throw error
  }
  return (data ?? []) as Campanha[]
}

export async function salvarCampanha(c: Omit<Campanha, 'id'> & { id?: string }): Promise<Campanha> {
  const campos = {
    sazonalidade: c.sazonalidade, nome: c.nome.trim(), pedidos_de: c.pedidos_de, pedidos_ate: c.pedidos_ate,
    embarque_de: c.embarque_de || null, embarque_ate: c.embarque_ate || null, observacao: c.observacao?.trim() || null,
  }
  const q = c.id ? supabase.from('campanha').update(campos).eq('id', c.id) : supabase.from('campanha').insert(campos)
  const { data, error } = await q.select('*').single()
  if (error) throw error
  return data as Campanha
}

export async function excluirCampanha(id: string) {
  const { error } = await supabase.from('campanha').delete().eq('id', id)
  if (error) throw error
}
