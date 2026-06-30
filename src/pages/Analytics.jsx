import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import {
  TrendingUp, TrendingDown, Zap, Target, Star, Users,
  Calendar, Award, Lightbulb, BarChart2, ShoppingBag, ArrowRight
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

    // ── Same-period YoY comparison: H1 2025 vs H1 2026 ──
    const h1_2025 = filtered.filter(t => t.fecha >= '2025-01-01' && t.fecha <= '2025-06-30')
    const h1_2026 = filtered.filter(t => t.fecha >= '2026-01-01' && t.fecha <= '2026-06-30')

    function periodMetrics(rows) {
      const rev = rows.reduce((s, t) => s + Number(t.monto), 0)
      const count = rows.length
      const svcMap = {}
      const brandMap = {}
      const dayMap = Array(7).fill(null).map(() => ({ count: 0 }))
      rows.forEach(t => {
        const s = t.tipo_servicio || 'Sin datos'
        if (!svcMap[s]) svcMap[s] = { count: 0, ingresos: 0 }
        svcMap[s].count++; svcMap[s].ingresos += Number(t.monto)
        if (t.marca) { brandMap[t.marca] = (brandMap[t.marca] || 0) + 1 }
        const [y, mo, d] = t.fecha.split('-')
        const dow = new Date(+y, +mo - 1, +d).getDay()
        dayMap[dow].count++
      })
      const patMap = {}
      rows.filter(t => t.patente).forEach(t => { patMap[t.patente] = (patMap[t.patente] || 0) + 1 })
      return { rev, count, ticket: count > 0 ? rev / count : 0, svcMap, brandMap, dayMap, patMap }
    }

    const pm25 = periodMetrics(h1_2025)
    const pm26 = periodMetrics(h1_2026)

    // Service growth: compare top services H1 2026 vs H1 2025
    const svcGrowth = Object.entries(pm26.svcMap)
      .map(([name, v26]) => {
        const v25 = pm25.svcMap[name] || { count: 0, ingresos: 0 }
        const revGrowth = v25.ingresos > 0 ? ((v26.ingresos - v25.ingresos) / v25.ingresos) * 100 : null
        const cntGrowth = v25.count > 0 ? ((v26.count - v25.count) / v25.count) * 100 : null
        return { name, count26: v26.count, rev26: v26.ingresos, count25: v25.count, rev25: v25.ingresos, revGrowth, cntGrowth }
      })
      .filter(s => s.count26 >= 20)
      .sort((a, b) => b.rev26 - a.rev26)
      .slice(0, 8)

    // Brand growth
    const brandGrowth = Object.entries(pm26.brandMap)
      .map(([brand, c26]) => ({ brand, c26, c25: pm25.brandMap[brand] || 0, growth: pm25.brandMap[brand] ? ((c26 - pm25.brandMap[brand]) / pm25.brandMap[brand]) * 100 : null }))
      .filter(b => b.c26 >= 15)
      .sort((a, b) => b.c26 - a.c26)
      .slice(0, 8)

    // Day comparison
    const dayComparison = DAYS_ES.map((day, i) => ({
      day,
      count25: pm25.dayMap[i].count,
      count26: pm26.dayMap[i].count,
      growth: pm25.dayMap[i].count > 0 ? ((pm26.dayMap[i].count - pm25.dayMap[i].count) / pm25.dayMap[i].count) * 100 : null,
    }))

    // New patentes in H1 2026 that didn't visit in H1 2025
    const pat25Set = new Set(Object.keys(pm25.patMap))
    const newPat26 = Object.keys(pm26.patMap).filter(p => !pat25Set.has(p)).length
    const retainedPat = Object.keys(pm26.patMap).filter(p => pat25Set.has(p)).length

    const periodComp = {
      pm25, pm26,
      revGrowth: pm25.rev > 0 ? ((pm26.rev - pm25.rev) / pm25.rev) * 100 : 0,
      cntGrowth: pm25.count > 0 ? ((pm26.count - pm25.count) / pm25.count) * 100 : 0,
      ticketGrowth: pm25.ticket > 0 ? ((pm26.ticket - pm25.ticket) / pm25.ticket) * 100 : 0,
      svcGrowth, brandGrowth, dayComparison,
      newPat26, retainedPat,
    }

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
      bestTicketService, periodComp,
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

      {/* ── MISMO PERÍODO: H1 2025 vs H1 2026 ── */}
      {a.periodComp && (() => {
        const pc = a.periodComp
        const { pm25, pm26, revGrowth, cntGrowth, ticketGrowth, svcGrowth, brandGrowth, dayComparison, newPat26, retainedPat } = pc
        const rising = svcGrowth.filter(s => s.revGrowth !== null && s.revGrowth > 15).slice(0, 3)
        const declining = svcGrowth.filter(s => s.revGrowth !== null && s.revGrowth < -5).slice(0, 2)
        const bestGrowthDay = [...dayComparison].filter(d => d.growth !== null && d.day !== 'Domingo').sort((a, b) => b.growth - a.growth)[0]
        const worstGrowthDay = [...dayComparison].filter(d => d.growth !== null && d.day !== 'Domingo').sort((a, b) => a.growth - b.growth)[0]
        const pl = d => d.endsWith('s') ? d : d + 's'
        return (
          <div className="space-y-5">
            {/* Section header */}
            <div className="flex items-center gap-3 pt-2">
              <div className="h-px flex-1 bg-gray-800" />
              <div className="flex items-center gap-2 text-xs text-gray-400 font-medium uppercase tracking-widest">
                <Calendar size={13} className="text-indigo-400" />
                Análisis Mismo Período · Ene–Jun 2025 vs Ene–Jun 2026
              </div>
              <div className="h-px flex-1 bg-gray-800" />
            </div>

            {/* Period KPIs */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Ingresos', v25: fmtCLP(pm25.rev), v26: fmtCLP(pm26.rev), growth: revGrowth },
                { label: 'Servicios', v25: pm25.count.toLocaleString(), v26: pm26.count.toLocaleString(), growth: cntGrowth },
                { label: 'Ticket prom.', v25: fmtCLP(pm25.ticket), v26: fmtCLP(pm26.ticket), growth: ticketGrowth },
              ].map(({ label, v25, v26, growth }) => (
                <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-3">{label}</p>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-gray-500">{v25}</span>
                    <ArrowRight size={12} className="text-gray-600 shrink-0" />
                    <span className="text-sm font-bold text-white">{v26}</span>
                  </div>
                  <span className={`text-xs font-semibold flex items-center gap-1 ${growth >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                    {growth >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {growth >= 0 ? '+' : ''}{growth.toFixed(1)}% vs mismo período 2025
                  </span>
                </div>
              ))}
            </div>

            {/* Service comparison table */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart2 size={15} className="text-indigo-400" />
                Servicios: Ene–Jun 2025 vs Ene–Jun 2026
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left pb-2 font-medium">Servicio</th>
                      <th className="text-right pb-2 font-medium">2025</th>
                      <th className="text-right pb-2 font-medium">2026</th>
                      <th className="text-right pb-2 font-medium">Δ Ingresos</th>
                      <th className="text-right pb-2 font-medium">Δ Vol.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {svcGrowth.map(s => (
                      <tr key={s.name} className="hover:bg-gray-800/30">
                        <td className="py-2 pr-4 text-gray-300 max-w-[160px] truncate">{s.name}</td>
                        <td className="py-2 text-right text-gray-400">{fmtCLP(s.rev25)}</td>
                        <td className="py-2 text-right text-white font-medium">{fmtCLP(s.rev26)}</td>
                        <td className="py-2 text-right">
                          {s.revGrowth !== null ? (
                            <span className={`font-medium ${s.revGrowth >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                              {s.revGrowth >= 0 ? '+' : ''}{s.revGrowth.toFixed(0)}%
                            </span>
                          ) : <span className="text-gray-600">nuevo</span>}
                        </td>
                        <td className="py-2 text-right">
                          {s.cntGrowth !== null ? (
                            <span className={`${s.cntGrowth >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                              {s.cntGrowth >= 0 ? '+' : ''}{s.cntGrowth.toFixed(0)}%
                            </span>
                          ) : <span className="text-blue-400">nuevo</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Day comparison + Brand growth */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Day comparison */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Calendar size={15} className="text-blue-400" />
                  Día de semana: crecimiento vs 2025
                </h3>
                <div className="space-y-2">
                  {dayComparison.filter(d => d.day !== 'Domingo').map(d => (
                    <div key={d.day} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-20 shrink-0">{pl(d.day)}</span>
                      <div className="flex-1 h-5 bg-gray-800 rounded-full overflow-hidden relative">
                        <div
                          className={`h-full rounded-full ${(d.growth ?? 0) >= 0 ? 'bg-green-500/70' : 'bg-rose-500/70'}`}
                          style={{ width: `${Math.min(Math.abs(d.growth ?? 0), 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium w-14 text-right shrink-0 ${(d.growth ?? 0) >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                        {d.growth !== null ? `${d.growth >= 0 ? '+' : ''}${d.growth.toFixed(0)}%` : '—'}
                      </span>
                      <span className="text-xs text-gray-500 w-20 text-right shrink-0">{d.count25} → {d.count26}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top brand growth */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Target size={15} className="text-purple-400" />
                  Marcas: volumen mismo período
                </h3>
                <div className="space-y-2">
                  {brandGrowth.map(b => (
                    <div key={b.brand} className="flex items-center justify-between">
                      <span className="text-xs text-gray-300 w-24 truncate">{b.brand}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{b.c25} → {b.c26}</span>
                        {b.growth !== null ? (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${b.growth >= 0 ? 'bg-green-500/15 text-green-400' : 'bg-rose-500/15 text-rose-400'}`}>
                            {b.growth >= 0 ? '+' : ''}{b.growth.toFixed(0)}%
                          </span>
                        ) : <span className="text-xs text-blue-400 px-2 py-0.5 rounded-full bg-blue-500/15">nuevo</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Customer retention */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Users size={15} className="text-green-400" />
                Clientes: retención y nuevos Ene–Jun 2026 vs Ene–Jun 2025
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-400">{retainedPat.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-1">Clientes retenidos</p>
                  <p className="text-xs text-gray-500">visitaron en ambos períodos</p>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-400">{newPat26.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-1">Clientes nuevos 2026</p>
                  <p className="text-xs text-gray-500">no visitaron en H1 2025</p>
                </div>
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-purple-400">
                    {pm25.count > 0 ? Math.round((retainedPat / Object.keys(pm25.patMap).length) * 100) : 0}%
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Tasa retención</p>
                  <p className="text-xs text-gray-500">de H1 2025 volvió en 2026</p>
                </div>
              </div>
            </div>

            {/* Actionable insights from comparison */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest font-medium mb-3 flex items-center gap-2">
                <Lightbulb size={12} className="text-amber-400" />
                Qué repetir y mejorar este semestre
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rising.length > 0 && (
                  <InsightCard
                    icon={TrendingUp}
                    title={`Potenciar "${rising[0].name}"`}
                    tag="En alza"
                    accent="green"
                    body={`Este servicio creció ${rising[0].revGrowth?.toFixed(0)}% en ingresos vs el mismo período 2025 (de ${fmtCLP(rising[0].rev25)} a ${fmtCLP(rising[0].rev26)}). Repite lo que funcionó: ¿hubo promo especial? ¿lo incluiste como combo? Consolídalo como tu estrella y agrégalo al material de publicidad.`}
                  />
                )}
                {rising.length > 1 && (
                  <InsightCard
                    icon={Zap}
                    title={`"${rising[1].name}" sigue creciendo`}
                    tag="En alza"
                    accent="blue"
                    body={`+${rising[1].revGrowth?.toFixed(0)}% vs H1 2025. Considera crear un pack mensual alrededor de este servicio. Si atrae clientes por primera vez, asegúrate de que el proceso de atención sea impecable para fidelizarlos.`}
                  />
                )}
                {bestGrowthDay && (
                  <InsightCard
                    icon={Calendar}
                    title={`Los ${pl(bestGrowthDay.day)} crecieron más`}
                    tag="Día estrella"
                    accent="green"
                    body={`${pl(bestGrowthDay.day)} creció ${bestGrowthDay.growth?.toFixed(0)}% en volumen (${bestGrowthDay.count25} → ${bestGrowthDay.count26} servicios). ¿Qué pasó ese día? Si hay algo que lo explique (promo, redes sociales, nuevo personal), repítelo. Considera agregar un turno o abrir más temprano.`}
                  />
                )}
                {worstGrowthDay && (worstGrowthDay.growth ?? 0) < 0 && (
                  <InsightCard
                    icon={TrendingDown}
                    title={`Los ${pl(worstGrowthDay.day)} bajaron`}
                    tag="Recuperar"
                    accent="rose"
                    body={`${pl(worstGrowthDay.day)} cayó ${Math.abs(worstGrowthDay.growth ?? 0).toFixed(0)}% vs H1 2025 (${worstGrowthDay.count25} → ${worstGrowthDay.count26} servicios). Lanza una promo específica: "Flash ${worstGrowthDay.day} — 10% off en Lavado Plus". Meta: recuperar al menos el nivel de 2025 en 30 días.`}
                  />
                )}
                {declining.length > 0 && (
                  <InsightCard
                    icon={Target}
                    title={`Revisar "${declining[0].name}"`}
                    tag="En baja"
                    accent="amber"
                    body={`Cayó ${Math.abs(declining[0].revGrowth ?? 0).toFixed(0)}% vs H1 2025 (${fmtCLP(declining[0].rev25)} → ${fmtCLP(declining[0].rev26)}). Analiza si el precio subió, si hay competencia directa, o si el servicio dejó de incluirse en combos. Considera un descuento temporal para reactivar demanda.`}
                  />
                )}
                <InsightCard
                  icon={Users}
                  title="Foco en retención"
                  tag="Clientes"
                  accent="purple"
                  body={`De los clientes de H1 2025, ${retainedPat.toLocaleString()} volvieron en H1 2026 (${pm25.count > 0 ? Math.round((retainedPat / Object.keys(pm25.patMap).length) * 100) : 0}% retención). Los ${newPat26.toLocaleString()} clientes nuevos son una oportunidad: si logras que vuelvan 2-3 veces más, tu base crece de forma sostenida. Implementa recordatorio por WhatsApp a los 30 días de su última visita.`}
                />
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
