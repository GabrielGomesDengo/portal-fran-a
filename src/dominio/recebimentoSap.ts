// Recebimento a partir do relatório de estoque do depósito no SAP.
// A Operação transfere a produção para o depósito de expedição da França no SAP
// antes de informar o portal. Em vez de digitar lote a lote, ela sobe o relatório
// de estoque desse depósito (o que está disponível = recebido) e o portal concilia
// com os lotes do plano do PCP. Também aceita a lista de documentos (MB51).

import { acharCabecalho, converter, mapearCabecalhos, valorCru, type Base } from '../manutencao/bases'
import { somarDias, type DataLocal } from './calendario'

/** Colunas reconhecidas no relatório do SAP (é também o "modelo" do recebimento). */
export const ESTOQUE_DEPOSITO_SAP: Base = {
  id: 'estoque_deposito_sap', nome: 'Estoque do depósito (recebimento)', tabela: 'recebimento', chave: ['sku', 'lote', 'qtd'],
  modos: ['atualizar'], modoPadrao: 'atualizar', frequencia: 'A cada recebimento', ordenarPor: [],
  descricao: 'Saldo disponível por lote no depósito de expedição da França. Preenche o recebimento do pedido no portal.',
  origemSugerida: 'Relatório de estoque do depósito no SAP (MB52 / MMBE / MCHB), filtrando o depósito da França',
  instrucoes: [
    '1. Extraia do SAP o relatório de estoque do depósito da França (o que está disponível / recebido).',
    '2. Suba o arquivo do jeito que sai do SAP: os cabeçalhos da coluna "Aceita também" são reconhecidos.',
    '3. Obrigatórios: Material, Lote e Quantidade disponível. Recomendado: Data de produção e/ou Data do vencimento.',
    '4. Se o relatório trouxer a coluna Depósito, o portal usa só o depósito da França (parâmetro deposito_expedicao_franca).',
    '5. O mesmo lote em várias linhas é somado; linhas sem saldo disponível são ignoradas.',
    '6. Sem data de produção, o portal calcula pela data do vencimento menos o shelf life (e vice-versa).',
    '7. Antes de aplicar, o portal mostra a conciliação com o plano do PCP. Nada é gravado até você salvar o recebimento.',
  ],
  colunas: [
    { campo: 'sku', rotulo: 'Material', tipo: 'texto', semZerosEsquerda: true, aliases: ['Código SAP', 'SKU', 'Código', 'Cód. material', 'Código material'] },
    { campo: 'lote', rotulo: 'Lote', tipo: 'texto', aliases: ['Batch', 'Nº lote'] },
    { campo: 'qtd', rotulo: 'Quantidade disponível', tipo: 'decimal', aliases: [
      'Utilização livre', 'Utilizacao livre', 'Util. livre', 'Livre utilização', 'Estoque livre', 'Estoque disponível', 'Disponível', 'Qtd disponível', 'Qtd. disponível',
      'Recebido', 'Qtd recebida', 'Quantidade recebida', 'Saldo', 'Quantidade', 'Qtd', 'Qtd.',
      'Qtd.em UM registro', 'Qtd em UM registro', 'Quantidade em UM registro', 'Qtd. UMB', 'Quantidade UMB', 'Qtd.UM base'] },
    { campo: 'deposito', rotulo: 'Depósito', tipo: 'texto', aliases: ['Dep.', 'Deposito', 'Local de estoque', 'Depósito de estoque'] },
    { campo: 'fabricacao', rotulo: 'Data de produção', tipo: 'data', aliases: ['Data producao', 'Dt. produção', 'Dt.produção', 'Fabricação', 'Data de fabricação', 'Produção'] },
    { campo: 'validade', rotulo: 'Data do vencimento', tipo: 'data', aliases: ['Vencimento', 'Validade', 'Data vencimento', 'Dt.vencimento', 'Dt. vencimento', 'Venc.', 'BBE', 'Data validade'] },
    { campo: 'lancamento', rotulo: 'Data de entrada', tipo: 'data', aliases: ['Data entrada', 'Data de lançamento', 'Data lançamento', 'Dt.lançamento', 'Data do recebimento', 'Data recebimento', 'Último recebimento'] },
    { campo: 'documento', rotulo: 'Documento de material', tipo: 'texto', aliases: ['Doc.material', 'Doc. material', 'Documento material'] },
  ],
}

