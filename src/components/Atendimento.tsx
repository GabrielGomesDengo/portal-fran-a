import type { LinhaAtendimento, ResumoAtendimento, SituacaoLinha } from '../dominio/atendimento'
import { fmtEur, fmtNum } from '../lib/formatos'
import { t, tp, localeAtual } from '../i18n/idioma'

export const pct = (v: number | null | undefined, casas = 0) => (v === null || v === undefined ? '—' : `${(v * 100).toLocaleString(localeAtual(), { maximumFractionDigits: casas })}%`)
export const corPct = (v: number | null | undefined) => (v === null || v === undefined ? 'text-tinta-3' : v >= 0.98 ? 'text-ok' : v >= 0.9 ? 'text-alerta' : 'text-erro')
const fundoPct = (v: number | null) => (v === null ? 'bg-linha' : v >= 0.98 ? 'bg-ok' : v >= 0.9 ? 'bg-alerta' : 'bg-erro')

export function BarraPct({ v, largura = 'w-24' }: { v: number | null; largura?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-1.5 ${largura} overflow-hidden rounded-full bg-linha`}><span className={`block h-1.5 rounded-full ${fundoPct(v)}`} style={{ width: `${Math.min(1, v ?? 0) * 100}%` }} /></span>
      <span className={`w-12 text-right text-sm font-semibold tabular-nums ${corPct(v)}`}>{pct(v)}</span>
    </span>
  )
}

const SIT: Record<SituacaoLinha, [string, string]> = {
  total: ['Atendido', 'bg-ok/15 text-ok'], parcial: ['Parcial', 'bg-alerta/15 text-alerta'], nao_atendido: ['Não atendido', 'bg-erro/15 text-erro'],
  excedente: ['Acima do pedido', 'bg-marca/30 text-tinta'], andamento: ['Em produção', 'bg-marca/25 text-tinta'], pendente: ['Aguardando', 'bg-linha text-tinta-3'], incluido: ['Incluído', 'bg-marca/30 text-tinta'],
}
export function PillSituacao({ s }: { s: SituacaoLinha }) { return <span className={`pill whitespace-nowrap ${SIT[s][1]}`}>{t(SIT[s][0])}</span> }

const FONTE = { nota: 'atendido em nota (invoice)', estoque: 'prévia pelo estoque (invoice ainda não emitida)', pendente: 'sem atendimento ainda' } as const
export const ROTULO_FONTE = { get nota() { return t(FONTE.nota) }, get estoque() { return t(FONTE.estoque) }, get pendente() { return t(FONTE.pendente) } }

/** Cartões do resumo: volume, SKUs e valor atendidos. */
export function CartoesAtendimento({ r, extra }: { r: ResumoAtendimento; extra?: { rotulo: string; valor: string; detalhe?: string; cor?: string }[] }) {
  const cards = [
    { rotulo: t('Atendimento em volume'), valor: pct(r.fillRateVolume, 1), cor: corPct(r.fillRateVolume), detalhe: t('{a} de {b} un/kg', { a: fmtNum(Math.round(r.volumeAtendido)), b: fmtNum(Math.round(r.volumeSolicitado)) }) },
    { rotulo: t('Produtos 100% atendidos'), valor: pct(r.fillRateSku, 1), cor: corPct(r.fillRateSku), detalhe: t('{a} de {b} · {p} parciais · {n} não atendidos', { a: r.skusAtendidosTotal, b: r.skusSolicitados, p: r.skusParciais, n: r.skusNaoAtendidos }) },
    { rotulo: t('Atendimento em valor'), valor: pct(r.fillRateValor, 1), cor: corPct(r.fillRateValor), detalhe: t('{a} de {b}', { a: fmtEur(r.valorAtendido), b: fmtEur(r.valorSolicitado) }) },
    ...(extra ?? []),
  ]
  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${cards.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
      {cards.map((c) => <div key={c.rotulo} className="cartao"><div className="rotulo">{c.rotulo}</div><div className={`mt-1 text-3xl font-semibold tabular-nums ${c.cor ?? ''}`}>{c.valor}</div>{c.detalhe && <div className="mt-0.5 text-xs text-tinta-3">{c.detalhe}</div>}</div>)}
    </div>
  )
}

/** Tabela linha a linha: pedido × atendido. Interno mostra também aprovado, planejado, recebido e faturado. */
export function TabelaAtendimento({ linhas, nome, interno }: { linhas: LinhaAtendimento[]; nome: (sku: string) => string; interno?: boolean }) {
  const soma = (f: (l: LinhaAtendimento) => number) => linhas.reduce((s, l) => s + f(l), 0)
  const fonte = linhas[0]?.fonte ?? 'pendente'
  return (
    <div className="overflow-x-auto">
      <table className="grade">
        <thead><tr>
          <th>{t('Produto')}</th><th className="text-right">{t('Pedido')}</th>
          {interno && <><th className="text-right">{t('Aprovado')}</th><th className="text-right">{t('Planejado')}</th><th className="text-right">{t('Recebido')}</th></>}
          <th className="text-right">{fonte === 'estoque' ? t('No estoque') : t('Atendido em nota')}</th><th className="text-right">{t('Diferença')}</th><th>{t('% atendido')}</th><th>{t('Situação')}</th>
          <th className="text-right">{t('Valor pedido')}</th><th className="text-right">{t('Valor atendido')}</th>
        </tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.sku} className={l.fonte !== 'nota' ? '' : l.situacao === 'nao_atendido' ? 'bg-erro/5' : l.situacao === 'parcial' ? 'bg-alerta/5' : ''}>
              <td className="min-w-48"><div className="font-medium leading-tight">{nome(l.sku)}</div><div className="font-mono text-xs text-tinta-3">{l.sku}</div></td>
              <td className="text-right tabular-nums">{fmtNum(l.solicitado, 3)}</td>
              {interno && <><td className="text-right tabular-nums">{fmtNum(l.aprovado, 3)}</td><td className="text-right tabular-nums">{fmtNum(l.planejado, 3)}</td><td className="text-right tabular-nums">{fmtNum(l.recebido, 3)}</td></>}
              <td className="text-right font-semibold tabular-nums">{l.fonte === 'pendente' ? '—' : fmtNum(l.atendido, 3)}</td>
              <td className={`text-right tabular-nums ${l.fonte === 'estoque' ? 'text-tinta-3' : l.diferenca < 0 ? 'text-erro' : l.diferenca > 0 ? 'text-tinta-2' : 'text-tinta-3'}`}>{l.fonte === 'pendente' ? '—' : `${l.diferenca > 0 ? '+' : ''}${fmtNum(l.diferenca, 3)}`}</td>
              <td>{l.fonte === 'pendente' ? '—' : l.fonte === 'estoque' ? <span className="text-sm tabular-nums text-tinta-2">{pct(l.pct)}</span> : <BarraPct v={l.pct} largura="w-16" />}</td>
              <td><PillSituacao s={l.situacao} /></td>
              <td className="text-right tabular-nums">{fmtEur(l.valorSolicitado)}</td>
              <td className="text-right tabular-nums">{l.fonte === 'pendente' ? '—' : fmtEur(l.valorAtendido)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="font-semibold">
          <td>{t('Total')} ({tp(linhas.length, '{n} produto', '{n} produtos')})</td><td className="text-right tabular-nums">{fmtNum(soma((l) => l.solicitado), 3)}</td>
          {interno && <><td className="text-right tabular-nums">{fmtNum(soma((l) => l.aprovado), 3)}</td><td className="text-right tabular-nums">{fmtNum(soma((l) => l.planejado), 3)}</td><td className="text-right tabular-nums">{fmtNum(soma((l) => l.recebido), 3)}</td></>}
          <td className="text-right tabular-nums">{fonte === 'pendente' ? '—' : fmtNum(soma((l) => l.atendido), 3)}</td><td className="text-right tabular-nums">{fonte === 'pendente' ? '—' : fmtNum(soma((l) => l.diferenca), 3)}</td><td colSpan={2} />
          <td className="text-right tabular-nums">{fmtEur(soma((l) => l.valorSolicitado))}</td><td className="text-right tabular-nums">{fonte === 'pendente' ? '—' : fmtEur(soma((l) => l.valorAtendido))}</td>
        </tr></tfoot>
      </table>
    </div>
  )
}
