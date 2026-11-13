// =============================================================
// PDFs no layout atual da Dengo: commercial invoice e packing list.
// Gerados no navegador com jsPDF + autotable.
// =============================================================
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Invoice, PackingList, Pallet } from '../dados/operacoes'
import type { Pedido, Produto } from '../tipos/dominio'
import { linhaPesoDe, pesoBrutoLinha, pesoLiquidoLinha, totaisPallet } from '../dominio/pesos'
import { fmtData } from '../lib/formatos'
import type { LinhaInvoiceCalc } from '../telas/pedidos/PainelInvoice'

export const EMPRESA = {
  supplier: ['DENGO CHOCOLATES SA', 'CNPJ 23.244.006/0001-00', 'RUA VIGÁRIO TAQUES BITTENCOURT, 171', '04755-060', 'SÃO PAULO - SP - BRAZIL'],
  importer: ['DENGO EUROPE SAS', 'VAT: FR 07904496254', '58 RUE BONAPARTE', '75006 PARIS', 'FRANCE'],
  importerPL: ['DENGO EUROPE SAS', 'VAT: FR 07904496254', 'PHONE: +33 06 59 73 25 80'],
  supplierPL: ['DENGO CHOCOLATES SA', 'VAT: 23.244.006/0001-00', 'ADDRESS: RUA VIGÁRIO TAQUES BITTENCOURT, 171 - 04755-060 - SÃO PAULO - BRAZIL'],
  banco: ['Bank: Itaú Bank S.A.', 'Bank Swift Code: ITAUBRSP', 'Branch Number: 0641', 'Account Number: 11698-3', 'IBAN: BR96 6070 1190 0064 1000 0116 983C 1'],
  transporte: ['TRANSPORTES YASMIN ARMAZ E LOGISTICA LTDA-ME', 'RUA CARLOPOLIS, 140 - ANT. 134 - PARQUE SAO LUIZ', 'CEP: 07170-540 - GUARULHOS - SP', 'CNPJ: 09.123.539/0001-02', 'INSCRIÇÃO ESTADUAL: 336821275110'],
}
const AMARELO: [number, number, number] = [245, 180, 0]
const n3 = (v: number | null | undefined) => (v === null || v === undefined ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }))
const n2 = (v: number | null | undefined) => (v === null || v === undefined ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const n0 = (v: number | null | undefined) => (v === null || v === undefined ? '' : v.toLocaleString('pt-BR', { maximumFractionDigits: 3 }))

/** Logo "dengo": caixa amarela com o nome em itálico. */
function logo(doc: jsPDF, x: number, y: number, tam = 16) {
  doc.setFillColor(...AMARELO); doc.rect(x, y, tam, tam, 'F')
  doc.setFont('times', 'italic'); doc.setFontSize(tam * 0.55); doc.setTextColor(26, 26, 26)
  doc.text('dengo', x + tam / 2, y + tam * 0.62, { align: 'center' }); doc.setFont('helvetica', 'normal')
}
function tituloCaixa(doc: jsPDF, texto: string, x: number, y: number, w: number, h = 9) {
  doc.setDrawColor(...AMARELO); doc.setLineWidth(0.4); doc.rect(x, y, w, h)
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text(texto, x + w / 2, y + h / 2 + 1.3, { align: 'center' }); doc.setFont('helvetica', 'normal')
}
function bloco(doc: jsPDF, linhas: string[], x: number, y: number, opts: { negrito?: number; tam?: number; align?: 'left' | 'center' } = {}) {
  const tam = opts.tam ?? 7; doc.setFontSize(tam)
  linhas.forEach((l, i) => { doc.setFont('helvetica', i < (opts.negrito ?? 0) ? 'bold' : 'normal'); doc.text(l, x, y + i * (tam * 0.5), { align: opts.align ?? 'left' }) })
  doc.setFont('helvetica', 'normal')
}

export function gerarInvoicePdf(pedido: Pedido, inv: Invoice, linhas: LinhaInvoiceCalc[], tot: { eur: number; brl: number; liq: number; bruto: number }) {
  montarInvoicePdf(inv, linhas, tot).save(`Invoice_${inv.numero || pedido.numero}.pdf`)
}
export function montarInvoicePdf(inv: Invoice, linhas: LinhaInvoiceCalc[], tot: { eur: number; brl: number; liq: number; bruto: number }): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 12
  logo(doc, M, 12, 16)
  tituloCaixa(doc, 'COMMERCIAL INVOICE', 45, 14, W - 45 - M)
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.text('DATE:', 95, 32); doc.text('N°:', 95, 36); doc.setFont('helvetica', 'normal')
  doc.text(fmtData(inv.data), 106, 32); doc.setFont('helvetica', 'bold'); doc.text(inv.numero, 106, 36); doc.setFont('helvetica', 'normal')
  doc.setFont('helvetica', 'bold'); doc.text('SUPPLIER:', 50, 42, { align: 'center' }); doc.text('IMPORTER', 160, 42, { align: 'center' }); doc.setFont('helvetica', 'normal')
  doc.setDrawColor(...AMARELO); doc.line(M, 43.5, 95, 43.5); doc.line(115, 43.5, W - M, 43.5)
  bloco(doc, EMPRESA.supplier, 50, 47, { align: 'center', tam: 6.5 }); bloco(doc, EMPRESA.importer, 160, 47, { align: 'center', tam: 6.5 })
  const yI = 68
  ;[['INCOTERM:', inv.incoterm], ['CURRENCY:', inv.moeda === 'EUR' ? 'EUROS' : inv.moeda], ['DUE DATE:', fmtData(inv.due_date)], ['PTAX:', inv.ptax ? String(inv.ptax).replace('.', ',') : '']].forEach(([k, v], i) => {
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.text(k, 95, yI + i * 4, { align: 'right' }); doc.setFont('helvetica', 'normal'); doc.text(v, 97, yI + i * 4)
  })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text('Origin of the product: Brazil', 35, yI + 18); doc.setFont('helvetica', 'normal')
  autoTable(doc, {
    startY: yI + 22, margin: { left: M, right: M }, styles: { fontSize: 5.6, cellPadding: 1, lineColor: [200, 200, 200], lineWidth: 0.1, textColor: 20 },
    headStyles: { fillColor: [255, 255, 255], textColor: 20, fontStyle: 'bold', lineColor: AMARELO, lineWidth: 0.3, halign: 'center', valign: 'middle' },
    columnStyles: { 0: { halign: 'center', cellWidth: 7 }, 1: { cellWidth: 12 }, 2: { cellWidth: 10 }, 3: { cellWidth: 13 }, 4: { cellWidth: 12 }, 5: { cellWidth: 36 }, 6: { halign: 'center', cellWidth: 8 }, 7: { halign: 'right', cellWidth: 11 }, 8: { halign: 'right', cellWidth: 9 }, 9: { halign: 'center', cellWidth: 7 }, 10: { halign: 'right', cellWidth: 11 }, 11: { halign: 'right', cellWidth: 11 }, 12: { halign: 'right', cellWidth: 14 }, 13: { halign: 'right', cellWidth: 10 }, 14: { halign: 'right', cellWidth: 15 } },
    head: [['Item nº', 'ID Dengo', 'Lot', 'BBE', 'HS CODE', 'Description', 'Boxes', 'Net Weight (Kg)', 'Qty', 'UNIT', 'Gross Weight (Kg)', 'BRL', 'TOTAL BRL', 'EUR', 'TOTAL EUR']],
    body: linhas.map((l, i) => [i + 1, l.sku, l.lote, fmtData(l.bbe), l.hs_code ?? '', l.descricao, n0(l.caixas), n3(l.peso_liq_kg), n0(l.qtd), l.unidade, n3(l.peso_bruto_kg), l.preco_brl === null ? '' : `R$ ${n2(l.preco_brl)}`, l.total_brl === null ? '' : `R$ ${n2(l.total_brl)}`, `€ ${n2(l.preco_eur)}`, `€ ${n2(l.total_eur)}`]),
    foot: [['', '', '', '', '', '', '', '', '', '', '', 'TOTAL', inv.ptax ? `R$ ${n2(tot.brl)}` : '', '', `€ ${n2(tot.eur)}`]],
    footStyles: { fillColor: AMARELO, textColor: 20, fontStyle: 'bold', halign: 'right' },
  })
  let y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  if (y > 250) { doc.addPage(); y = 20 }
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.text('TOTAL GROSS WEIGHT:', 50, y); doc.text('TOTAL NET WEIGHT:', 125, y); doc.setFont('helvetica', 'normal')
  doc.text(n3(tot.bruto), 80, y); doc.text(n3(tot.liq), 152, y)
  y += 10; doc.setFont('helvetica', 'bold'); doc.text('Bank Details', W / 2, y, { align: 'center' }); doc.setFont('helvetica', 'normal')
  doc.setDrawColor(...AMARELO); doc.rect(M, y + 2, W - 2 * M, 18); bloco(doc, EMPRESA.banco, W / 2, y + 6, { align: 'center', tam: 6.5 })
  y += 28; doc.setFont('helvetica', 'bold'); doc.text('Transport Info:', W / 2, y, { align: 'center' }); doc.setFont('helvetica', 'normal')
  doc.rect(M, y + 2, W - 2 * M, 18); bloco(doc, EMPRESA.transporte, W / 2, y + 6, { align: 'center', tam: 6.5 })
  return doc
}

