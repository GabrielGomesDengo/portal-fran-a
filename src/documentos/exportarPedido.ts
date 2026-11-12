import ExcelJS from 'exceljs'
import type { Pedido, PedidoItem, Produto, StatusPedido } from '../tipos/dominio'
import { ROTULO_STATUS } from '../tipos/dominio'
import type { LotePlano } from '../dados/plano'
import type { Alteracao } from '../dados/pedidos'
import { dataMaximaProducao, dataMinimaProducao, situacaoProducao, validadeDoLote, type FaixaContractDate } from '../dominio/contractDate'
import { fmtData } from '../lib/formatos'
import type { CreditNote, Invoice, InvoiceLinha, PackingList, Pallet, Recebimento } from '../dados/operacoes'
import { linhaPesoDe, pesoBrutoLinha, pesoLiquidoLinha, totaisPallet } from '../dominio/pesos'
import { avaliarValidade } from '../dominio/contractDate'

export type DadosExportacao = {
  pedido: Pedido; itens: PedidoItem[]; produtos: Produto[]; plano: LotePlano[]; alteracoes: Alteracao[]
  eventos: { para_status: StatusPedido; motivo: string | null; criado_em: string }[]
  contract: FaixaContractDate[]; leadEstoque: number; antecedenciaEstoque: number
  recebimentos?: Recebimento[]; packing?: { pl: PackingList; pallets: Pallet[] } | null; invoice?: { invoice: Invoice; linhas: InvoiceLinha[]; creditNotes: CreditNote[] } | null
}

const AMARELO: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5B400' } }
function cabecalho(ws: ExcelJS.Worksheet, titulos: string[]) {
  const r = ws.addRow(titulos); r.font = { bold: true }; r.fill = AMARELO
  r.eachCell((c) => { c.border = { bottom: { style: 'thin' } } })
}
const SIT: Record<string, string> = { ok: 'Atende', antes_minima: 'Não atende: antes da data mínima', depois_maxima: 'Não chega ao estoque a tempo', sem_regra: 'Sem shelf life' }

