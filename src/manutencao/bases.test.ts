import { describe, expect, it } from 'vitest'
import { baseDoId, converter, pendenciasCadastro, prepararCarga } from './bases'
import { lerCsv as lerCsvParaTeste } from './excel'

const produtos = baseDoId('produtos')!
const hist = baseDoId('historico_nf')!
const col = (b: typeof produtos, campo: string) => b.colunas.find((c) => c.campo === campo)!

describe('conversão de células', () => {
  it('números em formato brasileiro, americano e Excel', () => {
    expect(converter('1.234,56', col(produtos, 'preco_interco_eur'))).toEqual({ valor: 1234.56 })
    expect(converter('1,234.56', col(produtos, 'preco_interco_eur'))).toEqual({ valor: 1234.56 })
    expect(converter('0.350', col(produtos, 'preco_interco_eur'))).toEqual({ valor: 0.35 })
    expect(converter('0,35', col(produtos, 'preco_interco_eur'))).toEqual({ valor: 0.35 })
    expect(converter(12, col(produtos, 'shelf_life_dias'))).toEqual({ valor: 12 })
    expect(converter('12,5', col(produtos, 'shelf_life_dias'))).toHaveProperty('erro')
    expect(converter('-1', col(produtos, 'preco_interco_eur'))).toHaveProperty('erro')
  })
  it('datas dd/mm/aaaa, ISO e Date do Excel', () => {
    const c = col(hist, 'vencimento')
    expect(converter('10/12/2026', c)).toEqual({ valor: '2026-12-10' })
    expect(converter('2026-12-10', c)).toEqual({ valor: '2026-12-10' })
    expect(converter(new Date(Date.UTC(2026, 11, 10)), c)).toEqual({ valor: '2026-12-10' })
    expect(converter('31/02/2026', c)).toHaveProperty('erro')
  })
  it('código SAP sem zeros à esquerda; NF mantém zeros', () => {
    expect(converter('000000000001000011', col(produtos, 'sku'))).toEqual({ valor: '1000011' })
    expect(converter(1000011, col(produtos, 'sku'))).toEqual({ valor: '1000011' })
    expect(converter('000103256', col(hist, 'nf'))).toEqual({ valor: '000103256' })
  })
  it('vazio mantém, LIMPAR apaga, Sim/Não e listas', () => {
    expect(converter('', col(produtos, 'hs_code'))).toEqual({ vazio: true })
    expect(converter('limpar', col(produtos, 'hs_code'))).toEqual({ valor: null })
    expect(converter('Não', col(produtos, 'ativo'))).toEqual({ valor: false })
    expect(converter('x', col(produtos, 'ativo'))).toEqual({ valor: true })
    expect(converter('kg', col(produtos, 'unidade'))).toEqual({ valor: 'Kg' })
    expect(converter('cx', col(produtos, 'unidade'))).toHaveProperty('erro')
  })
})

