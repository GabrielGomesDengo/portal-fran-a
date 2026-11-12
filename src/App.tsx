import { BrowserRouter, Route, Routes } from 'react-router-dom'
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
import { MinhaConta } from './telas/MinhaConta'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<RotaPublica />}><Route path="/entrar" element={<Entrar />} /></Route>
          <Route element={<RotaProtegida />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Inicio />} />
              <Route path="/pedidos" element={<Pedidos />} />
              <Route path="/pedidos/:id" element={<Pedido />} />
              <Route path="/conta" element={<MinhaConta />} />
              <Route element={<RotaPerfil perfis={['franca', 'supply', 'admin']} />}>
                <Route path="/pedidos/novo" element={<NovoPedido />} />
              </Route>
              <Route element={<RotaPerfil perfis={['admin', 'supply']} />}>
                <Route path="/admin/produtos" element={<Produtos />} />
              </Route>
              <Route element={<RotaPerfil perfis={['admin']} />}>
                <Route path="/admin/parametros" element={<Parametros />} />
                <Route path="/admin/usuarios" element={<Usuarios />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
