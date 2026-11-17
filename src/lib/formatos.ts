import { localeAtual } from '../i18n/idioma'
import type { DataLocal } from '../dominio/calendario'

export function fmtData(d: DataLocal | null | undefined): string {
  if (!d) return ''
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}
export function fmtEur(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return new Intl.NumberFormat(localeAtual(), { style: 'currency', currency: 'EUR' }).format(v)
}
export function fmtNum(v: number | null | undefined, casas = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return new Intl.NumberFormat(localeAtual(), { maximumFractionDigits: casas }).format(v)
}
export function hoje(): DataLocal {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** Data e hora curtas no idioma atual. */
export function fmtDataHora(iso: string, comHora = true): string {
  return comHora
    ? new Date(iso).toLocaleString(localeAtual(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(localeAtual(), { day: '2-digit', month: 'short', year: 'numeric' })
}
