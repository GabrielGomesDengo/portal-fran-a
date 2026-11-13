// =============================================================
// Indicador do ciclo do pedido: etapas, tempo em cada uma, atraso.
// Função pura: recebe os eventos de status e devolve o ciclo.
// =============================================================
import type { StatusPedido } from '../tipos/dominio'

export type EtapaCiclo = 'pedido' | 'analise' | 'confirmado' | 'producao' | 'expedicao' | 'embarcado'

/** Etapas do ponto de vista do cliente (rastreio da França) — também usadas no indicador interno. */
export const ETAPAS: { chave: EtapaCiclo; rotulo: string; descricao: string; status: StatusPedido[] }[] = [
  { chave: 'pedido', rotulo: 'Pedido enviado', descricao: 'Recebemos o seu pedido.', status: ['rascunho', 'enviado'] },
  { chave: 'analise', rotulo: 'Em análise', descricao: 'O time de Supply está validando quantidades e datas.', status: ['em_validacao_supply', 'ajustado_supply', 'aguardando_fr', 'recusado_supply'] },
  { chave: 'confirmado', rotulo: 'Confirmado', descricao: 'Pedido aprovado. O PCP está montando o plano de produção.', status: ['aprovado', 'em_planejamento_pcp'] },
  { chave: 'producao', rotulo: 'Em produção', descricao: 'Os produtos estão sendo produzidos e chegando ao estoque.', status: ['plano_concluido', 'em_recebimento'] },
  { chave: 'expedicao', rotulo: 'Preparando embarque', descricao: 'Pallets montados, packing list e invoice em emissão.', status: ['packing_list', 'invoice_gerada'] },
  { chave: 'embarcado', rotulo: 'Embarcado', descricao: 'Documentos emitidos e carga liberada para embarque.', status: ['concluido'] },
]

export function etapaDoStatus(s: StatusPedido): EtapaCiclo | null {
  return ETAPAS.find((e) => e.status.includes(s))?.chave ?? null
}

export type EventoCiclo = { para_status: StatusPedido; criado_em: string }

export type Ciclo = {
  etapaAtual: EtapaCiclo | null
  cancelado: boolean
  /** data/hora em que entrou pela primeira vez em cada etapa */
  entrada: Partial<Record<EtapaCiclo, string>>
  /** dias corridos em cada etapa (soma dos períodos) */
  dias: Partial<Record<EtapaCiclo, number>>
  diasNoCiclo: number
  diasAteEmbarque: number
}

const DIA = 86_400_000

export function calcularCiclo(eventos: EventoCiclo[], criadoEm: string, dataEmbarque: string, agora: Date = new Date()): Ciclo {
  const ord = [...eventos].sort((a, b) => a.criado_em.localeCompare(b.criado_em))
  const entrada: Ciclo['entrada'] = {}; const dias: Ciclo['dias'] = {}
  let atual: EtapaCiclo | null = null; let desde = new Date(criadoEm).getTime(); let cancelado = false
  for (const e of ord) {
    if (e.para_status === 'cancelado') { cancelado = true; if (atual) dias[atual] = (dias[atual] ?? 0) + (new Date(e.criado_em).getTime() - desde) / DIA; atual = null; continue }
    const et = etapaDoStatus(e.para_status); if (!et || et === atual) continue
    const t = new Date(e.criado_em).getTime()
    if (atual) dias[atual] = (dias[atual] ?? 0) + (t - desde) / DIA
    entrada[et] ??= e.criado_em
    atual = et; desde = t
  }
  if (atual && atual !== 'embarcado') dias[atual] = (dias[atual] ?? 0) + (agora.getTime() - desde) / DIA
  if (!entrada.pedido) entrada.pedido = criadoEm
  const embarque = new Date(`${dataEmbarque}T12:00:00`).getTime()
  return {
    etapaAtual: atual, cancelado, entrada, dias,
    diasNoCiclo: (agora.getTime() - new Date(criadoEm).getTime()) / DIA,
    diasAteEmbarque: Math.ceil((embarque - agora.getTime()) / DIA),
  }
}
