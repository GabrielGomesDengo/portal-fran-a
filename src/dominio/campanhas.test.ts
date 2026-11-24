import { describe, expect, it } from 'vitest'
import { campanhasAbertas, liberacaoSazonal, situacaoCampanha, validarCampanha, type Campanha } from './campanhas'

const pascoa: Campanha = { id: 'p', sazonalidade: 'pascoa', nome: 'Páscoa 2027', pedidos_de: '2026-11-01', pedidos_ate: '2027-01-15', embarque_de: '2027-02-01', embarque_ate: '2027-03-15', observacao: null }
const natal: Campanha = { id: 'n', sazonalidade: 'natal', nome: 'Natal 2026', pedidos_de: '2026-07-01', pedidos_ate: '2026-10-15', embarque_de: null, embarque_ate: '2026-11-30', observacao: null }

describe('campanhas sazonais', () => {
  it('situação pela janela de pedidos', () => {
    expect(situacaoCampanha(pascoa, '2026-10-31')).toBe('agendada')
    expect(situacaoCampanha(pascoa, '2026-11-01')).toBe('aberta')
    expect(situacaoCampanha(pascoa, '2027-01-15')).toBe('aberta')
    expect(situacaoCampanha(pascoa, '2027-01-16')).toBe('encerrada')
    expect(campanhasAbertas([pascoa, natal], '2026-11-24').map((c) => c.id)).toEqual(['p'])
  })
  it('item comum é sempre liberado', () => {
    expect(liberacaoSazonal(null, [], '2026-11-24', '2027-02-01')).toBeNull()
  })
  it('item sazonal só com campanha aberta e embarque na janela', () => {
    expect(liberacaoSazonal('pascoa', [pascoa, natal], '2026-11-24', '2027-02-08')).toMatchObject({ liberado: true, campanha: { id: 'p' } })
    expect(liberacaoSazonal('pascoa', [pascoa], '2026-11-24', '2027-01-20')).toMatchObject({ liberado: false, motivo: 'fora_embarque' })
    expect(liberacaoSazonal('natal', [pascoa, natal], '2026-11-24', '2026-11-30')).toEqual({ liberado: false, motivo: 'sem_campanha' })
    expect(liberacaoSazonal('pascoa', [pascoa], '2027-01-16', '2027-02-08')).toEqual({ liberado: false, motivo: 'sem_campanha' })
  })
  it('janela de embarque aberta nas pontas', () => {
    expect(liberacaoSazonal('natal', [natal], '2026-08-01', '2026-08-03')).toMatchObject({ liberado: true })
    expect(liberacaoSazonal('natal', [natal], '2026-08-01', '2026-12-07')).toMatchObject({ liberado: false, motivo: 'fora_embarque' })
  })
  it('valida o formulário', () => {
    expect(validarCampanha(pascoa)).toEqual([])
    expect(validarCampanha({ ...pascoa, pedidos_ate: '2026-10-01' })).toContain('O fim dos pedidos é antes do início.')
    expect(validarCampanha({ nome: '' })).toHaveLength(3)
  })
})
