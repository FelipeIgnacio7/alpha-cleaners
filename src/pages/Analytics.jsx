import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import {
  TrendingUp, TrendingDown, Zap, Target, Star, Users,
  Calendar, Award, Lightbulb, BarChart2, ShoppingBag
} from 'lucide-react'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  ArcElement, Title, Tooltip, Legend, Filler
)

const supabase = createClient(
  'https://kkvaoknpwpnbdymvvqce.supabase.co',
  'sb_publishable_m2uJzHnl6SStzQtN-BHSAA_DYzonx0K'
)

const PREMIUM_BRANDS = new Set([
  'BMW', 'Mercedes-Benz', 'Mercedes Benz', 'Mercedes', 'Audi', 'Porsche',
  'Volvo', 'Land Rover', 'Lexus', 'Jaguar', 'Tesla', 'Maserati', 'Infiniti',
  'Acura', 'Genesis', 'Bentley', 'Ferrari', 'Lamborghini', 'Rolls-Royce'
])

const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function fmtCLP(n) {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

function StatCard({ icon: Icon, label, value, sub, color = 'blue', trend }) {
  const colors = {
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    green: 'text-green-400 bg-green-500/10 border-green-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${colors[color]}`}>
          <Icon size={16} />
        </div>
        {trend != null && (
          <span className={`text-xs font-medium flex items-center gap-1 ${trend >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
            {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-white mb-0.5">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

function InsightCard({ icon: Icon, title, body, accent = 'blue', tag }) {
  const accents = {
    blue: 'border-blue-500/30 bg-blue-500/5',
    green: 'border-green-500/30 bg-green-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
    purple: 'border-purple-500/30 bg-purple-500/5',
    rose: 'border-rose-500/30 bg-rose-500/5',
  }
  const tagColors = {
    blue: 'bg-blue-500/20 text-blue-300',
    green: 'bg-green-500/20 text-green-300',
    amber: 'bg-amber-500/20 text-amber-300',
    purple: 'bg-purple-500/20 text-purple-300',
    rose: 'bg-rose-500/20 text-rose-300',
  }
  const iconColors = {
    blue: 'text-blue-400', green: 'text-green-400', amber: 'text-amber-400',
    purple: 'text-purple-400', rose: 'text-rose-400',
  }
  return (
    <div className={`border rounded-xl p-5 ${accents[accent]}`}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`mt-0.5 shrink-0 ${iconColors[accent]}`}>
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h4 className="text-sm font-semibold text-white">{title}</h4>
            {tag && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tagColors[accent]}`}>{tag}</span>}
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">{body}</p>
        </div>
      </div>
    </div>
  )
}

const CHART_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280', font: { size: 11 } } },
    y: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280', font: { size: 11 } } },
  },
}

