import { expect, it } from 'vitest'
import { calcularCiclo, etapaDoStatus } from './ciclo'

it('mapeia status para etapa do cliente', () => {
  expect(etapaDoStatus('aguardando_fr')).toBe('analise')
  expect(etapaDoStatus('em_recebimento')).toBe('producao')
  expect(etapaDoStatus('cancelado')).toBeNull()
})

it('soma o tempo em cada etapa, inclusive idas e voltas', () => {
  const c = calcularCiclo([
    { para_status: 'enviado', criado_em: '2026-11-01T10:00:00Z' },
    { para_status: 'em_validacao_supply', criado_em: '2026-11-02T10:00:00Z' },
    { para_status: 'aprovado', criado_em: '2026-11-04T10:00:00Z' },
    { para_status: 'em_validacao_supply', criado_em: '2026-11-05T10:00:00Z' }, // Admin reabriu
    { para_status: 'aprovado', criado_em: '2026-11-06T10:00:00Z' },
  ], '2026-11-01T10:00:00Z', '2027-01-18', new Date('2026-11-08T10:00:00Z'))
  expect(c.etapaAtual).toBe('confirmado')
  expect(c.dias.pedido).toBeCloseTo(1)
  expect(c.dias.analise).toBeCloseTo(3)
  expect(c.dias.confirmado).toBeCloseTo(3)
  expect(c.entrada.confirmado).toBe('2026-11-04T10:00:00Z')
  expect(c.diasNoCiclo).toBeCloseTo(7)
})
