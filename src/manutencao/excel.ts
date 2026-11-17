import ExcelJS from 'exceljs'
import { LIMPAR, type Base, type Coluna, type Tipo } from './bases'

const COR_GRUPO: Record<string, string> = {
  'Básico': 'FFFFF3C4', 'Logística': 'FFDCEBFA', 'Qualidade': 'FFE3F4E3', 'Comercial': 'FFF7E1D7', 'Portfólio': 'FFEDE3F7',
}
const AMARELO = 'FFFFD200'
const TIPO: Record<Tipo, string> = { texto: 'Texto', inteiro: 'Número inteiro', decimal: 'Número (vírgula ou ponto)', data: 'Data (dd/mm/aaaa)', booleano: 'Sim / Não' }

function baixar(buf: ArrayBuffer, nome: string) {
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a'); a.href = url; a.download = nome; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function valorCelula(v: unknown, c: Coluna): ExcelJS.CellValue {
  if (v === null || v === undefined) return null
  if (c.tipo === 'booleano') return v ? 'Sim' : 'Não'
  if (c.tipo === 'data' && typeof v === 'string') { const [a, m, d] = v.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)) }
  if ((c.tipo === 'decimal' || c.tipo === 'inteiro') && typeof v === 'string') return Number(v)
  return v as ExcelJS.CellValue
}

/**
 * Modelo de carga: aba "Dados" (cabeçalho por visão + dados atuais, se houver)
 * e aba "Instruções". Este mesmo arquivo, editado, volta pelo importador.
 */
