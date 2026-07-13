import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Home from './pages/Home'
import Ingresos from './pages/Ingresos'
import Subarriendos from './pages/Subarriendos'
import Gastos from './pages/Gastos'
import Analytics from './pages/Analytics'
import Clima from './pages/Clima'

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/ingresos" element={<Ingresos />} />
            <Route path="/subarriendos" element={<Subarriendos />} />
            <Route path="/gastos" element={<Gastos />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/clima" element={<Clima />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
