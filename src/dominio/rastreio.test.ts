import { expect, it } from 'vitest'
import { montarRastreio } from './rastreio'

const base = {
  criadoEm: '2026-11-01T10:00:00Z', dataEmbarque: '2027-01-18', dataChegada: '2027-01-21', foraPrazo: false, antecedenciaDias: 78,
  hoje: '2026-12-05', nome: (s: string) => `Produto ${s}`, pallets: null, pesoBrutoKg: null, invoiceNumero: null,
  eventos: [
    { para_status: 'enviado' as const, motivo: null, criado_em: '2026-11-01T10:00:00Z' },
    { para_status: 'em_validacao_supply' as const, motivo: null, criado_em: '2026-11-02T10:00:00Z' },
    { para_status: 'aguardando_fr' as const, motivo: 'Ajuste de quantidades', criado_em: '2026-11-03T10:00:00Z' },
    { para_status: 'aprovado' as const, motivo: null, criado_em: '2026-11-04T10:00:00Z' },
    { para_status: 'em_planejamento_pcp' as const, motivo: null, criado_em: '2026-11-05T10:00:00Z' },
    { para_status: 'plano_concluido' as const, motivo: null, criado_em: '2026-11-06T10:00:00Z' },
    { para_status: 'em_recebimento' as const, motivo: null, criado_em: '2026-12-02T10:00:00Z' },
  ],
  plano: [{ sku: 'A', atendimento: 'sim', qtd_planejada: 100, data_producao: '2026-12-01' }, { sku: 'B', atendimento: 'sim', qtd_planejada: 100, data_producao: '2026-12-10' }],
  recebimentos: [{ sku: 'A', lote: '1', qtd_recebida: 100, data_recebimento: '2026-12-02' }],
}

it('em produção: marco atual com progresso e histórico detalhado', () => {
  const r = montarRastreio({ ...base, status: 'em_recebimento' })
  const atual = r.marcos.find((m) => m.estado === 'atual')!
  expect(atual.chave).toBe('producao')
  expect(atual.detalhe).toBe('1 produto de 2 no estoque · 50% do volume')
  const titulos = r.atualizacoes.map((a) => a.titulo)
  expect(titulos).toContain('Você aceitou os ajustes: pedido confirmado')
  expect(titulos).toContain('Plano de produção definido')
  expect(titulos).toContain('1 lote no estoque')
  expect(titulos).toContain('Produção programada')   // B em 10/12, futuro
  expect(titulos[0]).toBe('Chegada prevista na França') // ordenado do mais recente/futuro para o mais antigo
})

it('cancelado só mantém o marco de envio', () => {
  const r = montarRastreio({ ...base, status: 'cancelado', eventos: [...base.eventos.slice(0, 3), { para_status: 'cancelado', motivo: 'Recusado pela França', criado_em: '2026-11-04T10:00:00Z' }] })
  expect(r.marcos.filter((m) => m.estado === 'feito').map((m) => m.chave)).toEqual(['enviado'])
  expect(r.resumoAtual).toBe('Pedido cancelado')
})
