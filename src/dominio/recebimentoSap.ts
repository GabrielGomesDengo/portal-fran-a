// Recebimento a partir da transferência no SAP.
// A Operação transfere a produção no SAP antes de informar o portal; em vez de
// digitar lote a lote, ela sobe a extração da transferência (MB51 / MIGO) e o
// portal concilia com os lotes do plano do PCP.

import { acharCabecalho, converter, mapearCabecalhos, valorCru, type Base } from '../manutencao/bases'
import { somarDias, type DataLocal } from './calendario'

/** Colunas reconhecidas na extração do SAP (o "modelo" do recebimento). */
export const TRANSFERENCIA_SAP: Base = {
  id: 'transferencia_sap', nome: 'Transferência SAP (recebimento)', tabela: 'recebimento', chave: ['sku', 'lote', 'qtd'],
  modos: ['atualizar'], modoPadrao: 'atualizar', frequencia: 'A cada transferência', ordenarPor: [],
  descricao: 'Lotes transferidos no SAP para o pedido da França. Preenche o recebimento no portal.',
  origemSugerida: 'SAP MB51 (lista de documentos de material, movimento de transferência) ou MIGO',
  instrucoes: [
    '1. Extraia do SAP os documentos da transferência do pedido (ex.: MB51 filtrando material, data e tipo de movimento).',
    '2. Cole aqui ou suba o arquivo do jeito que sai do SAP: os cabeçalhos da coluna "Aceita também" são reconhecidos.',
    '3. Obrigatórios: Material, Lote e Quantidade. Recomendado: Data de produção e/ou Data do vencimento.',
    '4. Linhas com quantidade negativa (perna de saída da transferência) são ignoradas.',
    '5. O mesmo lote em várias linhas é somado.',
    '6. Sem data de produção, o portal calcula pela data do vencimento menos o shelf life (e vice-versa).',
    '7. Antes de aplicar, o portal mostra a conciliação com o plano do PCP. Nada é gravado até você salvar o recebimento.',
  ],
  colunas: [
    { campo: 'sku', rotulo: 'Material', tipo: 'texto', semZerosEsquerda: true, aliases: ['Código SAP', 'SKU', 'Código', 'Cód. material'] },
    { campo: 'lote', rotulo: 'Lote', tipo: 'texto', aliases: ['Batch', 'Nº lote'] },
    { campo: 'qtd', rotulo: 'Quantidade', tipo: 'decimal', aliases: ['Qtd.', 'Qtd', 'Qtd. UM registro', 'Qtd.em UM registro', 'Qtd em UM registro', 'Quantidade em UM registro', 'Qtd. UMB', 'Quantidade UMB', 'Qtd.UM base', 'Utilização livre'] },
    { campo: 'fabricacao', rotulo: 'Data de produção', tipo: 'data', aliases: ['Data producao', 'Dt. produção', 'Dt.produção', 'Fabricação', 'Data de fabricação', 'Produção'] },
    { campo: 'validade', rotulo: 'Data do vencimento', tipo: 'data', aliases: ['Vencimento', 'Validade', 'Data vencimento', 'Dt.vencimento', 'Dt. vencimento', 'Venc.', 'BBE'] },
    { campo: 'lancamento', rotulo: 'Data de lançamento', tipo: 'data', aliases: ['Data lançamento', 'Dt.lançamento', 'Dt. lançamento', 'Data do lançamento'] },
    { campo: 'documento', rotulo: 'Documento de material', tipo: 'texto', aliases: ['Doc.material', 'Doc. material', 'Documento material', 'Documento'] },
    { campo: 'movimento', rotulo: 'Tipo de movimento', tipo: 'texto', aliases: ['TMv', 'Tipo movimento', 'Tp. movimento'] },
  ],
}

export type LoteSap = {
  sku: string; lote: string; qtd: number
  fabricacao: DataLocal | null; validade: DataLocal | null; lancamento: DataLocal | null
  documentos: string[]; linhas: number[]; avisos: string[]
}
export type Descarte = { linha: number; sku: string; lote: string; qtd: number | null; motivo: string }

export type LeituraSap = { faltando: string[]; reconhecidas: string[]; lotes: LoteSap[]; descartes: Descarte[] }

