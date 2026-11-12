import ExcelJS from 'exceljs'
import type { Invoice, PackingList, Pallet } from '../dados/operacoes'
import type { Pedido, Produto } from '../tipos/dominio'
import { linhaPesoDe, pesoBrutoLinha, pesoLiquidoLinha, totaisPallet } from '../dominio/pesos'
import { fmtData } from '../lib/formatos'
import type { LinhaInvoiceCalc } from '../telas/pedidos/PainelInvoice'

const SUPPLIER = ['DENGO CHOCOLATES SA', 'CNPJ 23.244.006/0001-00', 'RUA VIGÁRIO TAQUES BITTENCOURT, 171', '04755-060', 'SÃO PAULO - SP - BRAZIL']
const IMPORTER = ['DENGO EUROPE SAS', 'VAT: FR 07904496254', '58 RUE BONAPARTE', '75006 PARIS', 'FRANCE', 'PHONE: +33 06 59 73 25 80']
const BANCO = ['Bank: Itaú Bank S.A.', 'Bank Swift Code: ITAUBRSP', 'Branch Number: 0641', 'Account Number: 11698-3', 'IBAN: BR96 6070 1190 0064 1000 0116 983C 1']
const TRANSPORTE = ['TRANSPORTES YASMIN ARMAZ E LOGISTICA LTDA-ME', 'RUA CARLOPOLIS, 140 - ANT. 134 - PARQUE SAO LUIZ', 'CEP: 07170-540 - GUARULHOS - SP', 'CNPJ: 09.123.539/0001-02', 'INSCRIÇÃO ESTADUAL: 336821275110']
const AMARELO: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5B400' } }
const PRETO: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } }

function baixar(wb: ExcelJS.Workbook, nome: string) {
  wb.xlsx.writeBuffer().then((buf) => {
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); URL.revokeObjectURL(url)
  })
}

