/** Arredonda a quantidade para múltiplos de caixa (sempre para cima; mínimo 1 caixa se > 0). */
export function arredondarParaCaixas(qtd: number, multiploCaixa: number): { qtd: number; caixas: number } {
  if (!multiploCaixa || multiploCaixa <= 0) return { qtd, caixas: qtd }
  if (qtd <= 0) return { qtd: 0, caixas: 0 }
  const caixas = Math.ceil(qtd / multiploCaixa)
  return { qtd: caixas * multiploCaixa, caixas }
}
