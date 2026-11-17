import { useRef, useState } from 'react'
import { conciliarRecebimento, lerTransferenciaSap, TRANSFERENCIA_SAP, type Conciliacao, type Destino, type LeituraSap, type LinhaRecebimento } from '../../dominio/recebimentoSap'
import { avaliarValidade, type FaixaContractDate } from '../../dominio/contractDate'
import { baixarModelo, lerArquivo } from '../../manutencao/excel'
import { fmtData, fmtNum, hoje } from '../../lib/formatos'
import { Erro } from '../../components/Carregando'
import type { Pedido, PedidoItem, Produto } from '../../tipos/dominio'

const DESTINO: Record<Destino, [string, string]> = {
  lote_do_plano: ['Lote do plano', 'bg-ok/15 text-ok'],
  lote_existente: ['Atualiza lote', 'bg-ok/15 text-ok'],
  extra: ['Lote extra', 'bg-alerta/15 text-alerta'],
  fora_do_pedido: ['Fora do pedido', 'bg-erro/15 text-erro'],
}

/** Recebimento a partir da extração da transferência no SAP (MB51 / MIGO). */
export function ImportarTransferenciaSap({ pedido, itens, produtos, linhas, contract, onAplicar, onCancelar }: {
  pedido: Pedido; itens: PedidoItem[]; produtos: Produto[]; linhas: LinhaRecebimento[]; contract: FaixaContractDate[]
  onAplicar: (linhas: LinhaRecebimento[], resumo: string) => void; onCancelar: () => void
}) {
  const prod = (sku: string) => produtos.find((p) => p.sku === sku)
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [leitura, setLeitura] = useState<LeituraSap | null>(null)
  const [conf, setConf] = useState<Conciliacao | null>(null)
  const [confirmar, setConfirmar] = useState(true)
  const [erro, setErro] = useState<unknown>(null)
  const [lendo, setLendo] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  function conciliar(l: LeituraSap, marcar = confirmar) {
    setConf(conciliarRecebimento(linhas, l.lotes, {
      pedidoId: pedido.id, skusPedido: new Set(itens.map((i) => i.sku)), shelfLife: (s) => prod(s)?.shelf_life_dias ?? null, hoje: hoje(), confirmar: marcar,
    }))
  }
  async function ler(f: File) {
    setErro(null); setLendo(true); setArquivo(f.name); setLeitura(null); setConf(null)
    try {
      const l = lerTransferenciaSap((await lerArquivo(f)).linhas)
      setLeitura(l)
      if (!l.faltando.length) conciliar(l)
    } catch (e) { setErro(e) } finally { setLendo(false) }
  }

  const itensConc = conf?.itens ?? []
  const n = (d: Destino) => itensConc.filter((i) => i.destino === d).length
  const aplicaveis = itensConc.filter((i) => i.destino !== 'fora_do_pedido')
  const qtdTotal = aplicaveis.reduce((s, i) => s + i.sap.qtd, 0)

  return (
    <div className="space-y-3 rounded-xl border border-marca bg-marca/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Importar transferência do SAP</h3>
          <p className="text-sm text-tinta-2">Suba a extração da transferência (MB51 ou MIGO) do jeito que sai do SAP. Obrigatórios: <b>Material, Lote e Quantidade</b>; recomendados: <b>Data de produção</b> e/ou <b>Data do vencimento</b>.</p>
        </div>
        <button className="btn-secundario !py-1 text-xs" onClick={onCancelar}>Fechar</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primario !py-1.5" onClick={() => entrada.current?.click()}>{arquivo ? 'Escolher outro arquivo' : 'Escolher arquivo'}</button>
        <input ref={entrada} type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) ler(f); e.target.value = '' }} />
        <button className="btn-secundario !py-1.5" onClick={() => baixarModelo(TRANSFERENCIA_SAP, [], 'modelo_transferencia_sap.xlsx').catch(setErro)}>Baixar modelo</button>
        {arquivo && <span className="text-sm text-tinta-2">Arquivo: <b>{arquivo}</b></span>}
        {lendo && <span className="text-sm text-tinta-3" role="status">Lendo…</span>}
      </div>
      {erro != null && <Erro erro={erro} />}

      {leitura && leitura.faltando.length > 0 && (
        <p className="rounded-md bg-erro/10 p-3 text-sm text-erro">Não encontrei a(s) coluna(s) <b>{leitura.faltando.join(', ')}</b>. Colunas reconhecidas: {leitura.reconhecidas.join(', ') || 'nenhuma'}. Confira o cabeçalho ou use o modelo.</p>
      )}

      {leitura && conf && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-cartao px-3 py-1 shadow-sm"><b>{fmtNum(aplicaveis.length)}</b> lotes · {fmtNum(qtdTotal)} un/kg</span>
            {n('lote_do_plano') + n('lote_existente') > 0 && <span className="rounded-full bg-ok/15 px-3 py-1 text-ok"><b>{n('lote_do_plano') + n('lote_existente')}</b> nos lotes do plano</span>}
            {n('extra') > 0 && <span className="rounded-full bg-alerta/15 px-3 py-1 text-alerta"><b>{n('extra')}</b> lotes extras</span>}
            {n('fora_do_pedido') > 0 && <span className="rounded-full bg-erro/15 px-3 py-1 text-erro"><b>{n('fora_do_pedido')}</b> fora do pedido</span>}
            {conf.semTransferencia.length > 0 && <span className="rounded-full bg-alerta/15 px-3 py-1 text-alerta"><b>{conf.semTransferencia.length}</b> lotes do plano sem transferência</span>}
            {leitura.descartes.length > 0 && <span className="rounded-full bg-fundo px-3 py-1 text-tinta-3"><b>{leitura.descartes.length}</b> linhas descartadas</span>}
          </div>

          <div className="max-h-[26rem] overflow-auto rounded-md border border-linha bg-cartao">
            <table className="grade">
              <thead><tr><th>SKU</th><th>Produto</th><th>Lote</th><th className="text-right">Qtd SAP</th><th className="text-right">Planejado</th><th>Produção</th><th>Vencimento</th><th>Contract date</th><th>Destino</th><th>Observações</th></tr></thead>
              <tbody>
                {itensConc.map((i) => {
                  const sl = prod(i.sap.sku)?.shelf_life_dias
                  const av = i.validade && sl ? avaliarValidade(i.validade, sl, pedido.data_chegada_fr, contract) : null
                  const calc = i.origemDatas === 'calculada'
                  return (
                    <tr key={`${i.sap.sku}|${i.sap.lote}`} className={i.destino === 'fora_do_pedido' ? 'text-tinta-3' : ''}>
                      <td className="font-mono">{i.sap.sku}</td>
                      <td className="text-xs">{prod(i.sap.sku)?.descricao_br ?? '—'}</td>
                      <td className="font-mono">{i.sap.lote}</td>
                      <td className="text-right font-semibold">{fmtNum(i.sap.qtd, 3)}</td>
                      <td className="text-right">{i.qtdPlanejada === null ? '—' : fmtNum(i.qtdPlanejada, 3)}</td>
                      <td className="whitespace-nowrap">{fmtData(i.fabricacao) || '—'}{calc && !i.sap.fabricacao && <span className="ml-1 text-xs text-tinta-3">(calc.)</span>}{i.origemDatas === 'plano' && <span className="ml-1 text-xs text-alerta">(plano)</span>}</td>
                      <td className="whitespace-nowrap">{fmtData(i.validade) || '—'}{calc && !i.sap.validade && <span className="ml-1 text-xs text-tinta-3">(calc.)</span>}</td>
                      <td>{av ? <span className={`pill ${av.atende ? 'bg-ok/15 text-ok' : 'bg-erro/15 text-erro'}`}>{av.atende ? 'atende' : `não atende (${Math.round(av.conformidade * 100)}%)`}</span> : '—'}</td>
                      <td><span className={`pill whitespace-nowrap ${DESTINO[i.destino][1]}`}>{DESTINO[i.destino][0]}</span></td>
                      <td className="text-xs">{i.avisos.length ? <ul className="text-alerta">{i.avisos.map((a) => <li key={a}>{a}</li>)}</ul> : <span className="text-tinta-3">{i.sap.documentos.length ? `Doc. ${i.sap.documentos.join(', ')}` : ''}</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {conf.semTransferencia.length > 0 && (
            <p className="text-sm text-alerta">Sem transferência no arquivo: {conf.semTransferencia.map((l) => `${l.sku} (${fmtNum(l.qtd_planejada)} plan.)`).join(', ')}. Ficam pendentes no recebimento.</p>
          )}
          {leitura.descartes.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-tinta-2">Linhas descartadas ({leitura.descartes.length})</summary>
              <ul className="mt-1 space-y-0.5 text-xs text-tinta-3">{leitura.descartes.map((d) => <li key={d.linha}>Linha {d.linha}{d.sku && ` · ${d.sku}`}{d.lote && ` · lote ${d.lote}`}{d.qtd !== null && ` · ${fmtNum(d.qtd, 3)}`}: {d.motivo}</li>)}</ul>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-linha pt-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmar} onChange={(e) => { setConfirmar(e.target.checked); conciliar(leitura, e.target.checked) }} />
              Marcar como confirmados os lotes com data de produção (o SAP é a fonte)
            </label>
            <div className="ml-auto flex gap-2">
              <button className="btn-secundario" onClick={onCancelar}>Cancelar</button>
              <button className="btn-primario" disabled={!aplicaveis.length}
                onClick={() => onAplicar(conf.linhas, `${arquivo}: ${aplicaveis.length} lote(s), ${fmtNum(qtdTotal)} un/kg`)}>
                Preencher recebimento com {aplicaveis.length} lote(s)
              </button>
            </div>
          </div>
          <p className="text-xs text-tinta-3">Nada é gravado agora: os lotes vão para a tabela do recebimento para você revisar e então salvar ou concluir.</p>
        </>
      )}
    </div>
  )
}
