import { useMemo, useState } from 'react'
import { mudarStatus, registrarEvento } from '../../dados/pedidos'
import { salvarInvoice, type CreditNote, type Invoice, type InvoiceLinha, type Pallet, type Recebimento } from '../../dados/operacoes'
import { linhaPesoDe, pesoBrutoLinha, pesoLiquidoLinha } from '../../dominio/pesos'
import { avaliarValidade, type FaixaContractDate } from '../../dominio/contractDate'
import { fmtData, fmtEur, fmtNum, hoje } from '../../lib/formatos'
import { Erro } from '../../components/Carregando'
import type { Pedido, Produto } from '../../tipos/dominio'
import { exportarInvoiceExcel, exportarArquivoSapExcel } from '../../documentos/exportarOperacoes'
import { gerarInvoicePdf } from '../../documentos/pdf'

export type LinhaInvoiceCalc = InvoiceLinha & { descricao: string; unidade: string; preco_brl: number | null; total_eur: number; total_brl: number | null; semanas_restantes: number | null; atende: boolean | null; conformidade: number | null }

/** Consolida o packing list por SKU + lote (mesma chave da planilha) e cruza com recebimento (BBE) e cadastro. */
export function consolidarInvoice(pallets: Pallet[], recebimentos: Recebimento[], produtos: Produto[]): InvoiceLinha[] {
  const m = new Map<string, InvoiceLinha>()
  for (const p of pallets) for (const l of p.linhas) {
    const k = `${l.sku}|${l.lote}`; const pr = produtos.find((x) => x.sku === l.sku); const lp = linhaPesoDe(pr, l.qtd, l.caixas)
    const r = recebimentos.find((x) => x.sku === l.sku && x.lote === l.lote)
    const e = m.get(k) ?? { sku: l.sku, lote: l.lote, bbe: r?.validade ?? null, hs_code: pr?.hs_code ?? null, qtd: 0, caixas: 0, peso_liq_kg: 0, peso_bruto_kg: 0, preco_eur: pr?.preco_interco_eur ?? null, cogs_eur: pr?.cogs_eur ?? null }
    e.qtd += l.qtd; e.caixas = (e.caixas ?? 0) + l.caixas; e.peso_liq_kg = (e.peso_liq_kg ?? 0) + pesoLiquidoLinha(lp); e.peso_bruto_kg = (e.peso_bruto_kg ?? 0) + pesoBrutoLinha(lp)
    m.set(k, e)
  }
  return [...m.values()].sort((a, b) => a.sku.localeCompare(b.sku) || a.lote.localeCompare(b.lote))
}

export function calcularLinhas(linhas: InvoiceLinha[], produtos: Produto[], ptax: number | null, dataChegada: string, contract: FaixaContractDate[]): LinhaInvoiceCalc[] {
  return linhas.map((l) => {
    const pr = produtos.find((x) => x.sku === l.sku)
    const av = l.bbe && pr?.shelf_life_dias ? avaliarValidade(l.bbe, pr.shelf_life_dias, dataChegada, contract) : null
    const preco_brl = l.preco_eur !== null && ptax ? l.preco_eur * ptax : null
    return { ...l, descricao: pr?.descricao_en ?? pr?.descricao_br ?? l.sku, unidade: pr?.unidade ?? 'Unit', preco_brl, total_eur: (l.preco_eur ?? 0) * l.qtd, total_brl: preco_brl !== null ? preco_brl * l.qtd : null,
      semanas_restantes: av?.semanasRestantes ?? null, atende: av?.atende ?? null, conformidade: av?.conformidade ?? null }
  })
}

