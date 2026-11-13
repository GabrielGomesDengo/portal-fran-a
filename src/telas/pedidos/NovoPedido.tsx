import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { carregarParametros, type Parametros } from '../../dados/parametros'
import { listarProdutos } from '../../dados/produtos'
import { carregarTabelaContract } from '../../dados/contractDate'
import { criarPedido } from '../../dados/pedidos'
import { regrasDoModal, type Modal } from '../../dominio/modal'
import { dataChegadaFR } from '../../dominio/contractDate'
import { diaDaSemana, diasEntre, somarDias } from '../../dominio/calendario'
import { fmtData, fmtEur, fmtNum, hoje } from '../../lib/formatos'
import { Carregando, Erro } from '../../components/Carregando'
import type { Produto } from '../../tipos/dominio'

type Passo = 'envio' | 'catalogo' | 'revisao'
type Ordem = 'relevancia' | 'preco_desc' | 'preco_asc' | 'total_desc' | 'nome'

/** Unidades por caixa; produto sem múltiplo cadastrado é vendido por unidade. */
const porCaixa = (p: Produto) => (p.multiplo_caixa && p.multiplo_caixa > 0 ? p.multiplo_caixa : 1)
const um = (p: Produto) => (p.unidade.toLowerCase() === 'kg' ? 'kg' : 'un')

