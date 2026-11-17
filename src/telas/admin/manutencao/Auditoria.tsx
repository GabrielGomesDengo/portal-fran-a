import { useEffect, useState } from 'react'
import { baseDaTabela } from '../../../manutencao/bases'
import { listarAuditoria, nomesUsuarios, type RegistroAuditoria } from '../../../dados/manutencao'
import { Carregando, Erro } from '../../../components/Carregando'
import { fmtDataHora } from '../../../lib/formatos'
import { fmtValor, nomeTabela, rotuloCampo, rotuloChave } from './comum'

const TABELAS = ['produto', 'produto_codigo', 'parametro', 'contract_date_regra', 'perfil_usuario']

export function Auditoria() {
  const [tabela, setTabela] = useState('')
  const [busca, setBusca] = useState('')
  const [origem, setOrigem] = useState<'' | 'manual' | 'carga'>('')
  const [regs, setRegs] = useState<RegistroAuditoria[] | null>(null)
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<unknown>(null)

  useEffect(() => { nomesUsuarios().then(setNomes).catch(() => {}) }, [])
  useEffect(() => {
    setRegs(null)
    const t = setTimeout(() => listarAuditoria({ tabela, busca, origem }).then(setRegs).catch(setErro), busca ? 350 : 0)
    return () => clearTimeout(t)
  }, [tabela, busca, origem])

  const valor = (r: RegistroAuditoria, v: string | null) => {
    if (r.tabela === 'perfil_usuario' && r.campo === 'user_id') return '—'
    return fmtValor(v)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-tinta-3">Toda alteração de cadastro fica registrada aqui, campo a campo — seja editada na tela ou por carga de arquivo. Estoque por lote e histórico de NFs ficam no Histórico de cargas.</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={tabela} onChange={(e) => { setTabela(e.target.value); setBusca('') }} aria-label="Base">
          <option value="">Todas as bases</option>
          {TABELAS.map((t) => <option key={t} value={t}>{nomeTabela(t)}</option>)}
        </select>
        {tabela !== 'perfil_usuario' && <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={tabela === 'parametro' ? 'Chave do parâmetro' : 'Código SAP exato'} aria-label="Buscar" />}
        <select value={origem} onChange={(e) => setOrigem(e.target.value as typeof origem)} aria-label="Origem">
          <option value="">Manual e carga</option>
          <option value="manual">Só edição na tela</option>
          <option value="carga">Só cargas</option>
        </select>
        <span className="ml-auto text-xs text-tinta-3">Últimos 300 registros</span>
      </div>
      {erro != null && <Erro erro={erro} />}
      {!regs ? <Carregando /> : !regs.length ? <p className="cartao text-sm text-tinta-3">Nenhuma alteração encontrada.</p> : (
        <div className="cartao overflow-x-auto p-0">
          <table className="grade">
            <thead><tr><th>Quando</th><th>Quem</th><th>Base</th><th>Registro</th><th>Campo</th><th>De</th><th>Para</th><th>Origem</th></tr></thead>
            <tbody>
              {regs.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{fmtDataHora(r.criado_em)}</td>
                  <td className="text-xs">{r.usuario ? nomes[r.usuario] ?? '—' : 'Sistema'}</td>
                  <td className="text-xs">{nomeTabela(r.tabela)}</td>
                  <td className="font-mono text-xs">{r.tabela === 'perfil_usuario' ? nomes[String(r.chave.user_id)] ?? '—' : rotuloChave(r.chave)}</td>
                  <td>{r.acao === 'update' ? rotuloCampo(baseDaTabela(r.tabela), r.campo ?? '') : <span className="font-semibold">{r.acao === 'insert' ? 'Registro criado' : 'Registro removido'}</span>}</td>
                  <td className="text-tinta-3">{r.acao === 'update' ? valor(r, r.valor_antigo) : ''}</td>
                  <td className="font-medium">{r.acao === 'update' ? valor(r, r.valor_novo) : ''}</td>
                  <td className="text-xs">{r.importacao_id ? `Carga nº ${r.importacao_id}` : 'Tela'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