export type LoteSap = {
  sku: string; lote: string; qtd: number; deposito: string | null
  fabricacao: DataLocal | null; validade: DataLocal | null; lancamento: DataLocal | null
  documentos: string[]; linhas: number[]; avisos: string[]
}
export type Descarte = { linha: number; sku: string; lote: string; qtd: number | null; motivo: string }
export type LeituraSap = {
  faltando: string[]; reconhecidas: string[]
  /** Depósitos presentes no arquivo (vazio se não houver a coluna). */
  depositos: string[]
  /** Depósito efetivamente usado (null = arquivo sem coluna de depósito ou com um só). */
  depositoUsado: string | null
  lotes: LoteSap[]; descartes: Descarte[]
}

/**
 * Lê o relatório: filtra o depósito, descarta linhas sem saldo/erros e soma o mesmo lote.
 * `deposito`: depósito da França; se o arquivo tiver vários e nenhum for informado, usa todos.
 */
export function lerEstoqueSap(matriz: unknown[][], opcoes: { deposito?: string | null } = {}, primeiraLinhaExcel = 1): LeituraSap {
  const base = ESTOQUE_DEPOSITO_SAP
  const iCab = acharCabecalho(matriz, base)
  const cab = (matriz[iCab] ?? []).map((c) => String(valorCru(c) ?? '').trim())
  const { mapa, faltandoChave } = mapearCabecalhos(cab, base)
  const reconhecidas = [...mapa.values()].map((c) => c.rotulo)
  const vazio = { reconhecidas, depositos: [], depositoUsado: null, lotes: [], descartes: [] }
  if (faltandoChave.length) return { ...vazio, faltando: faltandoChave.map((k) => base.colunas.find((c) => c.campo === k)!.rotulo) }

  // primeira passada: converte
  const registros: { n: number; d: Record<string, unknown>; erros: string[] }[] = []
  matriz.slice(iCab + 1).forEach((l, idx) => {
    if (!l || l.every((c) => { const v = valorCru(c); return v === null || v === undefined || String(v).trim() === '' })) return
    const d: Record<string, unknown> = {}
    const erros: string[] = []
    mapa.forEach((col, i) => { const r = converter(l[i], col); if ('erro' in r) erros.push(`${col.rotulo}: ${r.erro}`); else if ('valor' in r) d[col.campo] = r.valor })
    registros.push({ n: primeiraLinhaExcel + iCab + 1 + idx, d, erros })
  })
  const depositos = [...new Set(registros.map((r) => r.d.deposito).filter((x): x is string => typeof x === 'string' && x !== ''))].sort()
  const alvo = opcoes.deposito?.trim()
  const depositoUsado = depositos.length === 1 ? depositos[0] : alvo && depositos.some((d) => d.toUpperCase() === alvo.toUpperCase()) ? depositos.find((d) => d.toUpperCase() === alvo.toUpperCase())! : null

  const porLote = new Map<string, LoteSap>()
  const descartes: Descarte[] = []
  for (const { n, d, erros } of registros) {
    const sku = String(d.sku ?? ''), lote = String(d.lote ?? '').trim(), qtd = typeof d.qtd === 'number' ? d.qtd : null
    const dep = typeof d.deposito === 'string' ? d.deposito : null
    const fora = (motivo: string) => descartes.push({ linha: n, sku, lote, qtd, motivo })
    if (depositoUsado && dep && dep !== depositoUsado) { fora(`Outro depósito (${dep})`); continue }
    if (erros.length) { fora(erros.join('; ')); continue }
    if (!sku) { fora('Material vazio'); continue }
    if (!lote) { fora('Lote vazio'); continue }
    if (qtd === null || qtd === 0) { fora('Sem saldo disponível'); continue }
    if (qtd < 0) { fora('Quantidade negativa (saída)'); continue }
    const k = `${sku}|${lote}`
    const atual = porLote.get(k)
    const fab = (d.fabricacao as string) ?? null, val = (d.validade as string) ?? null, lanc = (d.lancamento as string) ?? null
    if (!atual) {
      porLote.set(k, { sku, lote, qtd, deposito: dep, fabricacao: fab, validade: val, lancamento: lanc, documentos: d.documento ? [String(d.documento)] : [], linhas: [n], avisos: [] })
    } else {
      atual.qtd = Math.round((atual.qtd + qtd) * 1e6) / 1e6
      atual.linhas.push(n)
      if (d.documento && !atual.documentos.includes(String(d.documento))) atual.documentos.push(String(d.documento))
      if (fab && atual.fabricacao && fab !== atual.fabricacao) atual.avisos.push(`Datas de produção diferentes no mesmo lote (linha ${n})`)
      if (val && atual.validade && val !== atual.validade) atual.avisos.push(`Vencimentos diferentes no mesmo lote (linha ${n})`)
      atual.fabricacao ??= fab; atual.validade ??= val
      if (lanc && (!atual.lancamento || lanc > atual.lancamento)) atual.lancamento = lanc
    }
  }
  const lotes = [...porLote.values()].sort((a, b) => a.sku.localeCompare(b.sku) || (a.fabricacao ?? '').localeCompare(b.fabricacao ?? '') || a.lote.localeCompare(b.lote))
  return { faltando: [], reconhecidas, depositos, depositoUsado, lotes, descartes }
}