export function NovoPedido() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [params, setParams] = useState<Parametros | null>(null)
  const [produtos, setProdutos] = useState<Produto[] | null>(null)
  const [contractVersao, setContractVersao] = useState(1)
  const [erro, setErro] = useState<unknown>(null)

  const [passo, setPasso] = useState<Passo>('envio')
  const [modal, setModal] = useState<Modal>('aereo')
  const [dataEmbarque, setDataEmbarque] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [poFranca, setPoFranca] = useState('')
  const [obs, setObs] = useState('')
  const [carrinho, setCarrinho] = useState<Record<string, number>>({}) // sku → caixas
  const [busca, setBusca] = useState('')
  const [familia, setFamilia] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('relevancia')
  const [soCarrinho, setSoCarrinho] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    Promise.all([carregarParametros(), listarProdutos(true), carregarTabelaContract()])
      .then(([p, pr, c]) => { setParams(p); setProdutos(pr); setContractVersao(c.versao) })
      .catch(setErro)
  }, [])
  useEffect(() => { window.scrollTo({ top: 0 }) }, [passo])

  const regras = params ? regrasDoModal(params, modal) : null
  const hojeL = hoje()
  const minimoRecomendado = regras ? somarDias(hojeL, regras.antecedenciaPedidoDias) : hojeL
  const antecedencia = dataEmbarque ? diasEntre(hojeL, dataEmbarque) : null
  const foraPrazo = !!dataEmbarque && dataEmbarque < minimoRecomendado
  const chegada = dataEmbarque && regras ? dataChegadaFR(dataEmbarque, regras.transitDias) : ''
  const dataValida = !!dataEmbarque && dataEmbarque > hojeL && (!foraPrazo || justificativa.trim().length >= 5)

  const prod = (sku: string) => produtos?.find((p) => p.sku === sku)
  const familias = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of produtos ?? []) { const f = p.familia?.trim() || 'Outros'; m.set(f, (m.get(f) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [produtos])

  const linhaTotal = (p: Produto, cx: number) => cx * porCaixa(p) * (p.preco_interco_eur ?? 0)
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const lista = (produtos ?? []).filter((p) => {
      if (soCarrinho && !carrinho[p.sku]) return false
      if (familia && (p.familia?.trim() || 'Outros') !== familia) return false
      return !t || p.sku.includes(t) || p.descricao_br.toLowerCase().includes(t) || (p.descricao_fr ?? '').toLowerCase().includes(t) || (p.descricao_en ?? '').toLowerCase().includes(t)
    })
    const preco = (p: Produto) => p.preco_interco_eur ?? 0
    const cmp: Record<Ordem, (a: Produto, b: Produto) => number> = {
      relevancia: (a, b) => (b.qtd_10_meses ?? 0) * preco(b) - (a.qtd_10_meses ?? 0) * preco(a),
      preco_desc: (a, b) => preco(b) - preco(a),
      preco_asc: (a, b) => preco(a) - preco(b),
      total_desc: (a, b) => linhaTotal(b, carrinho[b.sku] ?? 0) - linhaTotal(a, carrinho[a.sku] ?? 0) || preco(b) - preco(a),
      nome: (a, b) => a.descricao_br.localeCompare(b.descricao_br),
    }
    return lista.sort(cmp[ordem])
  }, [produtos, busca, familia, ordem, soCarrinho, carrinho]) // eslint-disable-line react-hooks/exhaustive-deps

  const itens = useMemo(() => Object.entries(carrinho).filter(([, cx]) => cx > 0).map(([sku, caixas]) => {
    const p = prod(sku)!; const qtd = caixas * porCaixa(p)
    return { sku, caixas, qtd, preco_eur: p.preco_interco_eur, total: qtd * (p.preco_interco_eur ?? 0), produto: p }
  }).sort((a, b) => b.total - a.total), [carrinho, produtos]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = itens.reduce((s, i) => s + i.total, 0)
  const totalCaixas = itens.reduce((s, i) => s + i.caixas, 0)

  const setCx = (sku: string, cx: number) => setCarrinho((c) => ({ ...c, [sku]: Math.max(0, Math.floor(cx || 0)) }))

  async function enviar() {
    if (!user || !regras) return
    setEnviando(true); setErro(null)
    try {
      const pedido = await criarPedido({
        userId: user.id, dataEmbarque, transitDias: regras.transitDias, contractVersao,
        poFranca: poFranca.trim() || null, observacao: obs.trim() || null,
        itens: itens.map((i) => ({ sku: i.sku, qtd: i.qtd, caixas: i.caixas, preco_eur: i.preco_eur })),
        modal, antecedenciaDias: antecedencia ?? 0, foraPrazo, justificativaPrazo: foraPrazo ? justificativa.trim() : null,
      })
      nav(`/pedidos/${pedido.id}?novo=1`)
    } catch (e) { setErro(e); setEnviando(false) }
  }

  if (erro && !params) return <Erro erro={erro} />
  if (!params || !produtos || !regras) return <Carregando />

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <Etapas passo={passo} irPara={(p) => { if (p === 'envio' || dataValida) setPasso(p) }} podeAvancar={dataValida} temItens={itens.length > 0} />

      {passo === 'envio' && (
        <section className="mx-auto max-w-3xl space-y-6 surgir">
          <header>
            <h1 className="text-2xl font-semibold">Como e quando vamos enviar?</h1>
            <p className="mt-1 text-sm text-tinta-2">Escolha o modal e a data de embarque na fábrica. Com isso calculamos a chegada na França e as validades.</p>
          </header>

          <fieldset>
            <legend className="rotulo mb-2">Modal de envio</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['aereo', 'maritimo'] as Modal[]).map((m) => { const r = regrasDoModal(params, m); const ativo = modal === m; return (
                <button key={m} type="button" onClick={() => setModal(m)} aria-pressed={ativo}
                  className={`rounded-xl border-2 p-4 text-left transition ${ativo ? 'border-marca bg-marca/10 shadow-sm' : 'border-linha bg-cartao hover:border-marca/50'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold">{m === 'aereo' ? '✈︎ Aéreo' : '⚓︎ Marítimo'}</span>
                    <span className={`grid h-5 w-5 place-items-center rounded-full border-2 ${ativo ? 'border-tinta bg-tinta' : 'border-linha'}`}>{ativo && <span className="h-2 w-2 rounded-full bg-marca" />}</span>
                  </div>
                  <ul className="mt-2 space-y-0.5 text-sm text-tinta-2">
                    <li>Chegada <b>{m === 'aereo' ? `${r.transitDias} dias` : `${Math.round(r.transitDias / 7)} semanas`}</b> após o embarque</li>
                    <li>Pedir com <b>{r.antecedenciaPedidoDias} dias</b> de antecedência</li>
                    <li>Pallet {r.dimensoesPallet.toLowerCase()} m{r.taraMasterBoxKg === 0 ? ' · sem master box' : ''}</li>
                  </ul>
                </button>) })}
            </div>
          </fieldset>

          <div className="cartao space-y-4">
            <label className="block">
              <span className="rotulo">Data de embarque na fábrica</span>
              <input type="date" className="mt-1 w-full sm:w-64" min={somarDias(hojeL, 1)} value={dataEmbarque} onChange={(e) => setDataEmbarque(e.target.value)} />
              <span className="mt-1 block text-xs text-tinta-3">Recomendado a partir de <b>{fmtData(minimoRecomendado)}</b>{regras.embarqueSegunda ? ', sempre numa segunda-feira' : ''}.</span>
            </label>

            {dataEmbarque && dataEmbarque <= hojeL && <p className="text-sm text-erro">Escolha uma data futura.</p>}
            {dataEmbarque && dataEmbarque > hojeL && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Info rotulo="Embarque" valor={fmtData(dataEmbarque)} />
                <Info rotulo="Chegada prevista na França" valor={fmtData(chegada)} />
                <Info rotulo="Antecedência" valor={`${antecedencia} dias`} alerta={foraPrazo} />
              </div>
            )}
            {regras.embarqueSegunda && dataEmbarque && dataEmbarque > hojeL && diaDaSemana(dataEmbarque) !== 1 && (
              <p className="rounded-md bg-alerta/10 p-3 text-sm text-alerta">Essa data não é segunda-feira. O aéreo sai às segundas; o Supply pode ajustar a data.</p>
            )}
            {foraPrazo && dataEmbarque > hojeL && (
              <div className="space-y-2 rounded-lg border border-alerta/40 bg-alerta/10 p-3">
                <p className="text-sm"><b>Pedido fora do prazo.</b> O {regras.rotulo.toLowerCase()} pede {regras.antecedenciaPedidoDias} dias de antecedência e este tem {antecedencia}. Você pode seguir: o pedido vai para <b>aprovação do Supply</b> e ficará sinalizado como colocado com atraso no acompanhamento.</p>
                <label className="block"><span className="rotulo">Por que precisa dessa data? (obrigatório)</span>
                  <textarea className="mt-1 w-full" rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Ex.: reposição urgente para o Natal" /></label>
              </div>
            )}
            <label className="block"><span className="rotulo">Nº do seu pedido (PO) · opcional</span><input className="mt-1 w-full sm:w-80" value={poFranca} onChange={(e) => setPoFranca(e.target.value)} placeholder="Ship.2026xx-PA00xxx" /></label>
          </div>

          <div className="flex justify-end">
            <button className="btn-primario px-6 py-3 text-base" disabled={!dataValida} onClick={() => setPasso('catalogo')}>Escolher produtos →</button>
          </div>
        </section>
      )}

      {passo === 'catalogo' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <section className="min-w-0">
            {/* Cabeçalho fixo: busca, categorias, ordenação e títulos das colunas */}
            <div className="sticky z-10 -mx-4 border-b border-linha bg-fundo/95 px-4 pb-2 pt-3 backdrop-blur" style={{ top: 'var(--altura-cabecalho, 64px)' }}>
              <div className="flex flex-wrap items-center gap-2">
                <input className="min-w-48 grow" type="search" placeholder="Buscar produto ou SKU" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar produto" />
                <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
                  <option value="relevancia">Mais pedidos</option>
                  <option value="preco_desc">Preço: maior → menor</option>
                  <option value="preco_asc">Preço: menor → maior</option>
                  <option value="total_desc">Total da linha: maior → menor</option>
                  <option value="nome">Nome A–Z</option>
                </select>
                <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={soCarrinho} onChange={(e) => setSoCarrinho(e.target.checked)} /> Só no carrinho</label>
              </div>
              <div className="rolagem-fina mt-2 flex gap-1.5 overflow-x-auto pb-1">
                <Chip ativo={!familia} onClick={() => setFamilia('')}>Todas ({produtos.length})</Chip>
                {familias.map(([f, n]) => <Chip key={f} ativo={familia === f} onClick={() => setFamilia(familia === f ? '' : f)}>{f.toLowerCase()} ({n})</Chip>)}
              </div>
              <div className="mt-2 hidden grid-cols-[1fr_90px_200px_110px] gap-3 px-3 text-xs font-semibold uppercase tracking-wide text-tinta-3 md:grid">
                <span>Produto</span><span className="text-right">Preço un.</span><span className="text-center">Quantidade</span><span className="text-right">Total</span>
              </div>
            </div>

            <ul className="mt-2 space-y-1.5">
              {visiveis.length === 0 && <li className="cartao text-center text-sm text-tinta-3">Nenhum produto encontrado com esses filtros.</li>}
              {visiveis.map((p) => { const cx = carrinho[p.sku] ?? 0; const no = cx > 0; return (
                <li key={p.sku} className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5 transition md:grid-cols-[1fr_90px_200px_110px] ${no ? 'border-marca bg-marca/10' : 'border-linha bg-cartao'}`}>
                  <div className="min-w-0">
                    <div className="font-medium leading-tight">{p.descricao_br}</div>
                    <div className="mt-0.5 text-xs text-tinta-3">
                      <span className="font-mono">{p.sku}</span> · caixa com {fmtNum(porCaixa(p))} {um(p)}{p.shelf_life_dias ? ` · validade ${p.shelf_life_dias} dias` : ''}
                      {p.descricao_fr && <span className="hidden sm:inline"> · {p.descricao_fr}</span>}
                    </div>
                  </div>
                  <div className="text-right text-sm md:order-none">{fmtEur(p.preco_interco_eur)}<span className="text-xs text-tinta-3">/{um(p)}</span></div>
                  <Stepper caixas={cx} unidades={cx * porCaixa(p)} um={um(p)} onChange={(v) => setCx(p.sku, v)} rotulo={p.descricao_br} />
                  <div className={`text-right font-semibold tabular-nums ${no ? '' : 'text-tinta-3'}`}>{no ? fmtEur(linhaTotal(p, cx)) : '—'}</div>
                </li>) })}
            </ul>
          </section>

          <aside className="hidden lg:block">
            <div className="sticky space-y-3" style={{ top: 'calc(var(--altura-cabecalho, 64px) + 12px)' }}>
              <ResumoEnvio regrasRotulo={regras.rotulo} embarque={dataEmbarque} chegada={chegada} foraPrazo={foraPrazo} onEditar={() => setPasso('envio')} />
              <div className="cartao space-y-3">
                <div className="flex items-baseline justify-between"><h2 className="font-semibold">Seu carrinho</h2><span className="text-xs text-tinta-3">{itens.length} itens · {fmtNum(totalCaixas)} cx</span></div>
                {itens.length === 0 ? <p className="text-sm text-tinta-3">Use + nos produtos para adicionar caixas.</p> : (
                  <ul className="rolagem-fina max-h-72 space-y-1.5 overflow-y-auto pr-1 text-sm">
                    {itens.map((i) => <li key={i.sku} className="flex items-start justify-between gap-2"><span className="leading-tight">{i.produto.descricao_br}<span className="block text-xs text-tinta-3">{i.caixas} cx · {fmtNum(i.qtd)} {um(i.produto)}</span></span><span className="whitespace-nowrap tabular-nums">{fmtEur(i.total)}</span></li>)}
                  </ul>
                )}
                <div className="flex items-baseline justify-between border-t border-linha pt-2"><span className="text-sm">Total estimado</span><span className="text-xl font-semibold tabular-nums">{fmtEur(total)}</span></div>
                <button className="btn-primario w-full py-3" disabled={itens.length === 0} onClick={() => setPasso('revisao')}>Revisar pedido →</button>
              </div>
            </div>
          </aside>

          {/* Barra inferior no celular/tablet */}
          <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-linha bg-cartao px-4 py-3 shadow-lg lg:hidden">
            <div><div className="text-xs text-tinta-3">{itens.length} itens · {fmtNum(totalCaixas)} cx</div><div className="text-lg font-semibold tabular-nums">{fmtEur(total)}</div></div>
            <button className="btn-primario px-5 py-3" disabled={itens.length === 0} onClick={() => setPasso('revisao')}>Revisar pedido →</button>
          </div>
        </div>
      )}

      {passo === 'revisao' && (
        <section className="mx-auto max-w-4xl space-y-4 surgir">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div><h1 className="text-2xl font-semibold">Revise o seu pedido</h1><p className="text-sm text-tinta-2">Ajuste quantidades, remova itens ou volte ao catálogo para incluir mais produtos.</p></div>
            <button className="btn-secundario" onClick={() => setPasso('catalogo')}>+ Adicionar mais produtos</button>
          </header>
          <ResumoEnvio regrasRotulo={regras.rotulo} embarque={dataEmbarque} chegada={chegada} foraPrazo={foraPrazo} onEditar={() => setPasso('envio')} horizontal />
          <div className="cartao overflow-x-auto p-0">
            <table className="grade">
              <thead><tr><th>Produto</th><th className="text-right">Preço un.</th><th className="text-center">Quantidade</th><th className="text-right">Total</th><th /></tr></thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.sku}>
                    <td><div className="font-medium">{i.produto.descricao_br}</div><div className="text-xs text-tinta-3"><span className="font-mono">{i.sku}</span> · caixa com {fmtNum(porCaixa(i.produto))} {um(i.produto)}</div></td>
                    <td className="text-right">{fmtEur(i.preco_eur)}</td>
                    <td><div className="flex justify-center"><Stepper caixas={i.caixas} unidades={i.qtd} um={um(i.produto)} onChange={(v) => setCx(i.sku, v)} rotulo={i.produto.descricao_br} /></div></td>
                    <td className="text-right font-semibold tabular-nums">{fmtEur(i.total)}</td>
                    <td><button className="text-sm text-erro underline" onClick={() => setCx(i.sku, 0)}>Remover</button></td>
                  </tr>
                ))}
                {itens.length === 0 && <tr><td colSpan={5} className="text-center text-sm text-tinta-3">O carrinho está vazio. <button className="underline" onClick={() => setPasso('catalogo')}>Voltar ao catálogo</button></td></tr>}
              </tbody>
              <tfoot><tr><td colSpan={3} className="text-right font-semibold">{itens.length} itens · {fmtNum(totalCaixas)} caixas · total estimado</td><td className="text-right text-lg font-semibold tabular-nums">{fmtEur(total)}</td><td /></tr></tfoot>
            </table>
          </div>
          <label className="block"><span className="rotulo">Observações para a Dengo Brasil</span><textarea className="mt-1 w-full" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} /></label>
          <p className="text-xs text-tinta-3">Valores aproximados pelo preço intercompany EXW. O valor final é o da invoice comercial.</p>
          {erro ? <Erro erro={erro} /> : null}
          <div className="flex flex-wrap justify-between gap-2">
            <button className="btn-secundario" onClick={() => setPasso('catalogo')}>← Voltar ao catálogo</button>
            <button className="btn-primario px-6 py-3 text-base" disabled={enviando || itens.length === 0} onClick={enviar}>{enviando ? 'Enviando…' : foraPrazo ? 'Enviar para aprovação' : 'Enviar pedido'}</button>
          </div>
        </section>
      )}
    </div>
  )
}

