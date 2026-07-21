// Motor de análisis de pricing para AlphaCleaners.
// Trabaja sobre transacciones_lavado (fecha, monto, tipo_servicio, marca, patente, local_id).
// IMPORTANTE: `monto` es el total de la transacción (incluye combos). Para obtener el
// precio "limpio" de un servicio usamos solo las transacciones STANDALONE (un solo
// segmento en tipo_servicio). El aporte de un extra se estima como el diferencial de
// ticket entre el combo y el servicio base solo.
// No hay datos de COSTO, así que todo esto es pricing por el lado de la DEMANDA, no del margen.

const PREMIUM_BRANDS = new Set([
  'BMW', 'MERCEDES-BENZ', 'MERCEDES BENZ', 'MERCEDES', 'AUDI', 'PORSCHE',
  'VOLVO', 'LAND ROVER', 'LEXUS', 'JAGUAR', 'TESLA', 'MASERATI', 'INFINITI',
  'ACURA', 'GENESIS', 'BENTLEY', 'FERRARI', 'LAMBORGHINI', 'ROLLS-ROYCE',
])

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function titleCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Divide un tipo_servicio en sus segmentos base (lowercase, sin duplicados)
export function parseSegments(tipo) {
  if (!tipo) return []
  const parts = tipo.split(/\s*\|\s*/).map(p => p.trim().toLowerCase()).filter(Boolean)
  return [...new Set(parts)]
}

function stats(nums) {
  if (nums.length === 0) return { avg: 0, min: 0, max: 0, std: 0 }
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const variance = nums.reduce((a, b) => a + (b - avg) ** 2, 0) / nums.length
  return { avg, min, max, std: Math.sqrt(variance) }
}

// Estima elasticidad-precio de un servicio con su serie mensual (precio prom vs volumen).
// Devuelve null si no hay suficiente variación de precio para estimarla.
function estimateElasticity(monthly) {
  const points = []
  for (let i = 1; i < monthly.length; i++) {
    const p0 = monthly[i - 1].price, p1 = monthly[i].price
    const q0 = monthly[i - 1].count, q1 = monthly[i].count
    if (p0 <= 0 || q0 <= 0) continue
    const dP = (p1 - p0) / p0
    const dQ = (q1 - q0) / q0
    if (Math.abs(dP) < 0.02) continue // sin cambio de precio relevante
    points.push(dQ / dP)
  }
  if (points.length < 3) return null
  points.sort((a, b) => a - b)
  const median = points[Math.floor(points.length / 2)] // mediana = robusta a outliers
  return { value: median, samples: points.length }
}