describe('prévia da carga', () => {
  const atuais = [
    { sku: '1000011', descricao_br: 'BARRA 38%', preco_interco_eur: 0.35, ativo: true, unidade: 'Unit' },
    { sku: '1000012', descricao_br: 'BARRA 50%', preco_interco_eur: 0.4, ativo: true, unidade: 'Unit' },
  ]
  it('detecta novo, alterado, igual e erros; colunas ausentes não mudam', () => {
    const planilha = [
      ['Produtos'],
      ['Código SAP', 'Preço interco (€)', 'Descrição BR', 'Coluna estranha'],
      ['1000011', '0,50', null, 'x'],
      ['1000012', 0.4, '', ''],
      ['1000099', 1, 'NOVO', ''],
      ['1000098', 1, '', ''],
      ['1000011', 2, '', ''],
      ['1000012', 'abc', '', ''],
    ]
    const p = prepararCarga(produtos, 'atualizar', planilha, atuais)
    expect(p.cabecalhosIgnorados).toEqual(['Coluna estranha'])
    expect(p.linhas.map((l) => [l.linha, l.acao])).toEqual([[3, 'alterado'], [4, 'igual'], [5, 'novo'], [6, 'erro'], [7, 'erro'], [8, 'erro']])
    expect(p.linhas[0].diferencas).toEqual([{ campo: 'preco_interco_eur', antes: 0.35, depois: 0.5 }])
    expect(p.linhas[3].erros[0]).toMatch(/Descrição BR é obrigatório/)
    expect(p.linhas[4].erros[0]).toMatch(/repetida/)
    expect(p.contagem).toMatchObject({ novo: 1, alterado: 1, igual: 1, erro: 3 })
    expect(p.payload).toEqual([{ sku: '1000011', preco_interco_eur: 0.5 }, { sku: '1000012', preco_interco_eur: 0.4 }, { sku: '1000099', preco_interco_eur: 1, descricao_br: 'NOVO' }])
  })
  it('aceita cabeçalhos alternativos, ignora SKU fora do portal; substituir lista removidos', () => {
    const base = { ...hist, exigeProduto: true }
    const planilha = [
      ['Nota fiscal', 'Material', 'Batch', 'Data emissão', 'Centro'],
      ['000103256', '000000000001000011', 'L1', '14/01/2026', '1001'],
      ['000103256', '000000000009999999', 'L9', '14/01/2026', '1001'],
    ]
    const atuaisNf = [{ nf: '000100000', sku: '1000011', lote: 'L0', data_nf: '2026-01-01' }]
    const p = prepararCarga(base, 'substituir', planilha, atuaisNf, { skus: new Set(['1000011']) })
    expect(p.faltandoChave).toEqual([])
    expect(p.cabecalhosIgnorados).toEqual(['Centro'])
    expect(p.linhas.map((l) => l.acao)).toEqual(['novo', 'ignorado'])
    expect(p.payload).toEqual([{ nf: '000103256', sku: '1000011', lote: 'L1', data_nf: '2026-01-14' }])
    expect(p.removidos).toEqual(atuaisNf)
  })
  it('colunas de consulta da tabela mestre não contam como ignoradas', () => {
    const p = prepararCarga(produtos, 'atualizar', [['Código SAP', 'Volume 10 meses', 'Campos pendentes'], ['1000011', 5, 0]], [{ sku: '1000011' }])
    expect(p.cabecalhosIgnorados).toEqual([])
    expect(p.linhas[0].acao).toBe('igual')
  })
  it('número com ponto de milhar (padrão SAP Brasil)', () => {
    expect(converter('1.200', col(hist, 'qtd'))).toEqual({ valor: 1200 })
  })
  it('sem coluna-chave não gera linhas', () => {
    const p = prepararCarga(produtos, 'atualizar', [['Preço'], [1]], atuais)
    expect(p.faltandoChave).toEqual(['sku'])
    expect(p.linhas).toEqual([])
  })
  it('não deixa apagar campo obrigatório', () => {
    const p = prepararCarga(produtos, 'atualizar', [['SKU', 'Descrição BR'], ['1000011', 'LIMPAR']], atuais)
    expect(p.linhas[0].acao).toBe('erro')
  })
})

describe('CSV e saúde do cadastro', () => {
  it('lê CSV com ; e aspas', () => {
    expect(lerCsvParaTeste('a;b\r\n"x;1";"di""z"\n')).toEqual([['a', 'b'], ['x;1', 'di"z']])
  })
  it('aponta pendências só dos ativos', () => {
    const ps = [
      { sku: '1', descricao_br: 'A', ativo: true, preco_interco_eur: null, shelf_life_dias: 180, shelf_life_dias_franca: 150, unidade: 'Unit' },
      { sku: '2', descricao_br: 'B', ativo: false, preco_interco_eur: null },
    ]
    const p = Object.fromEntries(pendenciasCadastro(ps).map((x) => [x.id, x.skus.map((s) => s.sku)]))
    expect(p.preco).toEqual(['1'])
    expect(p.diverg).toEqual(['1'])
  })
})