/** Packing list no layout atual: capa + um bloco por pallet. */
export function exportarPackingListExcel(pedido: Pedido, pl: PackingList, pallets: Pallet[], produtos: Produto[], numeroInvoice: string | null) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('PACKING LIST')
  ws.columns = [{ width: 12 }, { width: 11 }, { width: 44 }, { width: 13 }, { width: 7 }, { width: 10 }, { width: 11 }, { width: 13 }, { width: 8 }, { width: 13 }]
  const prod = (sku: string) => produtos.find((p) => p.sku === sku)
  const totais = pallets.map((p) => totaisPallet(p.linhas.map((l) => linhaPesoDe(prod(l.sku), l.qtd, l.caixas)), pl.tara_master_box_kg, pl.tara_pallet_kg))
  ws.mergeCells('A1:J1'); ws.getCell('A1').value = 'PACKING LIST'; ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' }
  ws.addRow([]); ws.addRow(['PACKING LIST']).font = { bold: true }
  ws.addRow(['RELATED TO INVOICE NUMBER:', '', numeroInvoice ?? pl.numero ?? '']).font = { bold: true }
  ws.addRow([fmtData(pl.data)]); ws.addRow([])
  ws.addRow(['DESTINATION:']).font = { bold: true, underline: true }; IMPORTER.forEach((l) => ws.addRow([l]))
  ws.addRow([]); ws.addRow(['SUPPLIER:']).font = { bold: true, underline: true }; SUPPLIER.forEach((l) => ws.addRow([l]))
  ws.addRow([])
  ws.addRow(['TOTAL NR. OF PALLETS', '', '', '', '', pallets.filter((p) => p.linhas.length > 0).length]).font = { bold: true }
  ws.addRow(['TOTAL GROSS WEIGHT (KG):', '', '', '', '', Number(totais.reduce((s, t) => s + (t.caixas > 0 ? t.bruto : 0), 0).toFixed(3))]).font = { bold: true }
  ws.addRow(['TOTAL NET WEIGHT (KG):', '', '', '', '', Number(totais.reduce((s, t) => s + t.liquido, 0).toFixed(3))]).font = { bold: true }
  pallets.forEach((p, i) => {
    ws.addRow([]); ws.addRow([])
    const r = ws.addRow(['PALLET Nº', p.numero]); r.font = { bold: true }; r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDDDDD' } }
    ws.addRow(['DIMENSIONS (M):', '', '', '', '', p.dimensoes ?? '']).font = { bold: true }
    ws.addRow(['TOTAL GROSS WEIGHT (KG):', '', '', '', '', Number(totais[i].bruto.toFixed(3))]).font = { bold: true }
    ws.addRow(['MASTER BOX + Wrapping', '', '', '', '', pl.tara_master_box_kg])
    ws.addRow(['Pallet', '', '', '', '', pl.tara_pallet_kg])
    ws.addRow(['TOTAL NET WEIGHT (KG):', '', '', '', '', Number(totais[i].liquido.toFixed(3))]).font = { bold: true }
    ws.addRow([])
    const h = ws.addRow(['ITEM ID', 'HS CODE', 'ITEM DESCRIPTION ENGLISH', 'LOT NUMBER', 'UNIT', 'QTY', 'UNIT NET WEIGHT', 'TOTAL NET WEIGHT', 'BOXES', 'GROSS WEIGHT (KG)'])
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = PRETO; h.alignment = { horizontal: 'center', wrapText: true }
    for (const l of p.linhas) {
      const pr = prod(l.sku); const lp = linhaPesoDe(pr, l.qtd, l.caixas)
      ws.addRow([l.sku, pr?.hs_code ?? '', pr?.descricao_en ?? pr?.descricao_br ?? '', l.lote, pr?.unidade ?? '', l.qtd, pr?.unidade === 'Kg' ? (pr?.multiplo_caixa ?? 0) : (pr?.peso_liq_un_kg ?? 0), Number(pesoLiquidoLinha(lp).toFixed(3)), l.caixas, Number(pesoBrutoLinha(lp).toFixed(3))])
    }
    ws.addRow(['', '', '', '', '', '', '', Number(totais[i].liquido.toFixed(3)), '', Number(totais[i].brutoLinhas.toFixed(3))])
  })
  baixar(wb, `PackingList_${pedido.numero}.xlsx`)
}

