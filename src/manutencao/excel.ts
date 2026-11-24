import ExcelJS from 'exceljs'
import { LIMPAR, normalizarCabecalho, type Base, type Coluna, type Tipo } from './bases'

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
  if (c.valores) { const r = Object.entries(c.valores).find(([, x]) => x === v); if (r) return r[0] }
  if (c.tipo === 'data' && typeof v === 'string') { const [a, m, d] = v.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)) }
  if ((c.tipo === 'decimal' || c.tipo === 'inteiro') && typeof v === 'string') return Number(v)
  return v as ExcelJS.CellValue
}

const letra = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }
const CINZA = 'FFEDEDED'

/**
 * Aba de dados de uma base: linha 1 = visão (grupo), linha 2 = cabeçalho, dados a partir da linha 3.
 * Na tabela mestre, `destacarPendencias` pinta as células obrigatórias vazias dos SKUs ativos.
 */
export function adicionarAbaDados(wb: ExcelJS.Workbook, base: Base, linhas: Record<string, unknown>[], opcoes: { nomeAba?: string; destacarPendencias?: boolean } = {}) {
  const ws = wb.addWorksheet(opcoes.nomeAba ?? 'Dados', { views: [{ state: 'frozen', ySplit: 2, xSplit: base.id === 'produtos' ? 2 : base.chave.length }] })
  const info = base.informativas ?? []
  const obrig = opcoes.destacarPendencias ? base.colunas.filter((c) => c.obrigatorioAtivo) : []
  const cols: (Coluna & { info?: boolean })[] = [...base.colunas, ...info.map((c) => ({ ...c, info: true }))]
  const comPendencias = obrig.length > 0
  ws.columns = [...cols.map((c) => ({ width: c.campo.startsWith('descricao') ? 44 : Math.max(12, Math.min(28, c.rotulo.length + 4)) })), ...(comPendencias ? [{ width: 18 }] : [])]

  // Linha 1: visão (grupo) mesclada
  const grupos = [...cols.map((c) => (c.info ? 'Consulta (calculado pelo portal)' : c.grupo ?? '')), ...(comPendencias ? ['Consulta (calculado pelo portal)'] : [])]
  const r1 = ws.getRow(1)
  let i = 0
  while (i < grupos.length) {
    const g = grupos[i]
    let j = i
    while (j + 1 < grupos.length && grupos[j + 1] === g) j++
    if (j > i) ws.mergeCells(1, i + 1, 1, j + 1)
    const cel = r1.getCell(i + 1)
    cel.value = g || base.nome
    cel.font = { bold: true, size: 9, color: { argb: 'FF555555' } }
    cel.alignment = { horizontal: 'center' }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_GRUPO[g] ?? (g.startsWith('Consulta') ? CINZA : 'FFF2F2F2') } }
    i = j + 1
  }
  // Linha 2: cabeçalhos
  const r2 = ws.getRow(2)
  cols.forEach((c, k) => {
    const cel = r2.getCell(k + 1)
    cel.value = c.rotulo
    cel.font = { bold: true, color: c.info ? { argb: 'FF777777' } : undefined }
    const destaque = base.chave.includes(c.campo) || c.obrigatorioNovo || (opcoes.destacarPendencias && c.obrigatorioAtivo)
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.info ? CINZA : destaque ? AMARELO : COR_GRUPO[c.grupo ?? ''] ?? 'FFF2F2F2' } }
    cel.border = { bottom: { style: 'thin' } }
    cel.note = c.info ? 'Somente consulta: calculado pelo portal, ignorado na carga.' : [c.ajuda, base.chave.includes(c.campo) ? 'Campo-chave (obrigatório).' : c.obrigatorioNovo ? 'Obrigatório para registro novo.' : '', opcoes.destacarPendencias && c.obrigatorioAtivo ? 'Obrigatório para SKU ativo no portfólio.' : '', `Tipo: ${TIPO[c.tipo]}`].filter(Boolean).join('\n')
  })
  if (comPendencias) {
    const cel = r2.getCell(cols.length + 1)
    cel.value = 'Campos pendentes'; cel.font = { bold: true, color: { argb: 'FF777777' } }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } }; cel.border = { bottom: { style: 'thin' } }
    cel.note = 'Quantos campos obrigatórios estão vazios neste SKU ativo. Filtre por > 0 para ver o que falta.'
  }
  const nCols = cols.length + (comPendencias ? 1 : 0)
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: nCols } }

  for (const l of linhas) ws.addRow(cols.map((c) => valorCelula(l[c.campo], c)))

  // Formatos e listas de validação
  const ultima = Math.max(linhas.length + 2, opcoes.destacarPendencias ? 1000 : 500)
  cols.forEach((c, k) => {
    const col = ws.getColumn(k + 1)
    if (c.tipo === 'data') col.numFmt = 'dd/mm/yyyy'
    if (c.tipo === 'texto') col.numFmt = '@'
    if (c.info) col.font = { color: { argb: 'FF777777' } }
    const lista = c.info ? null : c.tipo === 'booleano' ? ['Sim', 'Não'] : c.opcoes
    if (lista) for (let r = 3; r <= ultima; r++) ws.getCell(r, k + 1).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${[...lista, LIMPAR].join(',')}"`] }
  })
  ws.getRow(1).numFmt = ''; ws.getRow(2).numFmt = ''

  // Pendências dos SKUs ativos: célula vazia em vermelho claro + contador por linha
  if (comPendencias) {
    const L = (campo: string) => letra(cols.findIndex((c) => c.campo === campo) + 1)
    const ativo = L('ativo'), unid = L('unidade')
    const condicao = (campo: string, r: number) => `AND($${ativo}${r}="Sim",${campo === 'peso_liq_un_kg' ? `$${unid}${r}<>"Kg",` : ''}LEN(TRIM(${L(campo)}${r}))=0)`
    for (const c of obrig) {
      ws.addConditionalFormatting({ ref: `${L(c.campo)}3:${L(c.campo)}${ultima}`, rules: [{ type: 'expression', priority: 1, formulae: [condicao(c.campo, 3)], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } } } }] })
    }
    if (cols.some((c) => c.campo === 'shelf_life_dias_franca')) {
      const sap = L('shelf_life_dias'), fr = L('shelf_life_dias_franca')
      ws.addConditionalFormatting({ ref: `${fr}3:${fr}${ultima}`, rules: [{ type: 'expression', priority: 2, formulae: [`AND(${fr}3<>"",${sap}3<>"",${fr}3<>${sap}3)`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFE0B2' } } } }] })
    }
    const colP = letra(nCols)
    for (let r = 3; r <= ultima; r++) {
      const soma = obrig.map((c) => `(${c.campo === 'peso_liq_un_kg' ? `AND(${unid}${r}<>"Kg",LEN(TRIM(${L(c.campo)}${r}))=0)` : `LEN(TRIM(${L(c.campo)}${r}))=0`})*1`).join('+')
      ws.getCell(`${colP}${r}`).value = { formula: `IF(${ativo}${r}="Sim",${soma},"")` }
    }
    ws.getColumn(nCols).font = { color: { argb: 'FF777777' } }
    ws.addConditionalFormatting({ ref: `${colP}3:${colP}${ultima}`, rules: [{ type: 'expression', priority: 3, formulae: [`AND(ISNUMBER(${colP}3),${colP}3>0)`], style: { font: { bold: true, color: { argb: 'FFD33F2F' } } } }] })
  }
  return ws
}

function dicionario(add: (vals: (string | null)[], bold?: boolean) => ExcelJS.Row, base: Base, mestre = false) {
  const h = add(mestre ? ['Aba', 'Coluna', 'Campo', 'Tipo', 'Obrigatório', 'Aceita também', 'Observação'] : ['Coluna', 'Campo', 'Tipo', 'Obrigatório', 'Aceita também', 'Observação'], true)
  h.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARELO } } })
  for (const c of base.colunas) {
    const obrig = base.chave.includes(c.campo) ? 'Chave' : mestre && c.obrigatorioAtivo ? 'Se ativo' : c.obrigatorioNovo ? 'Se novo' : ''
    const linha = [c.rotulo, c.campo, TIPO[c.tipo], obrig, (c.aliases ?? []).join(', '), [c.ajuda, c.opcoes ? `Valores: ${c.opcoes.join(', ')}` : ''].filter(Boolean).join(' ')]
    add(mestre ? [base.aba ?? base.nome, ...linha] : linha)
  }
  for (const c of base.informativas ?? []) add(mestre ? [base.aba ?? base.nome, c.rotulo, c.campo, TIPO[c.tipo], 'Consulta', '', 'Calculado pelo portal; ignorado na carga.'] : [c.rotulo, c.campo, TIPO[c.tipo], 'Consulta', '', 'Calculado pelo portal; ignorado na carga.'])
}