export function PainelInvoice({ pedido, produtos, pallets, recebimentos, inicial, contract, incoterm, moeda, numeroPL, userId, editavel, aoConcluir }: {
  pedido: Pedido; produtos: Produto[]; pallets: Pallet[]; recebimentos: Recebimento[]; inicial: { invoice: Invoice; linhas: InvoiceLinha[]; creditNotes: CreditNote[] } | null
  contract: FaixaContractDate[]; incoterm: string; moeda: string; numeroPL: string | null; userId: string; editavel: boolean; aoConcluir: () => void
}) {
  const [inv, setInv] = useState<Invoice>(inicial?.invoice ?? { pedido_id: pedido.id, numero: '', data: hoje(), due_date: hoje(), incoterm, moeda, ptax: null, delivery_date: pedido.data_chegada_fr, numero_packing_list: numeroPL, observacao: null })
  const [linhas, setLinhas] = useState<InvoiceLinha[]>(inicial?.linhas ?? consolidarInvoice(pallets, recebimentos, produtos))
  const [cn, setCn] = useState<Map<string, CreditNote>>(() => { const m = new Map<string, CreditNote>(); for (const c of inicial?.creditNotes ?? []) { const l = inicial!.linhas.find((x) => x.id === c.invoice_linha_id); if (l) m.set(`${l.sku}|${l.lote}`, c) } return m })
  const [erro, setErro] = useState<unknown>(null); const [ocupado, setOcupado] = useState(false); const [salvo, setSalvo] = useState(false)
  const calc = useMemo(() => calcularLinhas(linhas, produtos, inv.ptax, inv.delivery_date ?? pedido.data_chegada_fr, contract), [linhas, produtos, inv.ptax, inv.delivery_date, pedido.data_chegada_fr, contract])
  const tot = { eur: calc.reduce((s, l) => s + l.total_eur, 0), brl: calc.reduce((s, l) => s + (l.total_brl ?? 0), 0), liq: calc.reduce((s, l) => s + (l.peso_liq_kg ?? 0), 0), bruto: calc.reduce((s, l) => s + (l.peso_bruto_kg ?? 0), 0) }
  const foraContract = calc.filter((l) => l.atende === false)

  function setCredit(k: string, l: LinhaInvoiceCalc, aceite: boolean | null) {
    const valor = aceite === false ? (l.cogs_eur ?? 0) * l.qtd : 0
    setCn((m) => new Map(m).set(k, { invoice_linha_id: '', aceite_franca: aceite, valor_credito_eur: valor })); setSalvo(false)
  }
  async function salvar(concluir = false) {
    setErro(null); setOcupado(true)
    try {
      if (!inv.numero.trim()) throw new Error('Informe o número da invoice.')
      await salvarInvoice(pedido.id, inv, linhas, cn)
      await registrarEvento(pedido.id, pedido.status, pedido.status, userId, `Invoice ${inv.numero} salva`)
      if (concluir) await mudarStatus(pedido, 'concluido', userId, 'Invoice emitida; dados para NF gerados')
      setSalvo(true); aoConcluir()
    } catch (e) { setErro(e) } finally { setOcupado(false) }
  }
  const f = (campos: Partial<Invoice>) => { setInv({ ...inv, ...campos }); setSalvo(false) }

  return (
    <section className="cartao space-y-4 border-marca">
      <h2 className="font-semibold">Commercial invoice</h2>
      <div className="grid gap-3 md:grid-cols-6">
        <label><span className="rotulo">Nº invoice</span><input className="mt-1 w-full" value={inv.numero} disabled={!editavel} onChange={(e) => f({ numero: e.target.value })} placeholder="108321" /></label>
        <label><span className="rotulo">Data</span><input type="date" className="mt-1 w-full" value={inv.data} disabled={!editavel} onChange={(e) => f({ data: e.target.value })} /></label>
        <label><span className="rotulo">Due date</span><input type="date" className="mt-1 w-full" value={inv.due_date ?? ''} disabled={!editavel} onChange={(e) => f({ due_date: e.target.value || null })} /></label>
        <label><span className="rotulo">PTAX (BRL/EUR)</span><input type="number" step="0.0001" className="mt-1 w-full" value={inv.ptax ?? ''} disabled={!editavel} onChange={(e) => f({ ptax: e.target.value === '' ? null : Number(e.target.value) })} placeholder="6,0505" /></label>
        <label><span className="rotulo">Delivery date (ref. shelf life)</span><input type="date" className="mt-1 w-full" value={inv.delivery_date ?? ''} disabled={!editavel} onChange={(e) => f({ delivery_date: e.target.value || null })} /></label>
        <label><span className="rotulo">Incoterm / moeda</span><input className="mt-1 w-full" value={`${inv.incoterm} · ${inv.moeda}`} disabled /></label>
      </div>
      <div className="overflow-x-auto">
        <table className="grade">
          <thead><tr><th>#</th><th>ID Dengo</th><th>Lot</th><th>BBE</th><th>HS</th><th>Description</th><th>Boxes</th><th>Net kg</th><th>Qty</th><th>Unit</th><th>Gross kg</th><th>BRL</th><th>Total BRL</th><th>EUR</th><th>Total EUR</th><th>Sem. rest.</th><th>Contract</th><th>Credit note</th></tr></thead>
          <tbody>
            {calc.map((l, i) => { const k = `${l.sku}|${l.lote}`; const c = cn.get(k); return (
              <tr key={k} className={l.atende === false ? 'bg-erro/5' : ''}>
                <td>{i + 1}</td><td className="font-mono">{l.sku}</td><td className="font-mono">{l.lote}</td><td>{fmtData(l.bbe)}</td><td className="font-mono text-xs">{l.hs_code}</td><td>{l.descricao}</td>
                <td>{fmtNum(l.caixas)}</td><td>{fmtNum(l.peso_liq_kg, 3)}</td><td>{fmtNum(l.qtd, 3)}</td><td>{l.unidade}</td><td>{fmtNum(l.peso_bruto_kg, 3)}</td>
                <td>{l.preco_brl === null ? '—' : fmtNum(l.preco_brl, 2)}</td><td>{l.total_brl === null ? '—' : fmtNum(l.total_brl, 2)}</td>
                <td>{editavel ? <input type="number" step="0.01" className="w-20 !py-1" value={l.preco_eur ?? ''} onChange={(e) => { setLinhas((ls) => ls.map((x) => x.sku === l.sku && x.lote === l.lote ? { ...x, preco_eur: e.target.value === '' ? null : Number(e.target.value) } : x)); setSalvo(false) }} /> : fmtEur(l.preco_eur)}</td>
                <td className="font-semibold">{fmtEur(l.total_eur)}</td>
                <td>{l.semanas_restantes === null ? '—' : fmtNum(l.semanas_restantes, 1)}</td>
                <td>{l.atende === null ? '—' : l.atende ? <span className="pill bg-ok/15 text-ok">OK</span> : <span className="pill bg-erro/15 text-erro">{Math.round((l.conformidade ?? 0) * 100)}%</span>}</td>
                <td>{l.atende === false && (editavel ? (
                  <select className="!py-0.5 text-xs" value={c?.aceite_franca === null || c?.aceite_franca === undefined ? '' : c.aceite_franca ? 'sim' : 'nao'} onChange={(e) => setCredit(k, l, e.target.value === '' ? null : e.target.value === 'sim')}>
                    <option value="">França aceita?</option><option value="sim">aceita (sem crédito)</option><option value="nao">não aceita → crédito {fmtEur((l.cogs_eur ?? 0) * l.qtd)}</option>
                  </select>) : c?.aceite_franca === false ? `crédito ${fmtEur(c.valor_credito_eur)}` : c?.aceite_franca ? 'aceito' : '—')}</td>
              </tr>) })}
          </tbody>
          <tfoot><tr className="font-semibold"><td colSpan={7}>TOTAL</td><td>{fmtNum(tot.liq, 3)}</td><td colSpan={2} /><td>{fmtNum(tot.bruto, 3)}</td><td /><td>{inv.ptax ? fmtNum(tot.brl, 2) : '—'}</td><td /><td>{fmtEur(tot.eur)}</td><td colSpan={3} /></tr></tfoot>
        </table>
      </div>
      {foraContract.length > 0 && <p className="rounded-md bg-erro/10 p-2 text-xs text-erro">{foraContract.length} lote(s) fora do contract date. Registre se a França aceita; se não, o valor da credit note é COGS × quantidade.</p>}
      <label className="block"><span className="rotulo">Observação</span><input className="mt-1 w-full" value={inv.observacao ?? ''} disabled={!editavel} onChange={(e) => f({ observacao: e.target.value || null })} /></label>
      {erro ? <Erro erro={erro} /> : null}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primario" onClick={() => gerarInvoicePdf(pedido, inv, calc, tot)}>⬇ Invoice em PDF</button>
        <button className="btn-secundario" onClick={() => exportarInvoiceExcel(pedido, inv, calc, tot)}>⬇ Invoice em Excel</button>
        <button className="btn-secundario" onClick={() => exportarArquivoSapExcel(pedido, inv, calc, produtos)}>⬇ Dados para NF (SAP)</button>
        {editavel && <>
          <button className="btn-secundario" disabled={ocupado} onClick={() => salvar(false)}>Salvar invoice</button>
          {pedido.status === 'invoice_gerada' && <button className="btn-primario" disabled={ocupado} onClick={() => salvar(true)}>Concluir pedido</button>}
        </>}
        {salvo && <span className="text-sm text-ok">Salvo.</span>}
      </div>
    </section>
  )
}
