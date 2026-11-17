import { describe, expect, it } from 'vitest'
import { conciliarRecebimento, lerTransferenciaSap, type LinhaRecebimento } from './recebimentoSap'

// Extração estilo MB51: transferência 311 gera uma linha de saída (negativa) e uma de entrada.
const MB51 = [
  ['Lista de documentos de material'],
  ['Material', 'Texto breve material', 'Centro', 'Depósito', 'TMv', 'Doc.material', 'Lote', 'Qtd.em UM registro', 'Data de lançamento', 'Data de produção', 'Data do vencimento'],
  ['000000000001300000', 'QQ CUPUACU', '1001', 'PA01', '311', '4900001', '263011', '-90', '21/11/2026', '20/11/2026', '18/06/2027'],
  ['000000000001300000', 'QQ CUPUACU', '1001', 'EXP1', '311', '4900001', '263011', '90', '21/11/2026', '20/11/2026', '18/06/2027'],
  ['1300001', 'BARRA 70%', '1001', 'EXP1', '311', '4900002', '263012', '150', '21/11/2026', '', '20/11/2027'],
  ['1300001', 'BARRA 70%', '1001', 'EXP1', '311', '4900003', '263012', '50', '22/11/2026', '', '20/11/2027'],
  ['1300002', 'DRAGEAS', '1001', 'EXP1', '311', '4900004', '263020', '30', '21/11/2026', '19/11/2026', ''],
  ['1300002', 'DRAGEAS', '1001', 'EXP1', '311', '4900005', '263021', '60', '22/11/2026', '21/11/2026', ''],
  ['1300009', 'OUTRO', '1001', 'EXP1', '311', '4900006', '263099', '10', '21/11/2026', '20/11/2026', '20/11/2027'],
  ['1300003', 'TRUFA', '1001', 'EXP1', '311', '4900007', '', '4', '21/11/2026', '', ''],
]

describe('leitura da transferência do SAP', () => {
  const r = lerTransferenciaSap(MB51)
  it('reconhece os cabeçalhos da MB51, ignora a saída e soma o mesmo lote', () => {
    expect(r.faltando).toEqual([])
    expect(r.lotes.map((l) => [l.sku, l.lote, l.qtd])).toEqual([
      ['1300000', '263011', 90], ['1300001', '263012', 200], ['1300002', '263020', 30], ['1300002', '263021', 60], ['1300009', '263099', 10],
    ])
    expect(r.lotes[1].documentos).toEqual(['4900002', '4900003'])
    expect(r.lotes[1].lancamento).toBe('2026-11-22')
    expect(r.descartes.map((d) => [d.linha, d.motivo])).toEqual([[3, 'Saída da transferência (quantidade negativa)'], [10, 'Lote vazio']])
  })
  it('aponta colunas obrigatórias que faltam', () => {
    expect(lerTransferenciaSap([['Material', 'Quantidade'], ['1', 2]]).faltando).toEqual(['Lote'])
  })
})

describe('conciliação com o plano', () => {
  const plano = (sku: string, qtd: number, fab: string, id: string): LinhaRecebimento => ({ pedido_id: 'P', plano_id: id, sku, lote: null, qtd_planejada: qtd, qtd_recebida: 0, data_fabricacao: fab, validade: null, data_recebimento: '2026-11-17', confirmado: false })
  const atuais = [plano('1300000', 90, '2026-11-20', 'a'), plano('1300001', 200, '2026-11-20', 'b'), plano('1300002', 45, '2026-11-18', 'c'), plano('1300002', 45, '2026-11-22', 'd'), plano('1300003', 10, '2026-11-20', 'e')]
  const shelf: Record<string, number> = { '1300000': 210, '1300001': 365, '1300002': 120, '1300003': 120 }
  const { lotes } = lerTransferenciaSap(MB51)
  const c = conciliarRecebimento(atuais, lotes, { pedidoId: 'P', skusPedido: new Set(Object.keys(shelf)), shelfLife: (s) => shelf[s] ?? null, hoje: '2026-11-17', confirmar: true })

  it('preenche lote, quantidade e datas do SAP nos lotes do plano', () => {
    const a = c.linhas.find((l) => l.plano_id === 'a')!
    expect(a).toMatchObject({ lote: '263011', qtd_recebida: 90, data_fabricacao: '2026-11-20', validade: '2027-06-18', data_recebimento: '2026-11-21', confirmado: true })
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
  it('material fora do pedido não entra; plano sem transferência fica pendente', () => {
    expect(c.itens.find((i) => i.sap.sku === '1300009')!.destino).toBe('fora_do_pedido')
    expect(c.linhas.some((l) => l.sku === '1300009')).toBe(false)
    expect(c.semTransferencia.map((l) => l.plano_id)).toEqual(['e'])
  })
  it('reimportar atualiza o mesmo lote e lote novo vira extra', () => {
    const extra = lerTransferenciaSap([['Material', 'Lote', 'Quantidade'], ['1300000', '263011', 95], ['1300000', '263050', 5]]).lotes
    const c2 = conciliarRecebimento(c.linhas, extra, { pedidoId: 'P', skusPedido: new Set(Object.keys(shelf)), shelfLife: (s) => shelf[s] ?? null, hoje: '2026-11-17', confirmar: true })
    expect(c2.itens.map((i) => i.destino)).toEqual(['lote_existente', 'extra'])
    expect(c2.linhas.find((l) => l.lote === '263011')!.qtd_recebida).toBe(95)
    const novo = c2.linhas.find((l) => l.lote === '263050')!
    expect(novo).toMatchObject({ plano_id: null, qtd_recebida: 5, confirmado: false })
    expect(c2.itens[1].origemDatas).toBe('incompleta')
  })
  it('avisa quando o lote do SAP pode duplicar um lote digitado à mão', () => {
    const digitado = [{ ...plano('1300001', 200, '2026-11-20', 'b'), lote: '263011', qtd_recebida: 200 }]
    const sap = lerTransferenciaSap([['Material', 'Lote', 'Quantidade'], ['1300001', '263012', 200]]).lotes
    const c3 = conciliarRecebimento(digitado, sap, { pedidoId: 'P', skusPedido: new Set(['1300001']), shelfLife: () => 365, hoje: '2026-11-17', confirmar: true })
    expect(c3.itens[0].destino).toBe('extra')
    expect(c3.itens[0].avisos.join()).toMatch(/lote 263011/)
  })
})
