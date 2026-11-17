import { baseDaTabela, type Base } from '../../../manutencao/bases'
import { fmtData } from '../../../lib/formatos'

export function rotuloCampo(base: Base | undefined, campo: string) {
  return base?.colunas.find((c) => c.campo === campo)?.rotulo ?? campo
}

export function fmtValor(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (v === 'true') return 'Sim'
  if (v === 'false') return 'Não'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtData(v)
  if (typeof v === 'number') return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(v)
  return String(v)
}

export function nomeTabela(tabela: string) {
  return baseDaTabela(tabela)?.nome ?? (tabela === 'perfil_usuario' ? 'Usuários' : tabela)
}

export function rotuloChave(chave: Record<string, unknown>) {
  return Object.values(chave).filter((v) => v !== '' && v !== null).join(' · ')
}

const COR: Record<string, string> = {
  novo: 'bg-ok/15 text-ok', alterado: 'bg-alerta/15 text-alerta', igual: 'bg-fundo text-tinta-3', erro: 'bg-erro/15 text-erro',
  ignorado: 'bg-fundo text-tinta-3 line-through', removido: 'bg-erro/10 text-erro',
}
const ROTULO: Record<string, string> = { novo: 'Novo', alterado: 'Alterado', igual: 'Sem mudança', erro: 'Erro', ignorado: 'Ignorado', removido: 'Removido' }
export function Etiqueta({ acao }: { acao: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${COR[acao] ?? 'bg-fundo'}`}>{ROTULO[acao] ?? acao}</span>
}
export const ROTULO_ACAO = ROTULO

export function Diferencas({ base, itens }: { base?: Base; itens: { campo: string; antes: unknown; depois: unknown }[] }) {
  if (!itens.length) return <span className="text-tinta-3">—</span>
  return (
    <ul className="space-y-0.5">
      {itens.map((d) => (
        <li key={d.campo} className="text-xs">
          <span className="font-semibold">{rotuloCampo(base, d.campo)}:</span>{' '}
          <span className="text-tinta-3 line-through decoration-tinta-3/50">{fmtValor(d.antes)}</span>{' → '}
          <span className="font-medium">{fmtValor(d.depois)}</span>
        </li>
      ))}
    </ul>
  )
}
