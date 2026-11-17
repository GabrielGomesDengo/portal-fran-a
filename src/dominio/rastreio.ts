// =============================================================
// Rastreio detalhado para a França: 9 marcos + histórico de atualizações.
// Montado a partir dos eventos de status, do plano do PCP, dos lotes que
// chegaram ao estoque e dos documentos. Função pura.
// =============================================================
import type { StatusPedido } from '../tipos/dominio'
import { t, tp } from '../i18n/idioma'

export type EstadoMarco = 'feito' | 'atual' | 'futuro'
export type Marco = { chave: string; rotulo: string; data: string | null; previsto?: boolean; detalhe?: string; estado: EstadoMarco }
export type Atualizacao = { data: string; titulo: string; detalhe?: string; tipo: 'status' | 'producao' | 'estoque' | 'documento' | 'alerta' | 'previsao' }

export type EntradaRastreio = {
  criadoEm: string
  dataEmbarque: string
  dataChegada: string
  foraPrazo: boolean
  antecedenciaDias: number | null
  status: StatusPedido
  hoje: string                                                        // yyyy-MM-dd
  eventos: { para_status: StatusPedido; motivo: string | null; criado_em: string }[]
  plano: { sku: string; atendimento: string | null; qtd_planejada: number | null; data_producao: string | null }[]
  recebimentos: { sku: string; lote: string | null; qtd_recebida: number; data_recebimento: string }[]
  nome: (sku: string) => string
  pallets: number | null
  pesoBrutoKg: number | null
  invoiceNumero: string | null
}

const ORDEM: StatusPedido[] = ['rascunho', 'enviado', 'em_validacao_supply', 'ajustado_supply', 'recusado_supply', 'aguardando_fr', 'aprovado', 'em_planejamento_pcp', 'plano_concluido', 'em_recebimento', 'packing_list', 'invoice_gerada', 'concluido']
const nivel = (s: StatusPedido) => ORDEM.indexOf(s)
const dt = (iso: string) => iso.slice(0, 10)

