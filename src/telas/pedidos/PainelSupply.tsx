import { useMemo, useState } from 'react'
import { aplicarEdicaoSupply, mudarStatus } from '../../dados/pedidos'
import { arredondarParaCaixas } from '../../dominio/caixas'
import { dataChegadaFR, dataMinimaProducao, type FaixaContractDate } from '../../dominio/contractDate'
import { fmtData, fmtEur, fmtNum, hoje } from '../../lib/formatos'
import { Erro } from '../../components/Carregando'
import type { Pedido, PedidoItem, Produto } from '../../tipos/dominio'

type Linha = { sku: string; qtd_solicitada: number; qtd_aprovada: number; observacao: string; novo: boolean }

export function PainelSupply({ pedido, itens, produtos, contract, userId, aoConcluir }: {
  pedido: Pedido; itens: PedidoItem[]; produtos: Produto[]; contract: FaixaContractDate[]; userId: string; aoConcluir: () => void
}) {
  const [data, setData] = useState(pedido.data_embarque)
  const [obs, setObs] = useState(pedido.observacao ?? '')
  const [linhas, setLinhas] = useState<Linha[]>(itens.map((i) => ({ sku: i.sku, qtd_solicitada: i.qtd_solicitada, qtd_aprovada: i.qtd_aprovada ?? i.qtd_solicitada, observacao: i.observacao ?? '', novo: false })))
  const [skuNovo, setSkuNovo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<unknown>(null)
  const [ocupado, setOcupado] = useState(false)
  const chegada = dataChegadaFR(data, pedido.transit_dias)
  const prod = (sku: string) => produtos.find((p) => p.sku === sku)
  const disponiveis = useMemo(() => produtos.filter((p) => p.ativo && !linhas.some((l) => l.sku === p.sku)), [produtos, linhas])

  function setLinha(sku: string, campos: Partial<Linha>) { setLinhas((ls) => ls.map((l) => (l.sku === sku ? { ...l, ...campos } : l))) }
  function incluir() {
    const p = prod(skuNovo); if (!p) return
    setLinhas((ls) => [...ls, { sku: p.sku, qtd_solicitada: 0, qtd_aprovada: p.multiplo_caixa ?? 1, observacao: '', novo: true }]); setSkuNovo('')
  }
  function ajustarCaixas(l: Linha) {
    const p = prod(l.sku); const { qtd } = arredondarParaCaixas(l.qtd_aprovada, p?.multiplo_caixa ?? 0); if (qtd !== l.qtd_aprovada) setLinha(l.sku, { qtd_aprovada: qtd })
  }

  async function concluir(acao: 'aprovar' | 'ajustar' | 'recusar') {
    setErro(null); setOcupado(true)
    try {
      if (acao === 'recusar') {
        if (!motivo.trim()) throw new Error('Informe o motivo da recusa.')
        await mudarStatus(pedido, 'recusado_supply', userId, motivo.trim())
      } else {
        const mudou = await aplicarEdicaoSupply(pedido, itens, {
          dataEmbarque: data, observacao: obs || null,
          itens: linhas.filter((l) => l.qtd_aprovada > 0).map((l) => ({ sku: l.sku, qtd_aprovada: l.qtd_aprovada, observacao: l.observacao || null })),
        }, userId)
        const removidos = linhas.some((l) => l.qtd_aprovada <= 0 && !l.novo)
        if (acao === 'aprovar' && !mudou && !removidos) await mudarStatus(pedido, 'aprovado', userId, null)
        else await mudarStatus({ ...pedido, status: 'ajustado_supply' }, 'aguardando_fr', userId, motivo.trim() || 'Pedido ajustado por Supply')
      }
      aoConcluir()
    } catch (e) { setErro(e) } finally { setOcupado(false) }
  }

  const total = linhas.reduce((s, l) => s + (prod(l.sku)?.preco_interco_eur ?? 0) * l.qtd_aprovada, 0)

  return (
    <section className="cartao space-y-4 border-marca">
      <h2 className="font-semibold">Validação do Supply</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block"><span className="rotulo">Data de embarque</span><input type="date" className="mt-1 w-full" value={data} onChange={(e) => setData(e.target.value)} />
          <span className="text-xs text-tinta-3">Chegada FR {fmtData(chegada)}{data !== pedido.data_embarque && ' · alterada'}</span></label>
        <label className="block md:col-span-2"><span className="rotulo">Observação geral</span><input className="mt-1 w-full" value={obs} onChange={(e) => setObs(e.target.value)} /></label>
      </div>
      <div className="overflow-x-auto">
        <table className="grade">
          <thead><tr><th>SKU</th><th>Produto</th><th>Solicitado</th><th>Aprovado</th><th>Caixas</th><th>Produzir após</th><th>Observação</th><th></th></tr></thead>
          <tbody>
            {linhas.map((l) => {
              const p = prod(l.sku); const minProd = p?.shelf_life_dias ? dataMinimaProducao(chegada, p.shelf_life_dias, contract) : null
              const inviavel = minProd !== null && minProd < hoje()
              return (
                <tr key={l.sku} className={l.qtd_aprovada !== l.qtd_solicitada ? 'bg-marca/10' : ''}>
                  <td className="font-mono">{l.sku}{l.novo && <span className="pill ml-1 bg-ok/15 text-ok">novo</span>}</td>
                  <td>{p?.descricao_br ?? l.sku}<div className="text-xs text-tinta-3">{p?.multiplo_caixa ? `${fmtNum(p.multiplo_caixa)}/cx · ` : ''}{fmtEur(p?.preco_interco_eur)}</div></td>
                  <td>{fmtNum(l.qtd_solicitada)}</td>
                  <td><input type="number" className="w-24 !py-1" min={0} step={p?.multiplo_caixa ?? 1} value={l.qtd_aprovada} onChange={(e) => setLinha(l.sku, { qtd_aprovada: Number(e.target.value) })} onBlur={() => ajustarCaixas(l)} /></td>
                  <td>{p?.multiplo_caixa ? fmtNum(l.qtd_aprovada / p.multiplo_caixa, 1) : '—'}</td>
                  <td className={inviavel ? 'text-erro font-semibold' : ''}>{minProd ? fmtData(minProd) : <span className="text-erro">sem regra</span>}{inviavel && <div className="text-xs">já passou: não atende o contract date</div>}</td>
                  <td><input className="w-44 !py-1" value={l.observacao} onChange={(e) => setLinha(l.sku, { observacao: e.target.value })} /></td>
                  <td><button className="text-sm text-erro underline" onClick={() => setLinha(l.sku, { qtd_aprovada: 0 })}>zerar</button></td>
                </tr>
              )
            })}
          </tbody>
          <tfoot><tr><td colSpan={7} className="text-right font-semibold">Total aprovado (estimado)</td><td className="font-semibold">{fmtEur(total)}</td></tr></tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grow"><span className="rotulo">Incluir produto</span>
          <select className="mt-1 w-full" value={skuNovo} onChange={(e) => setSkuNovo(e.target.value)}>
            <option value="">— escolher —</option>
            {disponiveis.map((p) => <option key={p.sku} value={p.sku}>{p.sku} · {p.descricao_br}</option>)}
          </select></label>
        <button className="btn-secundario" disabled={!skuNovo} onClick={incluir}>+ Incluir</button>
      </div>
      <label className="block"><span className="rotulo">Motivo (obrigatório para recusar; opcional para ajustes)</span><textarea className="mt-1 w-full" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
      {erro ? <Erro erro={erro} /> : null}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primario" disabled={ocupado} onClick={() => concluir('aprovar')}>Aprovar</button>
        <button className="btn-secundario" disabled={ocupado} onClick={() => concluir('ajustar')}>Enviar ajustes para a França</button>
        <button className="btn-perigo" disabled={ocupado} onClick={() => concluir('recusar')}>Recusar pedido</button>
      </div>
      <p className="text-xs text-tinta-3">"Aprovar" com alterações nas quantidades, itens ou data envia o pedido para a França validar antes de seguir ao PCP.</p>
    </section>
  )
}
