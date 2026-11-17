import { createContext, useContext } from 'react'
import type { Idioma } from './idioma'

export const IdiomaContext = createContext<{ idioma: Idioma; trocar: (i: Idioma) => void }>({ idioma: 'pt', trocar: () => {} })
export const useIdioma = () => useContext(IdiomaContext)

/** Botão PT | FR. */
export function SeletorIdioma({ className = '' }: { className?: string }) {
  const { idioma, trocar } = useIdioma()
  return (
    <div role="group" aria-label="Idioma / Langue" className={`inline-flex overflow-hidden rounded-md border border-linha text-xs font-semibold ${className}`}>
      {(['pt', 'fr'] as Idioma[]).map((i) => (
        <button key={i} type="button" onClick={() => trocar(i)} aria-pressed={idioma === i} title={i === 'pt' ? 'Português' : 'Français'}
          className={`px-2.5 py-1.5 ${idioma === i ? 'bg-tinta text-white' : 'bg-cartao text-tinta-2 hover:bg-fundo'}`}>{i.toUpperCase()}</button>
      ))}
    </div>
  )
}
