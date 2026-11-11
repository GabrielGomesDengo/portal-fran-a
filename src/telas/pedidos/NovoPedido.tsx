import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { carregarParametros, numero, type Parametros } from '../../dados/parametros'
import { listarProdutos } from '../../dados/produtos'
import { carregarTabelaContract } from '../../dados/contractDate'
import { criarPedido, type ItemCarrinho } from '../../dados/pedidos'
import { arredondarParaCaixas } from '../../dominio/caixas'
import { dataChegadaFR, dataMinimaProducao, type FaixaContractDate } from '../../dominio/contractDate'
import { diaDaSemana, somarDias } from '../../dominio/calendario'
import { fmtData, fmtEur, fmtNum, hoje } from '../../lib/formatos'
import { Carregando, Erro } from '../../components/Carregando'
import type { Produto } from '../../tipos/dominio'

type Passo = 'data' | 'itens' | 'carrinho'

export function NovoPedido() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [params, setParams] = useState<Parametros | null>(null)
  const [produtos, setProdutos] = useState<Produto[] | null>(null)
  const [contract, setContract] = useState<{ versao: number; tabela: FaixaContractDate[] } | null>(null)
  const [erro, setErro] = useState<unknown>(null)
  const [passo, setPasso] = useState<Passo>('data')
  const [dataEmbarque, setDataEmbarque] = useState('')
  const [poFranca, setPoFranca] = useState('')
  const [obs, setObs] = useState('')
  const [busca, setBusca] = useState('')
  const [familia, setFamilia] = useState('')
  const [carrinho, setCarrinho] = useState<Record<string, number>>({})
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    Promise.all([carregarParametros(), listarProdutos(true), carregarTabelaContract()])
      .then(([p, pr, c]) => { setParams(p); setProdutos(pr); setContract(c) })
      .catch(setErro)
  }, [])

  const antecedencia = params ? numero(params, 'antecedencia_dias', 60) : 60
  const transit = params ? numero(params, 'transit_dias', 3) : 3
  const dataMinima = somarDias(hoje(), antecedencia)
  const chegada = dataEmbarque ? dataChegadaFR(dataEmbarque, transit) : ''
  const familias = useMemo(() => Array.from(new Set((produtos ?? []).map((p) => p.familia ?? 'Outros'))).sort(), [produtos])
  const visiveis = useMemo(() => (produtos ?? []).filter((p) => {
    const t = busca.trim().toLowerCase()
    const okBusca = !t || p.sku.includes(t) || p.descricao_br.toLowerCase().includes(t) || (p.descricao_fr ?? '').toLowerCase().includes(t)
    const okFam = !familia || (p.familia ?? 'Outros') === familia
    return okBusca && okFam
  }), [produtos, busca, familia])

  const itens: (ItemCarrinho & { produto: Produto })[] = useMemo(() => Object.entries(carrinho)
    .filter(([, q]) => q > 0)
    .map(([sku, q]) => {
      const produto = produtos!.find((p) => p.sku === sku)!
      const { qtd, caixas } = arredondarParaCaixas(q, produto.multiplo_caixa ?? 0)
      return { sku, qtd, caixas, preco_eur: produto.preco_interco_eur, produto }
    }), [carrinho, produtos])
  const total = itens.reduce((s, i) => s + (i.preco_eur ?? 0) * i.qtd, 0)

  function ajustar(p: Produto, delta: number) {
    const mult = p.multiplo_caixa ?? 1
    setCarrinho((c) => ({ ...c, [p.sku]: Math.max(0, (c[p.sku] ?? 0) + delta * mult) }))
  }
  function definir(p: Produto, valor: number) {
    setCarrinho((c) => ({ ...c, [p.sku]: Math.max(0, valor) }))
  }

  async function enviar() {
    if (!user || !contract) return
    setEnviando(true); setErro(null)
    try {
      const pedido = await criarPedido({
        userId: user.id, dataEmbarque, transitDias: transit, contractVersao: contract.versao,
        poFranca: poFranca || null, observacao: obs || null, itens: itens.map(({ produto: _p, ...i }) => i),
      })
      nav(`/pedidos/${pedido.id}?novo=1`)
    } catch (e) { setErro(e); setEnviando(false) }
  }

  if (erro && !params) return <Erro erro={erro} />
  if (!params || !produtos || !contract) return <Carregando />

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Novo pedido</h1>
      <ol className="flex gap-2 text-sm">
        {(['data', 'itens', 'carrinho'] as Passo[]).map((p, i) => (
          <li key={p} className={`pill ${passo === p ? 'bg-marca' : 'bg-linha/60 text-tinta-3'}`}>{i + 1}. {p === 'data' ? 'Data de embarque' : p === 'itens' ? 'Escolher itens' : 'Carrinho e envio'}</li>
        ))}
      </ol>

      {passo === 'data' && (
        <section className="cartao max-w-xl space-y-4">
          <p className="text-sm text-tinta-2">
            O pedido precisa ser feito com <b>{antecedencia} dias</b> de antecedência. O embarque sai da fábrica na
            segunda-feira e chega na França {transit} dias depois. Escolha uma segunda-feira a partir de <b>{fmtData(dataMinima)}</b>.
          </p>
          <label className="block">
            <span className="rotulo">Data esperada de embarque na fábrica</span>
            <input type="date" className="mt-1" min={dataMinima} value={dataEmbarque} onChange={(e) => setDataEmbarque(e.target.value)} />
          </label>
          {dataEmbarque && dataEmbarque < dataMinima && <p className="text-sm text-erro">Data anterior ao prazo mínimo de {antecedencia} dias.</p>}
          {dataEmbarque && diaDaSemana(dataEmbarque) !== 1 && <p className="text-sm text-alerta">Atenção: essa data não é segunda-feira. O embarque padrão sai às segundas.</p>}
          {dataEmbarque && dataEmbarque >= dataMinima && <p className="text-sm">Chegada prevista na França: <b>{fmtData(chegada)}</b></p>}
          <label className="block"><span className="rotulo">Nº do pedido (PO) na França · opcional</span><input className="mt-1 w-full" value={poFranca} onChange={(e) => setPoFranca(e.target.value)} placeholder="Ship.2026xx-PA00xxx" /></label>
          <button className="btn-primario" disabled={!dataEmbarque || dataEmbarque < dataMinima} onClick={() => setPasso('itens')}>Continuar para os itens →</button>
        </section>
      )}

      {passo === 'itens' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grow"><span className="rotulo">Buscar</span><input className="mt-1 w-full" placeholder="SKU ou descrição" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
            <label><span className="rotulo">Família</span>
              <select className="mt-1" value={familia} onChange={(e) => setFamilia(e.target.value)}><option value="">Todas</option>{familias.map((f) => <option key={f}>{f}</option>)}</select>
            </label>
            <div className="ml-auto text-sm">Embarque <b>{fmtData(dataEmbarque)}</b> · {itens.length} itens · {fmtEur(total)}</div>
            <button className="btn-primario" disabled={itens.length === 0} onClick={() => setPasso('carrinho')}>Ver carrinho →</button>
          </div>
          <div className="cartao overflow-x-auto p-0">
            <table className="grade">
              <thead><tr><th>SKU</th><th>Produto</th><th>UM</th><th>Múltiplo/caixa</th><th>Shelf life</th><th>Produzir após</th><th>Preço aprox.</th><th>Últimos 10 meses</th><th>Quantidade</th></tr></thead>
              <tbody>
                {visiveis.map((p) => {
                  const q = carrinho[p.sku] ?? 0
                  const minProd = p.shelf_life_dias ? dataMinimaProducao(chegada, p.shelf_life_dias, contract.tabela) : null
                  return (
                    <tr key={p.sku} className={q > 0 ? 'bg-marca/10' : ''}>
                      <td className="font-mono">{p.sku}</td>
                      <td><div className="font-medium">{p.descricao_br}</div>{p.descricao_fr && <div className="text-xs text-tinta-3">{p.descricao_fr}</div>}</td>
                      <td>{p.unidade}</td>
                      <td>{p.multiplo_caixa ? `${fmtNum(p.multiplo_caixa)} ${p.unidade === 'Kg' ? 'kg' : 'un'}` : '—'}</td>
                      <td>{p.shelf_life_dias ? `${p.shelf_life_dias} d` : <span className="text-erro">sem regra</span>}</td>
                      <td>{minProd ? fmtData(minProd) : '—'}</td>
                      <td>{fmtEur(p.preco_interco_eur)}</td>
                      <td className="text-tinta-3">{p.qtd_10_meses ? `${fmtNum(p.qtd_10_meses)} em ${p.num_embarques_10_meses} emb.` : '—'}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button className="btn-secundario !px-2 !py-1" onClick={() => ajustar(p, -1)} aria-label="menos uma caixa">−</button>
                          <input type="number" className="w-24 !py-1" min={0} step={p.multiplo_caixa ?? 1} value={q} onChange={(e) => definir(p, Number(e.target.value))} />
                          <button className="btn-secundario !px-2 !py-1" onClick={() => ajustar(p, 1)} aria-label="mais uma caixa">+</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {passo === 'carrinho' && (
        <section className="space-y-3">
          <div className="cartao overflow-x-auto p-0">
            <table className="grade">
              <thead><tr><th>SKU</th><th>Produto</th><th>Qtd</th><th>Caixas</th><th>Preço</th><th>Total</th><th></th></tr></thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.sku}>
                    <td className="font-mono">{i.sku}</td>
                    <td>{i.produto.descricao_br}</td>
                    <td><input type="number" className="w-24 !py-1" min={0} step={i.produto.multiplo_caixa ?? 1} value={carrinho[i.sku]} onChange={(e) => definir(i.produto, Number(e.target.value))} />
                      {i.qtd !== carrinho[i.sku] && <div className="text-xs text-alerta">ajustado para {fmtNum(i.qtd)} (múltiplo de caixa)</div>}</td>
                    <td>{fmtNum(i.caixas)}</td>
                    <td>{fmtEur(i.preco_eur)}</td>
                    <td>{fmtEur((i.preco_eur ?? 0) * i.qtd)}</td>
                    <td><button className="text-sm text-erro underline" onClick={() => definir(i.produto, 0)}>remover</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={5} className="text-right font-semibold">Total estimado</td><td className="font-semibold">{fmtEur(total)}</td><td /></tr></tfoot>
            </table>
          </div>
          <p className="text-xs text-tinta-3">Valores aproximados (preço interco EXW). O documento válido é a invoice comercial.</p>
          <label className="block"><span className="rotulo">Observações</span><textarea className="mt-1 w-full" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} /></label>
          {erro ? <Erro erro={erro} /> : null}
          <div className="flex gap-2">
            <button className="btn-secundario" onClick={() => setPasso('itens')}>← Editar itens</button>
            <button className="btn-primario" disabled={enviando || itens.length === 0} onClick={enviar}>{enviando ? 'Enviando…' : 'Enviar pedido para a Dengo Brasil'}</button>
          </div>
        </section>
      )}
    </div>
  )
}
