import { NavLink } from 'react-router-dom'
import { LayoutDashboard, TrendingUp, Building2, Receipt, Droplets, Lightbulb, CloudRain, Tag } from 'lucide-react'

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/ingresos', icon: TrendingUp, label: 'Ingresos' },
  { to: '/subarriendos', icon: Building2, label: 'Subarriendos' },
  { to: '/gastos', icon: Receipt, label: 'Gastos' },
  { to: '/analytics', icon: Lightbulb, label: 'Inteligencia' },
  { to: '/pricing', icon: Tag, label: 'Pricing' },
  { to: '/clima', icon: CloudRain, label: 'Clima' },
]

export default function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/40">
            <Droplets size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white text-sm">Alpha Cleaners</h1>
            <p className="text-xs text-gray-400">Control Financiero</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/50'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <p className="text-xs text-gray-500">Conectado · MVP v1.0</p>
        </div>
      </div>
    </aside>
  )
}
