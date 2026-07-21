import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { buildPricingAnalysis, simulatePriceChange } from '../lib/pricing'
import {
  DollarSign, TrendingUp, Layers, Tag, Sparkles, Crown, ArrowUpRight,
  AlertTriangle, RefreshCw, SlidersHorizontal, Info,
} from 'lucide-react'

const fmtCLP = (n) => '$' + Math.round(n || 0).toLocaleString('es-CL')

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    green: 'text-green-400 bg-green-500/10 border-green-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon size={16} />
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

function RecCard({ icon: Icon, accent, tag, title, body }) {
  const accents = {
    green: 'border-green-500/30 bg-green-500/5 text-green-400',
    amber: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
    blue: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
    purple: 'border-purple-500/30 bg-purple-500/5 text-purple-400',
  }
  const [bC, bg, iC] = accents[accent].split(' ')
  return (
    <div className={`border rounded-xl p-5 ${bC} ${bg}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 shrink-0 ${iC}`}><Icon size={18} /></div>
        <div>
          <span className={`text-xs font-medium ${iC}`}>{tag}</span>
          <h4 className="text-sm font-semibold text-white mt-0.5">{title}</h4>
          <p className="text-sm text-gray-300 leading-relaxed mt-1">{body}</p>
        </div>
      </div>
    </div>
  )
}

function Simulator({ services }) {
  const [svcName, setSvcName] = useState(services[0]?.name || '')
  const [pct, setPct] = useState(8)
  const [elasticity, setElasticity] = useState(-0.6)

  const svc = services.find(s => s.name === svcName) || services[0]
  useEffect(() => {
    // si el servicio tiene elasticidad estimada, úsala como punto de partida
    if (svc?.elasticity) setElasticity(Math.max(-2, Math.min(-0.1, +svc.elasticity.value.toFixed(2))))
  }, [svcName]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!svc) return null
  const sim = simulatePriceChange({
    currentPrice: svc.avg, currentVolume: svc.count, priceChangePct: pct, elasticity,
  })
  const positive = sim.revenueDelta >= 0

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <SlidersHorizontal size={16} className="text-blue-400" />
        <h3 className="text-sm font-semibold text-white">Simulador de alza de precio</h3>
      </div>
      <div className="grid md:grid-cols-3 gap-4 mb-5">
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">Servicio</label>
          <select value={svcName} onChange={e => setSvcName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500">
            {services.map(s => <option key={s.name} value={s.name}>{s.titled}</option>)}
          </select>
          <p className="text-xs text-gray-500 mt-1.5">Precio actual: <span className="text-gray-300">{fmtCLP(svc.avg)}</span> · {svc.count.toLocaleString()} ventas/histórico</p>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">Cambio de precio: <span className="text-white font-medium">{pct > 0 ? '+' : ''}{pct}%</span></label>
          <input type="range" min="-20" max="30" step="1" value={pct} onChange={e => setPct(+e.target.value)} className="w-full accent-blue-500" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">
            Elasticidad: <span className="text-white font-medium">{elasticity}</span>
            {svc.elasticity && <span className="text-green-400 ml-1">· estimada de tus datos</span>}
          </label>
          <input type="range" min="-2" max="-0.1" step="0.1" value={elasticity} onChange={e => setElasticity(+e.target.value)} className="w-full accent-blue-500" />
          <p className="text-xs text-gray-500 mt-1">Cuánto cae el volumen por cada 1% de alza</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-800/50 rounded-lg p-3">
          <p className="text-xs text-gray-400">Precio nuevo</p>
          <p className="text-lg font-bold text-white">{fmtCLP(sim.newPrice)}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3">
          <p className="text-xs text-gray-400">Volumen proyectado</p>
          <p className="text-lg font-bold text-white">{sim.newVolume.toLocaleString()}</p>
          <p className="text-xs text-gray-500">{sim.volumeDeltaPct >= 0 ? '+' : ''}{sim.volumeDeltaPct.toFixed(1)}%</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3">
          <p className="text-xs text-gray-400">Ingreso proyectado</p>
          <p className="text-lg font-bold text-white">{fmtCLP(sim.newRevenue)}</p>
        </div>
        <div className={`rounded-lg p-3 ${positive ? 'bg-green-500/10 border border-green-500/20' : 'bg-rose-500/10 border border-rose-500/20'}`}>
          <p className="text-xs text-gray-400">Δ Ingreso</p>
          <p className={`text-lg font-bold ${positive ? 'text-green-400' : 'text-rose-400'}`}>{sim.revenueDelta >= 0 ? '+' : ''}{fmtCLP(sim.revenueDelta)}</p>
          <p className={`text-xs ${positive ? 'text-green-500' : 'text-rose-500'}`}>{sim.revenueDeltaPct >= 0 ? '+' : ''}{sim.revenueDeltaPct.toFixed(1)}%</p>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-4 flex items-start gap-1.5">
        <Info size={13} className="mt-0.5 shrink-0" />
        Proyección por el lado de la demanda (precio × volumen). Para retorno real de <b className="text-gray-400 font-medium">margen</b> falta cargar el costo por servicio.
      </p>
    </div>
  )
}