export function buildPricingAnalysis(txns) {
  if (!txns || txns.length === 0) return null

  // ── Precio limpio por servicio base (solo transacciones standalone) ──
  const standalone = {}   // service -> { prices:[], months:{ 'YYYY-MM': {sum,count} } }
  const anyCount = {}     // service -> nº de transacciones donde aparece (solo o en combo)
  let withExtra = 0

  txns.forEach(t => {
    const segs = parseSegments(t.tipo_servicio)
    if (segs.length === 0) return
    const monto = Number(t.monto) || 0
    segs.forEach(s => { anyCount[s] = (anyCount[s] || 0) + 1 })
    if (segs.length > 1) withExtra++
    if (segs.length === 1) {
      const s = segs[0]
      if (!standalone[s]) standalone[s] = { prices: [], months: {} }
      standalone[s].prices.push(monto)
      const mk = (t.fecha || '').slice(0, 7)
      if (mk) {
        if (!standalone[s].months[mk]) standalone[s].months[mk] = { sum: 0, count: 0 }
        standalone[s].months[mk].sum += monto
        standalone[s].months[mk].count++
      }
    }
  })

  const serviceTable = Object.entries(standalone).map(([name, d]) => {
    const st = stats(d.prices)
    const monthly = Object.keys(d.months).sort().map(mk => ({
      mk, price: d.months[mk].sum / d.months[mk].count, count: d.months[mk].count,
    }))
    return {
      name, titled: titleCase(name),
      count: d.prices.length,
      avg: Math.round(st.avg), min: Math.round(st.min), max: Math.round(st.max),
      dispersion: st.avg > 0 ? st.std / st.avg : 0, // coef. de variación (descuentos)
      revenue: Math.round(st.avg * d.prices.length),
      elasticity: estimateElasticity(monthly),
    }
  }).filter(s => s.count >= 10).sort((a, b) => b.revenue - a.revenue)

  const totalRev = serviceTable.reduce((a, s) => a + s.revenue, 0)
  serviceTable.forEach(s => { s.revShare = totalRev > 0 ? (s.revenue / totalRev) * 100 : 0 })

  // ── Recargo premium: por servicio base, premium vs estándar ──
  const premiumComp = {}
  txns.forEach(t => {
    const segs = parseSegments(t.tipo_servicio)
    if (segs.length !== 1) return
    const s = segs[0]
    const isPrem = PREMIUM_BRANDS.has((t.marca || '').trim().toUpperCase())
    if (!premiumComp[s]) premiumComp[s] = { prem: [], std: [] }
    premiumComp[s][isPrem ? 'prem' : 'std'].push(Number(t.monto) || 0)
  })
  const premiumOpps = Object.entries(premiumComp).map(([name, d]) => {
    if (d.prem.length < 5 || d.std.length < 10) return null
    const premAvg = d.prem.reduce((a, b) => a + b, 0) / d.prem.length
    const stdAvg = d.std.reduce((a, b) => a + b, 0) / d.std.length
    const gap = premAvg - stdAvg
    return { name, titled: titleCase(name), premAvg: Math.round(premAvg), stdAvg: Math.round(stdAvg), gap: Math.round(gap), premCount: d.prem.length }
  }).filter(o => o && o.gap < o.stdAvg * 0.08) // premium paga ≤8% más que estándar = oportunidad
    .sort((a, b) => b.premCount - a.premCount)

  // ── Extras / upsell: attach rate y lift de ticket ──
  const baseWashes = ['lavado full', 'lavado plus', 'lavado por fuera']
  const baseStats = {}
  baseWashes.forEach(b => {
    const solo = standalone[b]
    baseStats[b] = solo ? stats(solo.prices).avg : 0
  })
  const addonAgg = {} // addon -> { withBase:count, comboMontos:[] }
  txns.forEach(t => {
    const segs = parseSegments(t.tipo_servicio)
    if (segs.length < 2) return
    const base = segs.find(s => baseWashes.includes(s))
    if (!base) return
    const monto = Number(t.monto) || 0
    segs.filter(s => s !== base && !baseWashes.includes(s)).forEach(addon => {
      if (!addonAgg[addon]) addonAgg[addon] = { count: 0, montos: [], base }
      addonAgg[addon].count++
      addonAgg[addon].montos.push(monto)
    })
  })
  const totalBaseTxns = baseWashes.reduce((a, b) => a + (anyCount[b] || 0), 0)
  const upsellOpps = Object.entries(addonAgg).map(([addon, d]) => {
    const comboAvg = d.montos.reduce((a, b) => a + b, 0) / d.montos.length
    const lift = comboAvg - (baseStats[d.base] || 0)
    const attachRate = totalBaseTxns > 0 ? (d.count / totalBaseTxns) * 100 : 0
    return { addon, titled: titleCase(addon), count: d.count, lift: Math.round(lift), attachRate }
  }).filter(o => o.count >= 5 && o.lift > 0)
    .sort((a, b) => (b.lift * b.count) - (a.lift * a.count))

  // ── Candidatos a alza: alto volumen, poco descuento, demanda estable/creciente ──
  const raiseHints = serviceTable.filter(s => {
    if (s.count < 30 || s.dispersion > 0.35) return false // mucho descuento = no subir aún
    const el = s.elasticity
    // sin señal de elasticidad, o elasticidad suave (|e| < 1) => aguanta alza
    return !el || Math.abs(el.value) < 1
  }).slice(0, 5)

  const attachRateGlobal = txns.length > 0 ? (withExtra / txns.length) * 100 : 0

  return {
    serviceTable, premiumOpps, upsellOpps, raiseHints,
    attachRateGlobal,
    ticketPromedio: txns.reduce((a, t) => a + (Number(t.monto) || 0), 0) / txns.length,
    totalTxns: txns.length,
    MONTHS_ES,
  }
}

// Simulación de un cambio de precio con elasticidad asumida.
// priceChangePct: p.ej. +8 (subir 8%). elasticity: p.ej. -0.6 (10% alza => 6% menos volumen).
export function simulatePriceChange({ currentPrice, currentVolume, priceChangePct, elasticity }) {
  const dP = priceChangePct / 100
  const dQ = elasticity * dP
  const newVolume = Math.max(0, currentVolume * (1 + dQ))
  const newPrice = currentPrice * (1 + dP)
  const currentRevenue = currentPrice * currentVolume
  const newRevenue = newPrice * newVolume
  return {
    newPrice: Math.round(newPrice),
    newVolume: Math.round(newVolume),
    volumeDeltaPct: dQ * 100,
    currentRevenue: Math.round(currentRevenue),
    newRevenue: Math.round(newRevenue),
    revenueDelta: Math.round(newRevenue - currentRevenue),
    revenueDeltaPct: currentRevenue > 0 ? ((newRevenue - currentRevenue) / currentRevenue) * 100 : 0,
  }
}