/** Lê a matriz da planilha, descarta saídas/erros e soma o mesmo lote. */
export function lerTransferenciaSap(matriz: unknown[][], primeiraLinhaExcel = 1): LeituraSap {
  const base = TRANSFERENCIA_SAP
  const iCab = acharCabecalho(matriz, base)
  const cab = (matriz[iCab] ?? []).map((c) => String(valorCru(c) ?? '').trim())
  const { mapa, faltandoChave } = mapearCabecalhos(cab, base)
  const reconhecidas = [...mapa.values()].map((c) => c.rotulo)
  if (faltandoChave.length) return { faltando: faltandoChave.map((k) => base.colunas.find((c) => c.campo === k)!.rotulo), reconhecidas, lotes: [], descartes: [] }

  const porLote = new Map<string, LoteSap>()
  const descartes: Descarte[] = []
  matriz.slice(iCab + 1).forEach((l, idx) => {
    if (!l || l.every((c) => { const v = valorCru(c); return v === null || v === undefined || String(v).trim() === '' })) return
    const n = primeiraLinhaExcel + iCab + 1 + idx
    const d: Record<string, unknown> = {}
    const erros: string[] = []
    mapa.forEach((col, i) => { const r = converter(l[i], col); if ('erro' in r) erros.push(`${col.rotulo}: ${r.erro}`); else if ('valor' in r) d[col.campo] = r.valor })
    const sku = String(d.sku ?? ''), lote = String(d.lote ?? '').trim(), qtd = typeof d.qtd === 'number' ? d.qtd : null
    if (erros.length) return descartes.push({ linha: n, sku, lote, qtd, motivo: erros.join('; ') })
    if (!sku) return descartes.push({ linha: n, sku, lote, qtd, motivo: 'Material vazio' })
    if (!lote) return descartes.push({ linha: n, sku, lote, qtd, motivo: 'Lote vazio' })
    if (qtd === null || qtd === 0) return descartes.push({ linha: n, sku, lote, qtd, motivo: 'Quantidade vazia ou zero' })
    if (qtd < 0) return descartes.push({ linha: n, sku, lote, qtd, motivo: 'Saída da transferência (quantidade negativa)' })
    const k = `${sku}|${lote}`
    const atual = porLote.get(k)
    const fab = (d.fabricacao as string) ?? null, val = (d.validade as string) ?? null, lanc = (d.lancamento as string) ?? null
    if (!atual) {
      porLote.set(k, { sku, lote, qtd, fabricacao: fab, validade: val, lancamento: lanc, documentos: d.documento ? [String(d.documento)] : [], linhas: [n], avisos: [] })
    } else {
      atual.qtd = Math.round((atual.qtd + qtd) * 1e6) / 1e6
      atual.linhas.push(n)
      if (d.documento && !atual.documentos.includes(String(d.documento))) atual.documentos.push(String(d.documento))
      if (fab && atual.fabricacao && fab !== atual.fabricacao) atual.avisos.push(`Datas de produção diferentes no mesmo lote (linha ${n})`)
      if (val && atual.validade && val !== atual.validade) atual.avisos.push(`Vencimentos diferentes no mesmo lote (linha ${n})`)
      atual.fabricacao ??= fab; atual.validade ??= val
      if (lanc && (!atual.lancamento || lanc > atual.lancamento)) atual.lancamento = lanc
    }
  })
  const lotes = [...porLote.values()].sort((a, b) => a.sku.localeCompare(b.sku) || (a.fabricacao ?? '').localeCompare(b.fabricacao ?? '') || a.lote.localeCompare(b.lote))
  return { faltando: [], reconhecidas, lotes, descartes }
}

// ---------------------------------------------------------------------------
// Conciliação com o recebimento do pedido
// ---------------------------------------------------------------------------

export type LinhaRecebimento = {
  id?: string; pedido_id: string; plano_id: string | null; sku: string; lote: string | null
  qtd_planejada: number | null; qtd_recebida: number; data_fabricacao: string | null; validade: string | null
  data_recebimento: string; confirmado: boolean
}
export type Destino = 'lote_existente' | 'lote_do_plano' | 'extra' | 'fora_do_pedido'
export type ItemConciliacao = {
  sap: LoteSap; destino: Destino; qtdPlanejada: number | null
  fabricacao: DataLocal | null; validade: DataLocal | null
  origemDatas: 'sap' | 'calculada' | 'plano' | 'incompleta'
  avisos: string[]
}
export type Conciliacao = { linhas: LinhaRecebimento[]; itens: ItemConciliacao[]; semTransferencia: LinhaRecebimento[] }