export default function Pricing() {
  const [txns, setTxns] = useState([])
  const [loading, setLoading] = useState(true)
  const [local, setLocal] = useState('all')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { count } = await supabase.from('transacciones_lavado').select('*', { count: 'exact', head: true })
      const total = count || 0
      const pageSize = 1000
      const pages = Math.ceil(total / pageSize)
      const fetches = Array.from({ length: pages }, (_, i) =>
        supabase.from('transacciones_lavado').select('fecha, monto, tipo_servicio, marca, patente, local_id').range(i * pageSize, (i + 1) * pageSize - 1)
      )
      const results = await Promise.all(fetches)
      setTxns(results.flatMap(r => r.data || []))
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => local === 'all' ? txns : txns.filter(t => t.local_id === Number(local)), [txns, local])
  const a = useMemo(() => buildPricingAnalysis(filtered), [filtered])

  if (loading) return (
    <div className="p-8 text-gray-400 flex items-center gap-2">
      <RefreshCw size={16} className="animate-spin" /> Cargando datos de pricing...
    </div>
  )
  if (!a) return <div className="p-8 text-gray-400">Sin datos suficientes.</div>

  return (
    <div className="p-6 space-y-8 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Pricing &amp; Rentabilidad</h1>
          <p className="text-sm text-gray-400 mt-0.5">Precios reales, elasticidad estimada, upsell y simulador — por el lado de la demanda</p>
        </div>
        <select value={local} onChange={e => setLocal(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="all">Todos los locales</option>
          <option value="1">Av. Pedro Fontova</option>
          <option value="2">Curicó</option>
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="Ticket promedio" value={fmtCLP(a.ticketPromedio)} color="blue" />
        <StatCard icon={Layers} label="Attach rate de extras" value={`${a.attachRateGlobal.toFixed(1)}%`} sub="ventas con al menos un adicional" color="purple" />
        <StatCard icon={Tag} label="Servicios con precio activo" value={a.serviceTable.length} color="green" />
        <StatCard icon={Crown} label="Oportunidades de recargo" value={a.premiumOpps.length} sub="premium paga casi lo mismo" color="amber" />
      </div>

      {/* Recomendaciones */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Sparkles size={16} className="text-amber-400" /> Recomendaciones de pricing</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {a.premiumOpps.slice(0, 1).map(o => (
            <RecCard key={o.name} icon={Crown} accent="amber" tag="Recargo premium"
              title={`${o.titled}: los autos premium pagan casi lo mismo`}
              body={`En ${o.titled}, los autos de gama alta pagan ${fmtCLP(o.premAvg)} vs ${fmtCLP(o.stdAvg)} del estándar — ${o.gap > 0 ? `apenas ${fmtCLP(o.gap)} más` : 'incluso un poco menos'}. Un recargo "Premium Care" de $2.000–3.000 sobre estos ${o.premCount.toLocaleString()} servicios se acepta sin fricción y cae directo al margen.`} />
          ))}
          {a.upsellOpps.slice(0, 1).map(o => (
            <RecCard key={o.addon} icon={ArrowUpRight} accent="green" tag="Upsell en caja"
              title={`Empuja "${o.titled}" al lavado base`}
              body={`Solo el ${o.attachRate.toFixed(1)}% de los lavados base lo suman, pero cuando lo hacen suben el ticket +${fmtCLP(o.lift)}. Entrenar a caja para ofrecerlo activamente es ingreso sin costo de adquisición.`} />
          ))}
          {a.raiseHints.slice(0, 1).map(s => (
            <RecCard key={s.name} icon={TrendingUp} accent="blue" tag="Aguanta un alza"
              title={`${s.titled} tolera un ajuste al alza`}
              body={`Alto volumen (${s.count.toLocaleString()} ventas), poco descuento y demanda ${s.elasticity ? `poco sensible al precio (elasticidad ${s.elasticity.value.toFixed(2)})` : 'estable'}. Un +5–8% sobre ${fmtCLP(s.avg)} probablemente no mueve el volumen. Pruébalo y mide.`} />
          ))}
          {a.serviceTable.filter(s => s.dispersion > 0.4).slice(0, 1).map(s => (
            <RecCard key={s.name} icon={AlertTriangle} accent="purple" tag="Fuga por descuento"
              title={`${s.titled} se vende a precios muy dispersos`}
              body={`El precio de ${s.titled} varía mucho (de ${fmtCLP(s.min)} a ${fmtCLP(s.max)}). Tanta dispersión suele ser descuento no controlado. Estandarizar el precio recupera margen sin subir la tarifa de lista.`} />
          ))}
        </div>
      </div>

      {/* Simulador */}
      <Simulator services={a.serviceTable} />

      {/* Tabla de precios reales */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Tag size={16} className="text-green-400" /> Precio real por servicio</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
                  <th className="text-left font-medium py-3 px-4">Servicio</th>
                  <th className="text-right font-medium py-3 px-4">Ventas</th>
                  <th className="text-right font-medium py-3 px-4">Precio prom.</th>
                  <th className="text-right font-medium py-3 px-4">Rango</th>
                  <th className="text-right font-medium py-3 px-4">Dispersión</th>
                  <th className="text-right font-medium py-3 px-4">Elasticidad</th>
                  <th className="text-right font-medium py-3 px-4">% ingreso</th>
                </tr>
              </thead>
              <tbody>
                {a.serviceTable.map(s => (
                  <tr key={s.name} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2.5 px-4 text-gray-200 max-w-[220px] truncate">{s.titled}</td>
                    <td className="py-2.5 px-4 text-right text-gray-400 tabular-nums">{s.count.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right text-white font-medium tabular-nums">{fmtCLP(s.avg)}</td>
                    <td className="py-2.5 px-4 text-right text-gray-500 tabular-nums text-xs">{fmtCLP(s.min)}–{fmtCLP(s.max)}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      <span className={s.dispersion > 0.4 ? 'text-amber-400' : 'text-gray-400'}>{(s.dispersion * 100).toFixed(0)}%</span>
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-xs">
                      {s.elasticity ? <span className="text-gray-300">{s.elasticity.value.toFixed(2)}</span> : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right text-gray-400 tabular-nums">{s.revShare.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2 flex items-start gap-1.5">
          <Info size={13} className="mt-0.5 shrink-0" />
          Precio limpio calculado solo con ventas del servicio solo (sin combos). Dispersión alta = descuentos frecuentes. Elasticidad "—" = sin variación de precio histórica suficiente para estimarla.
        </p>
      </div>

      {/* Extras / upsell */}
      {a.upsellOpps.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><ArrowUpRight size={16} className="text-green-400" /> Extras: attach rate y aporte al ticket</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
                    <th className="text-left font-medium py-3 px-4">Extra</th>
                    <th className="text-right font-medium py-3 px-4">Veces vendido</th>
                    <th className="text-right font-medium py-3 px-4">Attach rate</th>
                    <th className="text-right font-medium py-3 px-4">Aporte al ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {a.upsellOpps.slice(0, 12).map(o => (
                    <tr key={o.addon} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2.5 px-4 text-gray-200">{o.titled}</td>
                      <td className="py-2.5 px-4 text-right text-gray-400 tabular-nums">{o.count.toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums">
                        <span className={o.attachRate < 5 ? 'text-amber-400' : 'text-gray-300'}>{o.attachRate.toFixed(1)}%</span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-green-400 font-medium tabular-nums">+{fmtCLP(o.lift)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Attach rate bajo + aporte alto = mayor oportunidad de upsell en caja.</p>
        </div>
      )}
    </div>
  )
}
