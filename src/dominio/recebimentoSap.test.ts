import { describe, expect, it } from 'vitest'
import { conciliarRecebimento, lerEstoqueSap, type ContextoConciliacao, type LinhaRecebimento } from './recebimentoSap'

// Relatório de estoque por lote (estilo MB52/MCHB) com mais de um depósito.
const ESTOQUE = [
  ['Estoque por lote — Centro 1001'],
  ['Material', 'Texto breve material', 'Centro', 'Depósito', 'Lote', 'Utilização livre', 'Em controle qualidade', 'Data de produção', 'Data do vencimento'],
  ['000000000001300000', 'QQ CUPUACU', '1001', 'EXPF', '263011', '90', '0', '20/11/2026', '18/06/2027'],
  ['000000000001300000', 'QQ CUPUACU', '1001', 'PA01', '263011', '500', '0', '20/11/2026', '18/06/2027'],
  ['1300001', 'BARRA 70%', '1001', 'EXPF', '263012', '150', '0', '', '20/11/2027'],
  ['1300001', 'BARRA 70%', '1001', 'EXPF', '263012', '50', '0', '', '20/11/2027'],
  ['1300002', 'DRAGEAS', '1001', 'EXPF', '263020', '30', '0', '19/11/2026', ''],
  ['1300002', 'DRAGEAS', '1001', 'EXPF', '263021', '60', '0', '21/11/2026', ''],
  ['1300002', 'DRAGEAS', '1001', 'EXPF', '263022', '0', '40', '22/11/2026', ''],
  ['1300009', 'OUTRO', '1001', 'EXPF', '263099', '10', '0', '20/11/2026', '20/11/2027'],
  ['1300003', 'TRUFA', '1001', 'EXPF', '', '4', '0', '', ''],
]

describe('leitura do relatório de estoque', () => {
  const r = lerEstoqueSap(ESTOQUE, { deposito: 'expf' })
  it('reconhece as colunas, usa só o depósito da França e soma o mesmo lote', () => {
    expect(r.faltando).toEqual([])
    expect(r.depositos).toEqual(['EXPF', 'PA01'])
    expect(r.depositoUsado).toBe('EXPF')
    expect(r.lotes.map((l) => [l.sku, l.lote, l.qtd])).toEqual([
      ['1300000', '263011', 90], ['1300001', '263012', 200], ['1300002', '263020', 30], ['1300002', '263021', 60], ['1300009', '263099', 10],
    ])
    expect(r.descartes.map((d) => [d.linha, d.motivo])).toEqual([[4, 'Outro depósito (PA01)'], [9, 'Sem saldo disponível'], [11, 'Lote vazio']])
  })
  it('sem depósito informado e vários no arquivo: usa todos e devolve a lista para escolher', () => {
    const t = lerEstoqueSap(ESTOQUE)
    expect(t.depositoUsado).toBeNull()
    expect(t.lotes.find((l) => l.lote === '263011')!.qtd).toBe(590)
  })
  it('prioriza Utilização livre quando o relatório também traz Quantidade (total)', () => {
    const t = lerEstoqueSap([['Material', 'Lote', 'Quantidade', 'Utilização livre'], ['1300000', 'L1', 100, 60]])
    expect(t.lotes[0].qtd).toBe(60)
  })
  it('aponta colunas obrigatórias que faltam', () => {
    expect(lerEstoqueSap([['Material', 'Utilização livre'], ['1', 2]]).faltando).toEqual(['Lote'])
  })
  it('aceita também a lista de documentos (MB51), ignorando a perna de saída', () => {
    const mb51 = lerEstoqueSap([['Material', 'Lote', 'Qtd.em UM registro', 'Data de lançamento'], ['1300000', 'L1', -90, '21/11/2026'], ['1300000', 'L1', 90, '21/11/2026']])
    expect(mb51.lotes.map((l) => [l.lote, l.qtd, l.lancamento])).toEqual([['L1', 90, '2026-11-21']])
  })
})

