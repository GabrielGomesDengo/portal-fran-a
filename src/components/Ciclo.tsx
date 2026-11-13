import { ETAPAS, calcularCiclo, type EventoCiclo } from '../dominio/ciclo'
import { fmtData, fmtNum } from '../lib/formatos'
import type { Pedido } from '../tipos/dominio'

const fmtDias = (d: number | undefined) => (d === undefined ? '—' : d < 1 ? `${Math.max(1, Math.round(d * 24))} h` : `${fmtNum(d, 1)} d`)

/** Selo de antecedência: verde no prazo, âmbar quando o pedido foi colocado com atraso. */
export function SeloPrazo({ pedido, minimo }: { pedido: Pedido; minimo?: number }) {
  if (pedido.antecedencia_dias === null) return null
  return pedido.fora_prazo
    ? <span className="pill bg-alerta/15 text-alerta" title={pedido.justificativa_prazo ?? ''}>colocado com atraso · {pedido.antecedencia_dias} d{minimo ? ` de ${minimo}` : ''}</span>
    : <span className="pill bg-ok/15 text-ok">no prazo · {pedido.antecedencia_dias} d</span>
}

/** Indicador interno do ciclo: tempo em cada etapa, dias no ciclo e até o embarque. */
export function IndicadorCiclo({ pedido, eventos, minimo }: { pedido: Pedido; eventos: EventoCiclo[]; minimo: number }) {
  const c = calcularCiclo(eventos, pedido.criado_em, pedido.data_embarque)
  const atualIdx = ETAPAS.findIndex((e) => e.chave === c.etapaAtual)
  return (
    <section className="cartao space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Ciclo do pedido</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <SeloPrazo pedido={pedido} minimo={minimo} />
          <span className="pill bg-fundo">{fmtNum(c.diasNoCiclo, 1)} dias no ciclo</span>
          {!c.cancelado && c.etapaAtual !== 'embarcado' && <span className={`pill ${c.diasAteEmbarque < 0 ? 'bg-erro/15 text-erro' : c.diasAteEmbarque <= 14 ? 'bg-alerta/15 text-alerta' : 'bg-fundo'}`}>{c.diasAteEmbarque < 0 ? `embarque passou há ${-c.diasAteEmbarque} d` : `${c.diasAteEmbarque} dias até o embarque`}</span>}
        </div>
      </div>
      {pedido.fora_prazo && pedido.justificativa_prazo && <p className="rounded-md bg-alerta/10 p-2 text-sm"><b>Justificativa da França:</b> {pedido.justificativa_prazo}</p>}
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {ETAPAS.map((e, i) => { const feito = i < atualIdx || c.etapaAtual === 'embarcado'; const atual = i === atualIdx && c.etapaAtual !== 'embarcado'; return (
          <li key={e.chave} className={`rounded-lg border p-2 ${atual ? 'border-marca bg-marca/15' : feito ? 'border-ok/30 bg-ok/5' : 'border-linha'}`}>
            <div className="text-xs font-semibold">{feito ? '✓ ' : ''}{e.rotulo}</div>
            <div className="text-lg font-semibold tabular-nums">{fmtDias(c.dias[e.chave])}</div>
            <div className="text-xs text-tinta-3">{c.entrada[e.chave] ? `desde ${fmtData(c.entrada[e.chave]!.slice(0, 10))}` : 'pendente'}</div>
          </li>) })}
      </ol>
    </section>
  )
}

/** Rastreio para o cliente: linha do tempo vertical com datas e descrição da etapa atual. */
export function Rastreio({ pedido, eventos }: { pedido: Pedido; eventos: EventoCiclo[] }) {
  const c = calcularCiclo(eventos, pedido.criado_em, pedido.data_embarque)
  if (c.cancelado) return <div className="cartao border-erro/40 bg-erro/5"><p className="font-semibold text-erro">Pedido cancelado</p></div>
  const atualIdx = ETAPAS.findIndex((e) => e.chave === c.etapaAtual)
  return (
    <ol className="cartao relative space-y-0">
      {ETAPAS.map((e, i) => {
        const feito = i < atualIdx || c.etapaAtual === 'embarcado'; const atual = i === atualIdx && c.etapaAtual !== 'embarcado'
        return (
          <li key={e.chave} className="relative flex gap-4 pb-5 last:pb-0">
            {i < ETAPAS.length - 1 && <span className={`absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5 ${feito ? 'bg-ok' : 'bg-linha'}`} aria-hidden />}
            <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${feito ? 'bg-ok text-white' : atual ? 'bg-marca text-tinta ring-4 ring-marca/30' : 'bg-linha/70 text-tinta-3'}`}>{feito ? '✓' : i + 1}</span>
            <div className="pt-1">
              <div className={`font-semibold ${!feito && !atual ? 'text-tinta-3' : ''}`}>{e.rotulo}{atual && <span className="pill ml-2 bg-marca">agora</span>}</div>
              {(feito || atual) && c.entrada[e.chave] && <div className="text-xs text-tinta-3">{new Date(c.entrada[e.chave]!).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</div>}
              {atual && <p className="mt-1 text-sm text-tinta-2">{e.descricao}</p>}
            </div>
          </li>)
      })}
    </ol>
  )
}

/** Mini barra de progresso (6 pontos) para listas. */
export function ProgressoMini({ pedido, eventos }: { pedido: Pedido; eventos: EventoCiclo[] }) {
  const c = calcularCiclo(eventos, pedido.criado_em, pedido.data_embarque)
  const idx = c.etapaAtual === 'embarcado' ? ETAPAS.length : ETAPAS.findIndex((e) => e.chave === c.etapaAtual)
  return (
    <div className="flex items-center gap-1" aria-label={`Etapa ${idx + 1} de ${ETAPAS.length}`}>
      {ETAPAS.map((e, i) => <span key={e.chave} title={e.rotulo} className={`h-1.5 flex-1 rounded-full ${c.cancelado ? 'bg-erro/30' : i < idx ? 'bg-ok' : i === idx ? 'bg-marca' : 'bg-linha'}`} />)}
    </div>
  )
}