/** Excel com o mesmo conteúdo que a página do pedido mostra, uma aba por bloco. */
export async function exportarPedidoExcel(d: DadosExportacao) {
  const { pedido, itens, produtos, plano, alteracoes, eventos, contract } = d
  const prod = (sku: string) => produtos.find((p) => p.sku === sku)
  const wb = new ExcelJS.Workbook()

  // ---- Aba Pedido ----
  const ws = wb.addWorksheet('Pedido')
  ws.columns = [{ width: 12 }, { width: 46 }, { width: 8 }, { width: 10 }, { width: 13 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 30 }]
  ws.mergeCells('A1:K1'); ws.getCell('A1').value = `PEDIDO ${pedido.numero} — DENGO EUROPE SAS → DENGO CHOCOLATES SA`; ws.getCell('A1').font = { bold: true, size: 14 }
  const cab: [string, string][] = [
    ['Status', ROTULO_STATUS[pedido.status]], ['Data de embarque', fmtData(pedido.data_embarque)], ['Transit (dias)', String(pedido.transit_dias)],
    ['Chegada prevista FR', fmtData(pedido.data_chegada_fr)], ['PO França', pedido.po_franca ?? ''], ['Criado em', new Date(pedido.criado_em).toLocaleString('pt-BR')],
    ['Observações', pedido.observacao ?? ''],
  ]
  cab.forEach(([k, v]) => { const r = ws.addRow([k, v]); r.getCell(1).font = { bold: true } })
  ws.addRow([])
  cabecalho(ws, ['SKU', 'Produto', 'UM', 'Múltiplo/cx', 'Shelf life (d)', 'Solicitado', 'Caixas', 'Aprovado', 'Preço EUR', 'Total EUR', 'Observação'])
  let total = 0
  for (const i of itens) {
    const p = prod(i.sku); const qtd = i.qtd_aprovada ?? i.qtd_solicitada; const preco = i.preco_eur ?? p?.preco_interco_eur ?? 0; total += preco * qtd
    ws.addRow([i.sku, p?.descricao_br ?? i.sku, p?.unidade ?? '', p?.multiplo_caixa ?? '', p?.shelf_life_dias ?? '', i.qtd_solicitada, i.caixas_solicitadas ?? '', i.qtd_aprovada ?? '', preco, preco * qtd, i.observacao ?? ''])
  }
  const tr = ws.addRow(['', '', '', '', '', '', '', '', 'TOTAL', total]); tr.font = { bold: true }
  ws.getColumn(9).numFmt = '€ #,##0.00'; ws.getColumn(10).numFmt = '€ #,##0.00'
  ws.addRow([]); ws.addRow(['Valores aproximados (preço interco EXW). Documento válido: invoice comercial.'])

  // ---- Aba Plano PCP ----
  if (plano.length > 0) {
    const wp = wb.addWorksheet('Plano PCP')
    wp.columns = [{ width: 12 }, { width: 46 }, { width: 6 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 13 }, { width: 13 }, { width: 7 }, { width: 12 }, { width: 32 }, { width: 36 }]
    const maxima = dataMaximaProducao(pedido.data_embarque, d.leadEstoque, d.antecedenciaEstoque)
    wp.mergeCells('A1:M1'); wp.getCell('A1').value = `PLANO DE PRODUÇÃO — pedido ${pedido.numero} · embarque ${fmtData(pedido.data_embarque)} · chegada FR ${fmtData(pedido.data_chegada_fr)} · produzir até ${fmtData(maxima)}`; wp.getCell('A1').font = { bold: true, size: 12 }
    wp.addRow([])
    cabecalho(wp, ['SKU', 'Produto', 'Lote', 'Qtd aprovada', 'Data mínima prod.', 'Data máxima prod.', 'Atender?', 'Qtd planejada', 'Data produção', 'Semana', 'Validade', 'Contract date', 'Observação PCP'])
    for (const l of plano) {
      const p = prod(l.sku); const item = itens.find((i) => i.sku === l.sku)
      const minima = p?.shelf_life_dias ? dataMinimaProducao(pedido.data_chegada_fr, p.shelf_life_dias, contract) : null
      const validade = l.data_producao && p?.shelf_life_dias ? validadeDoLote(l.data_producao, p.shelf_life_dias) : null
      const sit = l.data_producao ? SIT[situacaoProducao(l.data_producao, minima, maxima)] : ''
      wp.addRow([l.sku, p?.descricao_br ?? l.sku, l.lote_seq, l.lote_seq === 1 ? (item?.qtd_aprovada ?? item?.qtd_solicitada ?? '') : '', minima ? fmtData(minima) : 'sem regra', fmtData(maxima),
        l.atendimento ? l.atendimento.toUpperCase() : '', l.qtd_planejada ?? '', fmtData(l.data_producao), l.semana_producao ?? '', validade ? fmtData(validade) : '', sit, l.motivo ?? ''])
    }
  }

  // ---- Aba Alterações ----
  if (alteracoes.length > 0) {
    const wa = wb.addWorksheet('Alterações Supply')
    wa.columns = [{ width: 20 }, { width: 12 }, { width: 40 }, { width: 18 }, { width: 16 }, { width: 16 }]
    cabecalho(wa, ['Quando', 'SKU', 'Produto', 'Campo', 'De', 'Para'])
    for (const a of alteracoes) wa.addRow([new Date(a.criado_em).toLocaleString('pt-BR'), a.sku ?? '', a.sku ? prod(a.sku)?.descricao_br ?? '' : '', a.campo, a.valor_antigo ?? '', a.valor_novo ?? ''])
  }

  // ---- Aba Recebimento ----
  if (d.recebimentos && d.recebimentos.length > 0) {
    const wr = wb.addWorksheet('Recebimento')
    wr.columns = [{ width: 12 }, { width: 44 }, { width: 12 }, { width: 12 }, { width: 13 }, { width: 13 }, { width: 16 }, { width: 13 }, { width: 13 }, { width: 11 }]
    cabecalho(wr, ['SKU', 'Produto', 'Planejado', 'Lote', 'Fabricação', 'Validade', 'Contract date', 'Qtd recebida', 'Data receb.', 'Confirmado'])
    for (const r of d.recebimentos) {
      const p = prod(r.sku); const av = r.validade && p?.shelf_life_dias ? avaliarValidade(r.validade, p.shelf_life_dias, pedido.data_chegada_fr, contract) : null
      wr.addRow([r.sku, p?.descricao_br ?? '', r.qtd_planejada ?? '', r.lote ?? '', fmtData(r.data_fabricacao), fmtData(r.validade), av ? (av.atende ? 'Atende' : `Não atende (${Math.round(av.conformidade * 100)}%)`) : '', r.qtd_recebida, fmtData(r.data_recebimento), r.confirmado ? 'Sim' : 'Não'])
    }
  }
  // ---- Aba Packing list (resumo por pallet) ----
  if (d.packing && d.packing.pallets.some((p) => p.linhas.length > 0)) {
    const { pl, pallets } = d.packing
    const wpl = wb.addWorksheet('Packing list')
    wpl.columns = [{ width: 8 }, { width: 12 }, { width: 11 }, { width: 44 }, { width: 12 }, { width: 7 }, { width: 10 }, { width: 13 }, { width: 8 }, { width: 13 }]
    cabecalho(wpl, ['Pallet', 'Item ID', 'HS code', 'Descrição EN', 'Lote', 'UM', 'Qtd', 'Peso líq. kg', 'Caixas', 'Peso bruto kg'])
    for (const p of pallets) {
      for (const l of p.linhas) { const pr = prod(l.sku); const lp = linhaPesoDe(pr, l.qtd, l.caixas); wpl.addRow([p.numero, l.sku, pr?.hs_code ?? '', pr?.descricao_en ?? pr?.descricao_br ?? '', l.lote, pr?.unidade ?? '', l.qtd, Number(pesoLiquidoLinha(lp).toFixed(3)), l.caixas, Number(pesoBrutoLinha(lp).toFixed(3))]) }
      const t = totaisPallet(p.linhas.map((l) => linhaPesoDe(prod(l.sku), l.qtd, l.caixas)), pl.tara_master_box_kg, pl.tara_pallet_kg)
      const r = wpl.addRow([p.numero, 'TOTAL PALLET', '', p.dimensoes ?? '', '', '', '', Number(t.liquido.toFixed(3)), t.caixas, Number(t.bruto.toFixed(3))]); r.font = { bold: true }
    }
  }
  // ---- Aba Invoice ----
  if (d.invoice && d.invoice.linhas.length > 0) {
    const { invoice, linhas, creditNotes } = d.invoice
    const wi = wb.addWorksheet('Invoice')
    wi.columns = [{ width: 12 }, { width: 10 }, { width: 12 }, { width: 11 }, { width: 44 }, { width: 8 }, { width: 11 }, { width: 10 }, { width: 11 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 14 }, { width: 14 }]
    const cabI: [string, string][] = [['Nº invoice', invoice.numero], ['Data', fmtData(invoice.data)], ['Due date', fmtData(invoice.due_date)], ['Incoterm', invoice.incoterm], ['Moeda', invoice.moeda], ['PTAX', String(invoice.ptax ?? '')], ['Delivery date', fmtData(invoice.delivery_date)], ['Packing list', invoice.numero_packing_list ?? '']]
    cabI.forEach(([k, v]) => { const r = wi.addRow([k, v]); r.getCell(1).font = { bold: true } }); wi.addRow([])
    cabecalho(wi, ['ID Dengo', 'Lote', 'BBE', 'HS code', 'Descrição', 'Caixas', 'Peso líq. kg', 'Qtd', 'Peso bruto kg', 'EUR', 'Total EUR', 'BRL', 'Total BRL', 'Contract date', 'Credit note EUR'])
    for (const l of linhas) {
      const p = prod(l.sku); const av = l.bbe && p?.shelf_life_dias ? avaliarValidade(l.bbe, p.shelf_life_dias, invoice.delivery_date ?? pedido.data_chegada_fr, contract) : null
      const cn = creditNotes.find((c) => c.invoice_linha_id === l.id)
      wi.addRow([l.sku, l.lote, fmtData(l.bbe), l.hs_code ?? '', p?.descricao_en ?? p?.descricao_br ?? '', l.caixas ?? '', l.peso_liq_kg ?? '', l.qtd, l.peso_bruto_kg ?? '', l.preco_eur ?? '', (l.preco_eur ?? 0) * l.qtd, invoice.ptax && l.preco_eur !== null ? l.preco_eur * invoice.ptax : '', invoice.ptax && l.preco_eur !== null ? l.preco_eur * invoice.ptax * l.qtd : '', av ? (av.atende ? 'OK' : `${Math.round(av.conformidade * 100)}%`) : '', cn?.valor_credito_eur ?? ''])
    }
  }

  // ---- Aba Histórico ----
  const wh = wb.addWorksheet('Histórico')
  wh.columns = [{ width: 20 }, { width: 30 }, { width: 60 }]
  cabecalho(wh, ['Quando', 'Status', 'Motivo'])
  for (const e of eventos) wh.addRow([new Date(e.criado_em).toLocaleString('pt-BR'), ROTULO_STATUS[e.para_status] ?? e.para_status, e.motivo ?? ''])

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a'); a.href = url; a.download = `Pedido_${pedido.numero}_${pedido.status}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}
