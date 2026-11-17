// =============================================================
// Tradução PT → FR. A chave é o próprio texto em português; sem
// tradução cadastrada, o texto sai em português. Placeholders: {n}.
// =============================================================
import { FR } from './fr'

export type Idioma = 'pt' | 'fr'
const CHAVE = 'portal-franca.idioma'

function inicial(): Idioma {
  try { const v = globalThis.localStorage?.getItem(CHAVE); return v === 'fr' ? 'fr' : 'pt' } catch { return 'pt' }
}
let atual: Idioma = inicial()
if (typeof document !== 'undefined') document.documentElement.lang = atual === 'fr' ? 'fr' : 'pt-BR'

/** Já existe uma escolha salva neste navegador? */
export function temPreferencia(): boolean {
  try { return !!globalThis.localStorage?.getItem(CHAVE) } catch { return false }
}

export const idiomaAtual = () => atual
export const localeAtual = () => (atual === 'fr' ? 'fr-FR' : 'pt-BR')
export function definirIdioma(i: Idioma) {
  atual = i
  try { globalThis.localStorage?.setItem(CHAVE, i) } catch { /* modo privado: só vale nesta sessão */ }
  if (typeof document !== 'undefined') document.documentElement.lang = i === 'fr' ? 'fr' : 'pt-BR'
}

export function t(texto: string, vars?: Record<string, string | number>): string {
  let s = atual === 'fr' ? FR[texto] ?? texto : texto
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}

/** Singular/plural com o número no texto: tp(3, '{n} produto', '{n} produtos'). */
export const tp = (n: number, um: string, varios: string) => t(n === 1 ? um : varios, { n })

/** Nome do produto no idioma: em francês usa a descrição do cadastro da França quando existe. */
export const nomeProduto = (p: { descricao_br: string; descricao_fr?: string | null } | undefined, fallback = '') =>
  !p ? fallback : atual === 'fr' && p.descricao_fr ? p.descricao_fr : p.descricao_br