// ---------------------------------------------------------------------------
// Conciliação com o recebimento do pedido
// ---------------------------------------------------------------------------

export type LinhaRecebimento = {
  id?: string; pedido_id: string; plano_id: string | null; sku: string; lote: string | null
  qtd_planejada: number | null; qtd_recebida: number; data_fabricacao: string | null; validade: string | null
  data_recebimento: string; confirmado: boolean
}
export type Destino = 'lote_existente' | 'lote_do_plano' | 'extra' | 'excedente' | 'fora_do_pedido'
export type ItemConciliacao = {
  sap: LoteSap; destino: Destino; qtdPlanejada: number | null
  /** Quantidade que entra no recebimento (pode ser menor que o saldo quando limitado ao planejado). */
  qtdConsiderada: number
  fabricacao: DataLocal | null; validade: DataLocal | null
  origemDatas: 'sap' | 'calculada' | 'plano' | 'incompleta'
  avisos: string[]
}
export type Conciliacao = {
  linhas: LinhaRecebimento[]; itens: ItemConciliacao[]
  /** Lotes do plano sem saldo no arquivo (pendentes). */
  semEstoque: LinhaRecebimento[]
  /** Já recebidos no portal com lote que não está no depósito (conferir). */
  foraDoDeposito: LinhaRecebimento[]
}

export type ContextoConciliacao = {
  pedidoId: string; skusPedido: Set<string>; shelfLife: (sku: string) => number | null; hoje: DataLocal
  /** Marca como confirmados os lotes com data de produção. */
  confirmar: boolean
  /** Considera no máximo o planejado do SKU; o excedente fica no depósito (depósito compartilhado entre pedidos). */
  limitarAoPlanejado?: boolean
  /** Atende contract date? Usado para escolher os lotes quando há mais saldo que o planejado. */
  atende?: (sku: string, validade: DataLocal | null) => boolean | null
}