export function gerarPackingListPdf(pedido: Pedido, pl: PackingList, pallets: Pallet[], produtos: Produto[], numeroInvoice: string | null) {
  montarPackingListPdf(pl, pallets, produtos, numeroInvoice).save(`PackingList_${pedido.numero}.pdf`)
}
export function montarPackingListPdf(pl: PackingList, pallets: Pallet[], produtos: Produto[], numeroInvoice: string | null): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const W = 297, M = 10
  const prod = (sku: string) => produtos.find((p) => p.sku === sku)
  const totais = pallets.map((p) => totaisPallet(p.linhas.map((l) => linhaPesoDe(prod(l.sku), l.qtd, l.caixas)), pl.tara_master_box_kg, pl.tara_pallet_kg))
  const comCarga = pallets.map((p, i) => ({ p, t: totais[i] })).filter(({ p }) => p.linhas.length > 0)
  // Capa
  logo(doc, M, 14, 30); tituloCaixa(doc, 'PACKING LIST', 50, 22, W - 50 - M, 14)
  let y = 60; doc.setFontSize(8)
  bloco(doc, ['PACKING LIST', `RELATED TO INVOICE NUMBER:        ${numeroInvoice ?? pl.numero ?? ''}`, fmtData(pl.data)], M, y, { negrito: 2, tam: 8 }); y += 16
  doc.setFont('helvetica', 'bold'); doc.text('DESTINATION:', M, y); doc.line(M, y + 1, M + 22, y + 1); bloco(doc, EMPRESA.importerPL, M, y + 5, { negrito: 3, tam: 8 }); y += 22
  doc.setFont('helvetica', 'bold'); doc.text('SUPPLIER:', M, y); doc.line(M, y + 1, M + 17, y + 1); bloco(doc, EMPRESA.supplierPL, M, y + 5, { negrito: 3, tam: 8 }); y += 24
  const brutoTotal = comCarga.reduce((s, { t }) => s + t.bruto, 0), liqTotal = comCarga.reduce((s, { t }) => s + t.liquido, 0)
  ;[['TOTAL NR. OF PALLETS', String(comCarga.length)], ['TOTAL GROSS WEIGHT (KG):', n3(brutoTotal)], ['TOTAL NET WEIGHT (KG):', n3(liqTotal)]].forEach(([k, v], i) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text(k, M, y + i * 5); doc.text(v, 150, y + i * 5, { align: 'center' })
  })
  // Uma página por pallet
  for (const { p, t } of comCarga) {
    doc.addPage()
    doc.setFillColor(220, 220, 220); doc.rect(M, 12, 40, 5, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text(`PALLET Nº        ${p.numero}`, M + 2, 15.7)
    const cab: [string, string, boolean][] = [['DIMENSIONS (M):', p.dimensoes ?? '', true], ['TOTAL GROSS WEIGHT (KG):', n3(t.bruto), true], ['MASTER BOX + Wrapping', n2(pl.tara_master_box_kg), false], ['Pallet', n2(pl.tara_pallet_kg), false], ['TOTAL NET WEIGHT (KG):', n3(t.liquido), true]]
    cab.forEach(([k, v, b], i) => { doc.setFont('helvetica', b ? 'bold' : 'normal'); doc.text(k, M, 22 + i * 5); doc.setFont('helvetica', 'bold'); doc.text(v, 140, 22 + i * 5) })
    autoTable(doc, {
      startY: 50, margin: { left: M, right: M }, styles: { fontSize: 7, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.2, textColor: 20, valign: 'middle' },
      headStyles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: 'bold', halign: 'center' },
      columnStyles: { 0: { halign: 'center', cellWidth: 22 }, 1: { halign: 'center', cellWidth: 22 }, 2: { cellWidth: 90 }, 3: { halign: 'center', cellWidth: 28 }, 4: { halign: 'center', cellWidth: 14 }, 5: { halign: 'center', cellWidth: 20 }, 6: { halign: 'center', cellWidth: 20 }, 7: { halign: 'center', cellWidth: 22, fontStyle: 'bold' }, 8: { halign: 'center', cellWidth: 16 }, 9: { halign: 'center', fontStyle: 'bold' } },
      head: [['ITEM ID', 'HS CODE', 'ITEM DESCRIPTION ENGLISH', 'LOT NUMBER', 'UNIT', 'QTY', 'UNIT NET WEIGHT', 'TOTAL NET WEIGHT', 'BOXES', 'GROSS WEIGHT (KG)']],
      body: p.linhas.map((l) => { const pr = prod(l.sku); const lp = linhaPesoDe(pr, l.qtd, l.caixas)
        return [l.sku, pr?.hs_code ?? '', pr?.descricao_en ?? pr?.descricao_br ?? '', l.lote, pr?.unidade ?? '', n3(l.qtd), n2(pr?.unidade === 'Kg' ? (pr?.multiplo_caixa ?? 0) : (pr?.peso_liq_un_kg ?? 0)), n3(pesoLiquidoLinha(lp)), n0(l.caixas), n3(pesoBrutoLinha(lp))] }),
      foot: [['', '', '', '', '', '', '', n3(t.liquido), '', n3(t.brutoLinhas)]],
      footStyles: { fillColor: [255, 255, 255], textColor: 20, halign: 'center' },
    })
  }
  return doc
}
