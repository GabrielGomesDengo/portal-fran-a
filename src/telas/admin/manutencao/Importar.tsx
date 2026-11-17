import { useMemo, useRef, useState } from 'react'
import { BASES, baseDoId, prepararCarga, type Base, type LinhaPrevia, type Modo, type Previa } from '../../../manutencao/bases'
import { baixarModelo, lerArquivo } from '../../../manutencao/excel'
import { importarBase, lerTabela, skusCadastrados } from '../../../dados/manutencao'
import { Erro } from '../../../components/Carregando'
import { fmtNum } from '../../../lib/formatos'
import { Diferencas, Etiqueta, ROTULO_ACAO, fmtValor, rotuloCampo } from './comum'

type Filtro = LinhaPrevia['acao'] | 'removido' | 'todos'

export function Importar({ baseInicial, onConcluir }: { baseInicial?: string; onConcluir: (id: number) => void }) {
  const [base, setBase] = useState<Base | null>(baseInicial ? baseDoId(baseInicial) ?? null : null)
  const [modo, setModo] = useState<Modo>(base?.modoPadrao ?? 'atualizar')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState<unknown>(null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [gerando, setGerando] = useState<'vazio' | 'dados' | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  function escolherBase(b: Base) { setBase(b); setModo(b.modoPadrao); setArquivo(null); setPrevia(null); setErro(null) }

  async function processar(f: File, b = base!, m = modo) {
    setArquivo(f); setLendo(true); setErro(null); setPrevia(null); setFiltro('todos')
    try {
      const [{ linhas }, atuais, skus] = await Promise.all([lerArquivo(f), lerTabela(b), b.exigeProduto ? skusCadastrados() : Promise.resolve(undefined)])
      const p = prepararCarga(b, m, linhas, atuais, { skus })
      setPrevia(p)
      if (p.contagem.erro) setFiltro('erro')
      else if (p.contagem.alterado + p.contagem.novo) setFiltro(p.contagem.alterado ? 'alterado' : 'novo')
    } catch (e) { setErro(e) } finally { setLendo(false) }
  }
  function trocarModo(m: Modo) { setModo(m); if (arquivo && base) processar(arquivo, base, m) }

  async function modelo(tipo: 'vazio' | 'dados') {
    if (!base) return
    setGerando(tipo)
    try { await baixarModelo(base, tipo === 'dados' ? await lerTabela(base) : [], `${base.id}_${tipo === 'vazio' ? 'modelo' : new Date().toISOString().slice(0, 10)}.xlsx`) }
    catch (e) { setErro(e) } finally { setGerando(null) }
  }

  async function aplicar() {
    if (!base || !previa || !arquivo) return
    const c = previa.contagem
    const resumo = [`${c.novo} novos`, `${c.alterado} alterados`, c.removido ? `${c.removido} REMOVIDOS` : '', c.erro ? `${c.erro} linhas com erro ficam de fora` : ''].filter(Boolean).join(', ')
    if (!window.confirm(`Aplicar a carga em "${base.nome}"?\n\n${resumo}.\n\nA carga poderá ser desfeita no Histórico de cargas.`)) return
    setEnviando(true); setErro(null)
    try {
      const id = await importarBase(base, modo, previa.payload, arquivo.name, obs)
      onConcluir(id)
    } catch (e) { setErro(e) } finally { setEnviando(false) }
  }

  const linhasFiltradas = useMemo(() => {
    if (!previa) return []
    return filtro === 'todos' ? previa.linhas : filtro === 'removido' ? [] : previa.linhas.filter((l) => l.acao === filtro)
  }, [previa, filtro])

  // ---------- Passo 1: escolher a base ----------
  if (!base) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">1. Qual base você vai atualizar?</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BASES.map((b) => (
            <button key={b.id} className="cartao text-left transition hover:border-marca hover:shadow-md" onClick={() => escolherBase(b)}>
              <span className="font-semibold">{b.nome}</span>
              <span className="mt-1 block text-sm text-tinta-2">{b.descricao}</span>
              <span className="mt-2 block text-xs text-tinta-3">Origem: {b.origemSugerida}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const c = previa?.contagem
  const podeAplicar = !!previa && !previa.faltandoChave.length && (c!.novo + c!.alterado + c!.removido) > 0
  return (
    <div className="space-y-4">
      {/* Cabeçalho da base escolhida */}
      <div className="cartao flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wide text-tinta-3">Base</p>
          <p className="text-lg font-semibold">{base.nome}</p>
          <p className="text-sm text-tinta-3">{base.origemSugerida}</p>
        </div>
        <button className="btn-secundario !py-1.5" onClick={() => { setBase(null); setPrevia(null); setArquivo(null) }}>Trocar base</button>
      </div>

      {/* Passo 2: modelo e modo */}
      <section className="cartao space-y-3">
        <h2 className="font-semibold">2. Prepare o arquivo</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secundario !py-1.5" disabled={!!gerando} onClick={() => modelo('dados')}>{gerando === 'dados' ? 'Gerando…' : 'Baixar com os dados atuais'}</button>
          <button className="btn-secundario !py-1.5" disabled={!!gerando} onClick={() => modelo('vazio')}>{gerando === 'vazio' ? 'Gerando…' : 'Baixar modelo vazio'}</button>
        </div>
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-tinta-2">
          <li>Célula <b>vazia</b> mantém o valor atual. Para apagar um valor, escreva <code className="rounded bg-fundo px-1">LIMPAR</code>.</li>
          <li>Pode apagar as colunas que não vai alterar; só a chave é obrigatória (<b>{base.chave.map((k) => rotuloCampo(base, k)).join(' + ')}</b>).</li>
          <li>Também aceita uma extração do SAP colada direto, se os cabeçalhos forem reconhecidos (lista na aba Instruções do modelo). Aceita .xlsx e .csv.</li>
        </ul>
        {base.modos.length > 1 && (
          <fieldset className="flex flex-wrap gap-2" aria-label="Modo da carga">
            {base.modos.map((m) => (
              <label key={m} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${modo === m ? 'border-marca bg-marca/10' : 'border-linha'}`}>
                <input type="radio" name="modo" checked={modo === m} onChange={() => trocarModo(m)} className="mt-0.5" />
                <span>
                  <b>{m === 'substituir' ? 'Substituir (foto completa)' : 'Atualizar'}</b>
                  <span className="block text-xs text-tinta-3">{m === 'substituir' ? 'O que não estiver no arquivo é removido da base.' : 'Inclui novos e altera existentes; nada é removido.'}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
      </section>

      {/* Passo 3: subir */}
      <section className="cartao space-y-3">
        <h2 className="font-semibold">3. Suba o arquivo</h2>
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastando(true) }} onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); const f = e.dataTransfer.files[0]; if (f) processar(f) }}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center ${arrastando ? 'border-marca bg-marca/10' : 'border-linha'}`}>
          <p className="text-sm text-tinta-2">{arquivo ? <>Arquivo: <b>{arquivo.name}</b></> : 'Arraste o arquivo aqui ou'}</p>
          <button className="btn-primario !py-1.5" onClick={() => entrada.current?.click()}>{arquivo ? 'Escolher outro arquivo' : 'Escolher arquivo'}</button>
          <input ref={entrada} type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) processar(f); e.target.value = '' }} />
        </div>
        {lendo && <p className="text-sm text-tinta-3" role="status">Lendo e comparando com a base atual…</p>}
      </section>

      {erro != null && <Erro erro={erro} />}

      {/* Passo 4: prévia */}
      {previa && c && (
        <section className="cartao space-y-4">
          <h2 className="font-semibold">4. Confira a prévia antes de gravar</h2>

          {previa.faltandoChave.length > 0 ? (
            <p className="rounded-md bg-erro/10 p-3 text-sm text-erro">
              Não encontrei a(s) coluna(s)-chave <b>{previa.faltandoChave.map((k) => rotuloCampo(base, k)).join(', ')}</b> no arquivo. Confira o cabeçalho ou use o modelo.
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
                      {previa.removidos.slice(0, 500).map((r, i) => <li key={i} className="font-mono">{base.chave.map((k) => fmtValor(r[k])).join(' · ')}</li>)}
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
                          <td>{l.erros.length ? <ul className="text-xs text-erro">{l.erros.map((e) => <li key={e}>{e}</li>)}</ul> : <Diferencas base={base} itens={l.diferencas} />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {linhasFiltradas.length > 1000 && <p className="p-2 text-xs text-tinta-3">Mostrando 1.000 de {fmtNum(linhasFiltradas.length)} linhas.</p>}
                </div>
              )}

              {c.erro > 0 && <p className="text-sm text-alerta">As {fmtNum(c.erro)} linha(s) com erro <b>não</b> serão gravadas. Corrija no arquivo e suba de novo, ou aplique só as válidas.</p>}
              {c.ignorado > 0 && <p className="text-sm text-tinta-3">{fmtNum(c.ignorado)} linha(s) ignoradas porque o SKU não está cadastrado no portal (normal em extrações do SAP com todos os materiais).</p>}

              <div className="flex flex-wrap items-end gap-3 border-t border-linha pt-4">
                <label className="flex-1 text-sm">
                  <span className="mb-1 block text-tinta-2">Observação da carga (opcional)</span>
                  <input className="w-full" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: preços 2027, extração MB52 de 17/11" />
                </label>
                <button className="btn-primario" disabled={!podeAplicar || enviando} onClick={aplicar}>
                  {enviando ? 'Gravando…' : podeAplicar ? `Aplicar carga (${fmtNum(c.novo + c.alterado + c.removido)} mudanças)` : 'Nada para aplicar'}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
