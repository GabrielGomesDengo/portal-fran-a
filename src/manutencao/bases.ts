// Definição das bases que o admin mantém pelo painel de Manutenção.
// Cada base diz: tabela de destino, chave, colunas (com tipo, visão e
// cabeçalhos aceitos — inclusive os nomes que saem das extrações do SAP)
// e quais modos de carga aceita.

export type Tipo = 'texto' | 'inteiro' | 'decimal' | 'data' | 'booleano'
export type Modo = 'atualizar' | 'substituir'

export type Coluna = {
  campo: string
  rotulo: string
  tipo: Tipo
  grupo?: string
  /** Obrigatório quando a linha é um registro novo. */
  obrigatorioNovo?: boolean
  /** Outros cabeçalhos aceitos na planilha (ex.: nome da coluna no SAP). */
  aliases?: string[]
  ajuda?: string
  /** Valores permitidos (texto). */
  opcoes?: string[]
  /** Remove zeros à esquerda (código de material do SAP). */
  semZerosEsquerda?: boolean
  /** Coluna NOT NULL no banco: não aceita LIMPAR. */
  naoNulo?: boolean
  /** Obrigatório para SKU ativo no portfólio (destacado na tabela mestre e na saúde do cadastro). */
  obrigatorioAtivo?: boolean
  min?: number
}

export type Base = {
  id: string
  nome: string
  descricao: string
  tabela: string
  chave: string[]
  modos: Modo[]
  modoPadrao: Modo
  /** Linhas cujo SKU não existe no cadastro de produtos são ignoradas (tabelas com vínculo ao produto). */
  exigeProduto?: boolean
  /** Novos registros não são permitidos (só atualiza chaves existentes). */
  somenteExistentes?: boolean
  frequencia: string
  origemSugerida: string
  /** Substitui o passo a passo padrão da aba Instruções do modelo. */
  instrucoes?: string[]
  /** Nome da aba desta base na tabela mestre (arquivo único). */
  aba?: string
  /** Colunas só de consulta no modelo (calculadas pelo portal; ignoradas na carga). */
  informativas?: Coluna[]
  colunas: Coluna[]
  ordenarPor: string[]
}

const SKU: Coluna = { campo: 'sku', rotulo: 'Código SAP', tipo: 'texto', aliases: ['Material', 'SKU', 'Código', 'Codigo material', 'Cód. material'], semZerosEsquerda: true, ajuda: 'Código do material no SAP, sem zeros à esquerda.' }

