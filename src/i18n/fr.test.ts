import { expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { FR } from './fr'

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? arquivos(p) : /\.tsx?$/.test(f) && !f.endsWith('.test.ts') ? [p] : [] })
}

it('todo texto passado ao tradutor tem versão em francês', () => {
  const faltando = new Set<string>()
  for (const f of arquivos(join(__dirname, '..'))) {
    const s = readFileSync(f, 'utf8')
    for (const m of s.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) if (!(m[1] in FR)) faltando.add(m[1])
    for (const m of s.matchAll(/\btp\([^,]+,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'/g)) for (const k of [m[1], m[2]]) if (!(k in FR)) faltando.add(k)
  }
  expect([...faltando]).toEqual([])
})

it('placeholders preservados na tradução', () => {
  for (const [pt, fr] of Object.entries(FR)) {
    const a = [...pt.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), b = [...fr.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    expect(b, pt).toEqual(a)
  }
})
