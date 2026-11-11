import ExcelJS from 'exceljs'
import type { Pedido, PedidoItem, Produto } from '../tipos/dominio'
import { fmtData } from '../lib/formatos'

/** Excel "Resumo do Pedido" (estilo nota): cabeçalho + itens + total. Baixa no navegador. */
export async function gerarExcelResumoPedido(pedido: Pedido, itens: PedidoItem[], produtos: Produto[]) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Pedido')
  ws.columns = [{ width: 12 }, { width: 46 }, { width: 8 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 14 }]
  ws.mergeCells('A1:G1'); ws.getCell('A1').value = 'RESUMO DO PEDIDO — DENGO EUROPE SAS → DENGO CHOCOLATES SA'
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.getCell('A3').value = 'Pedido nº'; ws.getCell('B3').value = pedido.numero
  ws.getCell('A4').value = 'Data de embarque'; ws.getCell('B4').value = fmtData(pedido.data_embarque)
  ws.getCell('A5').value = 'Chegada prevista FR'; ws.getCell('B5').value = fmtData(pedido.data_chegada_fr)
  ws.getCell('A6').value = 'PO França'; ws.getCell('B6').value = pedido.po_franca ?? ''
  ws.getCell('A7').value = 'Status'; ws.getCell('B7').value = pedido.status
  const cab = ws.addRow([]); cab.number
  const h = ws.addRow(['SKU', 'Descrição', 'UM', 'Qtd solicitada', 'Caixas', 'Preço EUR', 'Total EUR'])
  h.font = { bold: true }; h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5B400' } }
  let total = 0
  for (const i of itens) {
    const p = produtos.find((x) => x.sku === i.sku)
    const qtd = i.qtd_aprovada ?? i.qtd_solicitada
    const t = (i.preco_eur ?? 0) * qtd; total += t
    ws.addRow([i.sku, p?.descricao_br ?? i.sku, p?.unidade ?? '', qtd, i.caixas_solicitadas ?? '', i.preco_eur ?? '', t])
  }
  const tr = ws.addRow(['', '', '', '', '', 'TOTAL', total]); tr.font = { bold: true }
  ws.getColumn(6).numFmt = '€ #,##0.00'; ws.getColumn(7).numFmt = '€ #,##0.00'
  ws.addRow([]); ws.addRow(['Valores aproximados (preço interco EXW). Documento válido: invoice comercial.'])
  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a'); a.href = url; a.download = `Pedido_${pedido.numero}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}