export function montarRastreio(e: EntradaRastreio): { marcos: Marco[]; atualizacoes: Atualizacao[]; resumoAtual: string } {
  const ev = [...e.eventos].sort((a, b) => a.criado_em.localeCompare(b.criado_em))
  const primeiro = (s: StatusPedido | ((x: (typeof ev)[number]) => boolean)) => ev.find(typeof s === 'string' ? (x) => x.para_status === s : s)?.criado_em ?? null
  const n = nivel(e.status)
  const cancelado = e.status === 'cancelado'

  const prod = e.plano.filter((l) => l.atendimento !== 'nao' && l.data_producao)
  const datasProd = prod.map((l) => l.data_producao!).sort()
  const planejado = e.plano.filter((l) => l.atendimento !== 'nao').reduce((s, l) => s + (l.qtd_planejada ?? 0), 0)
  const rec = e.recebimentos.filter((r) => r.qtd_recebida > 0)
  const recebido = rec.reduce((s, r) => s + r.qtd_recebida, 0)
  const skusPlano = new Set(e.plano.filter((l) => l.atendimento !== 'nao').map((l) => l.sku))
  const skusNoEstoque = new Set(rec.map((r) => r.sku))
  const primeiraRec = rec.map((r) => r.data_recebimento).sort()[0] ?? null
  const inicioProducao = datasProd.find((d) => d <= e.hoje) ?? (primeiraRec ?? null)

  const marcos: Omit<Marco, 'estado'>[] = [
    { chave: 'enviado', rotulo: t('Pedido enviado'), data: e.criadoEm, detalhe: e.foraPrazo ? t('Colocado com {n} dias de antecedência', { n: e.antecedenciaDias ?? 0 }) : undefined },
    { chave: 'analise', rotulo: t('Em análise pelo Supply'), data: primeiro('em_validacao_supply') },
    { chave: 'confirmado', rotulo: t('Pedido confirmado'), data: primeiro('aprovado') },
    { chave: 'planejado', rotulo: t('Produção planejada'), data: primeiro('plano_concluido'),
      detalhe: datasProd.length ? t('Produção entre {a} e {b}', { a: fmt(datasProd[0]), b: fmt(datasProd[datasProd.length - 1]) }) : undefined },
    { chave: 'producao', rotulo: t('Em produção'), data: n >= nivel('plano_concluido') ? inicioProducao : null,
      detalhe: planejado > 0 && n >= nivel('plano_concluido') ? t('{a} de {b} no estoque · {p}% do volume', { a: tp(skusNoEstoque.size, '{n} produto', '{n} produtos'), b: skusPlano.size, p: Math.round(Math.min(1, recebido / planejado) * 100) }) : undefined },
    { chave: 'concluida', rotulo: t('Produção concluída'), data: primeiro((x) => x.para_status === 'packing_list') },
    { chave: 'documentos', rotulo: t('Pallets e documentos'), data: primeiro('invoice_gerada') ?? primeiro((x) => x.para_status === 'packing_list' && (x.motivo ?? '').startsWith('Packing list')),
      detalhe: [e.pallets ? tp(e.pallets, '{n} pallet', '{n} pallets') : null, e.pesoBrutoKg ? t('{n} kg brutos', { n: Math.round(e.pesoBrutoKg) }) : null, e.invoiceNumero ? `invoice ${e.invoiceNumero}` : null].filter(Boolean).join(' · ') || undefined },
    { chave: 'embarcado', rotulo: t('Liberado para embarque'), data: primeiro('concluido') ?? e.dataEmbarque, previsto: !primeiro('concluido') },
    { chave: 'chegada', rotulo: t('Chegada na França'), data: e.dataChegada, previsto: !(e.status === 'concluido' && e.dataChegada <= e.hoje) },
  ]
  // Etapa atual = primeira não concluída
  const concluido: Record<string, boolean> = {
    enviado: true,
    analise: n >= nivel('aprovado'),
    confirmado: n >= nivel('em_planejamento_pcp'),
    planejado: n >= nivel('em_recebimento') || (n >= nivel('plano_concluido') && !!inicioProducao),
    producao: n >= nivel('packing_list'),
    concluida: n >= nivel('packing_list'),
    documentos: n >= nivel('concluido'),
    embarcado: n >= nivel('concluido'),
    chegada: e.status === 'concluido' && e.dataChegada <= e.hoje,
  }
  let achouAtual = false
  const comEstado: Marco[] = marcos.map((m) => {
    if (cancelado) return { ...m, estado: m.chave === 'enviado' ? 'feito' : 'futuro' }
    if (concluido[m.chave]) return { ...m, estado: 'feito' }
    if (!achouAtual) { achouAtual = true; return { ...m, estado: 'atual' } }
    return { ...m, estado: 'futuro' }
  })

  // ---------- Histórico de atualizações ----------
  const at: Atualizacao[] = []
  let anterior: StatusPedido | null = null
  let planoDefinido = false
  const jaTem = { pallets: false, invoice: false }
  for (const x of ev) {
    const m = x.motivo ?? ''
    switch (x.para_status) {
      case 'enviado': at.push({ data: x.criado_em, tipo: 'status', titulo: t('Pedido enviado à Dengo Brasil'), detalhe: e.foraPrazo ? t('Fora do prazo recomendado ({n} dias de antecedência); segue para aprovação especial.', { n: e.antecedenciaDias ?? 0 }) : undefined }); break
      case 'em_validacao_supply': at.push({ data: x.criado_em, tipo: 'status', titulo: anterior && nivel(anterior) >= nivel('aprovado') ? t('Pedido reaberto para revisão do Supply') : t('Supply iniciou a análise do pedido'), detalhe: m || undefined }); break
      case 'aguardando_fr': at.push({ data: x.criado_em, tipo: 'alerta', titulo: t('Supply ajustou o pedido: aguardando a sua resposta'), detalhe: m || undefined }); break
      case 'recusado_supply': at.push({ data: x.criado_em, tipo: 'alerta', titulo: t('Pedido recusado pelo Supply'), detalhe: m || undefined }); break
      case 'aprovado': at.push({ data: x.criado_em, tipo: 'status', titulo: anterior === 'aguardando_fr' ? t('Você aceitou os ajustes: pedido confirmado') : t('Pedido confirmado pelo Supply') }); break
      case 'em_planejamento_pcp': at.push({ data: x.criado_em, tipo: 'producao', titulo: t('Planejamento da produção iniciado') }); break
      case 'plano_concluido':
        if (!planoDefinido && x.para_status !== anterior) { planoDefinido = true; at.push({ data: x.criado_em, tipo: 'producao', titulo: t('Plano de produção definido'), detalhe: datasProd.length ? t('{q} programado(s) entre {a} e {b}.', { q: tp(new Set(prod.map((l) => l.sku)).size, '{n} produto', '{n} produtos'), a: fmt(datasProd[0]), b: fmt(datasProd[datasProd.length - 1]) }) : undefined }) }
        else if (m.startsWith('Plano de produção atualizado')) at.push({ data: x.criado_em, tipo: 'producao', titulo: t('Plano de produção atualizado pelo PCP') })
        break
      case 'em_recebimento': if (anterior !== 'em_recebimento') at.push({ data: x.criado_em, tipo: 'estoque', titulo: t('Produtos começaram a chegar ao estoque') }); break
      case 'packing_list':
        if (m === 'Recebimento concluído') at.push({ data: x.criado_em, tipo: 'estoque', titulo: t('Produção concluída: todos os lotes conferidos no estoque') })
        else if (m.startsWith('Packing list') && !jaTem.pallets) { jaTem.pallets = true; at.push({ data: x.criado_em, tipo: 'documento', titulo: t('Montagem dos pallets iniciada') }) }
        break
      case 'invoice_gerada':
        if (m.startsWith('Invoice')) { if (!jaTem.invoice) { jaTem.invoice = true; at.push({ data: x.criado_em, tipo: 'documento', titulo: t('Invoice comercial {n} emitida', { n: e.invoiceNumero ?? '' }).replace('  ', ' ') }) } }
        else at.push({ data: x.criado_em, tipo: 'documento', titulo: t('Packing list concluído'), detalhe: [e.pallets ? tp(e.pallets, '{n} pallet', '{n} pallets') : null, e.pesoBrutoKg ? t('{n} kg brutos', { n: Math.round(e.pesoBrutoKg) }) : null].filter(Boolean).join(' · ') || undefined })
        break
      case 'concluido': at.push({ data: x.criado_em, tipo: 'status', titulo: t('Documentos emitidos: carga liberada para embarque') }); break
      case 'cancelado': at.push({ data: x.criado_em, tipo: 'alerta', titulo: t('Pedido cancelado'), detalhe: m || undefined }); break
    }
    anterior = x.para_status
  }
  // Lotes que chegaram ao estoque, agrupados por dia
  const porDia = new Map<string, typeof rec>()
  for (const r of rec) { const l = porDia.get(r.data_recebimento) ?? []; l.push(r); porDia.set(r.data_recebimento, l) }
  for (const [dia, rs] of porDia) {
    const nomes = [...new Set(rs.map((r) => e.nome(r.sku)))]
    at.push({ data: `${dia}T12:00:00`, tipo: 'estoque', titulo: tp(rs.length, '{n} lote no estoque', '{n} lotes no estoque'), detalhe: nomes.slice(0, 3).join(', ') + (nomes.length > 3 ? ` ${t('e mais {n}', { n: nomes.length - 3 })}` : '') })
  }
  // Produção programada (futuro) e previsões
  if (!cancelado && n < nivel('packing_list')) {
    const futuras = [...new Set(datasProd.filter((d) => d > e.hoje))]
    for (const d of futuras.slice(0, 4)) {
      const nomes = [...new Set(prod.filter((l) => l.data_producao === d).map((l) => e.nome(l.sku)))]
      at.push({ data: `${d}T08:00:00`, tipo: 'previsao', titulo: t('Produção programada'), detalhe: nomes.slice(0, 3).join(', ') + (nomes.length > 3 ? ` ${t('e mais {n}', { n: nomes.length - 3 })}` : '') })
    }
  }
  if (!cancelado && n < nivel('concluido')) at.push({ data: `${e.dataEmbarque}T09:00:00`, tipo: 'previsao', titulo: t('Embarque previsto') })
  if (!cancelado) at.push({ data: `${e.dataChegada}T09:00:00`, tipo: 'previsao', titulo: e.status === 'concluido' && e.dataChegada <= e.hoje ? t('Chegada na França') : t('Chegada prevista na França') })
  at.sort((a, b) => b.data.localeCompare(a.data))

  const atual = comEstado.find((m) => m.estado === 'atual')
  const resumoAtual = cancelado ? t('Pedido cancelado') : atual ? `${atual.rotulo}${atual.detalhe ? ` · ${atual.detalhe}` : ''}` : t('Chegou na França')
  return { marcos: comEstado, atualizacoes: at, resumoAtual }
}

function fmt(d: string) { const [, m, dia] = dt(d).split('-'); return `${dia}/${m}` }
