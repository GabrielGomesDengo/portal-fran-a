import { expect, it } from 'vitest'
import { regrasDoModal } from './modal'
import { dataMaximaProducao } from './contractDate'

it('marítimo: 4 semanas de transit, estoque 12 dias antes, pallet 1,70, sem master box, pallet 21 kg', () => {
  const r = regrasDoModal({ transit_dias_maritimo: '28', antecedencia_estoque_dias_maritimo: '12', tara_master_box_kg_maritimo: '0', tara_pallet_kg_maritimo: '21' }, 'maritimo')
  expect(r.transitDias).toBe(28); expect(r.antecedenciaEstoqueDias).toBe(12); expect(r.taraMasterBoxKg).toBe(0); expect(r.taraPalletKg).toBe(21)
  expect(r.dimensoesPallet).toBe('1,00 X 1,20 X 1,70')
  expect(dataMaximaProducao('2027-03-01', r.leadEstoqueDias, r.antecedenciaEstoqueDias)).toBe('2027-02-16')
})
it('aéreo mantém as premissas atuais', () => {
  const r = regrasDoModal({}, 'aereo')
  expect([r.transitDias, r.antecedenciaEstoqueDias, r.taraMasterBoxKg, r.taraPalletKg]).toEqual([3, 7, 21, 15])
})
