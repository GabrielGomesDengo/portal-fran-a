import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { VisaoGeral } from './VisaoGeral'
import { Importar } from './Importar'
import { Cargas } from './Cargas'
import { Auditoria } from './Auditoria'

const ABAS = [
  { id: 'visao', rotulo: 'Visão geral' },
  { id: 'importar', rotulo: 'Importar bases' },
  { id: 'cargas', rotulo: 'Histórico de cargas' },
  { id: 'auditoria', rotulo: 'Auditoria' },
] as const
type Aba = (typeof ABAS)[number]['id']

/** Painel de manutenção das bases — somente admin (rota e banco). */
export function Manutencao() {
  const [params, setParams] = useSearchParams()
  const aba = (ABAS.find((a) => a.id === params.get('aba'))?.id ?? 'visao') as Aba
  const [baseImportar, setBaseImportar] = useState<string | undefined>(params.get('base') ?? undefined)
  const [cargaNova, setCargaNova] = useState<number | undefined>()
  const [chaveImportar, setChaveImportar] = useState(0)

  const ir = (a: Aba, extra: Record<string, string> = {}) => setParams({ aba: a, ...extra })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Manutenção</h1>
        <p className="text-sm text-tinta-3">Atualização das bases e cadastros do portal. Visível só para o admin; toda carga mostra a prévia antes de gravar e pode ser desfeita.</p>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-linha" role="tablist">
        {ABAS.map((a) => (
          <button key={a.id} role="tab" aria-selected={aba === a.id}
            onClick={() => { if (a.id === 'importar') { setBaseImportar(undefined); setChaveImportar((k) => k + 1) } if (a.id !== 'cargas') setCargaNova(undefined); ir(a.id) }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${aba === a.id ? 'border-marca font-semibold' : 'border-transparent text-tinta-2 hover:text-tinta'}`}>
            {a.rotulo}
          </button>
        ))}
      </nav>
      {aba === 'visao' && <VisaoGeral onImportar={(b) => { setBaseImportar(b); setChaveImportar((k) => k + 1); ir('importar', { base: b }) }} />}
      {aba === 'importar' && <Importar key={chaveImportar} baseInicial={baseImportar} onConcluir={(id) => { setCargaNova(id); ir('cargas') }} />}
      {aba === 'cargas' && <Cargas key={cargaNova ?? 0} destaque={cargaNova} />}
      {aba === 'auditoria' && <Auditoria />}
    </div>
  )
}
