import { expect, it } from 'vitest'
import { arredondarParaCaixas } from './caixas'
it('arredonda para cima em múltiplos de caixa', () => {
  expect(arredondarParaCaixas(100, 18)).toEqual({ qtd: 108, caixas: 6 })
  expect(arredondarParaCaixas(108, 18)).toEqual({ qtd: 108, caixas: 6 })
  expect(arredondarParaCaixas(0, 18)).toEqual({ qtd: 0, caixas: 0 })
  expect(arredondarParaCaixas(7, 0)).toEqual({ qtd: 7, caixas: 7 })
})
