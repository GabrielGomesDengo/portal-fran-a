export type Perfil = 'franca' | 'supply' | 'pcp' | 'operacoes' | 'admin'

export type StatusPedido =
  | 'rascunho' | 'enviado' | 'em_validacao_supply' | 'ajustado_supply' | 'recusado_supply'
  | 'aguardando_fr' | 'aprovado' | 'cancelado' | 'em_planejamento_pcp' | 'plano_concluido'
  | 'em_recebimento' | 'packing_list' | 'invoice_gerada' | 'concluido'

export const ROTULO_STATUS: Record<StatusPedido, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  em_validacao_supply: 'Em validação (Supply)',
  ajustado_supply: 'Ajustado por Supply',
  recusado_supply: 'Recusado por Supply',
  aguardando_fr: 'Aguardando França',
  aprovado: 'Aprovado',
  cancelado: 'Cancelado',
  em_planejamento_pcp: 'Em planejamento (PCP)',
  plano_concluido: 'Plano concluído',
  em_recebimento: 'Em recebimento',
  packing_list: 'Packing list',
  invoice_gerada: 'Invoice gerada',
  concluido: 'Concluído',
}

export const ROTULO_PERFIL: Record<Perfil, string> = {
  franca: 'França', supply: 'Supply', pcp: 'PCP', operacoes: 'Operações', admin: 'Admin',
}

export type Produto = {
  sku: string
  descricao_br: string
  descricao_en: string | null
  descricao_fr: string | null
  familia: string | null
  categoria: string | null
  unidade: string
  multiplo_caixa: number | null
  shelf_life_dias: number | null
  shelf_life_dias_franca: number | null
  preco_interco_eur: number | null
  cogs_eur: number | null
  peso_liq_un_kg: number | null
  peso_bruto_caixa_kg: number | null
  hs_code: string | null
  ativo: boolean
  qtd_10_meses: number | null
  num_embarques_10_meses: number | null
  ultimo_embarque: string | null
}

export type Pedido = {
  id: string
  numero: string
  po_franca: string | null
  criado_por: string
  data_embarque: string
  transit_dias: number
  data_chegada_fr: string
  contract_versao: number
  modal: 'aereo' | 'maritimo'
  antecedencia_dias: number | null
  fora_prazo: boolean
  justificativa_prazo: string | null
  status: StatusPedido
  observacao: string | null
  criado_em: string
  atualizado_em: string
}

export type PedidoItem = {
  id: string
  pedido_id: string
  sku: string
  qtd_solicitada: number
  qtd_aprovada: number | null
  caixas_solicitadas: number | null
  preco_eur: number | null
  observacao: string | null
}

export type PerfilUsuario = { user_id: string; nome: string; email: string; perfil: Perfil; ativo: boolean }
