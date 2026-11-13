import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { listarPedidos, listarTodosEventos, listarTodosItens } from '../dados/pedidos'
import { carregarParametros } from '../dados/parametros'
import { calcularCiclo, ETAPAS, type EventoCiclo } from '../dominio/ciclo'
import { regrasDoModal } from '../dominio/modal'
import { ProgressoMini, SeloPrazo } from '../components/Ciclo'
import { ROTULO_STATUS, type Pedido, type PedidoItem, type Perfil, type StatusPedido } from '../tipos/dominio'
import { fmtData, fmtEur, fmtNum } from '../lib/formatos'
import { Carregando, Erro } from '../components/Carregando'

/** Quais status pedem ação de cada perfil. */
const MINHA_VEZ: Record<Perfil, StatusPedido[]> = {
  franca: ['rascunho', 'aguardando_fr', 'recusado_supply'],
  supply: ['enviado', 'em_validacao_supply'],
  pcp: ['aprovado', 'em_planejamento_pcp'],
  operacoes: ['plano_concluido', 'em_recebimento', 'packing_list', 'invoice_gerada'],
  admin: [],
}

type Base = { pedidos: Pedido[]; eventos: Map<string, EventoCiclo[]>; itens: PedidoItem[]; params: Record<string, string> }

export function Inicio() {
  const { perfil } = useAuth()
  const [base, setBase] = useState<Base | null>(null)
  const [erro, setErro] = useState<unknown>(null)
  useEffect(() => {
    Promise.all([listarPedidos(), listarTodosEventos(), listarTodosItens(), carregarParametros()]).then(([pedidos, evs, itens, params]) => {
      const eventos = new Map<string, EventoCiclo[]>(); for (const e of evs) { const l = eventos.get(e.pedido_id) ?? []; l.push(e); eventos.set(e.pedido_id, l) }
      setBase({ pedidos, eventos, itens, params })
    }).catch(setErro)
  }, [])
  if (erro) return <Erro erro={erro} />
  if (!base || !perfil) return <Carregando />
  return perfil.perfil === 'franca' ? <InicioFranca base={base} nome={perfil.nome} /> : <InicioInterno base={base} perfil={perfil.perfil} nome={perfil.nome} />
}

const totalPedido = (p: Pedido, itens: PedidoItem[]) => itens.filter((i) => i.pedido_id === p.id).reduce((s, i) => s + (i.preco_eur ?? 0) * (i.qtd_aprovada ?? i.qtd_solicitada), 0)

function InicioFranca({ base, nome }: { base: Base; nome: string }) {
  const ativos = base.pedidos.filter((p) => !['concluido', 'cancelado'].includes(p.status))
  const historico = base.pedidos.filter((p) => ['concluido', 'cancelado'].includes(p.status))
  const acao = ativos.filter((p) => MINHA_VEZ.franca.includes(p.status))
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Bonjour, {nome.split(' ')[0]}</h1><p className="text-sm text-tinta-2">Acompanhe seus pedidos à Dengo Brasil.</p></div>
        <Link to="/pedidos/novo" className="btn-primario px-5 py-3">+ Novo pedido</Link>
      </div>
      {acao.length > 0 && (
        <div className="rounded-lg border border-marca bg-marca/15 p-3 text-sm"><b>{acao.length} pedido(s) precisam da sua resposta:</b> {acao.map((p) => <Link key={p.id} className="ml-2 underline" to={`/pedidos/${p.id}`}>{p.numero}</Link>)}</div>
      )}
      <section className="space-y-3">
        <h2 className="font-semibold">Em andamento ({ativos.length})</h2>
        {ativos.length === 0 && <div className="cartao text-center text-sm text-tinta-3">Nenhum pedido em andamento. <Link to="/pedidos/novo" className="underline">Fazer um pedido</Link></div>}
        <div className="grid gap-3 md:grid-cols-2">{ativos.map((p) => <CartaoPedido key={p.id} p={p} base={base} />)}</div>
      </section>
      {historico.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Histórico</h2>
          <div className="grid gap-3 md:grid-cols-2">{historico.map((p) => <CartaoPedido key={p.id} p={p} base={base} />)}</div>
        </section>
      )}
    </div>
  )
}

