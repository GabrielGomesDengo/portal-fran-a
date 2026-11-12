// Pesos do packing list, espelhando as fórmulas da planilha atual.
import type { Produto } from '../tipos/dominio'

export type LinhaPeso = { qtd: number; caixas: number; unidade: string; pesoLiqUnKg: number | null; pesoBrutoCaixaKg: number | null }

/** Peso líquido da linha: unidades × peso/un; para Kg a própria quantidade. */
export function pesoLiquidoLinha(l: LinhaPeso): number {
  if (l.unidade.toLowerCase() === 'kg') return l.qtd
  return (l.pesoLiqUnKg ?? 0) * l.qtd
}
/** Peso bruto da linha: peso bruto da caixa de transporte × caixas. */
export function pesoBrutoLinha(l: LinhaPeso): number {
  return (l.pesoBrutoCaixaKg ?? 0) * l.caixas
}
export function totaisPallet(linhas: LinhaPeso[], taraMasterBox: number, taraPallet: number) {
  const liquido = linhas.reduce((s, l) => s + pesoLiquidoLinha(l), 0)
  const brutoLinhas = linhas.reduce((s, l) => s + pesoBrutoLinha(l), 0)
  return { liquido, brutoLinhas, bruto: brutoLinhas + taraMasterBox + taraPallet, caixas: linhas.reduce((s, l) => s + l.caixas, 0) }
}
export function linhaPesoDe(p: Produto | undefined, qtd: number, caixas: number): LinhaPeso {
  return { qtd, caixas, unidade: p?.unidade ?? 'Unit', pesoLiqUnKg: p?.peso_liq_un_kg ?? null, pesoBrutoCaixaKg: p?.peso_bruto_caixa_kg ?? null }
}
