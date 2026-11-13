import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { montarInvoicePdf, montarPackingListPdf } from './pdf'
import type { Produto } from '../tipos/dominio'

const produtos: Produto[] = [
  { sku: '1300359', descricao_br: 'LT TRUFAS', descricao_en: 'CAN CHAMEGO CUPUAÇU 132G', descricao_fr: null, familia: null, categoria: null, unidade: 'Unit', multiplo_caixa: 24, shelf_life_dias: 90, shelf_life_dias_franca: null, preco_interco_eur: 2.73, cogs_eur: 4.63, peso_liq_un_kg: 0.2, peso_bruto_caixa_kg: 5.16, hs_code: '18069000', ativo: true, qtd_10_meses: null, num_embarques_10_meses: null, ultimo_embarque: null },
  { sku: '1300136', descricao_br: 'QQ COCO', descricao_en: 'Quebra-Quebra Coconut and Brazilian Nut | 200g', descricao_fr: null, familia: null, categoria: null, unidade: 'Unit', multiplo_caixa: 18, shelf_life_dias: 210, shelf_life_dias_franca: null, preco_interco_eur: 3.6, cogs_eur: 6.07, peso_liq_un_kg: 0.2, peso_bruto_caixa_kg: 4.212, hs_code: '18063210', ativo: true, qtd_10_meses: null, num_embarques_10_meses: null, ultimo_embarque: null },
  { sku: '1300125', descricao_br: 'QQ CUPUAÇU KG', descricao_en: 'QUEBRA-QUEBRA CUPUAÇU WITH CASHEW NUTS 65% COCOA KG', descricao_fr: null, familia: null, categoria: null, unidade: 'Kg', multiplo_caixa: 4, shelf_life_dias: 150, shelf_life_dias_franca: null, preco_interco_eur: 14.5, cogs_eur: 23.32, peso_liq_un_kg: 1, peso_bruto_caixa_kg: 4, hs_code: '18063210', ativo: true, qtd_10_meses: null, num_embarques_10_meses: null, ultimo_embarque: null },
]
const out = process.env.PDF_OUT ?? tmpdir()

it('gera os PDFs de exemplo', () => {
  const pl = { pedido_id: 'p', numero: 'PL-2611', data: '2026-11-03', tara_pallet_kg: 15, tara_master_box_kg: 21 }
  const pallets = [{ numero: 1, dimensoes: '1,00 X 1,20 X 1,10', linhas: [{ sku: '1300359', lote: '262891', qtd: 240, caixas: 10 }, { sku: '1300136', lote: '262892', qtd: 90, caixas: 5 }, { sku: '1300125', lote: '263012', qtd: 168, caixas: 42 }] },
    { numero: 2, dimensoes: '1,00 X 1,20 X 1,10', linhas: [{ sku: '1300136', lote: '262892', qtd: 360, caixas: 20 }] }]
  writeFileSync(`${out}/pl.pdf`, Buffer.from(montarPackingListPdf(pl, pallets, produtos, '108321').output('arraybuffer')))
  const inv = { pedido_id: 'p', numero: '108321', data: '2026-11-03', due_date: '2026-11-03', incoterm: 'EXW', moeda: 'EUR', ptax: 6.0505, delivery_date: '2026-11-06', numero_packing_list: 'PL-2611', observacao: null }
  const linhas = [
    { sku: '1300359', lote: '262891', bbe: '2027-01-14', hs_code: '18069000', qtd: 240, caixas: 10, peso_liq_kg: 48, peso_bruto_kg: 51.6, preco_eur: 2.73, cogs_eur: 4.63, descricao: 'CAN CHAMEGO CUPUAÇU 132G', unidade: 'Unit', preco_brl: 16.52, total_eur: 655.2, total_brl: 3964.3, semanas_restantes: 10, atende: true, conformidade: 1.1 },
    { sku: '1300125', lote: '263012', bbe: '2027-02-25', hs_code: '18063210', qtd: 168, caixas: 42, peso_liq_kg: 168, peso_bruto_kg: 168, preco_eur: 14.5, cogs_eur: 23.32, descricao: 'QUEBRA-QUEBRA CUPUAÇU WITH CASHEW NUTS 65% COCOA KG', unidade: 'Kg', preco_brl: 87.73, total_eur: 2436, total_brl: 14738.6, semanas_restantes: 16, atende: true, conformidade: 1.2 },
  ]
  writeFileSync(`${out}/inv.pdf`, Buffer.from(montarInvoicePdf(inv, linhas, { eur: 3091.2, brl: 18702.9, liq: 216, bruto: 219.6 }).output('arraybuffer')))
})
