// =============================================================
// Pedido × atendimento, linha a linha (SKU). Função pura.
// Atendido = faturado na invoice ("em nota"). Sem invoice ainda, usa o
// recebido no estoque como prévia, e a origem fica indicada.
// =============================================================

export type FonteAtendido = 'nota' | 'estoque' | 'pendente'
export type SituacaoLinha = 'total' | 'parcial' | 'nao_atendido' | 'excedente' | 'pendente' | 'incluido' | 'andamento'

export type EntradaAtendimento = {
  itens: { sku: string; qtd_solicitada: number; qtd_aprovada: number | null; preco_eur: number | null }[]
  plano: { sku: string; atendimento: string | null; qtd_planejada: number | null }[]
  recebimentos: { sku: string; qtd_recebida: number }[]
  faturado: { sku: string; qtd: number; preco_eur: number | null }[] | null   // null = sem invoice
  precoCadastro?: (sku: string) => number | null
}

export type LinhaAtendimento = {
  sku: string
  solicitado: number; aprovado: number; planejado: number; recebido: number; faturado: number
  atendido: number; fonte: FonteAtendido
  preco: number
  valorSolicitado: number; valorAtendido: number
  pct: number | null            // atendido / solicitado
  diferenca: number             // atendido − solicitado
  situacao: SituacaoLinha
}

export type ResumoAtendimento = {
  fonte: FonteAtendido
  skusSolicitados: number; skusAtendidosTotal: number; skusParciais: number; skusNaoAtendidos: number; skusIncluidos: number
  volumeSolicitado: number; volumeAtendido: number
  valorSolicitado: number; valorAtendido: number
  fillRateVolume: number | null  // Σ min(atendido, solicitado) / Σ solicitado
  fillRateSku: number | null     // SKUs atendidos 100% / SKUs solicitados
  fillRateValor: number | null   // valor atendido (limitado ao solicitado) / valor solicitado
}

const soma = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0)

export function linhasAtendimento(e: EntradaAtendimento): LinhaAtendimento[] {
  const fonte: FonteAtendido = e.faturado ? 'nota' : e.recebimentos.some((r) => r.qtd_recebida > 0) ? 'estoque' : 'pendente'
  const skus = new Set<string>([...e.itens.map((i) => i.sku), ...(e.faturado ?? []).map((f) => f.sku)])
  return [...skus].map((sku) => {
    const it = e.itens.find((i) => i.sku === sku)
    const solicitado = it?.qtd_solicitada ?? 0
    const aprovado = it ? it.qtd_aprovada ?? it.qtd_solicitada : 0
    const planejado = soma(e.plano.filter((l) => l.sku === sku && l.atendimento !== 'nao'), (l) => l.qtd_planejada ?? 0)
    const recebido = soma(e.recebimentos.filter((r) => r.sku === sku), (r) => r.qtd_recebida)
    const fat = (e.faturado ?? []).filter((f) => f.sku === sku)
    const faturado = soma(fat, (f) => f.qtd)
    const atendido = fonte === 'nota' ? faturado : fonte === 'estoque' ? recebido : 0
    const preco = it?.preco_eur ?? fat[0]?.preco_eur ?? e.precoCadastro?.(sku) ?? 0
    const situacao: SituacaoLinha = fonte === 'pendente' ? 'pendente'
      : solicitado === 0 ? 'incluido'
      // Antes da invoice, o que falta ainda pode chegar: não é falha de atendimento.
      : fonte === 'estoque' && atendido < solicitado ? 'andamento'
      : atendido === 0 ? 'nao_atendido'
      : atendido < solicitado ? 'parcial'
      : atendido > solicitado ? 'excedente' : 'total'
    return {
      sku, solicitado, aprovado, planejado, recebido, faturado, atendido, fonte, preco,
      valorSolicitado: solicitado * preco, valorAtendido: atendido * preco,
      pct: solicitado > 0 ? atendido / solicitado : null, diferenca: atendido - solicitado, situacao,
    }
  }).sort((a, b) => (a.pct ?? 9) - (b.pct ?? 9) || b.valorSolicitado - a.valorSolicitado)
}

export function resumirAtendimento(linhas: LinhaAtendimento[]): ResumoAtendimento {
  const pedidas = linhas.filter((l) => l.solicitado > 0)
  const fonte = linhas[0]?.fonte ?? 'pendente'
  const volumeSolicitado = soma(pedidas, (l) => l.solicitado)
  const valorSolicitado = soma(pedidas, (l) => l.valorSolicitado)
  const pend = fonte === 'pendente'
  return {
    fonte,
    skusSolicitados: pedidas.length,
    skusAtendidosTotal: pedidas.filter((l) => l.atendido >= l.solicitado).length,
    skusParciais: pedidas.filter((l) => l.situacao === 'parcial').length,
    skusNaoAtendidos: pedidas.filter((l) => l.situacao === 'nao_atendido').length,
    skusIncluidos: linhas.filter((l) => l.situacao === 'incluido').length,
    volumeSolicitado, volumeAtendido: soma(linhas, (l) => l.atendido),
    valorSolicitado, valorAtendido: soma(linhas, (l) => l.valorAtendido),
    fillRateVolume: pend || volumeSolicitado === 0 ? null : soma(pedidas, (l) => Math.min(l.atendido, l.solicitado)) / volumeSolicitado,
    fillRateSku: pend || pedidas.length === 0 ? null : pedidas.filter((l) => l.atendido >= l.solicitado).length / pedidas.length,
    fillRateValor: pend || valorSolicitado === 0 ? null : soma(pedidas, (l) => Math.min(l.atendido, l.solicitado) * l.preco) / valorSolicitado,
  }
}

/** Consolida vários resumos ponderando por volume/valor (não é média simples de percentuais). */
export function consolidar(resumos: ResumoAtendimento[]): ResumoAtendimento {
  const r = resumos.filter((x) => x.fonte !== 'pendente')
  const s = (f: (x: ResumoAtendimento) => number) => soma(r, f)
  const volS = s((x) => x.volumeSolicitado), valS = s((x) => x.valorSolicitado), skuS = s((x) => x.skusSolicitados)
  return {
    fonte: r.some((x) => x.fonte === 'estoque') ? 'estoque' : r.length ? 'nota' : 'pendente',
    skusSolicitados: skuS, skusAtendidosTotal: s((x) => x.skusAtendidosTotal), skusParciais: s((x) => x.skusParciais), skusNaoAtendidos: s((x) => x.skusNaoAtendidos), skusIncluidos: s((x) => x.skusIncluidos),
    volumeSolicitado: volS, volumeAtendido: s((x) => x.volumeAtendido), valorSolicitado: valS, valorAtendido: s((x) => x.valorAtendido),
    fillRateVolume: volS ? s((x) => (x.fillRateVolume ?? 0) * x.volumeSolicitado) / volS : null,
    fillRateSku: skuS ? s((x) => x.skusAtendidosTotal) / skuS : null,
    fillRateValor: valS ? s((x) => (x.fillRateValor ?? 0) * x.valorSolicitado) / valS : null,
  }
}
