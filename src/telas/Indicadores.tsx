import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { carregarBaseIndicadores, type BaseIndicadores } from '../dados/indicadores'
import { consolidar, linhasAtendimento, resumirAtendimento, type LinhaAtendimento, type ResumoAtendimento } from '../dominio/atendimento'
import { avaliarValidade } from '../dominio/contractDate'
import { calcularCiclo, ETAPAS } from '../dominio/ciclo'
import { calcularOtif } from '../dominio/otif'
import { regrasDoModal } from '../dominio/modal'
import { somarDias } from '../dominio/calendario'
import { BarraPct, CartoesAtendimento, PillSituacao, ROTULO_FONTE, TabelaAtendimento, corPct, pct } from '../components/Atendimento'
import { Carregando, Erro } from '../components/Carregando'
import { fmtData, fmtEur, fmtNum, hoje } from '../lib/formatos'
import { ROTULO_STATUS, type Pedido } from '../tipos/dominio'
import { t, nomeProduto } from '../i18n/idioma'

type Aba = 'pedidos' | 'produtos' | 'familias' | 'ciclo' | 'otif'
type Periodo = 'todos' | '90' | 'ano'
type LinhaPedido = { p: Pedido; linhas: LinhaAtendimento[]; r: ResumoAtendimento; shelf: { ok: number; total: number }; noPrazo: boolean | null }

