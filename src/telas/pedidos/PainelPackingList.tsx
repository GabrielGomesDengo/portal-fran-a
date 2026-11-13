import { useMemo, useState } from 'react'
import { mudarStatus, registrarEvento } from '../../dados/pedidos'
import { salvarPackingList, type PackingList, type Pallet, type Recebimento } from '../../dados/operacoes'
import { linhaPesoDe, pesoBrutoLinha, pesoLiquidoLinha, totaisPallet } from '../../dominio/pesos'
import { fmtNum, hoje } from '../../lib/formatos'
import { Erro } from '../../components/Carregando'
import type { Pedido, Produto } from '../../tipos/dominio'
import { exportarPackingListExcel } from '../../documentos/exportarOperacoes'
import { gerarPackingListPdf } from '../../documentos/pdf'

export function PainelPackingList({ pedido, produtos, recebimentos, inicial, dimensoesPadrao, taraPallet, taraMasterBox, userId, editavel, aoConcluir }: {
  pedido: Pedido; produtos: Produto[]; recebimentos: Recebimento[]; inicial: { pl: PackingList; pallets: Pallet[] } | null
  dimensoesPadrao: string; taraPallet: number; taraMasterBox: number; userId: string; editavel: boolean; aoConcluir: () => void
}) {
  const prod = (sku: string) => produtos.find((p) => p.sku === sku)
  const [pl, setPl] = useState<PackingList>(inicial?.pl ?? { pedido_id: pedido.id, numero: null, data: hoje(), tara_pallet_kg: taraPallet, tara_master_box_kg: taraMasterBox })
  const [pallets, setPallets] = useState<Pallet[]>(inicial?.pallets ?? [{ numero: 1, dimensoes: dimensoesPadrao, linhas: [] }])
  const [erro, setErro] = useState<unknown>(null); const [ocupado, setOcupado] = useState(false); const [salvo, setSalvo] = useState(false)
  const lotesRecebidos = useMemo(() => recebimentos.filter((r) => r.qtd_recebida > 0 && r.lote), [recebimentos])
  const embalado = useMemo(() => { const m = new Map<string, number>(); for (const p of pallets) for (const l of p.linhas) m.set(`${l.sku}|${l.lote}`, (m.get(`${l.sku}|${l.lote}`) ?? 0) + l.qtd); return m }, [pallets])

  function setPallet(i: number, campos: Partial<Pallet>) { setPallets((ps) => ps.map((p, k) => (k === i ? { ...p, ...campos } : p))); setSalvo(false) }
  function setLinha(i: number, j: number, campos: Partial<Pallet['linhas'][number]>) {
    setPallets((ps) => ps.map((p, k) => k !== i ? p : { ...p, linhas: p.linhas.map((l, m) => {
      if (m !== j) return l; const n = { ...l, ...campos }
      if (campos.qtd !== undefined) { const pr = prod(l.sku); const mult = pr?.multiplo_caixa ?? 0; if (mult > 0) n.caixas = Math.ceil(campos.qtd / mult) }
      return n }) })); setSalvo(false)
  }
  function addLinha(i: number, chave: string) {
    const [sku, lote] = chave.split('|'); const r = lotesRecebidos.find((x) => x.sku === sku && x.lote === lote); if (!r) return
    const restante = Math.max(0, r.qtd_recebida - (embalado.get(chave) ?? 0)); const mult = prod(sku)?.multiplo_caixa ?? 0
    setPallet(i, { linhas: [...pallets[i].linhas, { sku, lote: lote!, qtd: restante, caixas: mult > 0 ? Math.ceil(restante / mult) : restante }] })
  }
  function addPallet() { setPallets((ps) => [...ps, { numero: ps.length + 1, dimensoes: dimensoesPadrao, linhas: [] }]) }
  function rmPallet(i: number) { setPallets((ps) => ps.filter((_, k) => k !== i).map((p, k) => ({ ...p, numero: k + 1 }))) }

  const totais = pallets.map((p) => totaisPallet(p.linhas.map((l) => linhaPesoDe(prod(l.sku), l.qtd, l.caixas)), pl.tara_master_box_kg, pl.tara_pallet_kg))
  const geral = { pallets: pallets.filter((p) => p.linhas.length > 0).length, bruto: totais.reduce((s, t) => s + (t.caixas > 0 ? t.bruto : 0), 0), liquido: totais.reduce((s, t) => s + t.liquido, 0), caixas: totais.reduce((s, t) => s + t.caixas, 0) }
  const pendentes = lotesRecebidos.filter((r) => (embalado.get(`${r.sku}|${r.lote}`) ?? 0) < r.qtd_recebida)

  async function salvar(avancar = false) {
    setErro(null); setOcupado(true)
    try {
      await salvarPackingList(pedido.id, pl, pallets)
      await registrarEvento(pedido.id, pedido.status, pedido.status, userId, 'Packing list atualizado')
      if (avancar) await mudarStatus(pedido, 'invoice_gerada', userId, 'Packing list concluído; invoice gerada')
      setSalvo(true); aoConcluir()
    } catch (e) { setErro(e) } finally { setOcupado(false) }
  }

  return (
    <section className="cartao space-y-4 border-marca">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Packing list</h2>
        <div className="text-sm text-tinta-2">{geral.pallets} pallets · {fmtNum(geral.caixas)} caixas · bruto {fmtNum(geral.bruto, 3)} kg · líquido {fmtNum(geral.liquido, 3)} kg</div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <label><span className="rotulo">Nº packing list</span><input className="mt-1 w-full" value={pl.numero ?? ''} disabled={!editavel} onChange={(e) => setPl({ ...pl, numero: e.target.value || null })} placeholder="ex.: PL-2611" /></label>
        <label><span className="rotulo">Data</span><input type="date" className="mt-1 w-full" value={pl.data} disabled={!editavel} onChange={(e) => setPl({ ...pl, data: e.target.value })} /></label>
        <label><span className="rotulo">Master box + wrapping (kg/pallet)</span><input type="number" step="0.1" className="mt-1 w-full" value={pl.tara_master_box_kg} disabled={!editavel} onChange={(e) => setPl({ ...pl, tara_master_box_kg: Number(e.target.value) })} /></label>
        <label><span className="rotulo">Pallet (kg)</span><input type="number" step="0.1" className="mt-1 w-full" value={pl.tara_pallet_kg} disabled={!editavel} onChange={(e) => setPl({ ...pl, tara_pallet_kg: Number(e.target.value) })} /></label>
      </div>
      {pendentes.length > 0 && <p className="rounded-md bg-alerta/10 p-2 text-xs text-alerta">{pendentes.length} lote(s) recebido(s) ainda não totalmente embalado(s): {pendentes.map((r) => `${r.sku}/${r.lote} (${fmtNum(r.qtd_recebida - (embalado.get(`${r.sku}|${r.lote}`) ?? 0))})`).join(', ')}</p>}
      {pallets.map((p, i) => (
        <div key={i} className="rounded-lg border border-linha p-3">
          <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
            <b>PALLET Nº {p.numero}</b>
            <label>Dimensões (m): <input className="w-40 !py-0.5" value={p.dimensoes ?? ''} disabled={!editavel} onChange={(e) => setPallet(i, { dimensoes: e.target.value })} /></label>
            <span className="text-tinta-3">bruto {fmtNum(totais[i].bruto, 3)} kg · líquido {fmtNum(totais[i].liquido, 3)} kg · {fmtNum(totais[i].caixas)} caixas</span>
            {editavel && pallets.length > 1 && <button className="ml-auto text-xs text-erro underline" onClick={() => rmPallet(i)}>remover pallet</button>}
          </div>
          <table className="grade">
            <thead><tr><th>Item ID</th><th>HS code</th><th>Descrição EN</th><th>Lote</th><th>UM</th><th>Qtd</th><th>Peso líq. un.</th><th>Peso líq. total</th><th>Caixas</th><th>Peso bruto</th><th></th></tr></thead>
            <tbody>
              {p.linhas.map((l, j) => { const pr = prod(l.sku); const lp = linhaPesoDe(pr, l.qtd, l.caixas); return (
                <tr key={j}><td className="font-mono">{l.sku}</td><td className="font-mono text-xs">{pr?.hs_code}</td><td>{pr?.descricao_en ?? pr?.descricao_br}</td><td className="font-mono">{l.lote}</td><td>{pr?.unidade}</td>
                  <td>{editavel ? <input type="number" className="w-24 !py-1" min={0} value={l.qtd} onChange={(e) => setLinha(i, j, { qtd: Number(e.target.value) })} /> : fmtNum(l.qtd, 3)}</td>
                  <td>{fmtNum(pr?.unidade === 'Kg' ? (pr?.multiplo_caixa ?? 0) : (pr?.peso_liq_un_kg ?? 0), 3)}</td><td className="font-semibold">{fmtNum(pesoLiquidoLinha(lp), 3)}</td>
                  <td>{editavel ? <input type="number" className="w-20 !py-1" min={0} value={l.caixas} onChange={(e) => setLinha(i, j, { caixas: Number(e.target.value) })} /> : fmtNum(l.caixas)}</td>
                  <td className="font-semibold">{fmtNum(pesoBrutoLinha(lp), 3)}</td>
                  <td>{editavel && <button className="text-xs text-erro underline" onClick={() => setPallet(i, { linhas: p.linhas.filter((_, m) => m !== j) })}>remover</button>}</td></tr>) })}
            </tbody>
          </table>
          {editavel && (
            <select className="mt-2 !py-1 text-sm" value="" onChange={(e) => e.target.value && addLinha(i, e.target.value)}>
              <option value="">+ adicionar lote recebido…</option>
              {lotesRecebidos.map((r) => { const k = `${r.sku}|${r.lote}`; const resta = r.qtd_recebida - (embalado.get(k) ?? 0); return <option key={k} value={k}>{r.sku} · {prod(r.sku)?.descricao_br} · lote {r.lote} · restam {fmtNum(resta)}</option> })}
            </select>
          )}
        </div>
      ))}
      {erro ? <Erro erro={erro} /> : null}
      <div className="flex flex-wrap gap-2">
        {editavel && <button className="btn-secundario" onClick={addPallet}>+ Pallet</button>}
        <button className="btn-primario" onClick={() => gerarPackingListPdf(pedido, pl, pallets, produtos, pl.numero)}>⬇ Packing list em PDF</button>
        <button className="btn-secundario" onClick={() => exportarPackingListExcel(pedido, pl, pallets, produtos, pl.numero)}>⬇ Packing list em Excel</button>
        {editavel && <>
          <button className="btn-secundario" disabled={ocupado} onClick={() => salvar(false)}>Salvar packing list</button>
          {pedido.status === 'packing_list' && <button className="btn-primario" disabled={ocupado || geral.caixas === 0} onClick={() => salvar(true)}>Gerar invoice →</button>}
        </>}
        {salvo && <span className="text-sm text-ok">Salvo.</span>}
      </div>
    </section>
  )
}