function CartaoPedido({ p, base }: { p: Pedido; base: Base }) {
  const ev = base.eventos.get(p.id) ?? []
  const c = calcularCiclo(ev, p.criado_em, p.data_embarque)
  const etapa = ETAPAS.find((e) => e.chave === c.etapaAtual)
  const precisa = MINHA_VEZ.franca.includes(p.status)
  return (
    <Link to={`/pedidos/${p.id}`} className={`cartao block space-y-3 transition hover:shadow-md ${precisa ? 'border-marca' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div><div className="font-mono text-xs text-tinta-3">{p.numero}{p.po_franca ? ` · ${p.po_franca}` : ''}</div><div className="text-lg font-semibold">{c.cancelado ? 'Cancelado' : etapa?.rotulo}</div></div>
        <span className="pill bg-tinta text-white">{p.modal === 'maritimo' ? '⚓︎ Marítimo' : '✈︎ Aéreo'}</span>
      </div>
      <ProgressoMini pedido={p} eventos={ev} />
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span><span className="text-tinta-3">Embarque</span> {fmtData(p.data_embarque)}</span>
        <span><span className="text-tinta-3">Chegada</span> {fmtData(p.data_chegada_fr)}</span>
        <span className="font-semibold">{fmtEur(totalPedido(p, base.itens))}</span>
      </div>
      {precisa && <div className="text-sm font-semibold text-tinta">Responder ao Supply →</div>}
    </Link>
  )
}

function InicioInterno({ base, perfil, nome }: { base: Base; perfil: Perfil; nome: string }) {
  const linhas = useMemo(() => base.pedidos.map((p) => {
    const ev = base.eventos.get(p.id) ?? []; const c = calcularCiclo(ev, p.criado_em, p.data_embarque); const r = regrasDoModal(base.params, p.modal ?? 'aereo')
    return { p, ev, c, r, total: totalPedido(p, base.itens), minha: perfil === 'admin' ? !['concluido', 'cancelado'].includes(p.status) : MINHA_VEZ[perfil].includes(p.status) }
  }), [base, perfil])
  const [filtro, setFiltro] = useState<'todos' | 'minha_vez' | 'atrasados'>(() => (linhas.some((l) => l.minha) ? 'minha_vez' : 'todos'))
  const lista = linhas.filter((l) => filtro === 'todos' || (filtro === 'minha_vez' ? l.minha : l.p.fora_prazo || (l.c.diasAteEmbarque <= 14 && !['concluido', 'cancelado'].includes(l.p.status))))
  const conta = { minha: linhas.filter((l) => l.minha).length, atraso: linhas.filter((l) => l.p.fora_prazo).length, ativos: linhas.filter((l) => !['concluido', 'cancelado'].includes(l.p.status)).length }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Olá, {nome.split(' ')[0]}</h1>
        {perfil === 'admin' && <Link to="/pedidos/novo" className="btn-primario">+ Novo pedido</Link>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi rotulo="Esperando a sua ação" valor={conta.minha} destaque />
        <Kpi rotulo="Pedidos em andamento" valor={conta.ativos} />
        <Kpi rotulo="Colocados fora do prazo" valor={conta.atraso} alerta={conta.atraso > 0} />
      </div>
      <div className="flex gap-1 text-sm">
        {([['minha_vez', 'Minha vez'], ['atrasados', 'Atenção (atraso ou embarque ≤ 14 d)'], ['todos', 'Todos']] as const).map(([k, r]) => (
          <button key={k} onClick={() => setFiltro(k)} className={`rounded-full px-3 py-1 ${filtro === k ? 'bg-tinta text-white' : 'bg-cartao border border-linha'}`}>{r}</button>
        ))}
      </div>
      <div className="cartao overflow-x-auto p-0">
        <table className="grade">
          <thead><tr><th>Nº</th><th>Modal</th><th>Etapa</th><th className="w-40">Progresso</th><th>Antecedência</th><th>Embarque</th><th className="text-right">Dias no ciclo</th><th className="text-right">Até embarque</th><th className="text-right">Valor</th><th /></tr></thead>
          <tbody>
            {lista.map(({ p, ev, c, r, total }) => (
              <tr key={p.id}>
                <td className="font-mono">{p.numero}</td>
                <td>{r.rotulo}</td>
                <td className="text-xs">{ROTULO_STATUS[p.status]}</td>
                <td><ProgressoMini pedido={p} eventos={ev} /></td>
                <td><SeloPrazo pedido={p} minimo={r.antecedenciaPedidoDias} /></td>
                <td>{fmtData(p.data_embarque)}</td>
                <td className="text-right tabular-nums">{fmtNum(c.diasNoCiclo, 1)}</td>
                <td className={`text-right tabular-nums ${['concluido', 'cancelado'].includes(p.status) ? 'text-tinta-3' : c.diasAteEmbarque <= 14 ? 'font-semibold text-alerta' : ''}`}>{['concluido', 'cancelado'].includes(p.status) ? '—' : `${c.diasAteEmbarque} d`}</td>
                <td className="text-right tabular-nums">{fmtEur(total)}</td>
                <td className="text-right"><Link className="text-sm underline" to={`/pedidos/${p.id}`}>Abrir</Link></td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={10} className="text-center text-sm text-tinta-3">Nada aqui.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Kpi({ rotulo, valor, destaque, alerta }: { rotulo: string; valor: number; destaque?: boolean; alerta?: boolean }) {
  return <div className={`cartao ${destaque ? 'border-marca bg-marca/10' : ''}`}><div className="rotulo">{rotulo}</div><div className={`text-3xl font-semibold ${alerta ? 'text-alerta' : ''}`}>{valor}</div></div>
}

/** Lista simples usada em /pedidos. */
export function ListaPedidos({ pedidos }: { pedidos: Pedido[] }) {
  return (
    <table className="grade">
      <thead><tr><th>Nº</th><th>Modal</th><th>Embarque</th><th>Chegada FR</th><th>Status</th><th></th></tr></thead>
      <tbody>
        {pedidos.map((p) => (
          <tr key={p.id}>
            <td className="font-mono">{p.numero}</td><td>{p.modal === 'maritimo' ? 'Marítimo' : 'Aéreo'}</td>
            <td>{fmtData(p.data_embarque)}</td><td>{fmtData(p.data_chegada_fr)}</td>
            <td><span className="pill bg-marca/30">{ROTULO_STATUS[p.status]}</span>{p.fora_prazo && <span className="pill ml-1 bg-alerta/15 text-alerta">fora do prazo</span>}</td>
            <td className="text-right"><Link className="text-sm underline" to={`/pedidos/${p.id}`}>Abrir</Link></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