/**
 * Modelo de carga: aba "Dados" (cabeçalho por visão + dados atuais, se houver)
 * e aba "Instruções". Este mesmo arquivo, editado, volta pelo importador.
 */
export async function baixarModelo(base: Base, linhas: Record<string, unknown>[], nomeArquivo?: string) {
  const wb = new ExcelJS.Workbook()
  adicionarAbaDados(wb, base, linhas)
  const cols = base.colunas
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
  ;(base.instrucoes ?? [
    '1. Preencha ou cole os dados na aba "Dados" a partir da linha 3 (as linhas 1 e 2 são o cabeçalho).',
    '2. Célula VAZIA = o valor atual é mantido. Para apagar um valor, escreva LIMPAR.',
    '3. Você pode apagar as colunas que não quer alterar; só a(s) coluna(s)-chave são obrigatórias.',
    '4. Pode colar uma extração do SAP: os cabeçalhos da coluna "Aceita também" são reconhecidos.',
    '   Números em texto seguem o padrão SAP Brasil: vírgula = decimal, ponto = milhar (1.200,50).',
    base.modos.includes('substituir') ? '5. Modo SUBSTITUIR: o que não estiver na planilha é REMOVIDO da base (use quando o arquivo traz a base completa).' : '5. Esta base só aceita o modo ATUALIZAR (nada é removido).',
    '6. Ao subir o arquivo, o portal mostra a prévia (novos, alterados, erros) antes de gravar. Toda carga pode ser desfeita.',
  ]).forEach((t) => add([t]))
  add([])
  dicionario(add, base)
  baixar(await wb.xlsx.writeBuffer() as ArrayBuffer, nomeArquivo ?? `${base.id}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export type DadosMestre = { produtos: Record<string, unknown>[]; parametros: Record<string, unknown>[]; contract: Record<string, unknown>[] }

/** Tabela mestre: um arquivo com Leia-me, Produtos, Parâmetros, Contract date e Dicionário. */
export function montarTabelaMestre(bases: Base[], dados: DadosMestre, geradoEm = new Date()): ExcelJS.Workbook {
  const [bProd, bPar, bCd] = bases
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Portal de Pedidos França'

  const ativos = dados.produtos.filter((p) => p.ativo)
  const obrig = bProd.colunas.filter((c) => c.obrigatorioAtivo)
  const pend = ativos.filter((p) => obrig.some((c) => (c.campo !== 'peso_liq_un_kg' || p.unidade !== 'Kg') && (p[c.campo] === null || p[c.campo] === undefined || p[c.campo] === ''))).length

  const wl = wb.addWorksheet('Leia-me')
  wl.columns = [{ width: 30 }, { width: 90 }]
  const t = wl.addRow(['Tabela mestre — Portal de Pedidos França']); t.font = { bold: true, size: 16 }
  wl.addRow([`Gerada em ${geradoEm.toLocaleString('pt-BR')} com os dados atuais do portal.`]).font = { color: { argb: 'FF777777' } }
  wl.addRow([])
  const kv = (k: string, v: string) => { const r = wl.addRow([k, v]); r.getCell(1).font = { bold: true }; r.getCell(2).alignment = { wrapText: true, vertical: 'top' }; return r }
  kv('Para que serve', 'Um único arquivo com todo o cadastro que o portal usa. Preencha aqui e suba em Manutenção → Importar bases → Tabela mestre.')
  kv('Substitui', 'Aba cadastros (shelf life SAP) da planilha de volume SHIP · PMD da França (descrições, família, preço, COGS, caixa, pesos, HS) · dinâmica do portfólio de 10 meses · tabelas de prazos/taras e de contract date.')
  kv('Situação hoje', `${dados.produtos.length} SKUs, ${ativos.length} ativos no portfólio, ${pend} ativos com campo obrigatório vazio.`)
  wl.addRow([])
  const h = wl.addRow(['Aba', 'O que preencher']); h.font = { bold: true }; h.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARELO } } })
  kv('Produtos', 'Uma linha por SKU (código SAP). Colunas por visão: Básico, Logística, Qualidade, Comercial e Portfólio. Em amarelo no cabeçalho: obrigatórias para SKU ativo; célula vermelha = falta preencher; laranja = shelf life França diferente do SAP. Colunas cinza são só consulta.')
  kv('Parâmetros', 'Prazos, trânsito, taras, dimensões de pallet (aéreo e marítimo) e depósito SAP da França. Altere só a coluna Valor.')
  kv('Contract date', 'Shelf life × dias mínimos de validade na chegada. Entre as faixas, o portal calcula proporcionalmente.')
  kv('Dicionário', 'Todas as colunas, tipo, obrigatoriedade e nomes aceitos (inclusive cabeçalhos do SAP).')
  wl.addRow([])
  const h2 = wl.addRow(['Regras de preenchimento', '']); h2.font = { bold: true }; h2.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARELO } } })
  ;[
    ['Célula vazia', 'Mantém o valor atual do portal. Para apagar um valor, escreva LIMPAR.'],
    ['SKU novo', 'Inclua uma linha nova com Código SAP e Descrição BR (mínimo). Ativo = Sim para aparecer no catálogo da França.'],
    ['Sair do portfólio', 'Ativo = Não. O SKU nunca é apagado (há pedidos ligados a ele).'],
    ['Números', 'Vírgula ou ponto decimal. Em texto, padrão SAP Brasil: 1.200,50.'],
    ['Antes de gravar', 'O portal mostra a prévia por aba (novos, alterados, erros). Cada aba vira uma carga que pode ser desfeita no Histórico de cargas.'],
    ['Colunas a mais', 'Pode apagar colunas que não vai alterar (menos o Código SAP) ou acrescentar colunas suas: o portal ignora o que não reconhece.'],
  ].forEach(([k, v]) => kv(k, v))

  adicionarAbaDados(wb, bProd, dados.produtos, { nomeAba: bProd.aba, destacarPendencias: true })
  const wp = adicionarAbaDados(wb, bPar, dados.parametros, { nomeAba: bPar.aba })
  wp.getColumn(3).width = 80
  adicionarAbaDados(wb, bCd, dados.contract, { nomeAba: bCd.aba })

  const wd = wb.addWorksheet('Dicionário')
  wd.columns = [{ width: 16 }, { width: 28 }, { width: 24 }, { width: 22 }, { width: 12 }, { width: 50 }, { width: 60 }]
  const add = (vals: (string | null)[], bold = false) => { const r = wd.addRow(vals); if (bold) r.font = { bold: true }; return r }
  dicionario(add, bProd, true)
  for (const b of [bPar, bCd]) { for (const c of b.colunas) add([b.aba ?? b.nome, c.rotulo, c.campo, TIPO[c.tipo], b.chave.includes(c.campo) ? 'Chave' : '', (c.aliases ?? []).join(', '), c.ajuda ?? '']) }
  return wb
}

export async function baixarTabelaMestre(bases: Base[], dados: DadosMestre) {
  const wb = montarTabelaMestre(bases, dados)
  baixar(await wb.xlsx.writeBuffer() as ArrayBuffer, `tabela_mestre_portal_franca_${new Date().toISOString().slice(0, 10)}.xlsx`)
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

export type Aba = { nome: string; linhas: unknown[][] }

/** Lê .xlsx (todas as abas visíveis) ou .csv (uma aba). */
export async function lerArquivo(arquivo: File): Promise<{ abas: Aba[] }> {
  if (/\.(csv|txt)$/i.test(arquivo.name)) return { abas: [{ nome: 'CSV', linhas: lerCsv(await arquivo.text()) }] }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await arquivo.arrayBuffer())
  const abas: Aba[] = []
  for (const ws of wb.worksheets) {
    if (ws.state === 'hidden' || ws.state === 'veryHidden') continue
    const linhas: unknown[][] = []
    ws.eachRow({ includeEmpty: true }, (row, n) => { linhas[n - 1] = (row.values as unknown[]).slice(1) })
    for (let i = 0; i < linhas.length; i++) if (!linhas[i]) linhas[i] = []
    abas.push({ nome: ws.name, linhas })
  }
  if (!abas.length) throw new Error('A planilha não tem abas.')
  return { abas }
}

/** Aba a usar para uma base: a de mesmo nome na tabela mestre, depois "Dados", depois a primeira. */
export function abaDaBase(base: Base, abas: Aba[], exata = false): Aba | undefined {
  const n = (s: string) => normalizarCabecalho(s)
  const porNome = base.aba ? abas.find((a) => n(a.nome) === n(base.aba!)) : undefined
  if (porNome || exata) return porNome
  return abas.find((a) => n(a.nome) === 'dados') ?? abas[0]
}
