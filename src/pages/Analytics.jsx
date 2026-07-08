import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import {
  TrendingUp, TrendingDown, Zap, Target, Star, Users,
  Calendar, Award, Lightbulb, BarChart2, ShoppingBag, ArrowRight, Building2,
  Megaphone, Activity, Clock, AlertTriangle, Crown, UserX, UserPlus, RefreshCw
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
const MONTHS_ES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function fmtCLP(n) {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

// Orden canónico de servicios base (determina qué va primero cuando hay combos)
const SVC_BASE_ORDER = [
  'lavado full','lavado plus','lavado por fuera',
  'lavado de motor con vapor + pulverizado','lavado de motor con vapor',
  'lavado de chasis + ducha grafitada','membresía full','membresía simple',
  'detailing interior','limpieza tapiz','pulido completo basico',
  'pulido de focos + sellante','pulido por pieza','grabado de patentes',
  'desabolladura en frio','eliminado de rayones','desbarre','alfombra',
  'sellado ceramico','abrillantado de carrocería',
]
const SVC_CANONICAL = {
  'lavado full':'Lavado full','lavado plus':'Lavado Plus',
  'lavado por fuera':'Lavado por fuera',
  'lavado de motor con vapor':'Lavado de motor con vapor',
  'lavado de motor con vapor + pulverizado':'Lavado de motor con vapor + pulverizado',
  'lavado de chasis + ducha grafitada':'Lavado de chasis + ducha grafitada',
  'membresía full':'Membresía Full','membresía simple':'Membresía simple',
  'detailing interior':'Detailing interior','limpieza tapiz':'Limpieza Tapiz',
  'pulido completo basico':'Pulido completo basico',
  'pulido de focos + sellante':'Pulido de focos + sellante',
  'pulido por pieza':'Pulido por pieza','grabado de patentes':'Grabado de patentes',
  'desabolladura en frio':'Desabolladura en frio','desbarre':'Desbarre',
  'alfombra':'Alfombra','eliminado de rayones':'Eliminado de rayones',
  'sellado ceramico':'Sellado ceramico','abrillantado de carrocería':'Abrillantado de carrocería',
  'bebestible':'Bebestible','bebida caliente':'Bebida caliente',
  'pino aromatico':'Pino aromatico','aromatizante':'Aromatizante',
  'aromatizante little joe':'Aromatizante Little Joe',
  'cera carnauba':'Cera carnauba','cera aerosol':'Cera aerosol','cera sonax':'Cera Sonax',
  'plumillas':'Plumillas','pelo extra':'Pelo extra',
  'limpia parabrisa':'Limpia parabrisa',
  'descontaminación de ductos de aire':'Descontaminación de ductos de aire',
}
function normalizeServicio(raw) {
  if (!raw) return 'Sin datos'
  const capFirst = s => s.charAt(0).toUpperCase() + s.slice(1)
  const parts = raw.split(/\s*\|\s*/).map(p => p.trim().toLowerCase()).filter(Boolean)
  const seen = new Set()
  const unique = parts.filter(p => !seen.has(p) && seen.add(p))
  unique.sort((a, b) => {
    const ia = SVC_BASE_ORDER.indexOf(a), ib = SVC_BASE_ORDER.indexOf(b)
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
  })
  return unique.map(p => SVC_CANONICAL[p] || capFirst(p)).join(' | ')
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

function AdInsightCard({ icon: Icon, title, body, accion, prioridad, canal, copy, accent = 'blue' }) {
  const accentMap = {
    blue:   { border: 'border-blue-500/30',   icon: 'text-blue-400 bg-blue-500/10' },
    green:  { border: 'border-green-500/30',  icon: 'text-green-400 bg-green-500/10' },
    amber:  { border: 'border-amber-500/30',  icon: 'text-amber-400 bg-amber-500/10' },
    rose:   { border: 'border-rose-500/30',   icon: 'text-rose-400 bg-rose-500/10' },
    purple: { border: 'border-purple-500/30', icon: 'text-purple-400 bg-purple-500/10' },
  }
  const { border, icon: iconCls } = accentMap[accent] || accentMap.blue
  const priCls = prioridad === 'Alta' ? 'bg-rose-500/20 text-rose-300' : prioridad === 'Media' ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-700 text-gray-400'
  return (
    <div className={`bg-gray-900 border ${border} rounded-xl p-5 flex flex-col gap-3`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconCls}`}>
          <Icon size={15} />
        </div>
        <div>
          <p className="text-sm font-semibold text-white leading-tight">{title}</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">{body}</p>
        </div>
      </div>
      <div className="border-t border-gray-800 pt-3 space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide w-16 shrink-0 pt-0.5">Acción</span>
          <span className="text-xs text-gray-200">{accion}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide w-16 shrink-0">Prioridad</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priCls}`}>{prioridad}</span>
          <span className="text-[10px] text-gray-500 uppercase tracking-wide ml-1 shrink-0">Canal</span>
          <span className="text-xs text-gray-300">{canal}</span>
        </div>
        {copy && (
          <div className="flex items-start gap-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide w-16 shrink-0 pt-0.5">Copy</span>
            <span className="text-xs text-gray-300 italic border-l-2 border-gray-700 pl-2 leading-relaxed">{copy}</span>
          </div>
        )}
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
  const [intelMonth, setIntelMonth] = useState(null)

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
      const svc = normalizeServicio(t.tipo_servicio)
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

    // ── Shared helpers for MoM comparison ──
    function monthMetrics(rows) {
      const rev = rows.reduce((s, t) => s + Number(t.monto), 0)
      const count = rows.length
      const svcMap = {}
      const dowMap = Array(7).fill(null).map(() => ({ count: 0 }))
      rows.forEach(t => {
        const s = normalizeServicio(t.tipo_servicio)
        if (!svcMap[s]) svcMap[s] = { count: 0, ingresos: 0 }
        svcMap[s].count++; svcMap[s].ingresos += Number(t.monto)
        const [y, mo, d] = t.fecha.split('-')
        dowMap[new Date(+y, +mo - 1, +d).getDay()].count++
      })
      const patMap = {}
      rows.filter(t => t.patente).forEach(t => { patMap[t.patente] = (patMap[t.patente] || 0) + 1 })
      return { rev, count, ticket: count > 0 ? rev / count : 0, svcMap, dowMap, patMap }
    }

    function buildLocalMoM(localRows) {
      const byMonth = {}
      localRows.forEach(t => {
        const k = t.fecha.slice(0, 7)
        if (!byMonth[k]) byMonth[k] = []
        byMonth[k].push(t)
      })
      const months = Object.keys(byMonth).sort()
      if (months.length < 2) return null
      const mCur  = months[months.length - 1]
      const mPrev = months[months.length - 2]
      const dCur  = monthMetrics(byMonth[mCur])
      const dPrev = monthMetrics(byMonth[mPrev])

      // Service comparison
      const allS = new Set([...Object.keys(dCur.svcMap), ...Object.keys(dPrev.svcMap)])
      const svcComp = [...allS].map(name => {
        const c = dCur.svcMap[name]  || { count: 0, ingresos: 0 }
        const p = dPrev.svcMap[name] || { count: 0, ingresos: 0 }
        return { name, curCount: c.count, curRev: c.ingresos, prevCount: p.count, prevRev: p.ingresos,
          delta: p.count > 0 ? ((c.count - p.count) / p.count) * 100 : null }
      }).filter(s => s.curCount >= 2 || s.prevCount >= 2).sort((a, b) => b.curRev - a.curRev).slice(0, 10)

      const missedOpps = svcComp.filter(s => s.delta !== null && s.delta < -10 && s.prevCount >= 4)
        .sort((a, b) => a.delta - b.delta).slice(0, 3)
      const rising = svcComp.filter(s => s.delta !== null && s.delta > 15 && s.curCount >= 4)
        .sort((a, b) => b.delta - a.delta).slice(0, 2)

      // Day-of-week normalized
      function dowOcc(yk) {
        const [y, m] = yk.split('-').map(Number)
        const occ = Array(7).fill(0)
        const days = new Date(y, m, 0).getDate()
        for (let d = 1; d <= days; d++) occ[new Date(y, m - 1, d).getDay()]++
        return occ
      }
      const occC = dowOcc(mCur); const occP = dowOcc(mPrev)
      const dowComp = DAYS_ES.map((day, i) => {
        const curAvg  = occC[i] > 0 ? dCur.dowMap[i].count  / occC[i] : 0
        const prevAvg = occP[i] > 0 ? dPrev.dowMap[i].count / occP[i] : 0
        return { day, curAvg, prevAvg, delta: prevAvg > 0 ? ((curAvg - prevAvg) / prevAvg) * 100 : null }
      })

      // Retention
      const prevPats = new Set(Object.keys(dPrev.patMap))
      const curPatKeys = Object.keys(dCur.patMap)
      const retained = curPatKeys.filter(p => prevPats.has(p)).length
      const newPat   = curPatKeys.filter(p => !prevPats.has(p)).length
      const retPct   = Object.keys(dPrev.patMap).length > 0
        ? Math.round((retained / Object.keys(dPrev.patMap).length) * 100) : 0

      const trend = months.map(k => ({
        label: MONTHS_ES_FULL[parseInt(k.slice(5)) - 1].slice(0, 3) + ' ' + k.slice(2, 4),
        count: byMonth[k].length,
        rev: byMonth[k].reduce((s, t) => s + Number(t.monto), 0),
      }))

      return {
        mCur, mPrev,
        labelCur:  MONTHS_ES_FULL[parseInt(mCur.slice(5))  - 1] + ' ' + mCur.slice(0, 4),
        labelPrev: MONTHS_ES_FULL[parseInt(mPrev.slice(5)) - 1] + ' ' + mPrev.slice(0, 4),
        dCur, dPrev,
        revDelta:    dPrev.rev    > 0 ? ((dCur.rev    - dPrev.rev)    / dPrev.rev)    * 100 : null,
        cntDelta:    dPrev.count  > 0 ? ((dCur.count  - dPrev.count)  / dPrev.count)  * 100 : null,
        ticketDelta: dPrev.ticket > 0 ? ((dCur.ticket - dPrev.ticket) / dPrev.ticket) * 100 : null,
        svcComp, missedOpps, rising, dowComp,
        retained, newPat, retPct,
        trend,
      }
    }

    const fontovaMoM = buildLocalMoM(filtered.filter(t => t.local_id === 1))
    // periodComp kept as alias so existing JSX section still works (will be removed below)
    const periodComp = null

    const curicoComp = buildLocalMoM(filtered.filter(t => t.local_id === 2))

    // ── Membresía: patentes frecuentes (2+ y 3+ visitas en el mismo mes) ──
    const allMonthsForFreq = monthKeys.slice(-6) // last 6 months

    function buildFreqByMonth(rows, months) {
      return months.map(mk => {
        const mRows = rows.filter(t => t.fecha.slice(0, 7) === mk && t.patente)
        const byPat = {}
        mRows.forEach(t => {
          const p = t.patente.trim()
          if (!p) return
          if (!byPat[p]) byPat[p] = { count: 0, rev: 0 }
          byPat[p].count++; byPat[p].rev += Number(t.monto)
        })
        const two = Object.entries(byPat).filter(([, d]) => d.count >= 2)
        const three = Object.entries(byPat).filter(([, d]) => d.count >= 3)
        const avgTicket2 = two.length > 0 ? two.reduce((s, [, d]) => s + d.rev / d.count, 0) / two.length : 0
        return {
          month: mk,
          label: MONTHS_ES_FULL[parseInt(mk.slice(5)) - 1].slice(0, 3) + ' ' + mk.slice(2, 4),
          two: two.length, three: three.length,
          avgTicket2: Math.round(avgTicket2),
          topCandidates: two.sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(([p, d]) => ({
            patente: p, visits: d.count, total: d.rev, ticket: Math.round(d.rev / d.count)
          })),
        }
      })
    }

    const freqByMonth = buildFreqByMonth(filtered, allMonthsForFreq)
    const latestFreq = freqByMonth[freqByMonth.length - 1]
    const suggestedMembership = latestFreq ? Math.round(latestFreq.avgTicket2 * 1.8 / 1000) * 1000 : 0

    const fontovaRows = filtered.filter(t => t.local_id === 1)
    const freqByMonthFontova = buildFreqByMonth(fontovaRows, allMonthsForFreq)
    const latestFreqFontova = freqByMonthFontova[freqByMonthFontova.length - 1]
    const suggestedMembershipFontova = latestFreqFontova ? Math.round(latestFreqFontova.avgTicket2 * 1.8 / 1000) * 1000 : 0

    const curicoRows = filtered.filter(t => t.local_id === 2)
    const freqByMonthCurico = buildFreqByMonth(curicoRows, allMonthsForFreq)
    const latestFreqCurico = freqByMonthCurico[freqByMonthCurico.length - 1]
    const suggestedMembershipCurico = latestFreqCurico ? Math.round(latestFreqCurico.avgTicket2 * 1.8 / 1000) * 1000 : 0

    // ── Inteligencia Publicitaria ─────────────────────────────────────────

    // RFM Segmentation per patente
    const hoyMs = Date.now()
    const rfmByPat = {}
    filtered.filter(t => t.patente).forEach(t => {
      const p = t.patente.trim().toUpperCase()
      if (!rfmByPat[p]) rfmByPat[p] = { visits: 0, total: 0, lastMs: 0, firstMs: Infinity }
      rfmByPat[p].visits++
      rfmByPat[p].total += Number(t.monto)
      const ms = new Date(t.fecha).getTime()
      if (ms > rfmByPat[p].lastMs) rfmByPat[p].lastMs = ms
      if (ms < rfmByPat[p].firstMs) rfmByPat[p].firstMs = ms
    })

    const rfmChampions = [], rfmAtRisk = [], rfmLost = [], rfmNew = [], rfmHighTicket = []
    const avgTicketAll = filtered.length > 0 ? filtered.reduce((s, t) => s + Number(t.monto), 0) / filtered.length : 0

    Object.entries(rfmByPat).forEach(([pat, d]) => {
      const days = (hoyMs - d.lastMs) / 86400000
      const ticket = Math.round(d.total / d.visits)
      const c = { patente: pat, visits: d.visits, ticket, total: d.total, days: Math.round(days) }
      if (d.visits >= 3 && days <= 60) rfmChampions.push(c)
      else if (d.visits >= 2 && days > 60 && days <= 120) rfmAtRisk.push(c)
      else if (days > 120) rfmLost.push(c)
      if ((hoyMs - d.firstMs) / 86400000 <= 45 && d.visits <= 2) rfmNew.push(c)
      if (ticket > avgTicketAll * 1.5 && d.visits >= 2) rfmHighTicket.push(c)
    })

    const rfmSegments = {
      champions:  rfmChampions.sort((a, b) => b.visits - a.visits).slice(0, 10),
      atRisk:     rfmAtRisk.sort((a, b) => a.days - b.days).slice(0, 10),
      lost:       rfmLost.sort((a, b) => a.days - b.days).slice(0, 10),
      new:        rfmNew.sort((a, b) => a.days - b.days).slice(0, 10),
      highTicket: rfmHighTicket.sort((a, b) => b.ticket - a.ticket).slice(0, 10),
      counts: {
        champions: rfmChampions.length, atRisk: rfmAtRisk.length,
        lost: rfmLost.length, new: rfmNew.length, highTicket: rfmHighTicket.length,
      }
    }

    // ── Comparación acumulada: días 1–hoy del mes actual vs mismos días del mes anterior ──
    const mCurKey  = monthKeys[monthKeys.length - 1]
    const mPrevKey = monthKeys[monthKeys.length - 2]
    const mCurLabel  = mCurKey  ? MONTHS_ES_FULL[parseInt(mCurKey.slice(5))  - 1] : ''
    const mPrevLabel = mPrevKey ? MONTHS_ES_FULL[parseInt(mPrevKey.slice(5)) - 1] : ''

    const hoyDate = new Date()
    const hoyDia  = hoyDate.getDate()
    const diasEnMesCur = new Date(hoyDate.getFullYear(), hoyDate.getMonth() + 1, 0).getDate()
    const semanaActual = Math.ceil(hoyDia / 7)

    // Rows acumulados hasta hoy
    const curMonthRows  = filtered.filter(t => t.fecha.slice(0, 7) === mCurKey  && parseInt(t.fecha.slice(8, 10)) <= hoyDia)
    const prevMonthRows = filtered.filter(t => t.fecha.slice(0, 7) === mPrevKey && parseInt(t.fecha.slice(8, 10)) <= hoyDia)
    const prevMonthFull = filtered.filter(t => t.fecha.slice(0, 7) === mPrevKey)

    const curRevAcum   = curMonthRows.reduce((s, t)  => s + Number(t.monto), 0)
    const prevRevAcum  = prevMonthRows.reduce((s, t) => s + Number(t.monto), 0)
    const prevFullRev  = prevMonthFull.reduce((s, t) => s + Number(t.monto), 0)
    const curCntAcum   = curMonthRows.length
    const prevCntAcum  = prevMonthRows.length
    const acumRevDelta = prevRevAcum > 0 ? ((curRevAcum - prevRevAcum) / prevRevAcum) * 100 : 0
    const acumCntDelta = prevCntAcum > 0 ? ((curCntAcum - prevCntAcum) / prevCntAcum) * 100 : 0

    // Proyección por ritmo diario
    const pace = hoyDia > 0 ? curRevAcum / hoyDia : 0
    const forecastByPace = Math.round(pace * diasEnMesCur)
    const forecastVsPrev = prevFullRev > 0 ? ((forecastByPace - prevFullRev) / prevFullRev) * 100 : 0

    // Servicios en período acumulado (mismos días)
    function svcStats(rows) {
      const m = {}
      rows.forEach(t => {
        const s = normalizeServicio(t.tipo_servicio)
        if (!m[s]) m[s] = { count: 0, rev: 0 }
        m[s].count++; m[s].rev += Number(t.monto)
      })
      return m
    }
    const svcCur  = svcStats(curMonthRows)
    const svcPrev = svcStats(prevMonthRows)

    const svcAccumComp = [...new Set([...Object.keys(svcCur), ...Object.keys(svcPrev)])]
      .map(name => {
        const c = svcCur[name]  || { count: 0, rev: 0 }
        const p = svcPrev[name] || { count: 0, rev: 0 }
        const delta = p.count > 0 ? Math.round(((c.count - p.count) / p.count) * 100) : null
        return { name, curCount: c.count, prevCount: p.count, ticket: c.count > 0 ? Math.round(c.rev / c.count) : 0, delta }
      })
      .filter(s => s.curCount >= 2 || s.prevCount >= 2)

    const svcWinning = svcAccumComp.filter(s => s.delta !== null && s.delta > 5 && s.curCount >= 2).sort((a, b) => b.delta - a.delta).slice(0, 3)
    const svcLosing  = svcAccumComp.filter(s => s.delta !== null && s.delta < -5 && s.prevCount >= 2).sort((a, b) => a.delta - b.delta).slice(0, 3)

    const promoByProfitability = Object.entries(svcCur)
      .filter(([, v]) => v.count >= 3)
      .map(([name, v]) => ({ name, ticket: Math.round(v.rev / v.count), count: v.count }))
      .sort((a, b) => b.ticket - a.ticket)[0] || null

    const weeklyStatus = acumRevDelta >= 5 ? 'adelante' : acumRevDelta <= -5 ? 'atras' : 'par'

    // Best week of month (histórico)
    const byWeekCount = [0, 0, 0, 0, 0]
    filtered.forEach(t => {
      const day = parseInt(t.fecha.slice(8, 10))
      byWeekCount[Math.min(Math.floor((day - 1) / 7), 4)]++
    })
    const bestWeekIdx = byWeekCount.indexOf(Math.max(...byWeekCount))
    const WEEK_LABELS = ['1ª semana (1–7)', '2ª semana (8–14)', '3ª semana (15–21)', '4ª semana (22–28)', 'Fin de mes (29+)']
    const bestWeek = WEEK_LABELS[bestWeekIdx]

    const accumComparison = {
      hoyDia, semanaActual, diasEnMesCur,
      curRevAcum, prevRevAcum, acumRevDelta, acumCntDelta,
      curCntAcum, prevCntAcum,
      pace, forecastByPace, forecastVsPrev, prevFullRev,
      svcWinning, svcLosing, svcAccumComp,
      weeklyStatus, bestWeek,
      mCurLabel, mPrevLabel,
    }

    const promoDecision = {
      byProfitability: promoByProfitability,
      growing: svcWinning[0] || null,
      rescue: svcLosing[0] ? { ...svcLosing[0], prevCount: svcLosing[0].prevCount, curCount: svcLosing[0].curCount } : null,
    }

    const forecast = {
      nextRev: forecastByPace, lastRev: prevFullRev,
      deltaPct: forecastVsPrev,
      risk: forecastVsPrev < -15 ? 'alto' : forecastVsPrev < -5 ? 'medio' : 'bajo',
      monthLabel: mCurLabel,
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
      bestTicketService, fontovaMoM, curicoComp, freqByMonth, latestFreq, suggestedMembership,
      freqByMonthFontova, latestFreqFontova, suggestedMembershipFontova,
      freqByMonthCurico, latestFreqCurico, suggestedMembershipCurico,
      rfmSegments, promoDecision, bestWeek, forecast, accumComparison,
      mCurLabel: mCurKey ? MONTHS_ES_FULL[parseInt(mCurKey.slice(5)) - 1] + ' ' + mCurKey.slice(0, 4) : '',
    }
  }, [filtered])

  const selectedAccum = useMemo(() => {
    if (!analytics || !filtered.length) return null
    const { monthKeys } = analytics
    const chosenKey = intelMonth ?? monthKeys[monthKeys.length - 1]
    const chosenIdx = monthKeys.indexOf(chosenKey)
    if (chosenIdx < 0) return null
    const prevKey = chosenIdx > 0 ? monthKeys[chosenIdx - 1] : null
    const mCurLabel  = MONTHS_ES_FULL[parseInt(chosenKey.slice(5)) - 1]
    const mPrevLabel = prevKey ? MONTHS_ES_FULL[parseInt(prevKey.slice(5)) - 1] : ''
    const now = new Date()
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const isCurrentMonth = chosenKey === todayKey
    const chosenYear  = parseInt(chosenKey.slice(0, 4))
    const chosenMonthN = parseInt(chosenKey.slice(5))
    const diasEnMesCur = new Date(chosenYear, chosenMonthN, 0).getDate()
    const hoyDia = isCurrentMonth ? now.getDate() : diasEnMesCur
    const semanaActual = Math.ceil(hoyDia / 7)
    const curRows  = filtered.filter(t => t.fecha.slice(0, 7) === chosenKey && parseInt(t.fecha.slice(8, 10)) <= hoyDia)
    const prevRows = prevKey ? filtered.filter(t => t.fecha.slice(0, 7) === prevKey && parseInt(t.fecha.slice(8, 10)) <= hoyDia) : []
    const prevFull = prevKey ? filtered.filter(t => t.fecha.slice(0, 7) === prevKey) : []
    const curRevAcum   = curRows.reduce((s, t) => s + Number(t.monto), 0)
    const prevRevAcum  = prevRows.reduce((s, t) => s + Number(t.monto), 0)
    const prevFullRev  = prevFull.reduce((s, t) => s + Number(t.monto), 0)
    const curCntAcum   = curRows.length
    const prevCntAcum  = prevRows.length
    const acumRevDelta = prevRevAcum > 0 ? ((curRevAcum - prevRevAcum) / prevRevAcum) * 100 : 0
    const acumCntDelta = prevCntAcum > 0 ? ((curCntAcum - prevCntAcum) / prevCntAcum) * 100 : 0
    const pace = hoyDia > 0 ? curRevAcum / hoyDia : 0
    const forecastByPace = Math.round(pace * diasEnMesCur)
    const forecastVsPrev = prevFullRev > 0 ? ((forecastByPace - prevFullRev) / prevFullRev) * 100 : 0
    const svcSt = rows => {
      const m = {}
      rows.forEach(t => { const s = normalizeServicio(t.tipo_servicio); if (!m[s]) m[s] = { count: 0, rev: 0 }; m[s].count++; m[s].rev += Number(t.monto) })
      return m
    }
    const svcCur  = svcSt(curRows)
    const svcPrev = svcSt(prevRows)
    const svcComp = [...new Set([...Object.keys(svcCur), ...Object.keys(svcPrev)])]
      .map(name => {
        const c = svcCur[name] || { count: 0, rev: 0 }; const p = svcPrev[name] || { count: 0, rev: 0 }
        const delta = p.count > 0 ? Math.round(((c.count - p.count) / p.count) * 100) : null
        return { name, curCount: c.count, prevCount: p.count, ticket: c.count > 0 ? Math.round(c.rev / c.count) : 0, delta }
      })
      .filter(s => s.curCount >= 2 || s.prevCount >= 2)
    const svcWinning = svcComp.filter(s => s.delta !== null && s.delta > 5 && s.curCount >= 2).sort((a, b) => b.delta - a.delta).slice(0, 3)
    const svcLosing  = svcComp.filter(s => s.delta !== null && s.delta < -5 && s.prevCount >= 2).sort((a, b) => a.delta - b.delta).slice(0, 3)
    const promoByProfit = Object.entries(svcCur).filter(([, v]) => v.count >= 3).map(([name, v]) => ({ name, ticket: Math.round(v.rev / v.count), count: v.count })).sort((a, b) => b.ticket - a.ticket)[0] || null
    const weeklyStatus = acumRevDelta >= 5 ? 'adelante' : acumRevDelta <= -5 ? 'atras' : 'par'
    return {
      hoyDia, semanaActual, diasEnMesCur, mCurLabel, mPrevLabel, isCurrentMonth,
      curRevAcum, prevRevAcum, acumRevDelta, acumCntDelta, curCntAcum, prevCntAcum,
      pace, forecastByPace, forecastVsPrev, prevFullRev,
      svcWinning, svcLosing, weeklyStatus,
      promoDecision: { byProfitability: promoByProfit, growing: svcWinning[0] || null, rescue: svcLosing[0] || null },
      forecast: { nextRev: forecastByPace, lastRev: prevFullRev, deltaPct: forecastVsPrev, risk: forecastVsPrev < -15 ? 'alto' : forecastVsPrev < -5 ? 'medio' : 'bajo', monthLabel: mCurLabel },
    }
  }, [filtered, analytics, intelMonth])

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
  const ac = selectedAccum

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

      {/* ── INTELIGENCIA PUBLICITARIA ── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Megaphone size={16} className="text-violet-400" />
            <h2 className="text-sm font-semibold text-white">Inteligencia Publicitaria</h2>
          </div>
          <select
            value={intelMonth ?? a.monthKeys.at(-1) ?? ''}
            onChange={e => setIntelMonth(e.target.value || null)}
            className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-500"
          >
            {[...a.monthKeys].reverse().map(key => (
              <option key={key} value={key}>
                {MONTHS_ES_FULL[parseInt(key.slice(5)) - 1]} {key.slice(0, 4)}
              </option>
            ))}
          </select>
        </div>
        {ac && <p className="text-xs text-gray-500 mb-5">{ac.isCurrentMonth ? 'Comparación acumulada día a día' : 'Mes completo'} · {ac.mCurLabel} vs {ac.mPrevLabel}</p>}

        {/* A. Pulso del mes */}
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Pulso del mes (días 1–{ac.hoyDia} · semana {ac.semanaActual} de {Math.ceil(ac.diasEnMesCur / 7)})</h3>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Revenue acumulado */}
            <div>
              <p className="text-xs text-gray-400 mb-2">Ingresos acumulados (días 1–{ac.hoyDia})</p>
              <div className="flex items-end gap-3 mb-2">
                <div>
                  <p className="text-[10px] text-gray-500 mb-0.5">{ac.mCurLabel}</p>
                  <p className="text-2xl font-bold text-white">{fmtCLP(ac.curRevAcum)}</p>
                </div>
                <div className={`flex items-center gap-1 mb-1 text-sm font-semibold ${ac.acumRevDelta >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                  {ac.acumRevDelta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {ac.acumRevDelta >= 0 ? '+' : ''}{ac.acumRevDelta.toFixed(1)}%
                </div>
              </div>
              <p className="text-xs text-gray-500">{ac.mPrevLabel} mismo período: {fmtCLP(ac.prevRevAcum)}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {ac.curCntAcum} vs {ac.prevCntAcum} servicios
                {' '}({ac.acumCntDelta >= 0 ? '+' : ''}{ac.acumCntDelta.toFixed(0)}%)
              </p>
            </div>

            {/* Proyección al cierre */}
            <div className="border-l border-gray-800 pl-6">
              <p className="text-xs text-gray-400 mb-2">Proyección al cierre del mes</p>
              <div className="flex items-end gap-3 mb-2">
                <p className="text-2xl font-bold text-white">{fmtCLP(ac.forecastByPace)}</p>
                <div className={`flex items-center gap-1 mb-1 text-sm font-semibold ${ac.forecastVsPrev >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                  {ac.forecastVsPrev >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {ac.forecastVsPrev >= 0 ? '+' : ''}{ac.forecastVsPrev.toFixed(1)}%
                </div>
              </div>
              <p className="text-xs text-gray-500">{ac.mPrevLabel} cerró en: {fmtCLP(ac.prevFullRev)}</p>
              <p className="text-xs text-gray-500 mt-0.5">Ritmo: {fmtCLP(Math.round(ac.pace))}/día · {ac.diasEnMesCur - ac.hoyDia} días restantes</p>
            </div>

            {/* Estado semanal */}
            <div className="border-l border-gray-800 pl-6">
              <p className="text-xs text-gray-400 mb-2">Estado esta semana</p>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold mb-3 ${
                ac.weeklyStatus === 'adelante' ? 'bg-green-500/15 text-green-300' :
                ac.weeklyStatus === 'atras' ? 'bg-rose-500/15 text-rose-300' :
                'bg-gray-700 text-gray-300'
              }`}>
                {ac.weeklyStatus === 'adelante' ? <TrendingUp size={14} /> : ac.weeklyStatus === 'atras' ? <TrendingDown size={14} /> : <Activity size={14} />}
                {ac.weeklyStatus === 'adelante' ? 'Adelante' : ac.weeklyStatus === 'atras' ? 'Atrás' : 'Parejo'}
                {' '}vs {ac.mPrevLabel}
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                {ac.weeklyStatus === 'adelante'
                  ? `Vas ${Math.abs(ac.acumRevDelta).toFixed(0)}% sobre ${ac.mPrevLabel} a este punto. Potencia lo que está funcionando y mantén el ritmo de ads.`
                  : ac.weeklyStatus === 'atras'
                  ? `Vas ${Math.abs(ac.acumRevDelta).toFixed(0)}% bajo ${ac.mPrevLabel}. Activar reactivación de clientes y empujar el servicio más rentable.`
                  : `Vas parejo con ${ac.mPrevLabel} — diferencia de ${Math.abs(ac.curCntAcum - ac.prevCntAcum)} autos. Una buena semana inclina la balanza.`
                }
              </p>
            </div>
          </div>
        </div>

        {/* Servicios ganadores y rezagados */}
        {(ac.svcWinning.length > 0 || ac.svcLosing.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {ac.svcWinning.length > 0 && (
              <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                <p className="text-xs text-green-400 font-semibold uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <TrendingUp size={12} /> Servicios ganadores vs {ac.mPrevLabel}
                </p>
                <div className="space-y-2.5">
                  {ac.svcWinning.map(s => (
                    <div key={s.name} className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-200 font-medium">{s.name}</p>
                        <p className="text-[10px] text-gray-500">{s.curCount} servicios · {fmtCLP(s.ticket)} ticket prom</p>
                      </div>
                      <span className="text-xs font-bold text-green-400">+{s.delta}%</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-green-500/15 mt-3 pt-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Acción</p>
                  <p className="text-xs text-gray-300">Escalar presupuesto de ads en estos servicios. Crear contenido específico mostrando resultados.</p>
                </div>
              </div>
            )}
            {ac.svcLosing.length > 0 && (
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4">
                <p className="text-xs text-rose-400 font-semibold uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <TrendingDown size={12} /> Servicios rezagados vs {ac.mPrevLabel}
                </p>
                <div className="space-y-2.5">
                  {ac.svcLosing.map(s => (
                    <div key={s.name} className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-200 font-medium">{s.name}</p>
                        <p className="text-[10px] text-gray-500">{s.prevCount}→{s.curCount} servicios · {fmtCLP(s.ticket)} ticket prom</p>
                      </div>
                      <span className="text-xs font-bold text-rose-400">{s.delta}%</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-rose-500/15 mt-3 pt-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Acción</p>
                  <p className="text-xs text-gray-300">WhatsApp a clientes que usaron estos servicios el mes pasado. Oferta de reactivación con descuento puntual.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* B. Qué promover esta semana */}
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Qué promover esta semana</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {ac.promoDecision.byProfitability ? (
            <AdInsightCard
              icon={Star}
              accent="amber"
              title={`Rentabilidad: ${ac.promoDecision.byProfitability.name}`}
              body={`Mayor ticket promedio en los primeros ${ac.hoyDia} días de ${ac.mCurLabel}: ${fmtCLP(ac.promoDecision.byProfitability.ticket)} con ${ac.promoDecision.byProfitability.count} unidades. Margen alto, demanda ya probada.`}
              accion="Destacar en perfil de Instagram y stories. Subir foto del resultado."
              prioridad="Alta"
              canal="Instagram Stories + Google My Business"
              copy={`"¿Sabías que nuestro ${ac.promoDecision.byProfitability.name} deja tu auto como nuevo? Pide hora hoy mismo 🚗✨"`}
            />
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center justify-center">
              <p className="text-xs text-gray-500">Necesitas más datos del mes actual</p>
            </div>
          )}

          {ac.promoDecision.growing ? (
            <AdInsightCard
              icon={TrendingUp}
              accent="green"
              title={`Demanda creciente: ${ac.promoDecision.growing.name}`}
              body={`Creció +${ac.promoDecision.growing.delta}% vs mismo período de ${ac.mPrevLabel} (${ac.promoDecision.growing.curCount} vs ${ac.promoDecision.growing.prevCount} servicios). Momentum alcista — amplificar ahora captura clientes en el pico de interés.`}
              accion="Lanzar anuncio pagado en Meta apuntando a radio 5km del local."
              prioridad="Alta"
              canal="Facebook + Instagram Ads"
              copy={`"${ac.promoDecision.growing.name} en Alpha Cleaners — ${fmtCLP(ac.promoDecision.growing.ticket)} y listo al instante. Reserva online 📲"`}
            />
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center justify-center">
              <p className="text-xs text-gray-500">Sin servicios con crecimiento significativo</p>
            </div>
          )}

          {ac.promoDecision.rescue ? (
            <AdInsightCard
              icon={AlertTriangle}
              accent="rose"
              title={`Rescatar caída: ${ac.promoDecision.rescue.name}`}
              body={`Cayó ${ac.promoDecision.rescue.delta}% vs mismo período de ${ac.mPrevLabel} (de ${ac.promoDecision.rescue.prevCount} a ${ac.promoDecision.rescue.curCount} servicios). Hay clientes con historial — reactivarlos cuesta menos que captar nuevos.`}
              accion="WhatsApp a clientes que lo usaron antes pero no este mes."
              prioridad="Media"
              canal="WhatsApp Business + Reels"
              copy={`"Vuelve a darle el trato que merece a tu auto con nuestro ${ac.promoDecision.rescue.name}. Esta semana con 10% OFF para clientes frecuentes 🔧"`}
            />
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center justify-center">
              <p className="text-xs text-gray-500">Sin caídas significativas — buena señal</p>
            </div>
          )}
        </div>

        {/* B. Segmentos RFM */}
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Segmentos de clientes (RFM)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <AdInsightCard
            icon={Crown}
            accent="amber"
            title={`Champions — ${a.rfmSegments.counts.champions} patentes`}
            body={`3+ visitas, última hace menos de 60 días. Son tu base más valiosa y embajadores naturales de la marca.`}
            accion="Invitar a dejar reseña en Google. Ofrecer tarjeta VIP con beneficios exclusivos."
            prioridad="Alta"
            canal="WhatsApp directo + Google Reviews"
            copy={`"Gracias por confiar siempre en Alpha Cleaners. Como cliente frecuente, tienes un lavado Plus gratis en tu próxima visita 🏆"`}
          />

          <AdInsightCard
            icon={RefreshCw}
            accent="blue"
            title={`En riesgo — ${a.rfmSegments.counts.atRisk} patentes`}
            body={`2+ visitas pero sin venir entre 60 y 120 días. Aún recuerdan la marca — ventana ideal para reactivar antes de que se vayan definitivamente.`}
            accion="Campaña de reactivación personalizada con nombre + servicio previo."
            prioridad="Alta"
            canal="WhatsApp Business (Claudio)"
            copy={`"Hola [nombre], hace un tiempo que no traes tu [auto] 🚗 ¿Le damos una manita esta semana? Reserva con descuento especial para ti."`}
          />

          <AdInsightCard
            icon={UserX}
            accent="rose"
            title={`Perdidos — ${a.rfmSegments.counts.lost} patentes`}
            body={`Sin visitas hace más de 120 días. Recuperar el 10% con un incentivo fuerte puede generar ingresos equivalentes a varios meses de publicidad normal.`}
            accion="Campaña de incentivo con oferta de reingreso (descuento 20% o servicio extra gratis)."
            prioridad="Media"
            canal="WhatsApp + Instagram retargeting"
            copy={`"Te echamos de menos en Alpha Cleaners. Vuelve esta semana y tu primer lavado tiene 20% de descuento — solo por ser tú 💙"`}
          />

          <AdInsightCard
            icon={UserPlus}
            accent="green"
            title={`Nuevos — ${a.rfmSegments.counts.new} patentes`}
            body={`Primera visita en los últimos 45 días. El 70% de los clientes que no vuelven en 30 días nunca regresan — convertir la segunda visita es crítico.`}
            accion="Mensaje de bienvenida + descuento segunda visita enviado 7 días post-servicio."
            prioridad="Alta"
            canal="WhatsApp Business"
            copy={`"Gracias por elegirnos 🙌 Como regalo de bienvenida, tu próxima visita tiene 15% de descuento. ¡Te esperamos pronto!"`}
          />

          <AdInsightCard
            icon={Zap}
            accent="purple"
            title={`Alto ticket — ${a.rfmSegments.counts.highTicket} patentes`}
            body={`Ticket promedio >1.5× la media general (${fmtCLP(a.ticketProm * 1.5)}+), 2+ visitas. Clientes premium con mayor disposición a pagar servicios de valor.`}
            accion="Ofrecer paquetes premium, detailing y servicios de protección de pintura."
            prioridad="Media"
            canal="Instagram + WhatsApp directo"
            copy={`"Tu auto merece el mejor cuidado. Conoce nuestro servicio Premium Care: tratamiento completo desde ${fmtCLP(a.ticketProm * 1.6)} 🏅"`}
          />

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-3 font-medium">Resumen RFM</p>
            <div className="space-y-2.5">
              {[
                { label: 'Champions', count: a.rfmSegments.counts.champions, color: 'bg-amber-400' },
                { label: 'En riesgo', count: a.rfmSegments.counts.atRisk, color: 'bg-blue-400' },
                { label: 'Perdidos', count: a.rfmSegments.counts.lost, color: 'bg-rose-400' },
                { label: 'Nuevos', count: a.rfmSegments.counts.new, color: 'bg-green-400' },
                { label: 'Alto ticket', count: a.rfmSegments.counts.highTicket, color: 'bg-purple-400' },
              ].map(({ label, count, color }) => {
                const total = a.rfmSegments.counts.champions + a.rfmSegments.counts.atRisk + a.rfmSegments.counts.lost + a.rfmSegments.counts.new + a.rfmSegments.counts.highTicket
                const pct = total > 0 ? (count / total) * 100 : 0
                return (
                  <div key={label}>
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs text-gray-300">{label}</span>
                      <span className="text-xs text-gray-400">{count.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* C. Timing y Forecast */}
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Timing y Proyección</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* Timing */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={14} className="text-blue-400" />
              <p className="text-sm font-semibold text-white">Cuándo publicar</p>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-gray-400">Mejor día para captar</p>
                  <p className="text-sm font-medium text-white">{a.bestDay.day}</p>
                  <p className="text-xs text-gray-500">{a.bestDay.count.toLocaleString()} servicios históricos</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Día más lento (promo)</p>
                  <p className="text-sm font-medium text-white">{a.worstDay.day}</p>
                  <p className="text-xs text-gray-500">Ideal para descuentos de relleno</p>
                </div>
              </div>
              <div className="border-t border-gray-800 pt-3">
                <p className="text-xs text-gray-400 mb-1">Mejor semana del mes para ads</p>
                <p className="text-sm font-medium text-white">{a.bestWeek}</p>
                <p className="text-xs text-gray-500 mt-1">Mayor volumen histórico — presupuesto de ads rinde más en este período</p>
              </div>
              <div className="border-t border-gray-800 pt-3 space-y-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Acción recomendada</p>
                <p className="text-xs text-gray-300">Programar posts orgánicos los {a.bestDay.day}s. Activar ads la {a.bestWeek.toLowerCase()}. Lanzar promos los {a.worstDay.day}s para mover demanda baja.</p>
              </div>
            </div>
          </div>

          {/* Forecast */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={14} className="text-violet-400" />
              <p className="text-sm font-semibold text-white">Proyección {ac.forecast.monthLabel}</p>
            </div>
            <div className="space-y-3">
              <div className="flex items-end gap-3">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Proyección</p>
                  <p className="text-2xl font-bold text-white">{fmtCLP(ac.forecast.nextRev)}</p>
                </div>
                <div className={`flex items-center gap-1 mb-1 text-sm font-medium ${ac.forecast.deltaPct >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                  {ac.forecast.deltaPct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {ac.forecast.deltaPct >= 0 ? '+' : ''}{ac.forecast.deltaPct.toFixed(1)}% vs mes anterior
                </div>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-400">Nivel de riesgo:</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  ac.forecast.risk === 'alto' ? 'bg-rose-500/20 text-rose-300' :
                  ac.forecast.risk === 'medio' ? 'bg-amber-500/20 text-amber-300' :
                  'bg-green-500/20 text-green-300'
                }`}>
                  {ac.forecast.risk === 'alto' ? 'Alto' : ac.forecast.risk === 'medio' ? 'Medio' : 'Bajo'}
                </span>
              </div>
              <div className="border-t border-gray-800 pt-3 space-y-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Acción correctiva</p>
                <p className="text-xs text-gray-300">
                  {ac.forecast.risk === 'alto'
                    ? `Riesgo alto de caída. Activar campaña de clientes en riesgo (${a.rfmSegments.counts.atRisk} patentes) + empujar ${ac.promoDecision.byProfitability?.name || 'servicio de mayor ticket'} con descuento limitado.`
                    : ac.forecast.risk === 'medio'
                    ? `Tendencia moderada. Mantener ads activos la ${a.bestWeek.toLowerCase()} y reactivar ${a.rfmSegments.counts.atRisk} clientes en riesgo con WhatsApp.`
                    : `Proyección positiva. Invertir en captación de nuevos clientes (${a.rfmSegments.counts.new} nuevos este período) para consolidar el crecimiento.`
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* D. Meta Ads placeholder */}
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Análisis de Anuncios Meta (Instagram + Facebook)</h3>
        <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-8 text-center">
          <Activity size={24} className="text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-400 font-medium mb-1">Esperando datos de Meta Ads Manager</p>
          <p className="text-xs text-gray-500 mb-4">Exporta el CSV desde Ads Manager con las columnas: Campaña, Conjunto, Anuncio, Fecha, Impresiones, Alcance, Clics, CTR, CPC, Gasto, Resultados, Frecuencia, Plataforma/Ubicación, ID Creativo</p>
          <div className="flex flex-wrap justify-center gap-2 text-xs text-gray-600">
            {['CTR por campaña', 'CPC vs resultado', 'Frecuencia de saturación', 'Mejor plataforma', 'Retorno por creativo'].map(t => (
              <span key={t} className="bg-gray-800 px-2 py-1 rounded-full">{t}</span>
            ))}
          </div>
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

      {/* ── CURICÓ: MES ANTERIOR VS ÚLTIMO MES ── */}
      {a.curicoComp && (() => {
        const cc = a.curicoComp
        const pl = d => d.endsWith('s') ? d : d + 's'
        const trendChartData = {
          labels: cc.trend.map(t => t.label),
          datasets: [{
            label: 'Servicios',
            data: cc.trend.map(t => t.count),
            fill: true,
            backgroundColor: 'rgba(139,92,246,0.1)',
            borderColor: '#8b5cf6',
            borderWidth: 2, tension: 0.4, pointRadius: 3,
          }]
        }
        const missedCurico = cc.svcComp.filter(s => s.delta !== null && s.delta < -15 && s.prevCount >= 3).slice(0, 3)
        const risingCurico = cc.svcComp.filter(s => s.delta !== null && s.delta > 15 && s.curCount >= 3).slice(0, 2)
        const bestDow = cc.dowComp.filter(d => d.day !== 'Domingo' && d.delta !== null).sort((a, b) => b.delta - a.delta)[0]
        return (
          <div className="space-y-5">
            <div className="flex items-center gap-3 pt-2">
              <div className="h-px flex-1 bg-gray-800" />
              <div className="flex items-center gap-2 text-xs text-gray-400 font-medium uppercase tracking-widest">
                <Building2 size={13} className="text-purple-400" />
                Curicó · {cc.labelPrev} vs {cc.labelCur}
              </div>
              <div className="h-px flex-1 bg-gray-800" />
            </div>

            {/* KPIs + trend */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="grid grid-cols-1 gap-3">
                {[
                  { label: 'Ingresos', prev: fmtCLP(cc.dPrev.rev), cur: fmtCLP(cc.dCur.rev), g: cc.revDelta },
                  { label: 'Servicios', prev: cc.dPrev.count.toLocaleString(), cur: cc.dCur.count.toLocaleString(), g: cc.cntDelta },
                  { label: 'Ticket prom.', prev: fmtCLP(cc.dPrev.ticket), cur: fmtCLP(cc.dCur.ticket), g: cc.ticketDelta },
                ].map(({ label, prev, cur, g }) => (
                  <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400 mb-1">{label}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500">{prev}</span>
                        <ArrowRight size={10} className="text-gray-600 shrink-0" />
                        <span className="text-sm font-bold text-white">{cur}</span>
                      </div>
                    </div>
                    {g != null && (
                      <span className={`text-xs font-semibold flex items-center gap-1 ${g >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                        {g >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        {g >= 0 ? '+' : ''}{g.toFixed(1)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
                  <TrendingUp size={13} className="text-purple-400" />
                  Tendencia Curicó (servicios por mes)
                </p>
                <div className="h-36">
                  <Bar data={trendChartData} options={{
                    ...CHART_OPTS,
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} servicios` } } },
                    scales: {
                      x: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280', font: { size: 10 } } },
                      y: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280', font: { size: 10 } } },
                    }
                  }} />
                </div>
              </div>
            </div>

            {/* Service table + day comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <BarChart2 size={14} className="text-purple-400" />
                  Servicios Curicó: {cc.labelPrev} → {cc.labelCur}
                </h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left pb-2 font-medium">Servicio</th>
                      <th className="text-right pb-2 font-medium">Ant.</th>
                      <th className="text-right pb-2 font-medium">Act.</th>
                      <th className="text-right pb-2 font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {cc.svcComp.map(s => (
                      <tr key={s.name} className={`hover:bg-gray-800/30 ${s.delta !== null && s.delta < -15 ? 'bg-rose-500/5' : ''}`}>
                        <td className="py-1.5 pr-3 text-gray-300 max-w-[140px] truncate">{s.name}</td>
                        <td className="py-1.5 text-right text-gray-500">{s.prevCount || '—'}</td>
                        <td className="py-1.5 text-right text-white font-medium">{s.curCount || '—'}</td>
                        <td className="py-1.5 text-right">
                          {s.delta !== null
                            ? <span className={`font-medium ${s.delta >= 0 ? 'text-green-400' : 'text-rose-400'}`}>{s.delta >= 0 ? '+' : ''}{s.delta.toFixed(0)}%</span>
                            : <span className="text-blue-400">{s.curCount > 0 ? 'nuevo' : '—'}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Calendar size={14} className="text-blue-400" />
                  Días de semana Curicó (promedio por día)
                </h3>
                <div className="space-y-2.5">
                  {cc.dowComp.filter(d => d.day !== 'Domingo').map(d => (
                    <div key={d.day} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-20 shrink-0">{pl(d.day)}</span>
                      <div className="flex-1 h-4 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${(d.delta ?? 0) >= 0 ? 'bg-purple-500/70' : 'bg-rose-500/70'}`}
                          style={{ width: `${Math.min(Math.abs(d.delta ?? 0), 120)}%` }} />
                      </div>
                      <span className={`text-xs font-medium w-10 text-right shrink-0 ${(d.delta ?? 0) >= 0 ? 'text-purple-400' : 'text-rose-400'}`}>
                        {d.delta !== null ? `${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(0)}%` : '—'}
                      </span>
                      <span className="text-xs text-gray-600 w-20 text-right shrink-0">{d.prevAvg.toFixed(1)}→{d.curAvg.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
                {bestDow && bestDow.delta !== null && bestDow.delta > 0 && (
                  <p className="text-xs text-purple-300 mt-3 bg-purple-500/10 rounded-lg p-2">
                    Los {pl(bestDow.day)} son el día con más crecimiento (+{bestDow.delta.toFixed(0)}%) en Curicó. Considera publicar contenido en RRSS esos días.
                  </p>
                )}
              </div>
            </div>

            {/* Curicó actionable insights */}
            {(missedCurico.length > 0 || risingCurico.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {missedCurico[0] && (
                  <InsightCard icon={TrendingDown} accent="rose" tag="Curicó — oportunidad"
                    title={`"${missedCurico[0].name}" bajó en Curicó`}
                    body={`Pasó de ${missedCurico[0].prevCount} a ${missedCurico[0].curCount} servicios (${missedCurico[0].delta?.toFixed(0)}%). Revisar si el personal lo está ofreciendo, si hay stock de insumos, o si necesita más visibilidad en el cartel de precios.`}
                  />
                )}
                {risingCurico[0] && (
                  <InsightCard icon={TrendingUp} accent="purple" tag="Curicó — potenciar"
                    title={`"${risingCurico[0].name}" creció en Curicó`}
                    body={`+${risingCurico[0].delta?.toFixed(0)}% (${risingCurico[0].prevCount} → ${risingCurico[0].curCount}). Identifica qué lo impulsó y repítelo. Si fue por capacitación del personal o por una promo, regístralo para sistematizarlo.`}
                  />
                )}
              </div>
            )}

            {/* Membresía Curicó */}
            {a.latestFreqCurico && (() => {
              const lf = a.latestFreqCurico
              const freqTrend = a.freqByMonthCurico
              const suggestedMbr = a.suggestedMembershipCurico
              const curMonthName = MONTHS_ES_FULL[parseInt(lf.month.slice(5)) - 1] + ' ' + lf.month.slice(0, 4)
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 pt-1">
                    <div className="h-px flex-1 bg-gray-800" />
                    <div className="flex items-center gap-2 text-xs text-gray-400 font-medium uppercase tracking-widest">
                      <Award size={12} className="text-amber-400" />
                      Candidatos a Membresía · Curicó
                    </div>
                    <div className="h-px flex-1 bg-gray-800" />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                          <Star size={14} className="text-amber-400" />
                          Resumen {curMonthName} · Curicó
                        </h3>
                        <p className="text-xs text-gray-400">Patentes con 2+ visitas en el mismo mes</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                          <p className="text-2xl font-bold text-amber-400">{lf.two}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Patentes 2+ visitas</p>
                          <p className="text-xs text-gray-500">este mes</p>
                        </div>
                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                          <p className="text-2xl font-bold text-orange-400">{lf.three}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Patentes 3+ visitas</p>
                          <p className="text-xs text-gray-500">este mes</p>
                        </div>
                      </div>
                      <div className="border border-amber-500/20 rounded-xl p-4 bg-amber-500/5 space-y-2">
                        <p className="text-xs font-semibold text-amber-300 flex items-center gap-2">
                          <Lightbulb size={12} />
                          Simulación de membresía Curicó
                        </p>
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Ticket promedio (segmento 2+)</span>
                            <span className="text-white font-medium">{fmtCLP(lf.avgTicket2)}/visita</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Gasto estimado 2 visitas/mes</span>
                            <span className="text-white font-medium">{fmtCLP(lf.avgTicket2 * 2)}/mes</span>
                          </div>
                          <div className="h-px bg-amber-500/20 my-1" />
                          <div className="flex justify-between">
                            <span className="text-amber-300 font-medium">Membresía sugerida</span>
                            <span className="text-amber-300 font-bold">{fmtCLP(suggestedMbr)}/mes</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Ahorro para el cliente</span>
                            <span className="text-green-400 font-medium">{fmtCLP(lf.avgTicket2 * 2 - suggestedMbr)}/mes</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Ingreso garantizado (si {lf.two} se suscriben)</span>
                            <span className="text-blue-400 font-medium">{fmtCLP(suggestedMbr * lf.two)}/mes</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                        <BarChart2 size={14} className="text-amber-400" />
                        Evolución patentes frecuentes Curicó (2+/mes)
                      </h3>
                      <div className="space-y-1.5">
                        {freqTrend.map(m => {
                          const maxTwo = Math.max(...freqTrend.map(x => x.two), 1)
                          return (
                            <div key={m.month} className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-14 shrink-0">{m.label}</span>
                              <div className="flex-1 h-5 bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500/60 rounded-full" style={{ width: `${(m.two / maxTwo) * 100}%` }} />
                              </div>
                              <span className="text-xs text-amber-300 font-medium w-6 text-right shrink-0">{m.two}</span>
                              <span className="text-xs text-gray-600 w-20 text-right shrink-0">{fmtCLP(m.avgTicket2)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {lf.topCandidates.length > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                        <Users size={14} className="text-amber-400" />
                        Candidatos prioritarios Curicó {curMonthName}
                      </h3>
                      <p className="text-xs text-gray-500 mb-4">Patentes con 2+ visitas. Son los más fáciles de convertir a membresía.</p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500 border-b border-gray-800">
                            <th className="text-left pb-2 font-medium">Patente</th>
                            <th className="text-right pb-2 font-medium">Visitas</th>
                            <th className="text-right pb-2 font-medium">Gasto mes</th>
                            <th className="text-right pb-2 font-medium">Ticket prom.</th>
                            <th className="text-right pb-2 font-medium">Ahorro membresía</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/60">
                          {lf.topCandidates.map(c => (
                            <tr key={c.patente} className="hover:bg-amber-500/5">
                              <td className="py-2 font-mono text-amber-300 font-medium">{c.patente}</td>
                              <td className="py-2 text-right">
                                <span className={`font-bold ${c.visits >= 3 ? 'text-orange-400' : 'text-white'}`}>{c.visits}</span>
                                {c.visits >= 3 && <span className="ml-1 text-orange-400">★</span>}
                              </td>
                              <td className="py-2 text-right text-white">{fmtCLP(c.total)}</td>
                              <td className="py-2 text-right text-gray-300">{fmtCLP(c.ticket)}</td>
                              <td className="py-2 text-right text-green-400 font-medium">{fmtCLP(Math.max(0, c.total - suggestedMbr))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-xs text-gray-500 mt-3">★ = 3+ visitas en el mes. Contactarlos directamente con la propuesta de membresía puede tener una tasa de conversión del 40-60%.</p>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )
      })()}

      {/* ── FONTOVA: MES ANTERIOR VS ÚLTIMO MES ── */}
      {a.fontovaMoM && (() => {
        const fm = a.fontovaMoM
        const pl = d => d.endsWith('s') ? d : d + 's'
        const trendChartData = {
          labels: fm.trend.map(t => t.label),
          datasets: [{
            label: 'Servicios',
            data: fm.trend.map(t => t.count),
            fill: true,
            backgroundColor: 'rgba(59,130,246,0.1)',
            borderColor: '#3b82f6',
            borderWidth: 2, tension: 0.4, pointRadius: 3,
          }]
        }
        const bestDow = fm.dowComp.filter(d => d.day !== 'Domingo' && d.delta !== null).sort((a, b) => b.delta - a.delta)[0]
        return (
          <div className="space-y-5">
            <div className="flex items-center gap-3 pt-2">
              <div className="h-px flex-1 bg-gray-800" />
              <div className="flex items-center gap-2 text-xs text-gray-400 font-medium uppercase tracking-widest">
                <Building2 size={13} className="text-blue-400" />
                Fontova · {fm.labelPrev} vs {fm.labelCur}
              </div>
              <div className="h-px flex-1 bg-gray-800" />
            </div>

            {/* KPIs + trend */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="grid grid-cols-1 gap-3">
                {[
                  { label: 'Ingresos', prev: fmtCLP(fm.dPrev.rev), cur: fmtCLP(fm.dCur.rev), g: fm.revDelta },
                  { label: 'Servicios', prev: fm.dPrev.count.toLocaleString(), cur: fm.dCur.count.toLocaleString(), g: fm.cntDelta },
                  { label: 'Ticket prom.', prev: fmtCLP(fm.dPrev.ticket), cur: fmtCLP(fm.dCur.ticket), g: fm.ticketDelta },
                ].map(({ label, prev, cur, g }) => (
                  <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400 mb-1">{label}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500">{prev}</span>
                        <ArrowRight size={10} className="text-gray-600 shrink-0" />
                        <span className="text-sm font-bold text-white">{cur}</span>
                      </div>
                    </div>
                    {g != null && (
                      <span className={`text-xs font-semibold flex items-center gap-1 ${g >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                        {g >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        {g >= 0 ? '+' : ''}{g.toFixed(1)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
                  <TrendingUp size={13} className="text-blue-400" />
                  Tendencia Fontova (servicios por mes)
                </p>
                <div className="h-36">
                  <Bar data={trendChartData} options={{
                    ...CHART_OPTS,
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} servicios` } } },
                    scales: {
                      x: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280', font: { size: 10 } } },
                      y: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280', font: { size: 10 } } },
                    }
                  }} />
                </div>
              </div>
            </div>

            {/* Service table + day comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <BarChart2 size={14} className="text-blue-400" />
                  Servicios Fontova: {fm.labelPrev} → {fm.labelCur}
                </h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left pb-2 font-medium">Servicio</th>
                      <th className="text-right pb-2 font-medium">Ant.</th>
                      <th className="text-right pb-2 font-medium">Act.</th>
                      <th className="text-right pb-2 font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {fm.svcComp.map(s => (
                      <tr key={s.name} className={`hover:bg-gray-800/30 ${s.delta !== null && s.delta < -15 ? 'bg-rose-500/5' : ''}`}>
                        <td className="py-1.5 pr-3 text-gray-300 max-w-[140px] truncate">{s.name}</td>
                        <td className="py-1.5 text-right text-gray-500">{s.prevCount || '—'}</td>
                        <td className="py-1.5 text-right text-white font-medium">{s.curCount || '—'}</td>
                        <td className="py-1.5 text-right">
                          {s.delta !== null
                            ? <span className={`font-medium ${s.delta >= 0 ? 'text-green-400' : 'text-rose-400'}`}>{s.delta >= 0 ? '+' : ''}{s.delta.toFixed(0)}%</span>
                            : <span className="text-blue-400">{s.curCount > 0 ? 'nuevo' : '—'}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Calendar size={14} className="text-blue-400" />
                  Días de semana Fontova (promedio por día)
                </h3>
                <div className="space-y-2.5">
                  {fm.dowComp.filter(d => d.day !== 'Domingo').map(d => (
                    <div key={d.day} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-20 shrink-0">{pl(d.day)}</span>
                      <div className="flex-1 h-4 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${(d.delta ?? 0) >= 0 ? 'bg-blue-500/70' : 'bg-rose-500/70'}`}
                          style={{ width: `${Math.min(Math.abs(d.delta ?? 0), 120)}%` }} />
                      </div>
                      <span className={`text-xs font-medium w-10 text-right shrink-0 ${(d.delta ?? 0) >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
                        {d.delta !== null ? `${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(0)}%` : '—'}
                      </span>
                      <span className="text-xs text-gray-600 w-20 text-right shrink-0">{d.prevAvg.toFixed(1)}→{d.curAvg.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
                {bestDow && bestDow.delta !== null && bestDow.delta > 0 && (
                  <p className="text-xs text-blue-300 mt-3 bg-blue-500/10 rounded-lg p-2">
                    Los {pl(bestDow.day)} son el día con más crecimiento (+{bestDow.delta.toFixed(0)}%) en Fontova. Considera publicar contenido en RRSS esos días.
                  </p>
                )}
              </div>
            </div>

            {/* Retention */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Users size={14} className="text-green-400" />
                Clientes Fontova: retención y nuevos
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div>
                    <p className="text-xl font-bold text-green-400">{fm.retained.toLocaleString()}</p>
                    <p className="text-xs text-gray-400">Clientes que volvieron</p>
                    <p className="text-xs text-gray-500">ya estaban en {fm.labelPrev}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-300">{fm.retPct}%</p>
                    <p className="text-xs text-gray-500">retención</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <div>
                    <p className="text-xl font-bold text-blue-400">{fm.newPat.toLocaleString()}</p>
                    <p className="text-xs text-gray-400">Clientes nuevos</p>
                    <p className="text-xs text-gray-500">no estaban en {fm.labelPrev}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-blue-300">
                      {Object.keys(fm.dCur.patMap).length > 0 ? Math.round((fm.newPat / Object.keys(fm.dCur.patMap).length) * 100) : 0}%
                    </p>
                    <p className="text-xs text-gray-500">del total</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                  <div>
                    <p className="text-xl font-bold text-rose-400">{Math.max(0, Object.keys(fm.dPrev.patMap).length - fm.retained).toLocaleString()}</p>
                    <p className="text-xs text-gray-400">No volvieron</p>
                    <p className="text-xs text-gray-500">estaban en {fm.labelPrev}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-rose-300">{100 - fm.retPct}%</p>
                    <p className="text-xs text-gray-500">tasa pérdida</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Fontova actionable insights */}
            {(fm.missedOpps.length > 0 || fm.rising.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fm.missedOpps[0] && (
                  <InsightCard icon={TrendingDown} accent="rose" tag="Fontova — oportunidad"
                    title={`"${fm.missedOpps[0].name}" bajó en Fontova`}
                    body={`Pasó de ${fm.missedOpps[0].prevCount} a ${fm.missedOpps[0].curCount} servicios (${fm.missedOpps[0].delta?.toFixed(0)}%). Revisar si el personal lo está ofreciendo, si hay stock de insumos, o si necesita más visibilidad en el cartel de precios.`}
                  />
                )}
                {fm.rising[0] && (
                  <InsightCard icon={TrendingUp} accent="blue" tag="Fontova — potenciar"
                    title={`"${fm.rising[0].name}" creció en Fontova`}
                    body={`+${fm.rising[0].delta?.toFixed(0)}% (${fm.rising[0].prevCount} → ${fm.rising[0].curCount}). Identifica qué lo impulsó y repítelo. Si fue por capacitación del personal o por una promo, regístralo para sistematizarlo.`}
                  />
                )}
              </div>
            )}

            {/* Membresía Fontova */}
            {a.latestFreqFontova && (() => {
              const lf = a.latestFreqFontova
              const freqTrend = a.freqByMonthFontova
              const suggestedMbr = a.suggestedMembershipFontova
              const curMonthName = MONTHS_ES_FULL[parseInt(lf.month.slice(5)) - 1] + ' ' + lf.month.slice(0, 4)
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 pt-1">
                    <div className="h-px flex-1 bg-gray-800" />
                    <div className="flex items-center gap-2 text-xs text-gray-400 font-medium uppercase tracking-widest">
                      <Award size={12} className="text-amber-400" />
                      Candidatos a Membresía · Fontova
                    </div>
                    <div className="h-px flex-1 bg-gray-800" />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                          <Star size={14} className="text-amber-400" />
                          Resumen {curMonthName} · Fontova
                        </h3>
                        <p className="text-xs text-gray-400">Patentes con 2+ visitas en el mismo mes</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                          <p className="text-2xl font-bold text-amber-400">{lf.two}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Patentes 2+ visitas</p>
                          <p className="text-xs text-gray-500">este mes</p>
                        </div>
                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                          <p className="text-2xl font-bold text-orange-400">{lf.three}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Patentes 3+ visitas</p>
                          <p className="text-xs text-gray-500">este mes</p>
                        </div>
                      </div>
                      <div className="border border-amber-500/20 rounded-xl p-4 bg-amber-500/5 space-y-2">
                        <p className="text-xs font-semibold text-amber-300 flex items-center gap-2">
                          <Lightbulb size={12} />
                          Simulación de membresía Fontova
                        </p>
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Ticket promedio (segmento 2+)</span>
                            <span className="text-white font-medium">{fmtCLP(lf.avgTicket2)}/visita</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Gasto estimado 2 visitas/mes</span>
                            <span className="text-white font-medium">{fmtCLP(lf.avgTicket2 * 2)}/mes</span>
                          </div>
                          <div className="h-px bg-amber-500/20 my-1" />
                          <div className="flex justify-between">
                            <span className="text-amber-300 font-medium">Membresía sugerida</span>
                            <span className="text-amber-300 font-bold">{fmtCLP(suggestedMbr)}/mes</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Ahorro para el cliente</span>
                            <span className="text-green-400 font-medium">{fmtCLP(lf.avgTicket2 * 2 - suggestedMbr)}/mes</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Ingreso garantizado (si {lf.two} se suscriben)</span>
                            <span className="text-blue-400 font-medium">{fmtCLP(suggestedMbr * lf.two)}/mes</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                        <BarChart2 size={14} className="text-amber-400" />
                        Evolución patentes frecuentes Fontova (2+/mes)
                      </h3>
                      <div className="space-y-1.5">
                        {freqTrend.map(m => {
                          const maxTwo = Math.max(...freqTrend.map(x => x.two), 1)
                          return (
                            <div key={m.month} className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-14 shrink-0">{m.label}</span>
                              <div className="flex-1 h-5 bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500/60 rounded-full" style={{ width: `${(m.two / maxTwo) * 100}%` }} />
                              </div>
                              <span className="text-xs text-amber-300 font-medium w-6 text-right shrink-0">{m.two}</span>
                              <span className="text-xs text-gray-600 w-20 text-right shrink-0">{fmtCLP(m.avgTicket2)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {lf.topCandidates.length > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                        <Users size={14} className="text-amber-400" />
                        Candidatos prioritarios Fontova {curMonthName}
                      </h3>
                      <p className="text-xs text-gray-500 mb-4">Patentes con 2+ visitas. Son los más fáciles de convertir a membresía.</p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500 border-b border-gray-800">
                            <th className="text-left pb-2 font-medium">Patente</th>
                            <th className="text-right pb-2 font-medium">Visitas</th>
                            <th className="text-right pb-2 font-medium">Gasto mes</th>
                            <th className="text-right pb-2 font-medium">Ticket prom.</th>
                            <th className="text-right pb-2 font-medium">Ahorro membresía</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/60">
                          {lf.topCandidates.map(c => (
                            <tr key={c.patente} className="hover:bg-amber-500/5">
                              <td className="py-2 font-mono text-amber-300 font-medium">{c.patente}</td>
                              <td className="py-2 text-right">
                                <span className={`font-bold ${c.visits >= 3 ? 'text-orange-400' : 'text-white'}`}>{c.visits}</span>
                                {c.visits >= 3 && <span className="ml-1 text-orange-400">★</span>}
                              </td>
                              <td className="py-2 text-right text-white">{fmtCLP(c.total)}</td>
                              <td className="py-2 text-right text-gray-300">{fmtCLP(c.ticket)}</td>
                              <td className="py-2 text-right text-green-400 font-medium">{fmtCLP(Math.max(0, c.total - suggestedMbr))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-xs text-gray-500 mt-3">★ = 3+ visitas en el mes. Contactarlos directamente con la propuesta de membresía puede tener una tasa de conversión del 40-60%.</p>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )
      })()}
    </div>
  )
}