describe('conciliação com o plano', () => {
  const plano = (sku: string, qtd: number, fab: string, id: string): LinhaRecebimento => ({ pedido_id: 'P', plano_id: id, sku, lote: null, qtd_planejada: qtd, qtd_recebida: 0, data_fabricacao: fab, validade: null, data_recebimento: '2026-11-17', confirmado: false })
  const atuais = [plano('1300000', 90, '2026-11-20', 'a'), plano('1300001', 200, '2026-11-20', 'b'), plano('1300002', 45, '2026-11-18', 'c'), plano('1300002', 45, '2026-11-22', 'd'), plano('1300003', 10, '2026-11-20', 'e')]
  const shelf: Record<string, number> = { '1300000': 210, '1300001': 365, '1300002': 120, '1300003': 120 }
  const ctx: ContextoConciliacao = { pedidoId: 'P', skusPedido: new Set(Object.keys(shelf)), shelfLife: (s) => shelf[s] ?? null, hoje: '2026-11-17', confirmar: true }
  const { lotes } = lerEstoqueSap(ESTOQUE, { deposito: 'EXPF' })
  const c = conciliarRecebimento(atuais, lotes, ctx)

  it('preenche lote, quantidade e datas do SAP nos lotes do plano', () => {
    expect(c.linhas.find((l) => l.plano_id === 'a')).toMatchObject({ lote: '263011', qtd_recebida: 90, data_fabricacao: '2026-11-20', validade: '2027-06-18', confirmado: true })
  })
  it('calcula a produção pelo vencimento quando o SAP não traz', () => {
    expect(c.linhas.find((l) => l.plano_id === 'b')).toMatchObject({ lote: '263012', qtd_recebida: 200, data_fabricacao: '2026-11-20', validade: '2027-11-20' })
    expect(c.itens.find((i) => i.sap.lote === '263012')!.origemDatas).toBe('calculada')
  })
  it('associa cada lote ao lote do plano com data mais próxima e marca diferenças', () => {
    expect(c.linhas.find((l) => l.plano_id === 'c')!.lote).toBe('263020')
    expect(c.linhas.find((l) => l.plano_id === 'd')!.lote).toBe('263021')
    expect(c.itens.find((i) => i.sap.lote === '263020')!.avisos).toContain('Abaixo do planejado')
    expect(c.itens.find((i) => i.sap.lote === '263021')!.avisos).toContain('Acima do planejado')
  })
  it('material fora do pedido não entra; plano sem saldo no depósito fica pendente', () => {
    expect(c.itens.find((i) => i.sap.sku === '1300009')!.destino).toBe('fora_do_pedido')
    expect(c.linhas.some((l) => l.sku === '1300009')).toBe(false)
    expect(c.semEstoque.map((l) => l.plano_id)).toEqual(['e'])
  })
  it('reimportar atualiza o mesmo lote e lote novo vira extra', () => {
    const novo = lerEstoqueSap([['Material', 'Lote', 'Utilização livre'], ['1300000', '263011', 95], ['1300000', '263050', 5]]).lotes
    const c2 = conciliarRecebimento(c.linhas, novo, ctx)
    expect(c2.itens.map((i) => i.destino)).toEqual(['lote_existente', 'extra'])
    expect(c2.linhas.find((l) => l.lote === '263011')!.qtd_recebida).toBe(95)
    expect(c2.linhas.find((l) => l.lote === '263050')).toMatchObject({ plano_id: null, qtd_recebida: 5, confirmado: false })
    expect(c2.itens[1].origemDatas).toBe('incompleta')
  })
  it('limitado ao planejado: prioriza lotes que atendem contract date e os mais novos; excedente fica no depósito', () => {
    const dep = lerEstoqueSap([
      ['Material', 'Lote', 'Utilização livre', 'Data de produção'],
      ['1300002', 'VELHO', 80, '01/08/2026'], ['1300002', 'NOVO1', 50, '19/11/2026'], ['1300002', 'NOVO2', 50, '21/11/2026'],
    ]).lotes
    const c3 = conciliarRecebimento(atuais, dep, { ...ctx, limitarAoPlanejado: true, atende: (_s, v) => (v ? v > '2027-01-01' : null) })
    const por = Object.fromEntries(c3.itens.map((i) => [i.sap.lote, [i.destino, i.qtdConsiderada]]))
    expect(por).toEqual({ VELHO: ['excedente', 0], NOVO2: ['lote_do_plano', 50], NOVO1: ['lote_do_plano', 40] })
    expect(c3.linhas.filter((l) => l.sku === '1300002').reduce((s, l) => s + l.qtd_recebida, 0)).toBe(90)
  })
  it('avisa quando o lote do SAP pode duplicar um lote digitado à mão', () => {
    const digitado = [{ ...plano('1300001', 200, '2026-11-20', 'b'), lote: '263011', qtd_recebida: 200 }]
    const sap = lerEstoqueSap([['Material', 'Lote', 'Utilização livre'], ['1300001', '263012', 200]]).lotes
    const c4 = conciliarRecebimento(digitado, sap, { ...ctx, skusPedido: new Set(['1300001']) })
    expect(c4.itens[0].destino).toBe('extra')
    expect(c4.itens[0].avisos.join()).toMatch(/lote 263011/)
    expect(c4.foraDoDeposito.map((l) => l.lote)).toEqual(['263011'])
    // com limite, o já recebido consome o planejado: nada a mais entra
    const c5 = conciliarRecebimento(digitado, sap, { ...ctx, skusPedido: new Set(['1300001']), limitarAoPlanejado: true })
    expect(c5.itens[0].destino).toBe('excedente')
  })
})