/** Commercial invoice no layout atual. */
export function exportarInvoiceExcel(pedido: Pedido, inv: Invoice, linhas: LinhaInvoiceCalc[], tot: { eur: number; brl: number; liq: number; bruto: number }) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('INVOICE')
  ws.columns = [{ width: 7 }, { width: 11 }, { width: 9 }, { width: 11 }, { width: 10 }, { width: 44 }, { width: 7 }, { width: 10 }, { width: 8 }, { width: 6 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 8 }, { width: 11 }]
  ws.mergeCells('A1:O1'); ws.getCell('A1').value = 'COMMERCIAL INVOICE'; ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' }
  ws.addRow([]); ws.addRow(['', '', '', '', '', '', '', 'DATE:', fmtData(inv.data)]); ws.addRow(['', '', '', '', '', '', '', 'N°:', inv.numero])
  ws.addRow([]); const r = ws.addRow(['SUPPLIER:', '', '', '', '', '', '', '', '', '', 'IMPORTER']); r.font = { bold: true }
  for (let i = 0; i < Math.max(SUPPLIER.length, IMPORTER.length); i++) ws.addRow([SUPPLIER[i] ?? '', '', '', '', '', '', '', '', '', '', IMPORTER[i] ?? ''])
  ws.addRow([]); ws.addRow(['', '', '', '', '', '', '', 'INCOTERM:', inv.incoterm]); ws.addRow(['', '', '', '', '', '', '', 'CURRENCY:', inv.moeda === 'EUR' ? 'EUROS' : inv.moeda])
  ws.addRow(['', '', '', '', '', '', '', 'DUE DATE:', fmtData(inv.due_date)]); ws.addRow(['', '', '', '', '', '', '', 'PTAX:', inv.ptax ?? ''])
  ws.addRow(['Origin of the product: Brazil']); ws.addRow([])
  const h = ws.addRow(['Item nº', 'ID Dengo', 'Lot', 'BBE', 'HS CODE', 'Description', 'Boxes', 'Net Weight (Kg)', 'Qty', 'UNIT', 'Gross Weight (Kg)', 'BRL', 'TOTAL BRL', 'EUR', 'TOTAL EUR'])
  h.font = { bold: true }; h.fill = AMARELO; h.alignment = { wrapText: true, horizontal: 'center' }
  linhas.forEach((l, i) => ws.addRow([i + 1, l.sku, l.lote, fmtData(l.bbe), l.hs_code ?? '', l.descricao, l.caixas, Number((l.peso_liq_kg ?? 0).toFixed(3)), l.qtd, l.unidade, Number((l.peso_bruto_kg ?? 0).toFixed(3)), l.preco_brl ?? '', l.total_brl ?? '', l.preco_eur ?? '', l.total_eur]))
  const t = ws.addRow(['', '', '', '', '', '', '', '', '', '', 'TOTAL', '', inv.ptax ? tot.brl : '', '', tot.eur]); t.font = { bold: true }; t.fill = AMARELO
  for (const c of [12, 13]) ws.getColumn(c).numFmt = 'R$ #,##0.00'
  for (const c of [14, 15]) ws.getColumn(c).numFmt = '€ #,##0.00'
  ws.addRow([]); ws.addRow(['TOTAL GROSS WEIGHT:', '', Number(tot.bruto.toFixed(3)), '', '', '', '', 'TOTAL NET WEIGHT:', '', Number(tot.liq.toFixed(3))]).font = { bold: true }
  ws.addRow([]); ws.addRow(['Bank Details']).font = { bold: true }; BANCO.forEach((l) => ws.addRow([l]))
  ws.addRow([]); ws.addRow(['Transport Info:']).font = { bold: true }; TRANSPORTE.forEach((l) => ws.addRow([l]))
  baixar(wb, `Invoice_${inv.numero || pedido.numero}.xlsx`)
}

/** Dados para a NF de exportação no SAP. Campos conhecidos hoje; a lista final será fechada com o key user SAP. */
export function exportarArquivoSapExcel(pedido: Pedido, inv: Invoice, linhas: LinhaInvoiceCalc[], produtos: Produto[]) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('NF SAP')
  const cab = ['Pedido portal', 'PO França', 'Invoice', 'Data invoice', 'Cliente', 'VAT cliente', 'Incoterm', 'Moeda', 'PTAX', 'Material SAP', 'Descrição', 'NCM', 'Lote', 'Validade', 'Quantidade', 'UM', 'Preço unit EUR', 'Total EUR', 'Preço unit BRL', 'Total BRL', 'Peso líquido kg', 'Peso bruto kg', 'Caixas', 'Transportadora CNPJ']
  ws.columns = cab.map(() => ({ width: 16 }))
  const h = ws.addRow(cab); h.font = { bold: true }; h.fill = AMARELO
  for (const l of linhas) {
    const p = produtos.find((x) => x.sku === l.sku)
    ws.addRow([pedido.numero, pedido.po_franca ?? '', inv.numero, fmtData(inv.data), 'DENGO EUROPE SAS', 'FR 07904496254', inv.incoterm, inv.moeda, inv.ptax ?? '', l.sku, p?.descricao_br ?? '', l.hs_code ?? '', l.lote, fmtData(l.bbe), l.qtd, p?.unidade === 'Kg' ? 'KG' : 'UN', l.preco_eur ?? '', l.total_eur, l.preco_brl ?? '', l.total_brl ?? '', Number((l.peso_liq_kg ?? 0).toFixed(3)), Number((l.peso_bruto_kg ?? 0).toFixed(3)), l.caixas ?? '', '09.123.539/0001-02'])
  }
  baixar(wb, `NF_SAP_${inv.numero || pedido.numero}.xlsx`)
}
