import type { DataLocal } from '../dominio/calendario'

export function fmtData(d: DataLocal | null | undefined): string {
  if (!d) return ''
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}
export function fmtEur(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR' }).format(v)
}
export function fmtNum(v: number | null | undefined, casas = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas }).format(v)
}
export function hoje(): DataLocal {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