export async function baixarModelo(base: Base, linhas: Record<string, unknown>[], nomeArquivo?: string) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Dados', { views: [{ state: 'frozen', ySplit: 2, xSplit: base.chave.length }] })
  const cols = base.colunas
  ws.columns = cols.map((c) => ({ width: c.campo.startsWith('descricao') ? 44 : Math.max(12, Math.min(28, c.rotulo.length + 4)) }))

  // Linha 1: visão (grupo) mesclada
  const r1 = ws.getRow(1)
  let i = 0
  while (i < cols.length) {
    const g = cols[i].grupo ?? ''
    let j = i
    while (j + 1 < cols.length && (cols[j + 1].grupo ?? '') === g) j++
    if (j > i) ws.mergeCells(1, i + 1, 1, j + 1)
    const cel = r1.getCell(i + 1)
    cel.value = g || base.nome
    cel.font = { bold: true, size: 9, color: { argb: 'FF555555' } }
    cel.alignment = { horizontal: 'center' }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_GRUPO[g] ?? 'FFF2F2F2' } }
    i = j + 1
  }
  // Linha 2: cabeçalhos
  const r2 = ws.getRow(2)
  cols.forEach((c, k) => {
    const cel = r2.getCell(k + 1)
    cel.value = c.rotulo
    cel.font = { bold: true }
    const destaque = base.chave.includes(c.campo) || c.obrigatorioNovo
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: destaque ? AMARELO : COR_GRUPO[c.grupo ?? ''] ?? 'FFF2F2F2' } }
    cel.border = { bottom: { style: 'thin' } }
    cel.note = [c.ajuda, base.chave.includes(c.campo) ? 'Campo-chave (obrigatório).' : c.obrigatorioNovo ? 'Obrigatório para registro novo.' : '', `Tipo: ${TIPO[c.tipo]}`].filter(Boolean).join('\n')
  })
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } }

  for (const l of linhas) ws.addRow(cols.map((c) => valorCelula(l[c.campo], c)))

  // Formatos e listas de validação
  const ultima = Math.max(linhas.length + 2, 500)
  cols.forEach((c, k) => {
    const col = ws.getColumn(k + 1)
    if (c.tipo === 'data') col.numFmt = 'dd/mm/yyyy'
    if (c.tipo === 'texto') col.numFmt = '@'
    const lista = c.tipo === 'booleano' ? ['Sim', 'Não'] : c.opcoes
    if (lista) for (let r = 3; r <= ultima; r++) ws.getCell(r, k + 1).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${[...lista, LIMPAR].join(',')}"`] }
  })
  ws.getRow(1).numFmt = ''; ws.getRow(2).numFmt = ''

  // Instruções
  const wi = wb.addWorksheet('Instruções')
  wi.columns = [{ width: 28 }, { width: 26 }, { width: 24 }, { width: 18 }, { width: 44 }, { width: 50 }]
  const add = (vals: (string | null)[], bold = false) => { const r = wi.addRow(vals); if (bold) r.font = { bold: true }; return r }
  wi.addRow([`Base: ${base.nome}`]).font = { bold: true, size: 14 }
  add([base.descricao])
  add([`Origem sugerida: ${base.origemSugerida}`])
  add([`Frequência sugerida: ${base.frequencia}`])
  add([`Chave: ${base.chave.map((k) => cols.find((c) => c.campo === k)!.rotulo).join(' + ')}`])
  add([])
  add(['Como funciona'], true)
  ;[
    '1. Preencha ou cole os dados na aba "Dados" a partir da linha 3 (as linhas 1 e 2 são o cabeçalho).',
    '2. Célula VAZIA = o valor atual é mantido. Para apagar um valor, escreva LIMPAR.',
    '3. Você pode apagar as colunas que não quer alterar; só a(s) coluna(s)-chave são obrigatórias.',
    '4. Pode colar uma extração do SAP: os cabeçalhos da coluna "Aceita também" são reconhecidos.',
    '   Números em texto seguem o padrão SAP Brasil: vírgula = decimal, ponto = milhar (1.200,50).',
    base.modos.includes('substituir') ? '5. Modo SUBSTITUIR: o que não estiver na planilha é REMOVIDO da base (use para fotos, ex. estoque).' : '5. Esta base só aceita o modo ATUALIZAR (nada é removido).',
    '6. Ao subir o arquivo, o portal mostra a prévia (novos, alterados, erros) antes de gravar. Toda carga pode ser desfeita.',
  ].forEach((t) => add([t]))
  add([])
  const h = add(['Coluna', 'Campo', 'Tipo', 'Obrigatório', 'Aceita também', 'Observação'], true)
  h.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARELO } } })
  for (const c of cols) {
    add([c.rotulo, c.campo, TIPO[c.tipo], base.chave.includes(c.campo) ? 'Chave' : c.obrigatorioNovo ? 'Se novo' : '', (c.aliases ?? []).join(', '), [c.ajuda, c.opcoes ? `Valores: ${c.opcoes.join(', ')}` : ''].filter(Boolean).join(' ')])
  }

  baixar(await wb.xlsx.writeBuffer() as ArrayBuffer, nomeArquivo ?? `${base.id}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

/** CSV simples (separador ; ou , detectado pela primeira linha; aspas duplas). */
export function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '')
  const primeira = t.split(/\r?\n/, 1)[0] ?? ''
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : primeira.includes('\t') ? '\t' : ','
  const linhas: string[][] = []; let campo = '', linha: string[] = [], aspas = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++ } else if (ch === '"') aspas = false; else campo += ch
    } else if (ch === '"') aspas = true
    else if (ch === sep) { linha.push(campo); campo = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; linha.push(campo); linhas.push(linha); linha = []; campo = '' }
    else campo += ch
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha) }
  return linhas
}

/** Lê .xlsx (aba "Dados" ou a primeira) ou .csv e devolve as linhas como matriz. */
export async function lerArquivo(arquivo: File): Promise<{ linhas: unknown[][]; aba: string }> {
  if (/\.(csv|txt)$/i.test(arquivo.name)) return { linhas: lerCsv(await arquivo.text()), aba: 'CSV' }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await arquivo.arrayBuffer())
  const ws = wb.getWorksheet('Dados') ?? wb.worksheets.find((w) => w.state !== 'hidden') ?? wb.worksheets[0]
  if (!ws) throw new Error('A planilha não tem abas.')
  const linhas: unknown[][] = []
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const vals = (row.values as unknown[]).slice(1)
    linhas[n - 1] = vals
  })
  for (let i = 0; i < linhas.length; i++) if (!linhas[i]) linhas[i] = []
  return { linhas, aba: ws.name }
}
