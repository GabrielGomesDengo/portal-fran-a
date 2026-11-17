import type { Atualizacao, Marco } from '../dominio/rastreio'
import { fmtData } from '../lib/formatos'

/** Linha do tempo vertical com 9 marcos; o atual mostra o detalhe (ex.: progresso da produção). */
export function Marcos({ marcos }: { marcos: Marco[] }) {
  return (
    <ol className="cartao">
      {marcos.map((m, i) => {
        const feito = m.estado === 'feito', atual = m.estado === 'atual'
        return (
          <li key={m.chave} className="relative flex gap-3 pb-4 last:pb-0">
            {i < marcos.length - 1 && <span className={`absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5 ${feito ? 'bg-ok' : 'bg-linha'}`} aria-hidden />}
            <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${feito ? 'bg-ok text-white' : atual ? 'bg-marca text-tinta ring-4 ring-marca/30' : 'border border-linha bg-cartao text-tinta-3'}`}>{feito ? '✓' : i + 1}</span>
            <div className="min-w-0 pt-0.5">
              <div className={`text-sm font-semibold ${!feito && !atual ? 'text-tinta-3' : ''}`}>{m.rotulo}{atual && <span className="pill ml-2 bg-marca">agora</span>}</div>
              {m.data && (feito || atual || m.previsto) && <div className="text-xs text-tinta-3">{m.previsto && !feito ? 'previsto para ' : ''}{fmtData(m.data.slice(0, 10))}</div>}
              {m.detalhe && (feito || atual) && <div className="mt-0.5 text-xs text-tinta-2">{m.detalhe}</div>}
            </div>
          </li>)
      })}
    </ol>
  )
}

const ICONE: Record<Atualizacao['tipo'], [string, string]> = {
  status: ['●', 'bg-tinta text-white'], producao: ['⚙', 'bg-marca text-tinta'], estoque: ['▣', 'bg-ok text-white'],
  documento: ['▤', 'bg-tinta-2 text-white'], alerta: ['!', 'bg-alerta text-white'], previsao: ['◷', 'border border-dashed border-tinta-3 bg-cartao text-tinta-3'],
}

/** Histórico de atualizações, do mais recente (e previsões) para o mais antigo, como um rastreio de entrega. */
export function Atualizacoes({ itens, hoje }: { itens: Atualizacao[]; hoje: string }) {
  const futuras = itens.filter((a) => a.tipo === 'previsao' && a.data.slice(0, 10) >= hoje)
  const passadas = itens.filter((a) => !(a.tipo === 'previsao' && a.data.slice(0, 10) >= hoje))
  const Item = ({ a }: { a: Atualizacao }) => (
    <li className="flex gap-3 py-2">
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] ${ICONE[a.tipo][1]}`} aria-hidden>{ICONE[a.tipo][0]}</span>
      <div className="min-w-0">
        <div className={`text-sm ${a.tipo === 'previsao' ? 'text-tinta-2' : 'font-medium'}`}>{a.titulo}</div>
        {a.detalhe && <div className="text-xs text-tinta-2">{a.detalhe}</div>}
        <div className="text-xs text-tinta-3">{a.data.length > 10 && !a.data.endsWith('T12:00:00') && !a.data.endsWith('T09:00:00') && !a.data.endsWith('T08:00:00')
          ? new Date(a.data).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
          : new Date(`${a.data.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
      </div>
    </li>
  )
  return (
    <div className="cartao space-y-2">
      {futuras.length > 0 && <><div className="rotulo">Próximos passos</div><ul className="divide-y divide-linha">{[...futuras].reverse().map((a, i) => <Item key={'f' + i} a={a} />)}</ul></>}
      <div className="rotulo pt-1">Atualizações</div>
      <ul className="divide-y divide-linha">{passadas.map((a, i) => <Item key={'p' + i} a={a} />)}</ul>
    </div>
  )
}
