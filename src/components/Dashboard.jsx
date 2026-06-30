import { useEffect, useState } from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import { supabase } from '../lib/supabase'
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle,
  ArrowUpRight, Building2, Hash, CreditCard, Star,
} from 'lucide-react'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler)

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0)

const SERVICE_COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ec4899','#06b6d4','#ef4444','#84cc16']

function KpiCard({ label, value, sub, icon: Icon, color, subColor }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
        <div className={`p-1.5 rounded-lg ${color === 'text-green-400' ? 'bg-green-900/30' : color === 'text-red-400' ? 'bg-red-900/30' : color === 'text-purple-400' ? 'bg-purple-900/30' : color === 'text-amber-400' ? 'bg-amber-900/30' : 'bg-blue-900/30'}`}>
          <Icon size={14} className={color} />
        </div>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${subColor ?? 'text-gray-500'}`}>{sub}</p>}
    </div>
  )
}

function DeltaBadge({ pct }) {
  if (pct === null || pct === undefined) return null
  const up = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

export default function Dashboard() {
  const [kpis, setKpis] = useState({ ingresos: 0, gastos: 0, utilidad: 0, numServicios: 0, ticketPromedio: 0, mejorDia: null, mejorMonto: 0, deltaIngresos: null, deltaServicios: null })
  const [dailyChart, setDailyChart] = useState(null)
  const [monthlyChart, setMonthlyChart] = useState(null)
  const [weekdayChart, setWeekdayChart] = useState(null)
  const [servicios, setServicios] = useState([])
  const [marcas, setMarcas] = useState([])
  const [billeteraData, setBilleteraData] = useState([])
  const [recentTx, setRecentTx] = useState([])
  const [alert, setAlert] = useState(null)
  const [loading, setLoading] = useState(true)
  const [locales, setLocales] = useState([])
  const [filtroLocal, setFiltroLocal] = useState('')
  const [filtroMes, setFiltroMes] = useState(new Date().toISOString().slice(0, 7))

  useEffect(() => {
    supabase.from('locales').select('*').order('tipo').order('nombre')
      .then(({ data }) => setLocales(data ?? []))
  }, [])

  useEffect(() => {
    loadAll(filtroLocal, filtroMes)

    const sub = supabase
      .channel('dash-' + filtroLocal + '-' + filtroMes)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transacciones_lavado' }, () => loadAll(filtroLocal, filtroMes))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos' }, () => loadAll(filtroLocal, filtroMes))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos_membresia' }, () => loadAll(filtroLocal, filtroMes))
      .subscribe()

    return () => supabase.removeChannel(sub)
  }, [filtroLocal, filtroMes])

  async function loadAll(localId, mes) {
    setLoading(true)
    const [year, month] = mes.split('-').map(Number)
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).toISOString().split('T')[0]
    const daysInMonth = new Date(year, month, 0).getDate()

    const base = (q) => localId ? q.eq('local_id', Number(localId)) : q

    // Mes actual
    const [lavado, membresia, gastos] = await Promise.all([
      base(supabase.from('transacciones_lavado').select('monto, fecha, tipo_servicio, local_id, marca, locales(nombre)')).gte('fecha', firstDay).lte('fecha', lastDay),
      base(supabase.from('pagos_membresia').select('monto, fecha_pago, plan, local_id, locales(nombre)')).gte('fecha_pago', firstDay).lte('fecha_pago', lastDay),
      base(supabase.from('gastos').select('monto, fecha, categorias_gasto(nombre, color), locales(nombre)')).gte('fecha', firstDay).lte('fecha', lastDay),
    ])

    const lavData = lavado.data ?? []
    const memData = membresia.data ?? []
    const gasData = gastos.data ?? []

    const totalIngresos = [...lavData, ...memData].reduce((a, t) => a + Number(t.monto), 0)
    const totalGastos = gasData.reduce((a, g) => a + Number(g.monto), 0)
    const numServicios = lavData.length + memData.length
    const ticketPromedio = numServicios > 0 ? totalIngresos / numServicios : 0

    // Ventas por día
    const byDay = {}
    lavData.forEach(t => { byDay[t.fecha] = (byDay[t.fecha] ?? 0) + Number(t.monto) })
    memData.forEach(t => { byDay[t.fecha_pago] = (byDay[t.fecha_pago] ?? 0) + Number(t.monto) })
    const mejorDia = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0]

    // Breakdown por tipo de servicio (con ticket promedio)
    const byService = {}
    lavData.forEach(t => {
      const s = t.tipo_servicio ?? 'Sin tipo'
      byService[s] = { total: (byService[s]?.total ?? 0) + Number(t.monto), count: (byService[s]?.count ?? 0) + 1 }
    })
    memData.forEach(t => {
      const s = t.plan ?? 'Membresía'
      byService[s] = { total: (byService[s]?.total ?? 0) + Number(t.monto), count: (byService[s]?.count ?? 0) + 1 }
    })
    const sortedServices = Object.entries(byService).sort((a, b) => b[1].total - a[1].total)
    setServicios(sortedServices.map(([name, v], i) => ({
      name, ...v,
      ticket: v.count > 0 ? v.total / v.count : 0,
      color: SERVICE_COLORS[i % SERVICE_COLORS.length],
      pct: totalIngresos > 0 ? (v.total / totalIngresos) * 100 : 0,
    })))

    // Ventas por día de la semana
    const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
    const byWeekday = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 }
    const countWeekday = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 }
    lavData.forEach(t => {
      const d = new Date(t.fecha + 'T12:00:00').getDay()
      byWeekday[d] = (byWeekday[d] ?? 0) + Number(t.monto)
      countWeekday[d] = (countWeekday[d] ?? 0) + 1
    })
    // Ordenar Lun-Dom (1,2,3,4,5,6,0)
    const weekOrder = [1,2,3,4,5,6,0]
    const maxWeekday = Math.max(...weekOrder.map(d => byWeekday[d]))
    setWeekdayChart({
      labels: weekOrder.map(d => DIAS[d]),
      datasets: [{
        label: 'Ventas',
        data: weekOrder.map(d => byWeekday[d]),
        backgroundColor: weekOrder.map(d => byWeekday[d] === maxWeekday ? 'rgba(251,191,36,0.85)' : 'rgba(59,130,246,0.6)'),
        borderRadius: 4,
      }],
      counts: weekOrder.map(d => countWeekday[d]),
    })

    // Mes anterior para deltas
    const prevFirst = new Date(year, month - 2, 1).toISOString().split('T')[0]
    const prevLast = new Date(year, month - 1, 0).toISOString().split('T')[0]
    const [lavPrev, memPrev] = await Promise.all([
      base(supabase.from('transacciones_lavado').select('monto')).gte('fecha', prevFirst).lte('fecha', prevLast),
      base(supabase.from('pagos_membresia').select('monto')).gte('fecha_pago', prevFirst).lte('fecha_pago', prevLast),
    ])
    const prevIngresos = [...(lavPrev.data ?? []), ...(memPrev.data ?? [])].reduce((a, t) => a + Number(t.monto), 0)
    const prevServicios = (lavPrev.data?.length ?? 0) + (memPrev.data?.length ?? 0)
    const deltaIngresos = prevIngresos > 0 ? ((totalIngresos - prevIngresos) / prevIngresos) * 100 : null
    const deltaServicios = prevServicios > 0 ? ((numServicios - prevServicios) / prevServicios) * 100 : null

    setKpis({ ingresos: totalIngresos, gastos: totalGastos, utilidad: totalIngresos - totalGastos, numServicios, ticketPromedio, mejorDia: mejorDia?.[0], mejorMonto: mejorDia?.[1] ?? 0, deltaIngresos, deltaServicios })

    // Gráfico ventas diarias del mes (línea)
    const daysLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1))
    const dailyValues = daysLabels.map(d => {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${d.padStart(2, '0')}`
      return byDay[dateStr] ?? 0
    })

    // Acumulado del mes
    let acc = 0
    const accValues = dailyValues.map(v => { acc += v; return acc })

    setDailyChart({
      labels: daysLabels,
      datasets: [
        {
          label: 'Venta del día',
          data: dailyValues,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: dailyValues.map(v => v > 0 ? 3 : 0),
          pointHoverRadius: 5,
          yAxisID: 'y',
        },
        {
          label: 'Acumulado',
          data: accValues,
          borderColor: '#10b981',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.4,
          borderDash: [4, 3],
          pointRadius: 0,
          yAxisID: 'y1',
        },
      ],
    })

    // Gráfico 6 meses (barras)
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1)
      months.push({ label: d.toLocaleString('es-CL', { month: 'short', year: '2-digit' }), year: d.getFullYear(), month: d.getMonth() + 1 })
    }
    const chartStart = months[0].year + '-' + String(months[0].month).padStart(2, '0') + '-01'
    const [lavAll, memAll, gasAll] = await Promise.all([
      base(supabase.from('transacciones_lavado').select('monto, fecha')).gte('fecha', chartStart),
      base(supabase.from('pagos_membresia').select('monto, fecha_pago')).gte('fecha_pago', chartStart),
      base(supabase.from('gastos').select('monto, fecha')).gte('fecha', chartStart),
    ])
    const ingByM = months.map(m => {
      const lav = (lavAll.data ?? []).filter(t => { const d = new Date(t.fecha); return d.getFullYear() === m.year && d.getMonth() + 1 === m.month }).reduce((a, b) => a + Number(b.monto), 0)
      const mem = (memAll.data ?? []).filter(t => { const d = new Date(t.fecha_pago); return d.getFullYear() === m.year && d.getMonth() + 1 === m.month }).reduce((a, b) => a + Number(b.monto), 0)
      return lav + mem
    })
    const gasByM = months.map(m =>
      (gasAll.data ?? []).filter(t => { const d = new Date(t.fecha); return d.getFullYear() === m.year && d.getMonth() + 1 === m.month }).reduce((a, b) => a + Number(b.monto), 0)
    )
    setMonthlyChart({
      labels: months.map(m => m.label),
      datasets: [
        { label: 'Ingresos', data: ingByM, backgroundColor: 'rgba(59,130,246,0.8)', borderRadius: 4 },
        { label: 'Gastos', data: gasByM, backgroundColor: 'rgba(239,68,68,0.6)', borderRadius: 4 },
      ],
    })

    // Alerta químicos
    const quimicosEste = gasData.filter(g => g.categorias_gasto?.nombre === 'Químicos').reduce((a, b) => a + Number(b.monto), 0)
    if (quimicosEste > 0) {
      const { data: gasAnt } = await base(supabase.from('gastos').select('monto, categorias_gasto(nombre)')).gte('fecha', prevFirst).lte('fecha', prevLast)
      const quimicosPrev = (gasAnt ?? []).filter(g => g.categorias_gasto?.nombre === 'Químicos').reduce((a, b) => a + Number(b.monto), 0)
      if (quimicosPrev > 0) {
        const pct = ((quimicosEste - quimicosPrev) / quimicosPrev) * 100
        setAlert(pct > 10 ? `Gasto en Químicos subió ${pct.toFixed(0)}% vs mes anterior (${fmt(quimicosPrev)} → ${fmt(quimicosEste)})` : null)
      } else setAlert(null)
    } else setAlert(null)

    // Últimas transacciones
    const txLav = lavData.slice(-5).map(t => ({ desc: t.tipo_servicio ?? 'Lavado', local: t.locales?.nombre ?? '—', monto: Number(t.monto), fecha: t.fecha, color: 'text-green-400' }))
    const txGas = gasData.slice(-3).map(g => ({ desc: g.categorias_gasto?.nombre ?? 'Gasto', local: g.locales?.nombre ?? 'General', monto: -Number(g.monto), fecha: g.fecha, color: 'text-red-400' }))
    setRecentTx([...txLav, ...txGas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 6))

    // Ranking de marcas
    const byMarca = {}
    lavData.forEach(t => { if (t.marca) byMarca[t.marca] = (byMarca[t.marca] ?? 0) + 1 })
    const sortedMarcas = Object.entries(byMarca).sort((a, b) => b[1] - a[1])
    const totalMarcasCount = sortedMarcas.reduce((a, [, c]) => a + c, 0)
    setMarcas(sortedMarcas.slice(0, 8).map(([name, count], i) => ({
      name, count,
      pct: totalMarcasCount > 0 ? (count / totalMarcasCount) * 100 : 0,
      color: SERVICE_COLORS[i % SERVICE_COLORS.length],
    })))

    // Balance por billetera
    const { data: movData } = await base(supabase.from('movimientos_caja').select('monto, billetera, tipo')).gte('fecha', firstDay).lte('fecha', lastDay)
    const byBilletera = {}
    ;(movData ?? []).forEach(m => {
      if (m.tipo === 'ingreso' && m.billetera) byBilletera[m.billetera] = (byBilletera[m.billetera] ?? 0) + Number(m.monto)
    })
    const totalBilletera = Object.values(byBilletera).reduce((a, b) => a + b, 0)
    const BILL_COLORS = { 'Debito': '#3b82f6', 'Credito': '#8b5cf6', 'Efectivo': '#10b981', 'transferencia': '#f59e0b', 'Transferencia': '#f59e0b' }
    setBilleteraData(Object.entries(byBilletera).sort((a, b) => b[1] - a[1]).map(([name, monto], i) => ({
      name, monto,
      pct: totalBilletera > 0 ? (monto / totalBilletera) * 100 : 0,
      color: BILL_COLORS[name] || SERVICE_COLORS[i],
    })))

    setLoading(false)
  }

  const localSeleccionado = locales.find(l => String(l.id) === filtroLocal)
  const mesLabel = new Date(filtroMes + '-15').toLocaleString('es-CL', { month: 'long', year: 'numeric' })

  const dailyOpts = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#9ca3af', font: { size: 11 }, boxWidth: 12 } },
      tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.raw)}` } },
    },
    scales: {
      x: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: '#1f2937' } },
      y: { ticks: { color: '#6b7280', callback: v => fmt(v), font: { size: 10 } }, grid: { color: '#1f2937' }, title: { display: true, text: 'Día', color: '#4b5563', font: { size: 10 } } },
      y1: { position: 'right', ticks: { color: '#10b981', callback: v => fmt(v), font: { size: 10 } }, grid: { drawOnChartArea: false } },
    },
  }

  const monthlyOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#9ca3af', font: { size: 11 }, boxWidth: 12 } },
      tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.raw)}` } },
    },
    scales: {
      x: { ticks: { color: '#6b7280' }, grid: { color: '#1f2937' } },
      y: { ticks: { color: '#6b7280', callback: v => fmt(v) }, grid: { color: '#1f2937' } },
    },
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Dashboard</h2>
          <p className="text-sm text-gray-400 capitalize">
            {mesLabel}{localSeleccionado ? ` · ${localSeleccionado.nombre}` : ' · Todos los locales'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={filtroMes}
            onChange={e => setFiltroMes(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <Building2 size={14} className="text-gray-500 ml-1" />
          <select
            value={filtroLocal}
            onChange={e => setFiltroLocal(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Todos los locales</option>
            <optgroup label="── Propios">
              {locales.filter(l => l.tipo === 'propio').map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </optgroup>
            <optgroup label="── Subarrendados">
              {locales.filter(l => l.tipo === 'subarrendado').map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </optgroup>
          </select>
        </div>
      </div>

      {alert && (
        <div className="flex items-start gap-3 bg-amber-900/20 border border-amber-800/50 rounded-xl p-3">
          <AlertTriangle size={15} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-300">{alert}</p>
        </div>
      )}

      {/* KPIs — 5 tarjetas */}
      <div className="grid grid-cols-5 gap-3">
        <div className="col-span-1 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-start justify-between mb-2">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Ingresos</p>
            <TrendingUp size={14} className="text-green-400" />
          </div>
          <p className="text-xl font-bold text-green-400">{fmt(kpis.ingresos)}</p>
          <div className="mt-1"><DeltaBadge pct={kpis.deltaIngresos} /></div>
        </div>

        <div className="col-span-1 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-start justify-between mb-2">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Servicios</p>
            <Hash size={14} className="text-blue-400" />
          </div>
          <p className="text-xl font-bold text-blue-400">{kpis.numServicios.toLocaleString('es-CL')}</p>
          <div className="mt-1"><DeltaBadge pct={kpis.deltaServicios} /></div>
        </div>

        <div className="col-span-1 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-start justify-between mb-2">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Ticket prom.</p>
            <CreditCard size={14} className="text-purple-400" />
          </div>
          <p className="text-xl font-bold text-purple-400">{fmt(kpis.ticketPromedio)}</p>
          <p className="text-xs text-gray-500 mt-1">por servicio</p>
        </div>

        <div className="col-span-1 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-start justify-between mb-2">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Gastos</p>
            <TrendingDown size={14} className="text-red-400" />
          </div>
          <p className="text-xl font-bold text-red-400">{fmt(kpis.gastos)}</p>
          <p className="text-xs text-gray-500 mt-1">registrados</p>
        </div>

        <div className="col-span-1 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-start justify-between mb-2">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Utilidad</p>
            <DollarSign size={14} className={kpis.utilidad >= 0 ? 'text-blue-400' : 'text-red-400'} />
          </div>
          <p className={`text-xl font-bold ${kpis.utilidad >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{fmt(kpis.utilidad)}</p>
          {kpis.ingresos > 0 && <p className="text-xs text-gray-500 mt-1">margen {((kpis.utilidad / kpis.ingresos) * 100).toFixed(1)}%</p>}
        </div>
      </div>

      {/* Mejor día */}
      {kpis.mejorDia && (
        <div className="flex items-center gap-2 bg-amber-900/10 border border-amber-900/30 rounded-xl px-4 py-2.5">
          <Star size={13} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">
            Mejor día del mes: <span className="font-semibold">{new Date(kpis.mejorDia + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}</span> con <span className="font-semibold">{fmt(kpis.mejorMonto)}</span>
          </p>
        </div>
      )}

      {/* Ventas diarias + Breakdown servicios */}
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Ventas por día <span className="text-gray-500 font-normal">· venta diaria y acumulado</span></h3>
          <div className="h-52">
            {dailyChart
              ? <Line data={dailyChart} options={dailyOpts} />
              : <div className="flex items-center justify-center h-full"><p className="text-gray-500 text-sm">Cargando...</p></div>
            }
          </div>
        </div>

        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Ranking de servicios</h3>
          {servicios.length === 0 ? (
            <p className="text-gray-500 text-sm">Sin datos.</p>
          ) : (
            <div className="space-y-3">
              {servicios.slice(0, 6).map((s) => (
                <div key={s.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-xs text-gray-300 truncate">{s.name}</span>
                      <span className="text-xs text-gray-600">({s.count})</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <span className="text-xs text-gray-500">{s.pct.toFixed(0)}%</span>
                      <span className="text-xs font-medium text-gray-200">{fmt(s.total)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                    </div>
                    <span className="text-xs text-gray-600 shrink-0 w-20 text-right">⌀ {fmt(s.ticket)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Día de semana + 6 meses */}
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-1">Ventas por día de semana</h3>
          <p className="text-xs text-gray-500 mb-4">El día destacado es el de mayor venta</p>
          <div className="h-44">
            {weekdayChart ? (
              <Bar data={weekdayChart} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: { callbacks: {
                    label: (ctx) => ` ${fmt(ctx.raw)}`,
                    afterLabel: (ctx) => ` ${weekdayChart.counts[ctx.dataIndex]} servicios`,
                  }},
                },
                scales: {
                  x: { ticks: { color: '#9ca3af', font: { size: 11 } }, grid: { color: '#1f2937' } },
                  y: { ticks: { color: '#6b7280', callback: v => fmt(v), font: { size: 10 } }, grid: { color: '#1f2937' } },
                },
              }} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500 text-sm">Cargando...</p>
              </div>
            )}
          </div>
        </div>

        <div className="col-span-3 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Ingresos vs Gastos <span className="text-gray-500 font-normal">· últimos 6 meses</span></h3>
          <div className="h-44">
            {monthlyChart
              ? <Bar data={monthlyChart} options={monthlyOpts} />
              : <div className="flex items-center justify-center h-full"><p className="text-gray-500 text-sm">Cargando...</p></div>
            }
          </div>
        </div>
      </div>

      {/* Ranking marcas + Balance billetera */}
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Ranking de marcas <span className="text-gray-500 font-normal">· por nº de lavados</span></h3>
          {marcas.length === 0 ? (
            <p className="text-gray-500 text-sm">Sin datos. Importa el CSV de Ventas.</p>
          ) : (
            <div className="space-y-2.5">
              {marcas.map((m, i) => (
                <div key={m.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs text-gray-600 w-4 shrink-0">{i + 1}.</span>
                      <span className="text-xs text-gray-300 truncate font-medium">{m.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-xs text-gray-500">{m.pct.toFixed(0)}%</span>
                      <span className="text-xs font-semibold text-gray-200 w-5 text-right">{m.count}</span>
                    </div>
                  </div>
                  <div className="bg-gray-800 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full" style={{ width: `${m.pct}%`, backgroundColor: m.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="col-span-3 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Balance por billetera <span className="text-gray-500 font-normal">· medio de pago</span></h3>
          {billeteraData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-28 text-center">
              <p className="text-gray-500 text-sm">Sin datos de medios de pago.</p>
              <p className="text-xs text-gray-600 mt-1">Importa el CSV de Movimientos Caja en Ingresos.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {billeteraData.map((b) => (
                <div key={b.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                      <span className="text-xs text-gray-300 capitalize">{b.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{b.pct.toFixed(1)}%</span>
                      <span className="text-xs font-medium text-gray-200">{fmt(b.monto)}</span>
                    </div>
                  </div>
                  <div className="bg-gray-800 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full" style={{ width: `${b.pct}%`, backgroundColor: b.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Últimas transacciones */}
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-5 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Últimas transacciones</h3>
          {loading ? <p className="text-gray-500 text-sm">Cargando...</p> : recentTx.length === 0 ? (
            <p className="text-gray-500 text-sm">Sin transacciones.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {recentTx.map((tx, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-5 h-5 rounded-full bg-gray-800 flex items-center justify-center shrink-0">
                      <ArrowUpRight size={9} className={tx.color} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-200 truncate">{tx.desc}</p>
                      <p className="text-xs text-gray-500 truncate">{tx.local} · {tx.fecha}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold shrink-0 ml-2 ${tx.color}`}>
                    {tx.monto < 0 ? '-' : '+'}{fmt(Math.abs(tx.monto))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
