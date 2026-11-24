import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { Layout } from './components/Layout'
import { RotaPerfil, RotaProtegida, RotaPublica } from './components/Rotas'
import { Entrar } from './telas/Entrar'
import { Inicio } from './telas/Inicio'
import { Pedidos } from './telas/pedidos/Pedidos'
import { NovoPedido } from './telas/pedidos/NovoPedido'
import { Pedido } from './telas/pedidos/Pedido'
import { Produtos } from './telas/admin/Produtos'
import { Parametros } from './telas/admin/Parametros'
import { Usuarios } from './telas/admin/Usuarios'
import { Manutencao } from './telas/admin/manutencao/Manutencao'
import { Campanhas } from './telas/admin/Campanhas'
import { MinhaConta } from './telas/MinhaConta'
import { Indicadores } from './telas/Indicadores'
import { useState } from 'react'
import { IdiomaContext } from './i18n/contexto'
import { definirIdioma, idiomaAtual, type Idioma } from './i18n/idioma'

export default function App() {
  const [idioma, setIdioma] = useState<Idioma>(idiomaAtual())
  const trocar = (i: Idioma) => { definirIdioma(i); setIdioma(i) }
  return (
    <IdiomaContext.Provider value={{ idioma, trocar }}>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<RotaPublica />}><Route path="/entrar" element={<Entrar />} /></Route>
          <Route element={<RotaProtegida />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Inicio />} />
              <Route path="/pedidos/:id" element={<Pedido />} />
              <Route path="/conta" element={<MinhaConta />} />
              <Route path="/indicadores" element={<Indicadores />} />
              <Route path="/kpis" element={<Navigate to="/indicadores" replace />} />
              <Route element={<RotaPerfil perfis={['franca', 'supply', 'admin']} />}>
                <Route path="/pedidos/novo" element={<NovoPedido />} />
              </Route>
              <Route element={<RotaPerfil perfis={['supply', 'pcp', 'operacoes', 'admin']} />}>
                <Route path="/pedidos" element={<Pedidos />} />
              </Route>
              <Route element={<RotaPerfil perfis={['admin', 'supply']} />}>
                <Route path="/admin/produtos" element={<Produtos />} />
                <Route path="/campanhas" element={<Campanhas />} />
              </Route>
              <Route element={<RotaPerfil perfis={['admin']} />}>
                <Route path="/admin/parametros" element={<Parametros />} />
                <Route path="/admin/usuarios" element={<Usuarios />} />
                <Route path="/admin/manutencao" element={<Manutencao />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </IdiomaContext.Provider>
  )
}