export const BASES: Base[] = [
  {
    id: 'produtos', nome: 'Produtos', tabela: 'produto', chave: ['sku'], modos: ['atualizar'], modoPadrao: 'atualizar', aba: 'Produtos',
    informativas: [
      { campo: 'qtd_10_meses', rotulo: 'Volume 10 meses', tipo: 'decimal', grupo: 'Consulta' },
      { campo: 'num_embarques_10_meses', rotulo: 'Nº embarques 10 meses', tipo: 'inteiro', grupo: 'Consulta' },
      { campo: 'ultimo_embarque', rotulo: 'Último embarque', tipo: 'data', grupo: 'Consulta' },
    ],
    descricao: 'Cadastro mestre dos SKUs: descrições, logística, shelf life, preço e portfólio França.',
    frequencia: 'Quando houver SKU novo ou mudança de cadastro', origemSugerida: 'SAP (MM60 / SE16N MARA-MARC) + tabela de preço interco',
    ordenarPor: ['familia', 'descricao_br'],
    colunas: [
      { ...SKU, grupo: 'Básico' },
      { obrigatorioAtivo: true, campo: 'descricao_br', rotulo: 'Descrição BR', tipo: 'texto', grupo: 'Básico', obrigatorioNovo: true, aliases: ['Descrição', 'Texto breve material', 'Descricao material'] },
      { campo: 'descricao_en', rotulo: 'Descrição EN', tipo: 'texto', grupo: 'Básico' },
      { obrigatorioAtivo: true, campo: 'descricao_fr', rotulo: 'Descrição FR', tipo: 'texto', grupo: 'Básico', ajuda: 'Nome que a França vê no portal em francês.' },
      { obrigatorioAtivo: true, campo: 'familia', rotulo: 'Família', tipo: 'texto', grupo: 'Básico' },
      { campo: 'categoria', rotulo: 'Categoria', tipo: 'texto', grupo: 'Básico' },
      { campo: 'cost_type', rotulo: 'Cost type', tipo: 'texto', grupo: 'Básico' },
      { obrigatorioAtivo: true, campo: 'unidade', rotulo: 'Unidade', tipo: 'texto', grupo: 'Logística', opcoes: ['Unit', 'Kg'], naoNulo: true, aliases: ['UM', 'UMB', 'Unidade de medida'], ajuda: 'Unit ou Kg.' },
      { obrigatorioAtivo: true, campo: 'multiplo_caixa', rotulo: 'Múltiplo caixa', tipo: 'decimal', grupo: 'Logística', min: 0, aliases: ['Qtd por caixa', 'Unidades por caixa'], ajuda: 'Unidades (ou kg) por caixa.' },
      { obrigatorioAtivo: true, campo: 'peso_liq_un_kg', rotulo: 'Peso líquido un (kg)', tipo: 'decimal', grupo: 'Logística', min: 0, aliases: ['Peso líquido'] },
      { obrigatorioAtivo: true, campo: 'peso_bruto_caixa_kg', rotulo: 'Peso bruto caixa (kg)', tipo: 'decimal', grupo: 'Logística', min: 0, aliases: ['Peso bruto'] },
      { obrigatorioAtivo: true, campo: 'hs_code', rotulo: 'HS code', tipo: 'texto', grupo: 'Logística', aliases: ['NCM', 'HS'] },
      { obrigatorioAtivo: true, campo: 'shelf_life_dias', rotulo: 'Shelf life SAP (dias)', tipo: 'inteiro', grupo: 'Qualidade', min: 1, aliases: ['Shelf life', 'Prazo validade total', 'Prazo de validade total', 'Shelf'], ajuda: 'Fonte oficial para contract date.' },
      { campo: 'shelf_life_dias_franca', rotulo: 'Shelf life França (dias)', tipo: 'inteiro', grupo: 'Qualidade', min: 1, ajuda: 'Referência da França; divergências viram alerta.' },
      { obrigatorioAtivo: true, campo: 'preco_interco_eur', rotulo: 'Preço interco (€)', tipo: 'decimal', grupo: 'Comercial', min: 0, aliases: ['Preço', 'Preco EUR', 'Price'] },
      { campo: 'cogs_eur', rotulo: 'COGS (€)', tipo: 'decimal', grupo: 'Comercial', min: 0, aliases: ['COGS'] },
      { campo: 'ativo', rotulo: 'Ativo no portfólio', tipo: 'booleano', grupo: 'Portfólio', naoNulo: true, aliases: ['Ativo'], ajuda: 'Sim = aparece no catálogo da França.' },
    ],
  },
  {
    id: 'historico_nf', nome: 'Histórico de NFs', tabela: 'embarque_historico', chave: ['nf', 'sku', 'lote'], modos: ['atualizar', 'substituir'], modoPadrao: 'atualizar',
    descricao: 'Itens faturados para a França (NF × SKU × lote). Alimenta o portfólio dos últimos meses e os indicadores.',
    frequencia: 'Mensal (após o fechamento) ou a cada embarque', origemSugerida: 'Relatório de faturamento do SAP (VF05 / NFs emitidas)',
    ordenarPor: ['data_nf', 'nf'],
    colunas: [
      { campo: 'nf', rotulo: 'NF', tipo: 'texto', aliases: ['Nota fiscal', 'Nº NF', 'Número NF'] },
      { campo: 'data_nf', rotulo: 'Data NF', tipo: 'data', obrigatorioNovo: true, aliases: ['Data emissão', 'Data de emissão', 'Emissão'] },
      SKU,
      { campo: 'descricao', rotulo: 'Descrição', tipo: 'texto' },
      { campo: 'lote', rotulo: 'Lote', tipo: 'texto', aliases: ['Batch'], ajuda: 'Pode ficar vazio quando o item não tem lote.' },
      { campo: 'producao', rotulo: 'Produção', tipo: 'data', aliases: ['Data de produção', 'Fabricação'] },
      { campo: 'vencimento', rotulo: 'Vencimento', tipo: 'data', aliases: ['Validade', 'Data do vencimento'] },
      { campo: 'qtd', rotulo: 'Quantidade', tipo: 'decimal', min: 0, aliases: ['Qtd', 'Quantidade faturada'] },
      { campo: 'shelf_life_dias', rotulo: 'Shelf life (dias)', tipo: 'inteiro', min: 1 },
    ],
  },
  {
    id: 'parametros', nome: 'Parâmetros', tabela: 'parametro', chave: ['chave'], modos: ['atualizar'], modoPadrao: 'atualizar', somenteExistentes: true, aba: 'Parâmetros',
    descricao: 'Prazos, trânsito, taras e dimensões por modal usados nos cálculos do portal.',
    frequencia: 'Quando a regra mudar', origemSugerida: 'Definição Supply / Logística',
    ordenarPor: ['chave'],
    colunas: [
      { campo: 'chave', rotulo: 'Chave', tipo: 'texto' },
      { campo: 'valor', rotulo: 'Valor', tipo: 'texto', obrigatorioNovo: true },
      { campo: 'descricao', rotulo: 'Descrição', tipo: 'texto' },
    ],
  },
  {
    id: 'contract_date', nome: 'Regra de contract date', tabela: 'contract_date_regra', chave: ['versao', 'shelf_life_dias'], modos: ['atualizar'], modoPadrao: 'atualizar', aba: 'Contract date',
    descricao: 'Shelf life × dias mínimos de validade na chegada à França. Faixas fora da tabela são calculadas proporcionalmente.',
    frequencia: 'Quando o contrato mudar', origemSugerida: 'Contrato Dengo Europe',
    ordenarPor: ['versao', 'shelf_life_dias'],
    colunas: [
      { campo: 'versao', rotulo: 'Versão', tipo: 'inteiro', min: 1 },
      { campo: 'shelf_life_dias', rotulo: 'Shelf life (dias)', tipo: 'inteiro', min: 1 },
      { campo: 'minimo_dias_chegada', rotulo: 'Mínimo na chegada (dias)', tipo: 'inteiro', min: 0, obrigatorioNovo: true },
      { campo: 'vigente', rotulo: 'Vigente', tipo: 'booleano', naoNulo: true },
    ],
  },
]