function Etapas({ passo, irPara, podeAvancar, temItens }: { passo: Passo; irPara: (p: Passo) => void; podeAvancar: boolean; temItens: boolean }) {
  const lista: { p: Passo; r: string; ok: boolean }[] = [{ p: 'envio', r: 'Envio e data', ok: true }, { p: 'catalogo', r: 'Produtos', ok: podeAvancar }, { p: 'revisao', r: 'Revisão e envio', ok: podeAvancar && temItens }]
  const idx = lista.findIndex((x) => x.p === passo)
  return (
    <nav aria-label="Etapas do pedido"><ol className="flex flex-wrap items-center gap-2 text-sm">
      {lista.map((x, i) => (
        <li key={x.p} className="flex items-center gap-2">
          <button disabled={!x.ok} onClick={() => irPara(x.p)} aria-current={passo === x.p ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-full px-3 py-1 ${passo === x.p ? 'bg-tinta text-white' : i < idx ? 'bg-ok/15 text-ok' : 'bg-linha/60 text-tinta-3'} disabled:cursor-not-allowed`}>
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-xs font-semibold">{i < idx ? '✓' : i + 1}</span>{x.r}
          </button>
          {i < lista.length - 1 && <span className="text-tinta-3">›</span>}
        </li>))}
    </ol></nav>
  )
}

function Stepper({ caixas, unidades, um, onChange, rotulo }: { caixas: number; unidades: number; um: string; onChange: (v: number) => void; rotulo: string }) {
  return (
    <div className="flex items-center justify-start gap-2 md:justify-center">
      <div className="flex items-center rounded-md border border-linha bg-cartao">
        <button type="button" className="h-9 w-9 text-lg disabled:opacity-30" disabled={caixas <= 0} onClick={() => onChange(caixas - 1)} aria-label={`Remover uma caixa de ${rotulo}`}>−</button>
        <input type="number" inputMode="numeric" min={0} className="h-9 w-14 rounded-none border-0 border-x border-linha p-0 text-center tabular-nums focus:ring-0" value={caixas || ''} placeholder="0"
          onChange={(e) => onChange(Number(e.target.value))} aria-label={`Caixas de ${rotulo}`} />
        <button type="button" className="h-9 w-9 text-lg" onClick={() => onChange(caixas + 1)} aria-label={`Adicionar uma caixa de ${rotulo}`}>+</button>
      </div>
      <span className="w-20 text-xs leading-tight text-tinta-3">{caixas > 0 ? <>cx<br />= {fmtNum(unidades)} {um}</> : 'caixas'}</span>
    </div>
  )
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={ativo} className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs capitalize transition ${ativo ? 'border-tinta bg-tinta text-white' : 'border-linha bg-cartao hover:border-tinta/40'}`}>{children}</button>
}

function Info({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return <div className={`rounded-lg p-3 ${alerta ? 'bg-alerta/10' : 'bg-fundo'}`}><div className="rotulo">{rotulo}</div><div className={`text-lg font-semibold ${alerta ? 'text-alerta' : ''}`}>{valor}</div></div>
}

function ResumoEnvio({ regrasRotulo, embarque, chegada, foraPrazo, onEditar, horizontal }: { regrasRotulo: string; embarque: string; chegada: string; foraPrazo: boolean; onEditar: () => void; horizontal?: boolean }) {
  return (
    <div className={`cartao flex gap-3 text-sm ${horizontal ? 'flex-wrap items-center justify-between' : 'flex-col'}`}>
      <div className={`flex gap-4 ${horizontal ? 'flex-wrap' : 'flex-col gap-1'}`}>
        <span><span className="text-tinta-3">Modal</span> <b>{regrasRotulo}</b></span>
        <span><span className="text-tinta-3">Embarque</span> <b>{fmtData(embarque)}</b></span>
        <span><span className="text-tinta-3">Chegada FR</span> <b>{fmtData(chegada)}</b></span>
        {foraPrazo && <span className="pill self-start bg-alerta/15 text-alerta">fora do prazo · requer aprovação</span>}
      </div>
      <button className="self-start text-xs underline" onClick={onEditar}>Alterar envio</button>
    </div>
  )
}