export function Indicadores() {
  const { perfil } = useAuth()
  const [base, setBase] = useState<BaseIndicadores | null>(null)
  const [erro, setErro] = useState<unknown>(null)
  const [aba, setAba] = useState<Aba>('pedidos')
  const [periodo, setPeriodo] = useState<Periodo>('todos')
  const [modal, setModal] = useState<'todos' | 'aereo' | 'maritimo'>('todos')
  useEffect(() => { carregarBaseIndicadores().then(setBase).catch(setErro) }, [])
  const interno = perfil?.perfil !== 'franca'

  const dados = useMemo(() => {
    if (!base) return null
    const nome = (sku: string) => nomeProduto(base.produtos.find((p) => p.sku === sku), sku)
    const corte = periodo === '90' ? somarDias(hoje(), -90) : periodo === 'ano' ? `${hoje().slice(0, 4)}-01-01` : '0000'
    const pedidos = base.pedidos.filter((p) => p.status !== 'cancelado' && p.data_embarque >= corte && (modal === 'todos' || p.modal === modal))
    const porPedido: LinhaPedido[] = pedidos.map((p) => {
      const inv = base.invoices.find((i) => i.pedido_id === p.id)
      const linhas = linhasAtendimento({
        itens: base.itens.filter((i) => i.pedido_id === p.id), plano: base.plano.filter((l) => l.pedido_id === p.id),
        recebimentos: base.recebimentos.filter((r) => r.pedido_id === p.id), faturado: inv ? inv.linhas : null,
        precoCadastro: (sku) => base.produtos.find((x) => x.sku === sku)?.preco_interco_eur ?? null,
      })
      // Shelf life na chegada: lotes da nota (ou do estoque) que atendem o contract date
      const chegada = inv?.delivery_date ?? p.data_chegada_fr
      const lotes = inv ? inv.linhas.map((l) => ({ sku: l.sku, validade: l.bbe })) : base.recebimentos.filter((r) => r.pedido_id === p.id && r.qtd_recebida > 0).map((r) => ({ sku: r.sku, validade: r.validade }))
      const avaliados = lotes.map((l) => { const sl = base.produtos.find((x) => x.sku === l.sku)?.shelf_life_dias; return l.validade && sl ? avaliarValidade(l.validade, sl, chegada, base.contract) : null }).filter((x) => x !== null)
      const liberado = base.eventos.find((e) => e.pedido_id === p.id && e.para_status === 'concluido')?.criado_em.slice(0, 10)
      return { p, linhas, r: resumirAtendimento(linhas), shelf: { ok: avaliados.filter((a) => a!.atende).length, total: avaliados.length }, noPrazo: liberado ? liberado <= p.data_embarque : null }
    })
    // Consolidado só com pedidos faturados (atendido em nota). Em andamento aparecem na lista, fora da média.
    const comAtend = porPedido.filter((x) => x.r.fonte === 'nota')
    const emAndamento = porPedido.filter((x) => x.r.fonte === 'estoque').length
    const total = consolidar(comAtend.map((x) => x.r))
    const shelf = comAtend.reduce((s, x) => ({ ok: s.ok + x.shelf.ok, total: s.total + x.shelf.total }), { ok: 0, total: 0 })
    const liberados = porPedido.filter((x) => x.noPrazo !== null)
    return { nome, porPedido, comAtend, emAndamento, total, shelf, pontualidade: liberados.length ? liberados.filter((x) => x.noPrazo).length / liberados.length : null, liberados: liberados.length }
  }, [base, periodo, modal])

  if (erro) return <Erro erro={erro} />
  if (!base || !dados || !perfil) return <Carregando />
  const abas: [Aba, string][] = interno ? [['pedidos', t('Por pedido')], ['produtos', t('Por produto')], ['familias', t('Por família')], ['ciclo', t('Ciclo do pedido')], ['otif', 'OTIF']] : [['pedidos', t('Por pedido')], ['produtos', t('Por produto')]]

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{interno ? t('Indicadores') : t('Seus indicadores')}</h1>
          <p className="text-sm text-tinta-2">{t('Pedido × atendimento. Atendido = quantidade faturada na invoice; antes da invoice, usamos o que já está no estoque como prévia.')}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} aria-label={t('Período')}><option value="todos">{t('Todos os embarques')}</option><option value="90">{t('Embarques dos últimos 90 dias')}</option><option value="ano">{t('Embarques deste ano')}</option></select>
          <select value={modal} onChange={(e) => setModal(e.target.value as typeof modal)} aria-label={t('Modal')}><option value="todos">{t('Aéreo e marítimo')}</option><option value="aereo">{t('Aéreo')}</option><option value="maritimo">{t('Marítimo')}</option></select>
        </div>
      </header>

      {dados.comAtend.length === 0 ? (
        <div className="cartao text-center text-sm text-tinta-3">{t('Ainda não há pedidos faturados neste filtro. Os indicadores consolidados aparecem quando a primeira invoice for emitida.')}{dados.emAndamento > 0 && ` ${t('{n} pedido(s) em produção podem ser acompanhados na lista abaixo.', { n: dados.emAndamento })}`}</div>
      ) : (
        <CartoesAtendimento r={dados.total} extra={[
          { rotulo: t('Shelf life na chegada'), valor: pct(dados.shelf.total ? dados.shelf.ok / dados.shelf.total : null, 1), cor: corPct(dados.shelf.total ? dados.shelf.ok / dados.shelf.total : null), detalhe: t('{a} de {b} lotes dentro do contract date', { a: dados.shelf.ok, b: dados.shelf.total }) },
        ]} />
      )}
      {dados.comAtend.length > 0 && <p className="text-xs text-tinta-3">{t('Consolidado de {n} pedido(s) faturado(s).', { n: dados.comAtend.length })}{dados.emAndamento > 0 && ` ${t('{n} pedido(s) em produção ficam fora da média até a invoice.', { n: dados.emAndamento })}`}</p>}
      {dados.liberados > 0 && <p className="text-sm text-tinta-2">{t('Pontualidade da liberação para embarque')}: <b className={corPct(dados.pontualidade)}>{pct(dados.pontualidade)}</b> {t('dos {n} pedidos liberados até a data de embarque.', { n: dados.liberados })}</p>}

      <nav className="flex flex-wrap gap-1 border-b border-linha" aria-label={t('Visões')}>
        {abas.map(([k, r]) => <button key={k} onClick={() => setAba(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === k ? 'border-tinta font-semibold' : 'border-transparent text-tinta-2 hover:text-tinta'}`}>{r}</button>)}
      </nav>

      {aba === 'pedidos' && <PorPedido linhas={dados.porPedido} nome={dados.nome} interno={interno} />}
      {aba === 'produtos' && <PorProduto linhas={dados.comAtend} base={base} interno={interno} />}
      {aba === 'familias' && interno && <PorFamilia linhas={dados.comAtend} base={base} />}
      {aba === 'ciclo' && interno && <Ciclo base={base} pedidos={dados.porPedido.map((x) => x.p)} />}
      {aba === 'otif' && interno && <Otif base={base} pedidos={dados.porPedido.map((x) => x.p)} />}
    </div>
  )
}

function PorPedido({ linhas, nome, interno }: { linhas: LinhaPedido[]; nome: (s: string) => string; interno: boolean }) {
  const [aberto, setAberto] = useState<string | null>(null)
  return (
    <div className="cartao overflow-x-auto p-0">
      <table className="grade">
        <thead><tr><th /><th>{t('Pedido')}</th><th>{t('Modal')}</th><th>{t('Embarque')}</th><th>{t('Etapa')}</th><th>{t('Volume')}</th><th>{t('Produtos 100%')}</th><th>{t('Valor')}</th><th className="text-right">{t('Pedido')} €</th><th className="text-right">{t('Atendido')} €</th><th>Shelf life</th></tr></thead>
        <tbody>
          {linhas.map(({ p, linhas: ls, r, shelf }) => { const ab = aberto === p.id; const pend = r.fonte === 'pendente'; return (
            <Fragment key={p.id}>
              <tr className={`cursor-pointer hover:bg-fundo ${ab ? 'bg-marca/10' : ''}`} onClick={() => setAberto(ab ? null : p.id)}>
                <td className="w-6 text-tinta-3">{ab ? '▾' : '▸'}</td>
                <td><div className="whitespace-nowrap font-mono">{p.numero}</div>{p.fora_prazo && <span className="pill bg-alerta/15 text-alerta">{t('fora do prazo')}</span>}</td>
                <td>{p.modal === 'maritimo' ? t('Marítimo') : t('Aéreo')}</td><td>{fmtData(p.data_embarque)}</td>
                <td className="text-xs">{t(ROTULO_STATUS[p.status])}<div className="text-tinta-3">{r.fonte === 'nota' ? t('em nota') : r.fonte === 'estoque' ? t('prévia estoque') : ''}</div></td>
                {r.fonte === 'nota' ? <>
                  <td><BarraPct v={r.fillRateVolume} largura="w-16" /></td><td><BarraPct v={r.fillRateSku} largura="w-16" /></td><td><BarraPct v={r.fillRateValor} largura="w-16" /></td>
                </> : <td colSpan={3} className="text-xs text-tinta-3">{pend ? t('aguardando produção') : t('em produção · {p} do volume já no estoque', { p: pct(r.fillRateVolume) })}</td>}
                <td className="text-right tabular-nums">{fmtEur(r.valorSolicitado)}</td><td className="text-right tabular-nums">{r.fonte === 'nota' ? fmtEur(r.valorAtendido) : '—'}</td>
                <td className={`tabular-nums ${corPct(shelf.total ? shelf.ok / shelf.total : null)}`}>{shelf.total ? `${shelf.ok}/${shelf.total} ${t('lotes')}` : '—'}</td>
              </tr>
              {ab && <tr><td colSpan={11} className="bg-fundo p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{t('Linha a linha')} · <span className="text-tinta-3">{ROTULO_FONTE[r.fonte]}</span></span><Link className="underline" to={`/pedidos/${p.id}`}>{t('Abrir pedido')} →</Link></div>
                <div className="rounded-lg border border-linha bg-cartao"><TabelaAtendimento linhas={ls} nome={nome} interno={interno} /></div>
              </td></tr>}
            </Fragment>) })}
          {linhas.length === 0 && <tr><td colSpan={11} className="text-center text-sm text-tinta-3">{t('Nenhum pedido neste filtro.')}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

type AgSku = { chave: string; rotulo: string; pedidos: number; solicitado: number; atendido: number; valorSol: number; valorPerdido: number; parciais: number; nao: number; detalhes: { p: Pedido; l: LinhaAtendimento }[] }
function agregar(linhas: LinhaPedido[], chave: (sku: string) => [string, string]): AgSku[] {
  const m = new Map<string, AgSku>()
  for (const { p, linhas: ls } of linhas) for (const l of ls) {
    if (l.solicitado === 0) continue
    const [k, rot] = chave(l.sku); const a = m.get(k) ?? { chave: k, rotulo: rot, pedidos: 0, solicitado: 0, atendido: 0, valorSol: 0, valorPerdido: 0, parciais: 0, nao: 0, detalhes: [] }
    a.pedidos += 1; a.solicitado += l.solicitado; a.atendido += Math.min(l.atendido, l.solicitado); a.valorSol += l.valorSolicitado
    a.valorPerdido += Math.max(0, l.solicitado - l.atendido) * l.preco; if (l.situacao === 'parcial') a.parciais += 1; if (l.situacao === 'nao_atendido') a.nao += 1
    a.detalhes.push({ p, l }); m.set(k, a)
  }
  return [...m.values()].sort((a, b) => b.valorPerdido - a.valorPerdido || a.atendido / a.solicitado - b.atendido / b.solicitado)
}

function TabelaAgregada({ itens, titulo, nome }: { itens: AgSku[]; titulo: string; nome?: (s: string) => string }) {
  const [aberto, setAberto] = useState<string | null>(null)
  return (
    <div className="cartao overflow-x-auto p-0">
      <table className="grade">
        <thead><tr><th /><th>{titulo}</th><th className="text-right">{t('Pedidos')}</th><th className="text-right">{t('Pedido')}</th><th className="text-right">{t('Atendido')}</th><th>{t('% atendido')}</th><th className="text-right">{t('Parciais')}</th><th className="text-right">{t('Não atendidos')}</th><th className="text-right">{t('Valor não atendido')}</th></tr></thead>
        <tbody>
          {itens.map((a) => { const ab = aberto === a.chave; return (
            <Fragment key={a.chave}>
              <tr className={`cursor-pointer hover:bg-fundo ${ab ? 'bg-marca/10' : ''}`} onClick={() => setAberto(ab ? null : a.chave)}>
                <td className="w-6 text-tinta-3">{ab ? '▾' : '▸'}</td>
                <td><div className="font-medium">{a.rotulo}</div>{nome && <div className="font-mono text-xs text-tinta-3">{a.chave}</div>}</td>
                <td className="text-right">{a.pedidos}</td><td className="text-right tabular-nums">{fmtNum(a.solicitado, 3)}</td><td className="text-right tabular-nums">{fmtNum(a.atendido, 3)}</td>
                <td><BarraPct v={a.solicitado ? a.atendido / a.solicitado : null} largura="w-16" /></td>
                <td className={`text-right ${a.parciais ? 'text-alerta' : 'text-tinta-3'}`}>{a.parciais}</td><td className={`text-right ${a.nao ? 'text-erro' : 'text-tinta-3'}`}>{a.nao}</td>
                <td className={`text-right font-semibold tabular-nums ${a.valorPerdido > 0 ? 'text-erro' : 'text-tinta-3'}`}>{fmtEur(a.valorPerdido)}</td>
              </tr>
              {ab && <tr><td colSpan={9} className="bg-fundo p-3">
                <table className="grade rounded-lg border border-linha bg-cartao">
                  <thead><tr><th>{t('Pedido')}</th>{!nome && <th>{t('Produto')}</th>}<th>{t('Embarque')}</th><th className="text-right">{t('Pedido')}</th><th className="text-right">{t('Atendido')}</th><th>%</th><th>{t('Situação')}</th></tr></thead>
                  <tbody>{a.detalhes.map(({ p, l }) => (
                    <tr key={p.id + l.sku}><td><Link className="font-mono underline" to={`/pedidos/${p.id}`}>{p.numero}</Link></td>{!nome && <td>{l.sku}</td>}<td>{fmtData(p.data_embarque)}</td>
                      <td className="text-right tabular-nums">{fmtNum(l.solicitado, 3)}</td><td className="text-right tabular-nums">{fmtNum(l.atendido, 3)}</td><td><BarraPct v={l.pct} largura="w-12" /></td><td><PillSituacao s={l.situacao} /></td></tr>))}</tbody>
                </table>
              </td></tr>}
            </Fragment>) })}
          {itens.length === 0 && <tr><td colSpan={9} className="text-center text-sm text-tinta-3">{t('Sem dados de atendimento neste filtro.')}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function PorProduto({ linhas, base, interno }: { linhas: LinhaPedido[]; base: BaseIndicadores; interno: boolean }) {
  const nome = (sku: string) => nomeProduto(base.produtos.find((p) => p.sku === sku), sku)
  const itens = agregar(linhas, (sku) => [sku, nome(sku)])
  return <div className="space-y-2"><p className="text-sm text-tinta-2">{t('Ordenado pelo valor que deixou de ser atendido. Clique num produto para ver pedido a pedido.')}{!interno && ` ${t('Use para ajustar as próximas quantidades.')}`}</p><TabelaAgregada itens={itens} titulo={t('Produto')} nome={nome} /></div>
}

function PorFamilia({ linhas, base }: { linhas: LinhaPedido[]; base: BaseIndicadores }) {
  const fam = (sku: string) => { const f = base.produtos.find((p) => p.sku === sku)?.familia?.trim() || 'Outros'; return [f, f] as [string, string] }
  return <TabelaAgregada itens={agregar(linhas, fam)} titulo={t('Família')} />
}

function Ciclo({ base, pedidos }: { base: BaseIndicadores; pedidos: Pedido[] }) {
  const grupos = (['aereo', 'maritimo'] as const).map((m) => {
    const ps = pedidos.filter((p) => (p.modal ?? 'aereo') === m)
    const ciclos = ps.map((p) => ({ p, c: calcularCiclo(base.eventos.filter((e) => e.pedido_id === p.id), p.criado_em, p.data_embarque) }))
    const media = (k: (typeof ETAPAS)[number]['chave']) => { const v = ciclos.map((x) => x.c.dias[k]).filter((d): d is number => d !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
    return { m, rotulo: regrasDoModal(base.params, m).rotulo, ps, ciclos, media, fora: ps.filter((p) => p.fora_prazo).length, antMedia: ps.length ? ps.reduce((s, p) => s + (p.antecedencia_dias ?? 0), 0) / ps.length : null }
  })
  return (
    <div className="space-y-4">
      {grupos.map((g) => (
        <section key={g.m} className="cartao space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">{g.rotulo} · {g.ps.length} pedidos</h2>
            <span className="text-sm text-tinta-2">Antecedência média <b>{g.antMedia === null ? '—' : `${fmtNum(g.antMedia, 0)} d`}</b> · fora do prazo <b className={g.fora ? 'text-alerta' : ''}>{g.fora}</b></span></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {ETAPAS.map((e) => <div key={e.chave} className="rounded-lg bg-fundo p-2"><div className="text-xs font-semibold">{e.rotulo}</div><div className="text-xl font-semibold tabular-nums">{g.media(e.chave) === null ? '—' : `${fmtNum(g.media(e.chave)!, 1)} d`}</div><div className="text-xs text-tinta-3">média</div></div>)}
          </div>
          {g.ciclos.length > 0 && <div className="overflow-x-auto"><table className="grade">
            <thead><tr><th>Pedido</th><th>Antecedência</th>{ETAPAS.map((e) => <th key={e.chave} className="text-right">{e.rotulo}</th>)}<th className="text-right">Total</th></tr></thead>
            <tbody>{g.ciclos.map(({ p, c }) => (
              <tr key={p.id}><td><Link className="font-mono underline" to={`/pedidos/${p.id}`}>{p.numero}</Link></td><td className={p.fora_prazo ? 'text-alerta' : ''}>{p.antecedencia_dias ?? '—'} d</td>
                {ETAPAS.map((e) => <td key={e.chave} className={`text-right tabular-nums ${c.etapaAtual === e.chave ? 'font-semibold' : ''}`}>{c.dias[e.chave] === undefined ? '' : fmtNum(c.dias[e.chave]!, 1)}</td>)}
                <td className="text-right tabular-nums">{fmtNum(c.diasNoCiclo, 1)}</td></tr>))}</tbody>
          </table></div>}
        </section>
      ))}
    </div>
  )
}

function Otif({ base, pedidos }: { base: BaseIndicadores; pedidos: Pedido[] }) {
  const linhas = pedidos.flatMap((p) => {
    const rs = base.recebimentos.filter((r) => r.pedido_id === p.id); if (!rs.length) return []
    const r = regrasDoModal(base.params, p.modal ?? 'aereo')
    const o = calcularOtif(rs.map((x) => ({ sku: x.sku, qtdBase: x.qtd_planejada ?? 0, qtdRecebida: x.qtd_recebida, validade: x.validade, shelfLifeDias: base.produtos.find((y) => y.sku === x.sku)?.shelf_life_dias ?? null, dataRecebimento: x.qtd_recebida > 0 ? x.data_recebimento : null })),
      p.data_chegada_fr, somarDias(p.data_embarque, -r.antecedenciaEstoqueDias), base.contract)
    return [{ p, o }]
  })
  return (
    <div className="cartao overflow-x-auto p-0">
      <p className="p-3 text-sm text-tinta-2">OTIF do estoque contra o plano do PCP: volume e SKUs recebidos, lotes dentro do contract date e lotes no estoque até o limite do modal.</p>
      <table className="grade">
        <thead><tr><th>Pedido</th><th>Modal</th><th>Volume</th><th>SKU</th><th>Shelf life</th><th>On-time</th><th className="text-right">Lotes</th></tr></thead>
        <tbody>{linhas.map(({ p, o }) => (
          <tr key={p.id}><td><Link className="font-mono underline" to={`/pedidos/${p.id}`}>{p.numero}</Link></td><td>{p.modal === 'maritimo' ? 'Marítimo' : 'Aéreo'}</td>
            <td><BarraPct v={o.volume} largura="w-16" /></td><td><BarraPct v={o.sku} largura="w-16" /></td><td><BarraPct v={o.shelfLife} largura="w-16" /></td><td><BarraPct v={o.onTime} largura="w-16" /></td><td className="text-right">{o.linhas}</td></tr>))}
          {linhas.length === 0 && <tr><td colSpan={7} className="text-center text-sm text-tinta-3">Nenhum recebimento registrado.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