/** Tabela mestre: um arquivo com uma aba por base (Produtos, Parâmetros, Contract date). */
export const MESTRE = {
  id: 'mestre', nome: 'Tabela mestre (arquivo único)',
  descricao: 'Um só arquivo com todo o cadastro: produtos, parâmetros e contract date. Substitui as planilhas de cadastro, PMD, shelf life e preços.',
  partes: ['produtos', 'parametros', 'contract_date'],
}
export const baseDaTabela = (tabela: string) => BASES.find((b) => b.tabela === tabela)
export const baseDoId = (id: string) => BASES.find((b) => b.id === id)

// ---------------------------------------------------------------------------
// Conversão de células
// ---------------------------------------------------------------------------

export const LIMPAR = 'LIMPAR'
type Valor = string | number | boolean | null
export type Conversao = { vazio: true } | { valor: Valor } | { erro: string }

export function normalizarCabecalho(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Valor "cru" de uma célula do ExcelJS (fórmula, rich text, hyperlink…). */
export function valorCru(v: unknown): unknown {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as Record<string, unknown>
    if ('formula' in o || 'sharedFormula' in o) return 'result' in o ? valorCru(o.result) : null
    if ('result' in o) return valorCru(o.result)
    if ('richText' in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join('')
    if ('text' in o) return valorCru(o.text)
    if ('error' in o) return null
  }
  return v
}

const dataISO = (a: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(a, m - 1, d))
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function numeroDeTexto(s: string): number | null {
  let t = s.trim().replace(/\s|€|R\$/g, '')
  if (t === '') return null
  // 1.234,56 (pt-BR) | 1,234.56 (en) | 1234,5 | 1234.5
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  else if (t.includes(',')) t = t.replace(',', '.')
  // 1.200 ou 12.345.678 = milhar (padrão SAP Brasil); 0.350 continua decimal
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function converter(bruto: unknown, col: Coluna): Conversao {
  const v = valorCru(bruto)
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return { vazio: true }
  if (typeof v === 'string' && v.trim().toUpperCase() === LIMPAR) return { valor: null }
  switch (col.tipo) {
    case 'texto': {
      let s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(v)) : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim()
      if (col.semZerosEsquerda && /^\d+$/.test(s)) s = s.replace(/^0+(?=\d)/, '')
      if (col.opcoes) {
        const achou = col.opcoes.find((o) => o.toLowerCase() === s.toLowerCase())
        if (!achou) return { erro: `"${s}" não é válido (use ${col.opcoes.join(' ou ')})` }
        s = achou
      }
      return { valor: s }
    }
    case 'inteiro':
    case 'decimal': {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? numeroDeTexto(v) : null
      if (n === null) return { erro: `"${String(v)}" não é um número` }
      if (col.tipo === 'inteiro' && !Number.isInteger(n)) return { erro: `${n} deveria ser um número inteiro` }
      if (col.min !== undefined && n < col.min) return { erro: `${n} abaixo do mínimo (${col.min})` }
      return { valor: col.tipo === 'decimal' ? Math.round(n * 1e6) / 1e6 : n }
    }
    case 'data': {
      if (v instanceof Date) return Number.isNaN(v.getTime()) ? { erro: 'data inválida' } : { valor: v.toISOString().slice(0, 10) }
      if (typeof v === 'number') { // número serial do Excel
        const d = new Date(Math.round((v - 25569) * 86400000))
        return { valor: d.toISOString().slice(0, 10) }
      }
      const s = String(v).trim()
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
      let iso = m ? dataISO(+m[1], +m[2], +m[3]) : null
      if (!m) { m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); if (m) iso = dataISO(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]) }
      return iso ? { valor: iso } : { erro: `"${s}" não é uma data (use dd/mm/aaaa)` }
    }
    case 'booleano': {
      if (typeof v === 'boolean') return { valor: v }
      const s = normalizarCabecalho(String(v))
      if (['sim', 's', 'x', 'true', 'verdadeiro', '1', 'ativo', 'yes', 'y', 'oui'].includes(s)) return { valor: true }
      if (['nao', 'n', 'false', 'falso', '0', 'inativo', 'no', 'non'].includes(s)) return { valor: false }
      return { erro: `"${String(v)}" não é Sim/Não` }
    }
  }
}