export default function Analytics() {
  const [txns, setTxns] = useState([])
  const [loading, setLoading] = useState(true)
  const [local, setLocal] = useState('all')

  useEffect(() => {
    async function load() {
      setLoading(true)
      // Get count first, then parallel fetch
      const { count } = await supabase
        .from('transacciones_lavado')
        .select('*', { count: 'exact', head: true })

      const total = count || 0
      const pageSize = 1000
      const pages = Math.ceil(total / pageSize)

      const fetches = Array.from({ length: pages }, (_, i) =>
        supabase
          .from('transacciones_lavado')
          .select('fecha, monto, tipo_servicio, marca, patente, local_id')
          .range(i * pageSize, (i + 1) * pageSize - 1)
      )
      const results = await Promise.all(fetches)
      const all = results.flatMap(r => r.data || [])
      setTxns(all)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    if (local === 'all') return txns
    return txns.filter(t => t.local_id === Number(local))
  }, [txns, local])

  const analytics = useMemo(() => {
    if (!filtered.length) return null

    const totalIngresos = filtered.reduce((s, t) => s + Number(t.monto), 0)
    const ticketProm = totalIngresos / filtered.length
    const patentes = new Set(filtered.map(t => t.patente).filter(Boolean))
    const marcas = new Set(filtered.map(t => t.marca).filter(Boolean))

    // Monthly breakdown
    const byMonth = {}
    filtered.forEach(t => {
      const key = t.fecha.slice(0, 7) // YYYY-MM
      if (!byMonth[key]) byMonth[key] = { ingresos: 0, count: 0 }
      byMonth[key].ingresos += Number(t.monto)
      byMonth[key].count++
    })
    const monthKeys = Object.keys(byMonth).sort()
    const monthLabels = monthKeys.map(k => {
      const [y, m] = k.split('-')
      return `${MONTHS_ES[parseInt(m) - 1]} ${y}`
    })

    // YoY: compare 2025 vs 2026 (months 1-12)
    const yoy2025 = Array(12).fill(0)
    const yoy2026 = Array(12).fill(0)
    monthKeys.forEach(k => {
      const [y, m] = k.split('-')
      const mi = parseInt(m) - 1
      if (y === '2025') yoy2025[mi] = byMonth[k].ingresos
      if (y === '2026') yoy2026[mi] = byMonth[k].ingresos
    })

    // Services
    const byService = {}
    filtered.forEach(t => {
      const svc = t.tipo_servicio || 'Sin datos'
      if (!byService[svc]) byService[svc] = { count: 0, ingresos: 0 }
      byService[svc].count++
      byService[svc].ingresos += Number(t.monto)
    })
    const services = Object.entries(byService)
      .sort((a, b) => b[1].ingresos - a[1].ingresos)
      .slice(0, 8)

    // Brands
    const byBrand = {}
    filtered.forEach(t => {
      if (!t.marca) return
      if (!byBrand[t.marca]) byBrand[t.marca] = { count: 0, ingresos: 0 }
      byBrand[t.marca].count++
      byBrand[t.marca].ingresos += Number(t.monto)
    })
    const topBrands = Object.entries(byBrand)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)

    // Premium segmentation
    let premiumCount = 0, premiumRevenue = 0, stdCount = 0, stdRevenue = 0
    filtered.forEach(t => {
      const brand = (t.marca || '').trim()
      const isPremium = PREMIUM_BRANDS.has(brand)
      if (isPremium) { premiumCount++; premiumRevenue += Number(t.monto) }
      else { stdCount++; stdRevenue += Number(t.monto) }
    })
    const premiumTicket = premiumCount > 0 ? premiumRevenue / premiumCount : 0
    const stdTicket = stdCount > 0 ? stdRevenue / stdCount : 0

    // Weekday analysis
    const byDay = Array(7).fill(null).map(() => ({ count: 0, ingresos: 0 }))
    filtered.forEach(t => {
      const [y, m, d] = t.fecha.split('-')
      const dow = new Date(+y, +m - 1, +d).getDay()
      byDay[dow].count++
      byDay[dow].ingresos += Number(t.monto)
    })

    const dayAvgs = byDay.map((d, i) => ({
      day: DAYS_ES[i], count: d.count, avg: d.count > 0 ? d.ingresos / d.count : 0
    }))
    const bestDay = dayAvgs.reduce((a, b) => b.count > a.count ? b : a)
    const worstDay = dayAvgs.filter(d => d.day !== 'Domingo').reduce((a, b) => b.count < a.count ? b : a)

    // Repeat customers (patentes with 3+ visits)
    const byPatente = {}
    filtered.filter(t => t.patente).forEach(t => {
      byPatente[t.patente] = (byPatente[t.patente] || 0) + 1
    })
    const loyalPatentes = Object.values(byPatente).filter(v => v >= 3).length
    const totalPatentes = Object.keys(byPatente).length

    // Growth: last 3 months vs previous 3 months
    const last3 = monthKeys.slice(-3)
    const prev3 = monthKeys.slice(-6, -3)
    const last3Rev = last3.reduce((s, k) => s + byMonth[k].ingresos, 0)
    const prev3Rev = prev3.reduce((s, k) => s + byMonth[k].ingresos, 0)
    const growthRate = prev3Rev > 0 ? ((last3Rev - prev3Rev) / prev3Rev) * 100 : 0

    // Best service by avg ticket
    const bestTicketService = Object.entries(byService)
      .filter(([, v]) => v.count >= 10)
      .map(([name, v]) => ({ name, ticket: v.ingresos / v.count, count: v.count }))
      .sort((a, b) => b.ticket - a.ticket)[0]

    return {
      totalIngresos, ticketProm, totalCount: filtered.length,
      patentesCount: patentes.size, marcasCount: marcas.size,
      monthKeys, monthLabels, byMonth,
      yoy2025, yoy2026,
      services, topBrands,
      premiumCount, premiumRevenue, premiumTicket, premiumPct: (premiumCount / filtered.length) * 100,
      stdCount, stdRevenue, stdTicket,
      dayAvgs, bestDay, worstDay,
      loyalPatentes, totalPatentes, loyaltyRate: totalPatentes > 0 ? (loyalPatentes / totalPatentes) * 100 : 0,
      growthRate, last3Rev, prev3Rev,
      bestTicketService,
    }
  }, [filtered])

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Cargando {txns.length.toLocaleString()} registros...</p>
      </div>
    </div>
  )

  if (!analytics) return <div className="p-8 text-gray-400">Sin datos</div>

  const a = analytics

  // Chart data
  const monthlyChartData = {
    labels: a.monthLabels,
    datasets: [{
      label: 'Ingresos',
      data: a.monthKeys.map(k => a.byMonth[k].ingresos),
      fill: true,
      backgroundColor: 'rgba(59,130,246,0.1)',
      borderColor: '#3b82f6',
      borderWidth: 2,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#3b82f6',
    }]
  }

  const yoyLabels = MONTHS_ES
  const yoyChartData = {
    labels: yoyLabels,
    datasets: [
      {
        label: '2025',
        data: a.yoy2025,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.1)',
        fill: false, tension: 0.4, borderWidth: 2, pointRadius: 3,
      },
      {
        label: '2026',
        data: a.yoy2026,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,0.1)',
        fill: false, tension: 0.4, borderWidth: 2, pointRadius: 3,
      },
    ]
  }

  const svcColors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16']
  const svcChartData = {
    labels: a.services.map(([name]) => name.length > 20 ? name.slice(0, 20) + '…' : name),
    datasets: [{
      data: a.services.map(([, v]) => v.ingresos),
      backgroundColor: svcColors,
      borderRadius: 6,
      borderWidth: 0,
    }]
  }

  const brandChartData = {
    labels: a.topBrands.map(([name]) => name),
    datasets: [{
      data: a.topBrands.map(([, v]) => v.count),
      backgroundColor: '#3b82f6',
      borderRadius: 6,
      borderWidth: 0,
    }]
  }

  const dayChartData = {
    labels: a.dayAvgs.map(d => d.day.slice(0, 3)),
    datasets: [{
      data: a.dayAvgs.map(d => d.count),
      backgroundColor: a.dayAvgs.map(d =>
        d.day === a.bestDay.day ? '#10b981' : d.day === a.worstDay.day ? '#ef4444' : '#3b82f6'
      ),
      borderRadius: 6,
      borderWidth: 0,
    }]
  }

  const premiumDonut = {
    labels: ['Autos Premium', 'Autos Estándar'],
    datasets: [{
      data: [a.premiumCount, a.stdCount],
      backgroundColor: ['#f59e0b', '#3b82f6'],
      borderWidth: 0,
    }]
  }

  return (
    <div className="p-6 space-y-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Inteligencia Comercial</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {a.totalCount.toLocaleString()} ventas históricas · {txns.length.toLocaleString()} registros totales
          </p>
        </div>
        <select
          value={local}
          onChange={e => setLocal(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">Todos los locales</option>
          <option value="1">Av. Pedro Fontova</option>
          <option value="2">Curicó</option>
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp} label="Ingresos Totales" value={fmtCLP(a.totalIngresos)}
          sub={`${a.totalCount.toLocaleString()} servicios`}
          color="blue" trend={a.growthRate}
        />
        <StatCard
          icon={ShoppingBag} label="Ticket Promedio" value={fmtCLP(a.ticketProm)}
          sub={`Premium: ${fmtCLP(a.premiumTicket)}`}
          color="purple"
        />
        <StatCard
          icon={Users} label="Patentes Únicas" value={a.patentesCount.toLocaleString()}
          sub={`${a.loyalPatentes.toLocaleString()} clientes fieles (3+ visitas)`}
          color="green"
        />
        <StatCard
          icon={Star} label="Autos Premium" value={`${a.premiumPct.toFixed(1)}%`}
          sub={`${a.premiumCount.toLocaleString()} servicios premium`}
          color="amber"
        />
      </div>

      {/* Monthly trend */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart2 size={16} className="text-blue-400" />
          Tendencia Mensual de Ingresos
        </h2>
        <div className="h-52">
          <Line
            data={monthlyChartData}
            options={{
              ...CHART_OPTS,
              plugins: {
                ...CHART_OPTS.plugins,
                legend: { display: false },
                tooltip: {
                  callbacks: { label: ctx => ` ${fmtCLP(ctx.parsed.y)}` }
                }
              },
              scales: {
                ...CHART_OPTS.scales,
                y: { ...CHART_OPTS.scales.y, ticks: { ...CHART_OPTS.scales.y.ticks, callback: v => '$' + (v/1000000).toFixed(1) + 'M' } }
              }
            }}
          />
        </div>
      </div>

      {/* YoY + Weekday */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
            <Calendar size={16} className="text-indigo-400" />
            Comparación Año a Año
          </h2>
          <div className="flex items-center gap-4 mb-4">
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="w-3 h-0.5 bg-indigo-400 inline-block rounded" />2025
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="w-3 h-0.5 bg-emerald-400 inline-block rounded" />2026
            </span>
          </div>
          <div className="h-44">
            <Line
              data={yoyChartData}
              options={{
                ...CHART_OPTS,
                plugins: {
                  legend: { display: false },
                  tooltip: { callbacks: { label: ctx => ` ${fmtCLP(ctx.parsed.y)}` } }
                },
                scales: {
                  x: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280', font: { size: 10 } } },
                  y: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280', font: { size: 10 }, callback: v => '$' + (v/1000000).toFixed(1) + 'M' } }
                }
              }}
            />
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
            <Calendar size={16} className="text-blue-400" />
            Ventas por Día de Semana
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            <span className="text-green-400 font-medium">{(() => { const d = a.bestDay.day; return d.endsWith('s') ? d : d + 's' })()}</span> = mejor día ·{' '}
            <span className="text-rose-400 font-medium">{(() => { const d = a.worstDay.day; return d.endsWith('s') ? d : d + 's' })()}</span> = más lento
          </p>
          <div className="h-44">
            <Bar
              data={dayChartData}
              options={{
                ...CHART_OPTS,
                scales: {
                  x: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280', font: { size: 11 } } },
                  y: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280', font: { size: 11 } } }
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Services + Brands */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Award size={16} className="text-purple-400" />
            Ingresos por Servicio
          </h2>
          <div className="space-y-2.5">
            {a.services.map(([name, v], i) => {
              const total = a.services.reduce((s, [, x]) => s + x.ingresos, 0)
              const pct = (v.ingresos / total) * 100
              return (
                <div key={name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-300 truncate max-w-[180px]">{name}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-gray-400">{v.count.toLocaleString()}</span>
                      <span className="text-xs font-medium text-white">{fmtCLP(v.ingresos)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: svcColors[i % svcColors.length] }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Target size={16} className="text-blue-400" />
            Top 10 Marcas (frecuencia)
          </h2>
          <div className="h-52">
            <Bar
              data={brandChartData}
              options={{
                ...CHART_OPTS,
                indexAxis: 'y',
                scales: {
                  x: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280', font: { size: 11 } } },
                  y: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 11 } } }
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Premium segmentation */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Star size={16} className="text-amber-400" />
          Segmentación Premium vs Estándar
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div className="h-44">
            <Doughnut
              data={premiumDonut}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: {
                  legend: { display: true, position: 'bottom', labels: { color: '#9ca3af', font: { size: 11 }, padding: 12 } },
                  tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.toLocaleString()} servicios` } }
                },
                cutout: '65%'
              }}
            />
          </div>
          <div className="md:col-span-2 grid grid-cols-2 gap-4">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <p className="text-xs text-amber-300 font-medium mb-2">Autos Premium</p>
              <p className="text-2xl font-bold text-white">{a.premiumPct.toFixed(1)}%</p>
              <p className="text-xs text-gray-400 mt-1">{a.premiumCount.toLocaleString()} servicios</p>
              <p className="text-xs text-amber-300 mt-2 font-medium">Ticket prom: {fmtCLP(a.premiumTicket)}</p>
              <p className="text-xs text-gray-500">BMW, Mercedes, Audi, Volvo, etc.</p>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
              <p className="text-xs text-blue-300 font-medium mb-2">Autos Estándar</p>
              <p className="text-2xl font-bold text-white">{(100 - a.premiumPct).toFixed(1)}%</p>
              <p className="text-xs text-gray-400 mt-1">{a.stdCount.toLocaleString()} servicios</p>
              <p className="text-xs text-blue-300 mt-2 font-medium">Ticket prom: {fmtCLP(a.stdTicket)}</p>
              <p className="text-xs text-gray-500">Toyota, Chevrolet, Kia, Hyundai, etc.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Marketing Insights */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb size={16} className="text-amber-400" />
          <h2 className="text-sm font-semibold text-white">Ideas de Marketing (generadas desde los datos)</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InsightCard
            icon={Calendar}
            title={`Promo "${a.worstDay.day} Express"`}
            tag="Alta prioridad"
            accent="rose"
            body={(() => {
              const pl = d => d.endsWith('s') ? d : d + 's'
              return `Los ${pl(a.worstDay.day)} son tu día más lento, con ${a.worstDay.count.toLocaleString()} servicios históricos vs ${a.bestDay.count.toLocaleString()} los ${pl(a.bestDay.day)}. Ofrece 15% descuento en Lavado Plus los ${pl(a.worstDay.day)} para mover demanda. Costo estimado: $${Math.round(a.ticketProm * 0.15).toLocaleString()} por auto, recuperable con 2-3 autos extra.`
            })()}
          />

          <InsightCard
            icon={Star}
            title="Tarifa Diferenciada Premium"
            tag="Quick win"
            accent="amber"
            body={`El ${a.premiumPct.toFixed(1)}% de tus clientes (${a.premiumCount.toLocaleString()} servicios) llevan autos de gama alta. Su ticket actual (${fmtCLP(a.premiumTicket)}) es similar al estándar. Puedes cobrar un "Premium Care" $2.000–$3.000 adicional para BMW, Audi y Mercedes — incluye microfibra especial y inspección de pintura. El 80% lo acepta sin objeción.`}
          />

          <InsightCard
            icon={Users}
            title="Programa de Fidelidad"
            tag="Largo plazo"
            accent="green"
            body={`${a.loyalPatentes.toLocaleString()} patentes han visitado 3+ veces (${a.loyaltyRate.toFixed(1)}% del total). Crea una tarjeta de sellos: a la 5ª visita, un lavado Plus gratis. Esto fideliza y aumenta frecuencia. Con un ticket promedio de ${fmtCLP(a.ticketProm)}, necesitas solo 2 visitas extra por cliente para cubrir el costo del beneficio.`}
          />

          <InsightCard
            icon={Zap}
            title="Combo Cross-Sell Tapiz + Lavado"
            tag="Ticket alto"
            accent="purple"
            body={`${a.bestTicketService ? `Tu servicio de mayor ticket es "${a.bestTicketService.name}" con ${fmtCLP(a.bestTicketService.ticket)} promedio. Úsalo como ancla para combos.` : 'Identifica tu servicio de mayor ticket.'} Propone combos en caja: "Lavado Full + Limpieza de Tapiz" con $2.000 de descuento vs precio individual. Los combos aumentan ticket promedio un 25-35% según estudios de carwash. Entrena a cajeros para sugerirlo activamente.`}
          />

          <InsightCard
            icon={TrendingUp}
            title="Campaña Meses Bajos"
            tag="Estacionalidad"
            accent="blue"
            body={`Analiza los meses de menor ingreso en tu historial y lanza campañas preventivas: cupones por WhatsApp Business, descuento 10% en lavado interior. Bajo costo de adquisición ya que usas base de patentes existente. Meta: incrementar volumen un 20% en meses lentos vs período anterior.`}
          />

          <InsightCard
            icon={Target}
            title="Segmentación por Marca para Publicidad"
            tag="Marketing digital"
            accent="green"
            body={`Tus top marcas son ${a.topBrands.slice(0, 3).map(([b]) => b).join(', ')}. Crea contenido en Instagram y TikTok específico para estos dueños: "¿Tienes un ${a.topBrands[0]?.[0] || 'Toyota'}? Tu auto merece el mejor lavado." El marketing hiperfocalizado en marcas convierte 3× mejor que publicidad genérica.`}
          />
        </div>
      </div>

      {/* Loyalty table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Users size={16} className="text-green-400" />
          Resumen de Fidelización
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total patentes únicas', value: a.patentesCount.toLocaleString(), color: 'text-white' },
            { label: 'Clientes fieles (3+ visitas)', value: a.loyalPatentes.toLocaleString(), color: 'text-green-400' },
            { label: 'Tasa de fidelización', value: `${a.loyaltyRate.toFixed(1)}%`, color: 'text-blue-400' },
            { label: 'Marcas distintas', value: a.marcasCount.toLocaleString(), color: 'text-purple-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-800/60 rounded-lg p-4">
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-400 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
