// =============================================================
// Aritmética de datas de negócio. ZERO dependências: este módulo é
// compartilhado com a Edge Function (Deno) sem bundler.
//
// Datas circulam como 'yyyy-MM-dd' (DataLocal), o mesmo formato do tipo
// `date` do Postgres. Nunca como Date. A única conversão instante -> data
// civil está em dataLocalDe(), com fuso explícito via Intl.
// =============================================================

export const FUSO = 'America/Sao_Paulo'

/** Data de negócio no formato 'yyyy-MM-dd'. */
export type DataLocal = string

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/

const fmtSP = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
})

/** Converte um instante (Date) para a data civil em America/Sao_Paulo. */
export function dataLocalDe(instante: Date): DataLocal {
  // en-CA formata como YYYY-MM-DD.
  return fmtSP.format(instante)
}

export function ehDataLocal(valor: unknown): valor is DataLocal {
  if (typeof valor !== 'string') return false
  const m = RE_DATA.exec(valor)
  if (!m) return false
  const [, a, me, d] = m.map(Number)
  return me >= 1 && me <= 12 && d >= 1 && d <= diasNoMes(a, me)
}

export function partes(data: DataLocal): { ano: number; mes: number; dia: number } {
  const m = RE_DATA.exec(data)
  if (!m) throw new Error(`Data inválida: ${data}`)
  return { ano: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) }
}

export function montar(ano: number, mes: number, dia: number): DataLocal {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** Quantidade de dias no mês (mes = 1..12). Sem Date local: usa UTC puro. */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/** Dia 1 do mês da data. É o formato de `competencia` no banco. */
export function primeiroDiaDoMes(data: DataLocal): DataLocal {
  const { ano, mes } = partes(data)
  return montar(ano, mes, 1)
}

/** Soma meses a um ano/mês. Ex.: (2026, 11) + 2 -> (2027, 1) */
export function somarMeses(ano: number, mes: number, delta: number): { ano: number; mes: number } {
  const total = ano * 12 + (mes - 1) + delta
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 }
}

/** Aplica um dia do mês, encolhendo para o último dia quando não existe (31/fev -> 28). */
export function diaNoMes(ano: number, mes: number, dia: number): DataLocal {
  return montar(ano, mes, Math.min(dia, diasNoMes(ano, mes)))
}

/** Comparação lexicográfica funciona porque o formato é ISO com zero à esquerda. */
export function compararDatas(a: DataLocal, b: DataLocal): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Diferença b - a em dias (inteiro). */
export function diasEntre(a: DataLocal, b: DataLocal): number {
  const pa = partes(a), pb = partes(b)
  return Math.round((Date.UTC(pb.ano, pb.mes - 1, pb.dia) - Date.UTC(pa.ano, pa.mes - 1, pa.dia)) / 86_400_000)
}

/** Soma (ou subtrai) dias a uma data civil. */
export function somarDias(data: DataLocal, dias: number): DataLocal {
  const p = partes(data)
  const d = new Date(Date.UTC(p.ano, p.mes - 1, p.dia + dias))
  return montar(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(data: DataLocal): number {
  const p = partes(data)
  return new Date(Date.UTC(p.ano, p.mes - 1, p.dia)).getUTCDay()
}

/** Semana ISO 8601 (1–53) de uma data civil. */
export function semanaISO(data: DataLocal): number {
  const p = partes(data)
  const d = new Date(Date.UTC(p.ano, p.mes - 1, p.dia))
  const dia = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dia)
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - inicioAno.getTime()) / 86_400_000 + 1) / 7)
}