// ---------------------------------------------------------------------------
// Prévia da carga
// ---------------------------------------------------------------------------

export type Diferenca = { campo: string; antes: unknown; depois: unknown }
export type LinhaPrevia = {
  linha: number
  chave: Record<string, Valor>
  rotuloChave: string
  acao: 'novo' | 'alterado' | 'igual' | 'erro' | 'ignorado'
  dados: Record<string, Valor>
  diferencas: Diferenca[]
  erros: string[]
}
export type Previa = {
  base: Base
  modo: Modo
  colunasReconhecidas: { coluna: Coluna; cabecalho: string }[]
  cabecalhosIgnorados: string[]
  faltandoChave: string[]
  linhas: LinhaPrevia[]
  removidos: Record<string, unknown>[]
  contagem: Record<LinhaPrevia['acao'] | 'removido', number>
  /** Linhas que vão para o banco (todas as válidas, inclusive iguais — necessário no modo substituir). */
  payload: Record<string, Valor>[]
}

/** Associa os cabeçalhos da planilha às colunas da base (por rótulo, nome do campo ou alias). */
export function mapearCabecalhos(cabecalhos: string[], base: Base) {
  // Cada coluna pega o cabeçalho que casa com o nome de MAIOR prioridade (rótulo, campo, depois
  // aliases na ordem). Ex.: com "Utilização livre" e "Quantidade" no arquivo, vale "Utilização livre".
  const norm = cabecalhos.map((h) => normalizarCabecalho(h ?? ''))
  const mapa = new Map<number, Coluna>()
  const usados = new Set<number>()
  for (const c of base.colunas) {
    const nomes = [c.rotulo, c.campo, ...(c.aliases ?? [])].map(normalizarCabecalho)
    let melhor = -1, rank = Infinity
    norm.forEach((n, i) => { if (!n || usados.has(i)) return; const r = nomes.indexOf(n); if (r >= 0 && r < rank) { rank = r; melhor = i } })
    if (melhor >= 0) { mapa.set(melhor, c); usados.add(melhor) }
  }
  const ignorados = cabecalhos.filter((_h, i) => norm[i] && !usados.has(i))
  const campos = new Set([...mapa.values()].map((c) => c.campo))
  return { mapa: new Map([...mapa.entries()].sort((a, b) => a[0] - b[0])), ignorados, faltandoChave: base.chave.filter((k) => !campos.has(k)) }
}

