// Regras que mudam conforme o modal de envio. Aéreo = premissas originais.
export type Modal = 'aereo' | 'maritimo'

export type RegrasModal = {
  modal: Modal
  rotulo: string
  transitDias: number           // embarque no Brasil → chegada na França
  antecedenciaPedidoDias: number // prazo mínimo entre pedido e embarque
  leadEstoqueDias: number        // produção desce ao estoque em D+n
  antecedenciaEstoqueDias: number // carga pronta no estoque n dias antes do embarque
  dimensoesPallet: string
  taraMasterBoxKg: number
  taraPalletKg: number
  embarqueSegunda: boolean       // aéreo sai sempre na segunda-feira
}

const num = (p: Record<string, string>, k: string, d: number) => { const v = Number(p[k]); return Number.isFinite(v) && p[k] !== undefined && p[k] !== '' ? v : d }

export function regrasDoModal(params: Record<string, string>, modal: Modal): RegrasModal {
  if (modal === 'maritimo') return {
    modal, rotulo: 'Marítimo',
    transitDias: num(params, 'transit_dias_maritimo', 28),
    antecedenciaPedidoDias: num(params, 'antecedencia_dias_maritimo', 60),
    leadEstoqueDias: num(params, 'lead_time_estoque_dias', 1),
    antecedenciaEstoqueDias: num(params, 'antecedencia_estoque_dias_maritimo', 12),
    dimensoesPallet: params.dimensoes_pallet_maritimo ?? '1,00 X 1,20 X 1,70',
    taraMasterBoxKg: num(params, 'tara_master_box_kg_maritimo', 0),
    taraPalletKg: num(params, 'tara_pallet_kg_maritimo', 21),
    embarqueSegunda: false,
  }
  return {
    modal: 'aereo', rotulo: 'Aéreo',
    transitDias: num(params, 'transit_dias', 3),
    antecedenciaPedidoDias: num(params, 'antecedencia_dias', 60),
    leadEstoqueDias: num(params, 'lead_time_estoque_dias', 1),
    antecedenciaEstoqueDias: num(params, 'antecedencia_estoque_dias', 7),
    dimensoesPallet: params.dimensoes_pallet ?? '1,00 X 1,20 X 1,10',
    taraMasterBoxKg: num(params, 'tara_master_box_kg', 21),
    taraPalletKg: num(params, 'tara_pallet_kg', 15),
    embarqueSegunda: true,
  }
}