export function conciliarRecebimento(
  atuais: LinhaRecebimento[], lotes: LoteSap[],
  ctx: { pedidoId: string; skusPedido: Set<string>; shelfLife: (sku: string) => number | null; hoje: DataLocal; confirmar: boolean },
): Conciliacao {
  const linhas = atuais.map((l) => ({ ...l }))
  const tocadas = new Set<number>()
  const itens: ItemConciliacao[] = []
  const lotesDoArquivo = new Set(lotes.map((l) => `${l.sku}|${l.lote}`))

  for (const s of lotes) {
    if (!ctx.skusPedido.has(s.sku)) { itens.push({ sap: s, destino: 'fora_do_pedido', qtdPlanejada: null, fabricacao: s.fabricacao, validade: s.validade, origemDatas: 'sap', avisos: ['Material não está neste pedido — não será incluído'] }); continue }

    let idx = linhas.findIndex((l, i) => !tocadas.has(i) && l.sku === s.sku && (l.lote ?? '').trim() === s.lote)
    let destino: Destino = 'lote_existente'
    if (idx < 0) {
      // lote do plano ainda sem lote informado: prefere o de data de produção mais próxima
      const livres = linhas.map((l, i) => ({ l, i })).filter(({ l, i }) => !tocadas.has(i) && l.sku === s.sku && !(l.lote ?? '').trim() && l.qtd_recebida <= 0)
      const dist = (d: string | null) => (d && s.fabricacao ? Math.abs(Date.parse(d) - Date.parse(s.fabricacao)) : Number.MAX_SAFE_INTEGER)
      livres.sort((a, b) => Number(!!b.l.plano_id) - Number(!!a.l.plano_id) || dist(a.l.data_fabricacao) - dist(b.l.data_fabricacao))
      if (livres.length) { idx = livres[0].i; destino = 'lote_do_plano' }
    }
    if (idx < 0) {
      linhas.push({ pedido_id: ctx.pedidoId, plano_id: null, sku: s.sku, lote: null, qtd_planejada: 0, qtd_recebida: 0, data_fabricacao: null, validade: null, data_recebimento: ctx.hoje, confirmado: false })
      idx = linhas.length - 1; destino = 'extra'
    }
    const alvo = linhas[idx]
    const sl = ctx.shelfLife(s.sku)
    let fab = s.fabricacao, val = s.validade, origem: ItemConciliacao['origemDatas'] = 'sap'
    if (!fab && val && sl) { fab = somarDias(val, -sl); origem = 'calculada' }
    if (fab && !val && sl) { val = somarDias(fab, sl); origem = 'calculada' }
    if (!fab && !val && alvo.data_fabricacao) { fab = alvo.data_fabricacao; val = alvo.validade; origem = 'plano' }
    if (!fab) origem = 'incompleta'
    const avisos = [...s.avisos]
    if (origem === 'plano') avisos.push('SAP sem datas: mantida a data de produção do plano — confira')
    if (origem === 'incompleta') avisos.push('Sem data de produção nem vencimento — preencha antes de confirmar')
    if (fab && val && sl && s.fabricacao && s.validade && somarDias(s.fabricacao, sl) !== s.validade) avisos.push(`Vencimento do SAP difere de produção + shelf life (${sl} dias)`)
    if (destino === 'extra') {
      const outros = linhas.filter((l, i) => i !== idx && l.sku === s.sku && l.qtd_recebida > 0 && (l.lote ?? '') !== s.lote && !lotesDoArquivo.has(`${l.sku}|${l.lote}`)).map((l) => l.lote || 'sem lote')
      if (outros.length) avisos.push(`Este SKU já tem recebimento no lote ${outros.join(', ')}, que não está no arquivo — confira se não é o mesmo lote digitado diferente`)
    }
    const plan = alvo.qtd_planejada ?? 0
    if (destino !== 'extra' && plan > 0 && s.qtd !== plan) avisos.push(s.qtd > plan ? 'Acima do planejado' : 'Abaixo do planejado')

    linhas[idx] = {
      ...alvo, lote: s.lote, qtd_recebida: s.qtd, data_fabricacao: fab, validade: val,
      data_recebimento: s.lancamento ?? alvo.data_recebimento ?? ctx.hoje,
      confirmado: ctx.confirmar && !!fab,
    }
    tocadas.add(idx)
    itens.push({ sap: s, destino, qtdPlanejada: destino === 'extra' ? null : alvo.qtd_planejada, fabricacao: fab, validade: val, origemDatas: origem, avisos })
  }
  const semTransferencia = linhas.filter((l, i) => !tocadas.has(i) && l.plano_id && l.qtd_recebida <= 0)
  return { linhas, itens, semTransferencia }
}