/** Acha a linha de cabeçalho (a que mais casa com as colunas da base entre as 15 primeiras). */
export function acharCabecalho(linhas: unknown[][], base: Base): number {
  let melhor = 0, pontos = -1
  linhas.slice(0, 15).forEach((l, i) => {
    const p = mapearCabecalhos(l.map((c) => String(valorCru(c) ?? '')), base).mapa.size
    if (p > pontos) { melhor = i; pontos = p }
  })
  return melhor
}

const igual = (a: unknown, b: unknown) => {
  if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) return true
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b)
  return String(a) === String(b)
}
const chaveTexto = (base: Base, r: Record<string, unknown>) => base.chave.map((k) => String(r[k] ?? '')).join('|')

export type Contexto = { skus?: Set<string> }

/**
 * Compara a planilha com o que está no banco e devolve a prévia da carga.
 * `linhas` = todas as linhas da planilha (a primeira com cabeçalho é detectada).
 * Primeira linha de dados = linha (cabecalho + 2) no Excel.
 */
export function prepararCarga(base: Base, modo: Modo, linhas: unknown[][], atuais: Record<string, unknown>[], ctx: Contexto = {}, primeiraLinhaExcel = 1): Previa {
  const iCab = acharCabecalho(linhas, base)
  const cab = (linhas[iCab] ?? []).map((c) => String(valorCru(c) ?? '').trim())
  const { mapa, ignorados, faltandoChave } = mapearCabecalhos(cab, base)
  const porChave = new Map(atuais.map((r) => [chaveTexto(base, r), r]))
  const vistas = new Set<string>()
  const saida: LinhaPrevia[] = []

  if (faltandoChave.length === 0) {
    linhas.slice(iCab + 1).forEach((l, idx) => {
      if (!l || l.every((c) => { const v = valorCru(c); return v === null || v === undefined || String(v).trim() === '' })) return
      const dados: Record<string, Valor> = {}
      const erros: string[] = []
      mapa.forEach((col, i) => {
        const r = converter(l[i], col)
        if ('erro' in r) erros.push(`${col.rotulo}: ${r.erro}`)
        else if ('valor' in r) dados[col.campo] = r.valor
      })
      // Lote vazio no histórico de NFs vira '' (faz parte da chave)
      if (base.tabela === 'embarque_historico' && (dados.lote === undefined || dados.lote === null)) dados.lote = ''
      const chave: Record<string, Valor> = {}
      for (const k of base.chave) {
        const v = dados[k]
        if (v === undefined || v === null || v === '') { if (!(base.tabela === 'embarque_historico' && k === 'lote')) erros.push(`${base.colunas.find((c) => c.campo === k)!.rotulo} vazio`) }
        chave[k] = v ?? null
      }
      for (const c of base.colunas) {
        if (base.chave.includes(c.campo) || dados[c.campo] !== null || !(c.obrigatorioNovo || c.naoNulo)) continue
        erros.push(`${c.rotulo} não pode ser apagado`)
      }
      const ck = chaveTexto(base, chave)
      const atual = porChave.get(ck)
      const linha: LinhaPrevia = { linha: primeiraLinhaExcel + iCab + 1 + idx, chave, rotuloChave: base.chave.map((k) => chave[k]).filter((x) => x !== '').join(' · '), acao: 'igual', dados, diferencas: [], erros }

      if (!erros.length && vistas.has(ck)) erros.push('Chave repetida na planilha (vale só a primeira ocorrência)')
      vistas.add(ck)
      if (!erros.length && base.exigeProduto && ctx.skus && !ctx.skus.has(String(chave.sku))) {
        linha.acao = 'ignorado'; linha.erros = ['SKU não cadastrado no portal']; saida.push(linha); return
      }
      if (!erros.length && !atual) {
        if (base.somenteExistentes) erros.push('Registro não existe (esta base só atualiza registros existentes)')
        for (const c of base.colunas) if (c.obrigatorioNovo && (dados[c.campo] === undefined || dados[c.campo] === null)) erros.push(`${c.rotulo} é obrigatório para registro novo`)
      }
      if (erros.length) { linha.acao = 'erro'; saida.push(linha); return }
      if (!atual) {
        linha.acao = 'novo'
        linha.diferencas = Object.entries(dados).filter(([k]) => !base.chave.includes(k)).map(([campo, depois]) => ({ campo, antes: null, depois }))
      } else {
        linha.diferencas = Object.entries(dados).filter(([k, v]) => !base.chave.includes(k) && !igual(atual[k], v)).map(([campo, depois]) => ({ campo, antes: atual[campo] ?? null, depois }))
        linha.acao = linha.diferencas.length ? 'alterado' : 'igual'
      }
      saida.push(linha)
    })
  }

  const validas = saida.filter((l) => l.acao === 'novo' || l.acao === 'alterado' || l.acao === 'igual')
  const chavesCarga = new Set(validas.map((l) => chaveTexto(base, l.chave)))
  const removidos = modo === 'substituir' && faltandoChave.length === 0 ? atuais.filter((r) => !chavesCarga.has(chaveTexto(base, r))) : []
  const contagem = { novo: 0, alterado: 0, igual: 0, erro: 0, ignorado: 0, removido: removidos.length }
  saida.forEach((l) => { contagem[l.acao]++ })
  return {
    base, modo,
    colunasReconhecidas: [...mapa.entries()].map(([i, coluna]) => ({ coluna, cabecalho: cab[i] })),
    cabecalhosIgnorados: ignorados.filter((h) => !(base.informativas ?? []).some((c) => normalizarCabecalho(c.rotulo) === normalizarCabecalho(h)) && normalizarCabecalho(h) !== 'campos pendentes'), faltandoChave,
    linhas: saida, removidos, contagem,
    payload: validas.map((l) => ({ ...l.dados })),
  }
}

