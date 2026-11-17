import { useMemo, useRef, useState } from 'react'
import { conciliarRecebimento, ESTOQUE_DEPOSITO_SAP, lerEstoqueSap, type Destino, type LinhaRecebimento } from '../../dominio/recebimentoSap'
import { avaliarValidade, type FaixaContractDate } from '../../dominio/contractDate'
import { baixarModelo, lerArquivo } from '../../manutencao/excel'
import { fmtData, fmtNum, hoje } from '../../lib/formatos'
import { Erro } from '../../components/Carregando'
import type { Pedido, PedidoItem, Produto } from '../../tipos/dominio'

const DESTINO: Record<Destino, [string, string]> = {
  lote_do_plano: ['Lote do plano', 'bg-ok/15 text-ok'],
  lote_existente: ['Atualiza lote', 'bg-ok/15 text-ok'],
  extra: ['Lote extra', 'bg-alerta/15 text-alerta'],
  excedente: ['Fica no depósito', 'bg-fundo text-tinta-3'],
  fora_do_pedido: ['Fora do pedido', 'bg-erro/15 text-erro'],
}

/** Recebimento a partir do relatório de estoque do depósito da França no SAP. */
export function ImportarEstoqueSap({ pedido, itens, produtos, linhas, contract, depositoPadrao, onAplicar, onCancelar }: {
  pedido: Pedido; itens: PedidoItem[]; produtos: Produto[]; linhas: LinhaRecebimento[]; contract: FaixaContractDate[]
  depositoPadrao: string; onAplicar: (linhas: LinhaRecebimento[], resumo: string) => void; onCancelar: () => void
}) {
  const prod = (sku: string) => produtos.find((p) => p.sku === sku)
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [matriz, setMatriz] = useState<unknown[][] | null>(null)
  const [deposito, setDeposito] = useState(depositoPadrao)
  const [confirmar, setConfirmar] = useState(true)
  const [limitar, setLimitar] = useState(false)
  const [erro, setErro] = useState<unknown>(null)
  const [lendo, setLendo] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  const avaliar = (sku: string, validade: string | null) => {
    const sl = prod(sku)?.shelf_life_dias
    return validade && sl ? avaliarValidade(validade, sl, pedido.data_chegada_fr, contract) : null
  }
  const leitura = useMemo(() => (matriz ? lerEstoqueSap(matriz, { deposito }) : null), [matriz, deposito])
  const conf = useMemo(() => {
    if (!leitura || leitura.faltando.length) return null
    return conciliarRecebimento(linhas, leitura.lotes, {
      pedidoId: pedido.id, skusPedido: new Set(itens.map((i) => i.sku)), shelfLife: (s) => prod(s)?.shelf_life_dias ?? null, hoje: hoje(),
      confirmar, limitarAoPlanejado: limitar, atende: (s, v) => avaliar(s, v)?.atende ?? null,
    })
  }, [leitura, linhas, confirmar, limitar]) // eslint-disable-line react-hooks/exhaustive-deps

  async function ler(f: File) {
    setErro(null); setLendo(true); setArquivo(f.name); setMatriz(null)
    try { setMatriz((await lerArquivo(f)).linhas) } catch (e) { setErro(e) } finally { setLendo(false) }
  }

  const itensConc = conf?.itens ?? []
  const n = (d: Destino) => itensConc.filter((i) => i.destino === d).length
  const aplicaveis = itensConc.filter((i) => i.qtdConsiderada > 0)
  const qtdTotal = aplicaveis.reduce((s, i) => s + i.qtdConsiderada, 0)
  const paramForaDoArquivo = !!leitura && !!depositoPadrao && leitura.depositos.length > 0 && !leitura.depositos.some((d) => d.toUpperCase() === depositoPadrao.toUpperCase())

  return (
    <div className="space-y-3 rounded-xl border border-marca bg-marca/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="font-semibold">Importar estoque do depósito (SAP)</h3>
          <p className="text-sm text-tinta-2">Suba o relatório de estoque do depósito da França{depositoPadrao && <> (<b>{depositoPadrao}</b>)</>}: o saldo disponível de cada lote é o que foi recebido. Obrigatórios: <b>Material, Lote e Quantidade disponível</b>; recomendados: <b>Data de produção</b> e/ou <b>Data do vencimento</b>.</p>
        </div>
        <button className="btn-secundario !py-1 text-xs" onClick={onCancelar}>Fechar</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primario !py-1.5" onClick={() => entrada.current?.click()}>{arquivo ? 'Escolher outro arquivo' : 'Escolher arquivo'}</button>
        <input ref={entrada} type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) ler(f); e.target.value = '' }} />
        <button className="btn-secundario !py-1.5" onClick={() => baixarModelo(ESTOQUE_DEPOSITO_SAP, [], 'modelo_estoque_deposito.xlsx').catch(setErro)}>Baixar modelo</button>
        {arquivo && <span className="text-sm text-tinta-2">Arquivo: <b>{arquivo}</b></span>}
        {lendo && <span className="text-sm text-tinta-3" role="status">Lendo…</span>}
      </div>
      {!depositoPadrao && <p className="text-xs text-tinta-3">Dica: o admin pode cadastrar o depósito da França em Parâmetros (<code>deposito_expedicao_franca</code>) para o portal filtrar sozinho.</p>}
      {erro != null && <Erro erro={erro} />}

      {leitura && leitura.faltando.length > 0 && (
        <p className="rounded-md bg-erro/10 p-3 text-sm text-erro">Não encontrei a(s) coluna(s) <b>{leitura.faltando.join(', ')}</b>. Colunas reconhecidas: {leitura.reconhecidas.join(', ') || 'nenhuma'}. Confira o cabeçalho ou use o modelo.</p>
      )}

      {leitura && conf && (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {leitura.depositos.length > 1 ? (
              <label className="flex items-center gap-2">Depósito
                <select className="!py-1" value={leitura.depositoUsado ?? ''} onChange={(e) => setDeposito(e.target.value)}>
                  <option value="">Todos ({leitura.depositos.length})</option>
                  {leitura.depositos.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
            ) : leitura.depositos.length === 1 ? <span>Depósito <b>{leitura.depositos[0]}</b></span> : null}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={limitar} onChange={(e) => setLimitar(e.target.checked)} />
              Considerar só até o planejado do pedido (o excedente fica no depósito)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)} />
              Marcar como confirmados os lotes com data de produção
            </label>
          </div>
          {paramForaDoArquivo && <p className="text-sm text-alerta">O depósito da França cadastrado ({depositoPadrao}) não aparece no arquivo. Escolha o depósito acima.</p>}
          {leitura.depositos.length > 1 && !leitura.depositoUsado && <p className="text-sm text-alerta">O arquivo tem vários depósitos e todos estão sendo somados. Escolha o depósito da França.</p>}

          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-cartao px-3 py-1 shadow-sm"><b>{fmtNum(aplicaveis.length)}</b> lotes · {fmtNum(qtdTotal, 3)} un/kg</span>
            {n('lote_do_plano') + n('lote_existente') > 0 && <span className="rounded-full bg-ok/15 px-3 py-1 text-ok"><b>{n('lote_do_plano') + n('lote_existente')}</b> nos lotes do plano</span>}
            {n('extra') > 0 && <span className="rounded-full bg-alerta/15 px-3 py-1 text-alerta"><b>{n('extra')}</b> lotes extras</span>}
            {n('excedente') > 0 && <span className="rounded-full bg-fundo px-3 py-1 text-tinta-3"><b>{n('excedente')}</b> ficam no depósito</span>}
            {n('fora_do_pedido') > 0 && <span className="rounded-full bg-erro/15 px-3 py-1 text-erro"><b>{n('fora_do_pedido')}</b> fora do pedido</span>}
            {conf.semEstoque.length > 0 && <span className="rounded-full bg-alerta/15 px-3 py-1 text-alerta"><b>{conf.semEstoque.length}</b> lotes do plano sem saldo</span>}
            {conf.foraDoDeposito.length > 0 && <span className="rounded-full bg-alerta/15 px-3 py-1 text-alerta"><b>{conf.foraDoDeposito.length}</b> recebidos fora do depósito</span>}
            {leitura.descartes.length > 0 && <span className="rounded-full bg-fundo px-3 py-1 text-tinta-3"><b>{leitura.descartes.length}</b> linhas descartadas</span>}
          </div>

          <div className="max-h-[26rem] overflow-auto rounded-md border border-linha bg-cartao">
            <table className="grade">
              <thead><tr><th>SKU</th><th>Produto</th><th>Lote</th><th className="text-right">Saldo SAP</th><th className="text-right">Considerado</th><th className="text-right">Planejado</th><th>Produção</th><th>Vencimento</th><th>Contract date</th><th>Destino</th><th>Observações</th></tr></thead>
              <tbody>
                {itensConc.map((i) => {
                  const av = avaliar(i.sap.sku, i.validade)
                  const calc = i.origemDatas === 'calculada'
                  const fora = i.qtdConsiderada === 0
                  return (
                    <tr key={`${i.sap.sku}|${i.sap.lote}`} className={fora ? 'text-tinta-3' : ''}>
                      <td className="font-mono">{i.sap.sku}</td>
                      <td className="text-xs">{prod(i.sap.sku)?.descricao_br ?? '—'}</td>
                      <td className="font-mono">{i.sap.lote}</td>
                      <td className="text-right">{fmtNum(i.sap.qtd, 3)}</td>
                      <td className={`text-right font-semibold ${i.qtdConsiderada < i.sap.qtd && !fora ? 'text-alerta' : ''}`}>{fora ? '—' : fmtNum(i.qtdConsiderada, 3)}</td>
                      <td className="text-right">{i.qtdPlanejada === null ? '—' : fmtNum(i.qtdPlanejada, 3)}</td>
                      <td className="whitespace-nowrap">{fmtData(i.fabricacao) || '—'}{calc && !i.sap.fabricacao && <span className="ml-1 text-xs text-tinta-3">(calc.)</span>}{i.origemDatas === 'plano' && <span className="ml-1 text-xs text-alerta">(plano)</span>}</td>
                      <td className="whitespace-nowrap">{fmtData(i.validade) || '—'}{calc && !i.sap.validade && <span className="ml-1 text-xs text-tinta-3">(calc.)</span>}</td>
                      <td>{av ? <span className={`pill ${av.atende ? 'bg-ok/15 text-ok' : 'bg-erro/15 text-erro'}`}>{av.atende ? 'atende' : `não atende (${Math.round(av.conformidade * 100)}%)`}</span> : '—'}</td>
                      <td><span className={`pill whitespace-nowrap ${DESTINO[i.destino][1]}`}>{DESTINO[i.destino][0]}</span></td>
                      <td className="text-xs">{i.avisos.length ? <ul className="text-alerta">{i.avisos.map((a) => <li key={a}>{a}</li>)}</ul> : null}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {conf.semEstoque.length > 0 && (
            <p className="text-sm text-alerta">Sem saldo no depósito: {conf.semEstoque.map((l) => `${l.sku} (${fmtNum(l.qtd_planejada)} plan.)`).join(', ')}. Ficam pendentes no recebimento.</p>
          )}
          {conf.foraDoDeposito.length > 0 && (
            <p className="text-sm text-alerta">Já recebidos no portal, mas sem saldo no depósito: {conf.foraDoDeposito.map((l) => `${l.sku} lote ${l.lote} (${fmtNum(l.qtd_recebida, 3)})`).join(', ')}. Continuam no recebimento — confira e remova ou corrija na tabela se for lote digitado errado.</p>
          )}
          {leitura.descartes.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-tinta-2">Linhas descartadas ({leitura.descartes.length})</summary>
              <ul className="mt-1 space-y-0.5 text-xs text-tinta-3">{leitura.descartes.map((d) => <li key={d.linha}>Linha {d.linha}{d.sku && ` · ${d.sku}`}{d.lote && ` · lote ${d.lote}`}{d.qtd !== null && ` · ${fmtNum(d.qtd, 3)}`}: {d.motivo}</li>)}</ul>
            </details>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-linha pt-3">
            <span className="mr-auto text-xs text-tinta-3">Nada é gravado agora: os lotes vão para a tabela do recebimento para você revisar e então salvar ou concluir.</span>
            <button className="btn-secundario" onClick={onCancelar}>Cancelar</button>
            <button className="btn-primario" disabled={!aplicaveis.length}
              onClick={() => onAplicar(conf.linhas, `${arquivo}${leitura.depositoUsado ? `, depósito ${leitura.depositoUsado}` : ''}: ${aplicaveis.length} lote(s), ${fmtNum(qtdTotal, 3)} un/kg`)}>
              Preencher recebimento com {aplicaveis.length} lote(s)
            </button>
          </div>
        </>
      )}
    </div>
  )
}
