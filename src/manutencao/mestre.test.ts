import { describe, expect, it } from 'vitest'
import { MESTRE, baseDoId, prepararCarga } from './bases'
import { abaDaBase, lerArquivo, montarTabelaMestre } from './excel'

const bases = MESTRE.partes.map((id) => baseDoId(id)!)
const produtos = [
  { sku: '1000011', descricao_br: 'BARRA 38% 20G', descricao_en: 'BAR 38%', descricao_fr: 'Tablette 38%', familia: 'BARS', categoria: 'Food', cost_type: 'Finished Goods', unidade: 'Unit', multiplo_caixa: 100, peso_liq_un_kg: 0.02, peso_bruto_caixa_kg: 2.3, hs_code: '18063210', shelf_life_dias: 365, shelf_life_dias_franca: 365, preco_interco_eur: 0.35, cogs_eur: 0.2, ativo: true, sazonalidade: null, qtd_10_meses: 600, num_embarques_10_meses: 2, ultimo_embarque: '2026-10-16' },
  { sku: '1000122', descricao_br: 'TRUFA KG', descricao_en: null, descricao_fr: null, familia: 'CHAMEGO', categoria: null, cost_type: null, unidade: 'Kg', multiplo_caixa: 2, peso_liq_un_kg: null, peso_bruto_caixa_kg: null, hs_code: null, shelf_life_dias: 120, shelf_life_dias_franca: 90, preco_interco_eur: 16, cogs_eur: null, ativo: true, sazonalidade: 'natal', qtd_10_meses: 10, num_embarques_10_meses: 1, ultimo_embarque: '2026-09-01' },
  { sku: '5200311', descricao_br: 'PANETONE', descricao_en: null, descricao_fr: null, familia: null, categoria: null, cost_type: null, unidade: 'Unit', multiplo_caixa: null, peso_liq_un_kg: null, peso_bruto_caixa_kg: null, hs_code: null, shelf_life_dias: null, shelf_life_dias_franca: null, preco_interco_eur: null, cogs_eur: null, ativo: false, sazonalidade: 'pascoa', qtd_10_meses: null, num_embarques_10_meses: null, ultimo_embarque: null },
]
const parametros = [{ chave: 'transit_dias', valor: '3', descricao: 'Trânsito aéreo' }, { chave: 'deposito_expedicao_franca', valor: '', descricao: 'Depósito SAP' }]
const contract = [{ versao: 1, shelf_life_dias: 90, minimo_dias_chegada: 63, vigente: true }, { versao: 1, shelf_life_dias: 365, minimo_dias_chegada: 196, vigente: true }]

describe('tabela mestre', () => {
  it('gera as abas e volta pelo importador sem diferenças (ida e volta)', async () => {
    const wb = montarTabelaMestre(bases, { produtos, parametros, contract })
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Leia-me', 'Produtos', 'Parâmetros', 'Contract date', 'Dicionário'])
    const buf = await wb.xlsx.writeBuffer()
    const { abas } = await lerArquivo(new File([buf as ArrayBuffer], 'mestre.xlsx'))
    const atuais = [produtos, parametros, contract]
    bases.forEach((b, i) => {
      const aba = abaDaBase(b, abas, true)!
      expect(aba.nome).toBe(b.aba)
      const p = prepararCarga(b, 'atualizar', aba.linhas, atuais[i])
      expect(p.faltandoChave).toEqual([])
      expect(p.cabecalhosIgnorados).toEqual([])
      expect(p.linhas.map((l) => l.acao)).toEqual(atuais[i].map(() => 'igual'))
    })
  })
  it('conta pendências dos SKUs ativos no Leia-me e cria o contador por linha', async () => {
    const wb = montarTabelaMestre(bases, { produtos, parametros, contract })
    const leia = wb.getWorksheet('Leia-me')!
    const situacao = leia.getColumn(2).values.find((v) => typeof v === 'string' && v.includes('ativos no portfólio'))
    expect(situacao).toBe('3 SKUs, 2 ativos no portfólio, 1 ativos com campo obrigatório vazio.')
    const ws = wb.getWorksheet('Produtos')!
    const cab = (ws.getRow(2).values as unknown[]).slice(1)
    expect(cab.at(-1)).toBe('Campos pendentes')
    const formula = ws.getCell(3, cab.length).value as { formula: string }
    expect(formula.formula).toMatch(/^IF\(/)
  })
  it('aba que não está no arquivo não é lida (arquivo só com Produtos)', () => {
    const abas = [{ nome: 'Produtos', linhas: [] }]
    expect(abaDaBase(bases[1], abas, true)).toBeUndefined()
    expect(abaDaBase(bases[0], abas, true)!.nome).toBe('Produtos')
  })
})