// ---------------------------------------------------------------------------
// Saúde do cadastro de produtos
// ---------------------------------------------------------------------------

type ProdutoSaude = { sku: string; descricao_br: string; ativo: boolean } & Record<string, unknown>
export type Pendencia = { id: string; rotulo: string; dica: string; campos: string[]; skus: ProdutoSaude[] }

export function pendenciasCadastro(produtos: ProdutoSaude[]): Pendencia[] {
  const ativos = produtos.filter((p) => p.ativo)
  const vazio = (v: unknown) => v === null || v === undefined || v === '' || v === 0
  const regra = (id: string, rotulo: string, dica: string, campos: string[], f: (p: ProdutoSaude) => boolean): Pendencia => ({ id, rotulo, dica, campos, skus: ativos.filter(f) })
  return [
    regra('preco', 'Sem preço interco', 'Pedido sai sem valor e a invoice fica zerada.', ['preco_interco_eur'], (p) => vazio(p.preco_interco_eur)),
    regra('shelf', 'Sem shelf life SAP', 'Não dá para calcular contract date nem a janela de produção.', ['shelf_life_dias'], (p) => vazio(p.shelf_life_dias)),
    regra('caixa', 'Sem múltiplo de caixa', 'O pedido não arredonda em caixas fechadas.', ['multiplo_caixa'], (p) => vazio(p.multiplo_caixa)),
    regra('peso_liq', 'Sem peso líquido', 'Packing list e invoice saem sem peso líquido.', ['peso_liq_un_kg'], (p) => p.unidade !== 'Kg' && vazio(p.peso_liq_un_kg)),
    regra('peso_bruto', 'Sem peso bruto da caixa', 'Packing list sai sem peso bruto.', ['peso_bruto_caixa_kg'], (p) => vazio(p.peso_bruto_caixa_kg)),
    regra('hs', 'Sem HS code', 'A invoice exige o HS code de cada item.', ['hs_code'], (p) => vazio(p.hs_code)),
    regra('fr', 'Sem descrição em francês', 'No portal em francês aparece o nome em português.', ['descricao_fr'], (p) => vazio(p.descricao_fr)),
    regra('diverg', 'Shelf life SAP ≠ França', 'Alinhar com a França qual vale; o portal usa o SAP.', ['shelf_life_dias', 'shelf_life_dias_franca'],
      (p) => !vazio(p.shelf_life_dias_franca) && !vazio(p.shelf_life_dias) && p.shelf_life_dias !== p.shelf_life_dias_franca),
  ]
}
