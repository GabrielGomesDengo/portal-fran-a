import { useEffect, useMemo, useState } from 'react'
import { listarProdutos, salvarProduto } from '../../dados/produtos'
import { Carregando, Erro } from '../../components/Carregando'
import { fmtEur, fmtNum } from '../../lib/formatos'
import type { Produto } from '../../tipos/dominio'

export function Produtos() {
  const [produtos, setProdutos] = useState<Produto[] | null>(null)
  const [erro, setErro] = useState<unknown>(null)
  const [busca, setBusca] = useState(''); const [soAtivos, setSoAtivos] = useState(true); const [soDiverg, setSoDiverg] = useState(false)
  useEffect(() => { listarProdutos().then(setProdutos).catch(setErro) }, [])
  const lista = useMemo(() => (produtos ?? []).filter((p) => {
    const t = busca.toLowerCase()
    return (!t || p.sku.includes(t) || p.descricao_br.toLowerCase().includes(t)) && (!soAtivos || p.ativo)
      && (!soDiverg || (p.shelf_life_dias_franca && p.shelf_life_dias !== p.shelf_life_dias_franca))
  }), [produtos, busca, soAtivos, soDiverg])

  async function editar(p: Produto, campos: Partial<Produto>) {
    setProdutos((ps) => ps!.map((x) => (x.sku === p.sku ? { ...x, ...campos } : x)))
    try { await salvarProduto(p.sku, campos) } catch (e) { setErro(e) }
  }
  if (erro) return <Erro erro={erro} />
  if (!produtos) return <Carregando />
  const divergentes = produtos.filter((p) => p.shelf_life_dias_franca && p.shelf_life_dias !== p.shelf_life_dias_franca).length
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Portfólio</h1>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <input placeholder="Buscar SKU ou descrição" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="flex items-center gap-1"><input type="checkbox" checked={soAtivos} onChange={(e) => setSoAtivos(e.target.checked)} /> só ativos</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={soDiverg} onChange={(e) => setSoDiverg(e.target.checked)} /> shelf life divergente da França ({divergentes})</label>
        <span className="ml-auto text-tinta-3">{lista.length} de {produtos.length} · {produtos.filter((p) => p.ativo).length} ativos</span>
      </div>
      <div className="cartao overflow-x-auto p-0">
        <table className="grade">
          <thead><tr><th>Ativo</th><th>SKU</th><th>Descrição</th><th>Família</th><th>UM</th><th>Múltiplo</th><th>Shelf SAP</th><th>Shelf FR</th><th>Preço €</th><th>HS</th><th>10 meses</th></tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.sku}>
                <td><input type="checkbox" checked={p.ativo} onChange={(e) => editar(p, { ativo: e.target.checked })} /></td>
                <td className="font-mono">{p.sku}</td>
                <td>{p.descricao_br}</td>
                <td className="text-xs">{p.familia}</td>
                <td>{p.unidade}</td>
                <td><input type="number" className="w-20 !py-1" value={p.multiplo_caixa ?? ''} onChange={(e) => editar(p, { multiplo_caixa: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                <td><input type="number" className="w-20 !py-1" value={p.shelf_life_dias ?? ''} onChange={(e) => editar(p, { shelf_life_dias: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                <td className={p.shelf_life_dias_franca && p.shelf_life_dias !== p.shelf_life_dias_franca ? 'text-alerta font-semibold' : 'text-tinta-3'}>{p.shelf_life_dias_franca ?? '—'}</td>
                <td><input type="number" step="0.01" className="w-24 !py-1" value={p.preco_interco_eur ?? ''} onChange={(e) => editar(p, { preco_interco_eur: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                <td className="font-mono text-xs">{p.hs_code}</td>
                <td className="text-tinta-3">{p.qtd_10_meses ? `${fmtNum(p.qtd_10_meses)} · ${fmtEur(p.preco_interco_eur)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