export function conciliarRecebimento(atuais: LinhaRecebimento[], lotes: LoteSap[], ctx: ContextoConciliacao): Conciliacao {
  const linhas = atuais.map((l) => ({ ...l }))
  const tocadas = new Set<number>()
  const itens: ItemConciliacao[] = []
  const lotesDoArquivo = new Set(lotes.map((l) => `${l.sku}|${l.lote}`))

  // Datas de cada lote (SAP, ou calculadas pelo shelf life)
  const datas = new Map(lotes.map((s) => {
    const sl = ctx.shelfLife(s.sku)
    let fab = s.fabricacao, val = s.validade, origem: ItemConciliacao['origemDatas'] = 'sap'
    if (!fab && val && sl) { fab = somarDias(val, -sl); origem = 'calculada' }
    if (fab && !val && sl) { val = somarDias(fab, sl); origem = 'calculada' }
    if (!fab && !val) origem = 'incompleta'
    return [s, { fab, val, origem, sl }] as const
  }))

  // Com limite: dentro do SKU, primeiro os lotes que atendem contract date, depois os mais novos.
  const ordem = ctx.limitarAoPlanejado
    ? [...lotes].sort((a, b) => {
        if (a.sku !== b.sku) return a.sku.localeCompare(b.sku)
        const at = (s: LoteSap) => { const r = ctx.atende?.(s.sku, datas.get(s)!.val) ?? null; return r === true ? 0 : r === null ? 1 : 2 }
        return at(a) - at(b) || (datas.get(b)!.fab ?? '').localeCompare(datas.get(a)!.fab ?? '') || a.lote.localeCompare(b.lote)
      })
    : lotes
  // Já recebidos no portal com lote que não aparece no depósito: ficam como estão, mas consomem o planejado e são sinalizados.
  const foraDoDeposito = linhas.filter((l) => l.qtd_recebida > 0 && (l.lote ?? '').trim() && !lotesDoArquivo.has(`${l.sku}|${(l.lote ?? '').trim()}`))
  const restante = new Map<string, number>()
  for (const l of linhas) restante.set(l.sku, (restante.get(l.sku) ?? 0) + (l.qtd_planejada ?? 0))
  for (const l of foraDoDeposito) restante.set(l.sku, (restante.get(l.sku) ?? 0) - l.qtd_recebida)

  for (const s of ordem) {
    const { fab: fabSap, val: valSap, sl } = datas.get(s)!
    let origem: ItemConciliacao['origemDatas'] = datas.get(s)!.origem
    if (!ctx.skusPedido.has(s.sku)) {
      itens.push({ sap: s, destino: 'fora_do_pedido', qtdPlanejada: null, qtdConsiderada: 0, fabricacao: fabSap, validade: valSap, origemDatas: origem, avisos: ['Material não está neste pedido — não será incluído'] })
      continue
    }
    let qtd = s.qtd
    const avisos = [...s.avisos]
    if (ctx.limitarAoPlanejado) {
      const r = Math.max(0, restante.get(s.sku) ?? 0)
      if (r <= 0) {
        itens.push({ sap: s, destino: 'excedente', qtdPlanejada: null, qtdConsiderada: 0, fabricacao: fabSap, validade: valSap, origemDatas: origem, avisos: ['Planejado do SKU já coberto por outros lotes — fica no depósito'] })
        continue
      }
      if (qtd > r) { avisos.push(`Saldo ${fmt(qtd)}; considerado ${fmt(r)} (restante do planejado) — o excedente fica no depósito`); qtd = r }
      restante.set(s.sku, r - qtd)
    }

    let idx = linhas.findIndex((l, i) => !tocadas.has(i) && l.sku === s.sku && (l.lote ?? '').trim() === s.lote)
    let destino: Destino = 'lote_existente'
    if (idx < 0) {
      // lote do plano ainda sem lote informado: prefere o de data de produção mais próxima
      const livres = linhas.map((l, i) => ({ l, i })).filter(({ l, i }) => !tocadas.has(i) && l.sku === s.sku && !(l.lote ?? '').trim() && l.qtd_recebida <= 0)
      const dist = (d: string | null) => (d && fabSap ? Math.abs(Date.parse(d) - Date.parse(fabSap)) : Number.MAX_SAFE_INTEGER)
      livres.sort((a, b) => Number(!!b.l.plano_id) - Number(!!a.l.plano_id) || dist(a.l.data_fabricacao) - dist(b.l.data_fabricacao))
      if (livres.length) { idx = livres[0].i; destino = 'lote_do_plano' }
    }
    if (idx < 0) {
      linhas.push({ pedido_id: ctx.pedidoId, plano_id: null, sku: s.sku, lote: null, qtd_planejada: 0, qtd_recebida: 0, data_fabricacao: null, validade: null, data_recebimento: ctx.hoje, confirmado: false })
      idx = linhas.length - 1; destino = 'extra'
    }
    const alvo = linhas[idx]
    let fab = fabSap, val = valSap
    if (!fab && !val && alvo.data_fabricacao) { fab = alvo.data_fabricacao; val = alvo.validade; origem = 'plano' }
    if (origem === 'plano') avisos.push('SAP sem datas: mantida a data de produção do plano — confira')
    if (origem === 'incompleta') avisos.push('Sem data de produção nem vencimento — preencha antes de confirmar')
    if (sl && s.fabricacao && s.validade && somarDias(s.fabricacao, sl) !== s.validade) avisos.push(`Vencimento do SAP difere de produção + shelf life (${sl} dias)`)
    if (destino === 'extra') {
      const outros = linhas.filter((l, i) => i !== idx && l.sku === s.sku && l.qtd_recebida > 0 && (l.lote ?? '') !== s.lote && !lotesDoArquivo.has(`${l.sku}|${l.lote}`)).map((l) => l.lote || 'sem lote')
      if (outros.length) avisos.push(`Possível duplicidade: o SKU já tem o lote ${outros.join(', ')} recebido, que não está no depósito`)
    }
    const plan = alvo.qtd_planejada ?? 0
    if (!ctx.limitarAoPlanejado && destino !== 'extra' && plan > 0 && qtd !== plan) avisos.push(qtd > plan ? 'Acima do planejado' : 'Abaixo do planejado')

    linhas[idx] = {
      ...alvo, lote: s.lote, qtd_recebida: qtd, data_fabricacao: fab, validade: val,
      data_recebimento: s.lancamento ?? alvo.data_recebimento ?? ctx.hoje,
      confirmado: ctx.confirmar && !!fab,
    }
    tocadas.add(idx)
    itens.push({ sap: s, destino, qtdPlanejada: destino === 'extra' ? null : alvo.qtd_planejada, qtdConsiderada: qtd, fabricacao: fab, validade: val, origemDatas: origem, avisos })
  }
  const semEstoque = linhas.filter((l, i) => !tocadas.has(i) && l.plano_id && l.qtd_recebida <= 0)
  // devolve os itens na ordem do arquivo (por SKU / produção), não na ordem de alocação
  const pos = new Map(lotes.map((l, i) => [l, i]))
  itens.sort((a, b) => pos.get(a.sap)! - pos.get(b.sap)!)
  return { linhas, itens, semEstoque, foraDoDeposito }
}

const fmt = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(n)
