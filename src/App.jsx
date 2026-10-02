import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Menu, Droplets } from 'lucide-react'
import Sidebar from './components/Sidebar'
import Home from './pages/Home'
import Ingresos from './pages/Ingresos'
import Subarriendos from './pages/Subarriendos'
import Gastos from './pages/Gastos'
import Analytics from './pages/Analytics'
import Pricing from './pages/Pricing'
import Clima from './pages/Clima'
import Reactivacion from './pages/Reactivacion'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top bar solo en mobile: botón para abrir el menú */}
          <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900 shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-400 hover:text-white p-1 -ml-1"
              aria-label="Abrir menú"
            >
              <Menu size={22} />
            </button>
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <Droplets size={14} className="text-white" />
            </div>
            <h1 className="font-bold text-white text-sm">Alpha Cleaners</h1>
          </div>

          <main className="flex-1 overflow-auto">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/ingresos" element={<Ingresos />} />
              <Route path="/subarriendos" element={<Subarriendos />} />
              <Route path="/gastos" element={<Gastos />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/clima" element={<Clima />} />
              <Route path="/reactivacion" element={<Reactivacion />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}
