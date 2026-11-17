import { useMemo, useRef, useState } from 'react'
import { BASES, MESTRE, baseDoId, prepararCarga, type Base, type LinhaPrevia, type Modo, type Previa } from '../../../manutencao/bases'
import { abaDaBase, baixarModelo, baixarTabelaMestre, lerArquivo } from '../../../manutencao/excel'
import { importarBase, lerTabela, skusCadastrados } from '../../../dados/manutencao'
import { Erro } from '../../../components/Carregando'
import { fmtNum } from '../../../lib/formatos'
import { Diferencas, Etiqueta, ROTULO_ACAO, fmtValor, rotuloCampo } from './comum'

type Filtro = LinhaPrevia['acao'] | 'removido' | 'todos'
type Parte = { base: Base; aba: string; previa: Previa }

export const basesDaMestre = () => MESTRE.partes.map((id) => baseDoId(id)!)
export async function baixarMestreAtual() {
  const bs = basesDaMestre()
  const [produtos, parametros, contract] = await Promise.all(bs.map((b) => lerTabela(b)))
  await baixarTabelaMestre(bs, { produtos, parametros, contract })
}
const mudancas = (p: Previa) => p.contagem.novo + p.contagem.alterado + p.contagem.removido

export function Importar({ baseInicial, onConcluir }: { baseInicial?: string; onConcluir: (ids: number[]) => void }) {
  const [alvo, setAlvo] = useState<string | null>(baseInicial && (baseInicial === MESTRE.id || baseDoId(baseInicial)) ? baseInicial : null)
  const ehMestre = alvo === MESTRE.id
  const bases = useMemo(() => (alvo ? (ehMestre ? basesDaMestre() : [baseDoId(alvo)!]) : []), [alvo, ehMestre])
  const [modo, setModo] = useState<Modo>(bases[0]?.modoPadrao ?? 'atualizar')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [partes, setPartes] = useState<Parte[] | null>(null)
  const [ativa, setAtiva] = useState(0)
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState<unknown>(null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [gerando, setGerando] = useState<'vazio' | 'dados' | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  function escolher(id: string) {
    setAlvo(id); setArquivo(null); setPartes(null); setErro(null)
    setModo(id === MESTRE.id ? 'atualizar' : baseDoId(id)!.modoPadrao)
  }
  const filtroInicial = (p: Previa): Filtro => (p.contagem.erro ? 'erro' : p.contagem.alterado ? 'alterado' : p.contagem.novo ? 'novo' : 'todos')

  async function processar(f: File, m = modo) {
    setArquivo(f); setLendo(true); setErro(null); setPartes(null); setAtiva(0)
    try {
      const { abas } = await lerArquivo(f)
      const res: Parte[] = []
      for (const b of bases) {
        const aba = abaDaBase(b, abas, ehMestre)
        if (!aba) continue
        const [atuais, skus] = await Promise.all([lerTabela(b), b.exigeProduto ? skusCadastrados() : Promise.resolve(undefined)])
        res.push({ base: b, aba: aba.nome, previa: prepararCarga(b, ehMestre ? b.modoPadrao : m, aba.linhas, atuais, { skus }) })
      }
      if (!res.length) throw new Error(`Não encontrei as abas ${bases.map((b) => `"${b.aba}"`).join(', ')} no arquivo. Use a tabela mestre baixada do portal.`)
      // abre na primeira aba com algo a ver (erro ou mudança)
      const i = Math.max(0, res.findIndex((p) => p.previa.contagem.erro || mudancas(p.previa)))
      setPartes(res); setAtiva(i); setFiltro(filtroInicial(res[i].previa))
    } catch (e) { setErro(e) } finally { setLendo(false) }
  }
  function trocarModo(m: Modo) { setModo(m); if (arquivo) processar(arquivo, m) }

  async function modelo(tipo: 'vazio' | 'dados') {
    setGerando(tipo)
    try {
      if (ehMestre) await (tipo === 'dados' ? baixarMestreAtual() : baixarTabelaMestre(bases, { produtos: [], parametros: [], contract: [] }))
      else await baixarModelo(bases[0], tipo === 'dados' ? await lerTabela(bases[0]) : [], `${bases[0].id}_${tipo === 'vazio' ? 'modelo' : new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) { setErro(e) } finally { setGerando(null) }
  }

  async function aplicar() {
    if (!partes || !arquivo) return
    const comMudanca = partes.filter((p) => mudancas(p.previa) > 0)
    const resumo = comMudanca.map(({ base, previa: { contagem: c } }) => `• ${base.nome}: ${[`${c.novo} novos`, `${c.alterado} alterados`, c.removido ? `${c.removido} REMOVIDOS` : '', c.erro ? `${c.erro} com erro ficam de fora` : ''].filter(Boolean).join(', ')}`).join('\n')
    if (!window.confirm(`Aplicar a carga?\n\n${resumo}\n\n${comMudanca.length > 1 ? 'Cada aba vira uma carga separada; ' : ''}tudo pode ser desfeito no Histórico de cargas.`)) return
    setEnviando(true); setErro(null)
    const ids: number[] = []
    try {
      for (const p of comMudanca) ids.push(await importarBase(p.base, p.previa.modo, p.previa.payload, arquivo.name, obs))
      onConcluir(ids)
    } catch (e) {
      const feitas = ids.length ? ` As abas anteriores já foram gravadas (carga nº ${ids.join(', ')}) e podem ser desfeitas no Histórico.` : ''
      setErro(new Error(`${e instanceof Error ? e.message : String(e)}${feitas}`))
    } finally { setEnviando(false) }
  }

  const parte = partes?.[ativa]
  const previa = parte?.previa
  const linhasFiltradas = useMemo(() => {
    if (!previa) return []
    return filtro === 'todos' ? previa.linhas : filtro === 'removido' ? [] : previa.linhas.filter((l) => l.acao === filtro)
  }, [previa, filtro])

  // ---------- Passo 1: escolher a base ----------
  if (!alvo) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">1. O que você vai atualizar?</h2>
        <button className="cartao w-full border-marca bg-marca/10 text-left transition hover:shadow-md" onClick={() => escolher(MESTRE.id)}>
          <span className="flex flex-wrap items-center gap-2 font-semibold">{MESTRE.nome} <span className="rounded-full bg-marca px-2 py-0.5 text-xs">recomendado</span></span>
          <span className="mt-1 block text-sm text-tinta-2">{MESTRE.descricao}</span>
        </button>
        <p className="pt-2 text-sm text-tinta-3">Ou uma base específica:</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BASES.map((b) => (
            <button key={b.id} className="cartao text-left transition hover:border-marca hover:shadow-md" onClick={() => escolher(b.id)}>
              <span className="font-semibold">{b.nome}</span>
              <span className="mt-1 block text-sm text-tinta-2">{b.descricao}</span>
              <span className="mt-2 block text-xs text-tinta-3">Origem: {b.origemSugerida}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const totalMudancas = partes?.reduce((s, p) => s + mudancas(p.previa), 0) ?? 0
  const algumaSemChave = partes?.some((p) => p.previa.faltandoChave.length > 0)
  const c = previa?.contagem
  return (
    <div className="space-y-4">
      <div className="cartao flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wide text-tinta-3">Importar</p>
          <p className="text-lg font-semibold">{ehMestre ? MESTRE.nome : bases[0].nome}</p>
          <p className="text-sm text-tinta-3">{ehMestre ? 'Abas: ' + bases.map((b) => b.aba).join(', ') : bases[0].origemSugerida}</p>
        </div>
        <button className="btn-secundario !py-1.5" onClick={() => { setAlvo(null); setPartes(null); setArquivo(null) }}>Trocar</button>
      </div>

      <section className="cartao space-y-3">
        <h2 className="font-semibold">2. Prepare o arquivo</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secundario !py-1.5" disabled={!!gerando} onClick={() => modelo('dados')}>{gerando === 'dados' ? 'Gerando…' : ehMestre ? 'Baixar tabela mestre com os dados atuais' : 'Baixar com os dados atuais'}</button>
          <button className="btn-secundario !py-1.5" disabled={!!gerando} onClick={() => modelo('vazio')}>{gerando === 'vazio' ? 'Gerando…' : 'Baixar modelo vazio'}</button>
        </div>
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-tinta-2">
          <li>Célula <b>vazia</b> mantém o valor atual. Para apagar um valor, escreva <code className="rounded bg-fundo px-1">LIMPAR</code>.</li>
          {ehMestre
            ? <li>O portal lê as abas <b>{bases.map((b) => b.aba).join(', ')}</b>; as que não estiverem no arquivo ficam como estão. Cada aba vira uma carga.</li>
            : <li>Pode apagar as colunas que não vai alterar; só a chave é obrigatória (<b>{bases[0].chave.map((k) => rotuloCampo(bases[0], k)).join(' + ')}</b>).</li>}
          <li>Também aceita extração do SAP colada direto, se os cabeçalhos forem reconhecidos (lista no Dicionário/Instruções do modelo). Aceita .xlsx{ehMestre ? '' : ' e .csv'}.</li>
        </ul>
        {!ehMestre && bases[0].modos.length > 1 && (
          <fieldset className="flex flex-wrap gap-2" aria-label="Modo da carga">
            {bases[0].modos.map((m) => (
              <label key={m} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${modo === m ? 'border-marca bg-marca/10' : 'border-linha'}`}>
                <input type="radio" name="modo" checked={modo === m} onChange={() => trocarModo(m)} className="mt-0.5" />
                <span>
                  <b>{m === 'substituir' ? 'Substituir (base completa)' : 'Atualizar'}</b>
                  <span className="block text-xs text-tinta-3">{m === 'substituir' ? 'O que não estiver no arquivo é removido da base.' : 'Inclui novos e altera existentes; nada é removido.'}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
      </section>

      <section className="cartao space-y-3">
        <h2 className="font-semibold">3. Suba o arquivo</h2>
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastando(true) }} onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); const f = e.dataTransfer.files[0]; if (f) processar(f) }}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center ${arrastando ? 'border-marca bg-marca/10' : 'border-linha'}`}>
          <p className="text-sm text-tinta-2">{arquivo ? <>Arquivo: <b>{arquivo.name}</b></> : 'Arraste o arquivo aqui ou'}</p>
          <button className="btn-primario !py-1.5" onClick={() => entrada.current?.click()}>{arquivo ? 'Escolher outro arquivo' : 'Escolher arquivo'}</button>
          <input ref={entrada} type="file" accept={ehMestre ? '.xlsx' : '.xlsx,.csv,.txt'} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) processar(f); e.target.value = '' }} />
        </div>
        {lendo && <p className="text-sm text-tinta-3" role="status">Lendo e comparando com a base atual…</p>}
      </section>

      {erro != null && <Erro erro={erro} />}

      {partes && parte && previa && c && (
        <section className="cartao space-y-4">
          <h2 className="font-semibold">4. Confira a prévia antes de gravar</h2>

          {partes.length > 1 && (
            <div className="flex flex-wrap gap-1 border-b border-linha" role="tablist">
              {partes.map((p, i) => {
                const n = mudancas(p.previa), e = p.previa.contagem.erro
                return (
                  <button key={p.base.id} role="tab" aria-selected={i === ativa} onClick={() => { setAtiva(i); setFiltro(filtroInicial(p.previa)) }}
                    className={`-mb-px border-b-2 px-3 py-2 text-sm ${i === ativa ? 'border-marca font-semibold' : 'border-transparent text-tinta-2'}`}>
                    {p.aba}{' '}
                    <span className={`ml-1 rounded-full px-1.5 text-xs ${e ? 'bg-erro/15 text-erro' : n ? 'bg-alerta/15 text-alerta' : 'bg-fundo text-tinta-3'}`}>{e ? `${e} erro(s)` : n ? `${n} mudança(s)` : 'sem mudança'}</span>
                  </button>
                )
              })}
            </div>
          )}

          {previa.faltandoChave.length > 0 ? (
            <p className="rounded-md bg-erro/10 p-3 text-sm text-erro">
              Não encontrei a(s) coluna(s)-chave <b>{previa.faltandoChave.map((k) => rotuloCampo(parte.base, k)).join(', ')}</b> na aba "{parte.aba}". Confira o cabeçalho ou use o modelo.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {(['todos', 'novo', 'alterado', 'removido', 'igual', 'erro', 'ignorado'] as Filtro[]).map((f) => {
                  const n = f === 'todos' ? previa.linhas.length : c[f]
                  if (f !== 'todos' && !n) return null
                  return (
                    <button key={f} onClick={() => setFiltro(f)}
                      className={`rounded-full border px-3 py-1 text-sm ${filtro === f ? 'border-tinta bg-tinta text-white' : 'border-linha bg-cartao hover:bg-fundo'}`}>
                      {f === 'todos' ? 'Todas as linhas' : ROTULO_ACAO[f]} <b>{fmtNum(n)}</b>
                    </button>
                  )
                })}
              </div>

              <details className="text-sm">
                <summary className="cursor-pointer text-tinta-2">
                  {previa.colunasReconhecidas.length} colunas reconhecidas{previa.cabecalhosIgnorados.length ? ` · ${previa.cabecalhosIgnorados.length} ignoradas` : ''}
                </summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {previa.colunasReconhecidas.map(({ coluna, cabecalho }) => (
                    <span key={coluna.campo} className="rounded bg-ok/10 px-2 py-0.5 text-xs">{cabecalho}{cabecalho !== coluna.rotulo && <> → <b>{coluna.rotulo}</b></>}</span>
                  ))}
                  {previa.cabecalhosIgnorados.map((h) => <span key={h} className="rounded bg-fundo px-2 py-0.5 text-xs text-tinta-3 line-through">{h}</span>)}
                </div>
              </details>

              {c.removido > 0 && (filtro === 'removido' || filtro === 'todos') && (
                <div className="rounded-md bg-erro/10 p-3 text-sm">
                  <p className="font-semibold text-erro">{fmtNum(c.removido)} registro(s) serão removidos (não estão no arquivo).</p>
                  {filtro === 'removido' && (
                    <ul className="mt-2 max-h-48 overflow-auto text-xs">
                      {previa.removidos.slice(0, 500).map((r, i) => <li key={i} className="font-mono">{parte.base.chave.map((k) => fmtValor(r[k])).join(' · ')}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {linhasFiltradas.length > 0 && (
                <div className="max-h-[28rem] overflow-auto rounded-md border border-linha">
                  <table className="grade">
                    <thead><tr><th>Linha</th><th>Chave</th><th>Situação</th><th>O que muda / problema</th></tr></thead>
                    <tbody>
                      {linhasFiltradas.slice(0, 1000).map((l) => (
                        <tr key={l.linha}>
                          <td className="text-tinta-3">{l.linha}</td>
                          <td className="font-mono text-xs">{l.rotuloChave || '—'}</td>
                          <td><Etiqueta acao={l.acao} /></td>
                          <td>{l.erros.length ? <ul className="text-xs text-erro">{l.erros.map((e) => <li key={e}>{e}</li>)}</ul> : <Diferencas base={parte.base} itens={l.diferencas} />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {linhasFiltradas.length > 1000 && <p className="p-2 text-xs text-tinta-3">Mostrando 1.000 de {fmtNum(linhasFiltradas.length)} linhas.</p>}
                </div>
              )}

              {c.erro > 0 && <p className="text-sm text-alerta">As {fmtNum(c.erro)} linha(s) com erro <b>não</b> serão gravadas. Corrija no arquivo e suba de novo, ou aplique só as válidas.</p>}
              {c.ignorado > 0 && <p className="text-sm text-tinta-3">{fmtNum(c.ignorado)} linha(s) ignoradas porque o SKU não está cadastrado no portal.</p>}
            </>
          )}

          <div className="flex flex-wrap items-end gap-3 border-t border-linha pt-4">
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-tinta-2">Observação da carga (opcional)</span>
              <input className="w-full" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: revisão do cadastro nov/26, preços 2027" />
            </label>
            <button className="btn-primario" disabled={!totalMudancas || enviando || (!ehMestre && algumaSemChave)} onClick={aplicar}>
              {enviando ? 'Gravando…' : totalMudancas ? `Aplicar carga (${fmtNum(totalMudancas)} mudanças${partes.length > 1 ? ` em ${partes.filter((p) => mudancas(p.previa)).length} aba(s)` : ''})` : 'Nada para aplicar'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
