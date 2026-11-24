// Itens sazonais (Páscoa e Natal) só podem ser pedidos durante uma campanha aberta.
// Campanha = janela de pedidos (quando a França pode pedir) + janela de embarque
// (datas de embarque aceitas para os itens sazonais).

import type { DataLocal } from './calendario'

export type Sazonalidade = 'pascoa' | 'natal'
export const SAZONALIDADES: Record<Sazonalidade, { nome: string; nomeFr: string; cor: string }> = {
  pascoa: { nome: 'Páscoa', nomeFr: 'Pâques', cor: 'bg-[#e9f3ff] text-[#1d5fa8]' },
  natal: { nome: 'Natal', nomeFr: 'Noël', cor: 'bg-[#fdecea] text-[#b3261e]' },
}
export const LISTA_SAZONALIDADES = Object.keys(SAZONALIDADES) as Sazonalidade[]

export type Campanha = {
  id: string
  sazonalidade: Sazonalidade
  nome: string
  pedidos_de: DataLocal
  pedidos_ate: DataLocal
  embarque_de: DataLocal | null
  embarque_ate: DataLocal | null
  observacao: string | null
}

export type SituacaoCampanha = 'agendada' | 'aberta' | 'encerrada'
export function situacaoCampanha(c: Campanha, hoje: DataLocal): SituacaoCampanha {
  if (hoje < c.pedidos_de) return 'agendada'
  if (hoje > c.pedidos_ate) return 'encerrada'
  return 'aberta'
}

export const embarqueNaJanela = (c: Campanha, embarque: DataLocal | null) =>
  !embarque || ((!c.embarque_de || embarque >= c.embarque_de) && (!c.embarque_ate || embarque <= c.embarque_ate))

export type Liberacao =
  | { liberado: true; campanha: Campanha }
  | { liberado: false; motivo: 'sem_campanha' }
  | { liberado: false; motivo: 'fora_embarque'; campanhas: Campanha[] }

/**
 * Item comum → null (sempre liberado).
 * Item sazonal → liberado se há campanha aberta da subcategoria cuja janela de embarque aceita a data do pedido.
 */
export function liberacaoSazonal(saz: Sazonalidade | null | undefined, campanhas: Campanha[], hoje: DataLocal, embarque: DataLocal | null): Liberacao | null {
  if (!saz) return null
  const abertas = campanhas.filter((c) => c.sazonalidade === saz && situacaoCampanha(c, hoje) === 'aberta')
  if (!abertas.length) return { liberado: false, motivo: 'sem_campanha' }
  const ok = abertas.find((c) => embarqueNaJanela(c, embarque))
  return ok ? { liberado: true, campanha: ok } : { liberado: false, motivo: 'fora_embarque', campanhas: abertas }
}

export function campanhasAbertas(campanhas: Campanha[], hoje: DataLocal) {
  return campanhas.filter((c) => situacaoCampanha(c, hoje) === 'aberta').sort((a, b) => a.pedidos_ate.localeCompare(b.pedidos_ate))
}

/** Validação do formulário de campanha. */
export function validarCampanha(c: Partial<Campanha>): string[] {
  const e: string[] = []
  if (!c.sazonalidade) e.push('Escolha a subcategoria (Páscoa ou Natal).')
  if (!c.nome?.trim()) e.push('Dê um nome à campanha (ex.: Páscoa 2027).')
  if (!c.pedidos_de || !c.pedidos_ate) e.push('Informe o período de pedidos.')
  else if (c.pedidos_ate < c.pedidos_de) e.push('O fim dos pedidos é antes do início.')
  if (c.embarque_de && c.embarque_ate && c.embarque_ate < c.embarque_de) e.push('O fim dos embarques é antes do início.')
  if (c.embarque_ate && c.pedidos_de && c.embarque_ate < c.pedidos_de) e.push('A janela de embarque termina antes de abrir os pedidos.')
  return e
}
