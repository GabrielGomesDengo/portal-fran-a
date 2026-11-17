import { supabase } from '../lib/supabase'
import type { Base, Modo } from '../manutencao/bases'

/** Lê a tabela inteira (paginando de 1000 em 1000, limite da API). */
export async function lerTabela(base: Base): Promise<Record<string, unknown>[]> {
  const todas: Record<string, unknown>[] = []
  for (let de = 0; ; de += 1000) {
    let q = supabase.from(base.tabela).select('*')
    for (const c of base.ordenarPor) q = q.order(c, { nullsFirst: false })
    for (const k of base.chave) q = q.order(k)
    const { data, error } = await q.range(de, de + 999)
    if (error) throw error
    todas.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return todas
}

export async function importarBase(base: Base, modo: Modo, linhas: Record<string, unknown>[], arquivo: string, observacao: string): Promise<number> {
  const { data, error } = await supabase.rpc('importar_base', {
    p_base: base.id, p_tabela: base.tabela, p_modo: modo, p_linhas: linhas, p_arquivo: arquivo, p_observacao: observacao || null,
  })
  if (error) throw new Error(error.message)
  return data as number
}

export async function desfazerCarga(id: number) {
  const { error } = await supabase.rpc('desfazer_importacao', { p_id: id })
  if (error) throw new Error(error.message)
}

export type ResumoBase = { tabela: string; linhas: number; ultima_carga: string | null; ultima_carga_id: number | null }
export async function resumoBases(): Promise<ResumoBase[]> {
  const { data, error } = await supabase.rpc('resumo_bases')
  if (error) throw error
  return data as ResumoBase[]
}

export type Carga = {
  id: number; base: string; tabela: string; modo: Modo; arquivo: string | null; observacao: string | null
  usuario: string | null; criado_em: string; novos: number; alterados: number; removidos: number; iguais: number
  desfeita_em: string | null; desfeita_por: string | null
}
export async function listarCargas(limite = 100): Promise<Carga[]> {
  const { data, error } = await supabase.from('importacao').select('*').order('id', { ascending: false }).limit(limite)
  if (error) throw error
  return data as Carga[]
}

export type LinhaCarga = { id: number; chave: Record<string, unknown>; acao: 'novo' | 'alterado' | 'removido'; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null }
export async function linhasDaCarga(id: number): Promise<LinhaCarga[]> {
  const { data, error } = await supabase.from('importacao_linha').select('id, chave, acao, antes, depois').eq('importacao_id', id).order('id').limit(5000)
  if (error) throw error
  return data as LinhaCarga[]
}

export type RegistroAuditoria = {
  id: number; tabela: string; chave: Record<string, unknown>; acao: string; campo: string | null
  valor_antigo: string | null; valor_novo: string | null; usuario: string | null; importacao_id: number | null; criado_em: string
}
export async function listarAuditoria(f: { tabela?: string; busca?: string; origem?: 'manual' | 'carga' | ''; limite?: number }): Promise<RegistroAuditoria[]> {
  let q = supabase.from('auditoria').select('*').order('id', { ascending: false }).limit(f.limite ?? 300)
  if (f.tabela) q = q.eq('tabela', f.tabela)
  if (f.origem === 'manual') q = q.is('importacao_id', null)
  if (f.origem === 'carga') q = q.not('importacao_id', 'is', null)
  if (f.busca?.trim()) {
    const b = f.busca.trim()
    const k = f.tabela === 'parametro' ? 'chave' : 'sku'
    q = q.contains('chave', { [k]: b })
  }
  const { data, error } = await q
  if (error) throw error
  return data as RegistroAuditoria[]
}

export async function nomesUsuarios(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('perfil_usuario').select('user_id, nome')
  if (error) throw error
  return Object.fromEntries((data ?? []).map((u) => [u.user_id, u.nome]))
}

export async function skusCadastrados(): Promise<Set<string>> {
  const { data, error } = await supabase.from('produto').select('sku')
  if (error) throw error
  return new Set((data ?? []).map((p) => p.sku))
}
