import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, RefreshCw, TrendingUp, TrendingDown, Wallet, CreditCard, Banknote, Landmark } from 'lucide-react'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0)

const PERSONAS = ['Daniel', 'Gloria']

const MEDIOS = [
  { value: 'credito', label: 'Tarjeta de crédito', short: 'Crédito', icon: CreditCard, color: '#8b5cf6' },
  { value: 'debito', label: 'Débito', short: 'Débito', icon: Landmark, color: '#3b82f6' },
  { value: 'efectivo', label: 'Efectivo', short: 'Efectivo', icon: Banknote, color: '#10b981' },
]

const CATEGORIAS = [
  'Supermercado', 'Salud', 'Bencina y transporte', 'Cuentas del hogar', 'Restaurantes',
  'Ropa', 'Hogar y muebles', 'Familia', 'Entretenimiento', 'Regalos', 'Suscripciones', 'Otros',
]

const hoy = () => new Date().toISOString().split('T')[0]
const DEFAULT_FORM = { persona: 'Daniel', categoria: '', monto: '', medio_pago: 'debito', detalle: '', fecha: hoy() }

// Supabase limita a 1000 filas por consulta; se pagina para que el ingreso del mes sea exacto.
async function fetchAll(buildQuery) {
  const size = 1000
  let all = []
  for (let from = 0; ; from += size) {
    const { data, error } = await buildQuery().range(from, from + size - 1)
    if (error || !data) break
    all = all.concat(data)
    if (data.length < size) break
  }
  return all
}

function monthRange(mes) {
  const [y, m] = mes.split('-').map(Number)
  const first = `${y}-${String(m).padStart(2, '0')}-01`
  const last = new Date(y, m, 0).toISOString().split('T')[0]
  return [first, last]
}

const sum = (rows, key = 'monto') => rows.reduce((a, r) => a + Number(r[key] ?? 0), 0)

function Kpi({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
        <Icon size={14} className={color} />
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

function Barra({ label, monto, total, color }) {
  const pct = total > 0 ? (monto / total) * 100 : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-xs text-gray-300 truncate">{label}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          <span className="text-xs text-gray-500">{pct.toFixed(0)}%</span>
          <span className="text-xs font-medium text-gray-200">{fmt(monto)}</span>
        </div>
      </div>
      <div className="bg-gray-800 rounded-full h-1.5">
        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

export default function Personal() {
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  const [filtroPersona, setFiltroPersona] = useState('')
  const [form, setForm] = useState(DEFAULT_FORM)
  const [gastos, setGastos] = useState([])
  const [ingreso, setIngreso] = useState({ ventas: 0, membresias: 0, subarriendos: 0, gastosLocales: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [mes])

  async function load() {
    setLoading(true)
    const [first, last] = monthRange(mes)
    const [personales, lavado, membresia, subarriendo, gastosLoc] = await Promise.all([
      fetchAll(() => supabase.from('gastos_personales').select('*').gte('fecha', first).lte('fecha', last).order('fecha', { ascending: false }).order('id', { ascending: false })),
      fetchAll(() => supabase.from('transacciones_lavado').select('id, monto').gte('fecha', first).lte('fecha', last).order('id')),
      fetchAll(() => supabase.from('pagos_membresia').select('id, monto').gte('fecha_pago', first).lte('fecha_pago', last).order('id')),
      fetchAll(() => supabase.from('pagos_subarriendo').select('id, monto_pagado').gte('fecha_pago', first).lte('fecha_pago', last).order('id')),
      fetchAll(() => supabase.from('gastos').select('id, monto').gte('fecha', first).lte('fecha', last).order('id')),
    ])
    setGastos(personales)
    setIngreso({
      ventas: sum(lavado),
      membresias: sum(membresia),
      subarriendos: sum(subarriendo, 'monto_pagado'),
      gastosLocales: sum(gastosLoc),
    })
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.monto || !form.categoria || !form.fecha) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('gastos_personales').insert({
      persona: form.persona,
      categoria: form.categoria,
      monto: Number(form.monto),
      medio_pago: form.medio_pago,
      detalle: form.detalle || null,
      fecha: form.fecha,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setForm(f => ({ ...DEFAULT_FORM, persona: f.persona, medio_pago: f.medio_pago }))
    setSuccess(true)
    setTimeout(() => setSuccess(false), 2500)
    await load()
  }

  async function eliminar(id) {
    await supabase.from('gastos_personales').delete().eq('id', id)
    await load()
  }

  const utilidad = ingreso.ventas + ingreso.membresias + ingreso.subarriendos - ingreso.gastosLocales
  const totalGastado = sum(gastos)
  const saldo = utilidad - totalGastado
  const visibles = filtroPersona ? gastos.filter(g => g.persona === filtroPersona) : gastos

  const porPersona = PERSONAS.map(p => ({ nombre: p, monto: sum(gastos.filter(g => g.persona === p)) }))
  const porMedio = MEDIOS.map(m => ({ ...m, monto: sum(gastos.filter(g => g.medio_pago === m.value)) }))
  const porCategoria = Object.entries(
    gastos.reduce((acc, g) => { acc[g.categoria] = (acc[g.categoria] ?? 0) + Number(g.monto); return acc }, {})
  ).sort((a, b) => b[1] - a[1])

  const medioInfo = (v) => MEDIOS.find(m => m.value === v)
  const mesLabel = new Date(mes + '-15').toLocaleString('es-CL', { month: 'long', year: 'numeric' })
  const inputCls = 'w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Gastos Personales</h2>
          <p className="text-sm text-gray-400 capitalize">Daniel y Gloria · {mesLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={mes}
            onChange={e => e.target.value && setMes(e.target.value)}
            className="flex-1 sm:flex-none bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button onClick={load} className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi
          label="Ingreso (utilidad locales)"
          value={fmt(utilidad)}
          sub={`${fmt(ingreso.ventas + ingreso.membresias)} ventas${ingreso.subarriendos ? ` + ${fmt(ingreso.subarriendos)} subarriendos` : ''} − ${fmt(ingreso.gastosLocales)} gastos locales`}
          color="text-green-400"
          icon={TrendingUp}
        />
        <Kpi label="Gastos personales" value={fmt(totalGastado)} sub={`${gastos.length} gastos registrados`} color="text-red-400" icon={TrendingDown} />
        <Kpi
          label="Saldo del mes"
          value={fmt(saldo)}
          sub={utilidad > 0 ? `${((totalGastado / utilidad) * 100).toFixed(0)}% de la utilidad gastado` : 'Sin utilidad en el mes'}
          color={saldo >= 0 ? 'text-blue-400' : 'text-red-400'}
          icon={Wallet}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Formulario + desgloses */}
        <div className="lg:col-span-1 space-y-5">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Nuevo Gasto Personal</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">¿Quién gastó? *</label>
                <div className="grid grid-cols-2 gap-2">
                  {PERSONAS.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, persona: p }))}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        form.persona === p ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Medio de pago *</label>
                <div className="grid grid-cols-3 gap-2">
                  {MEDIOS.map(m => {
                    const Icon = m.icon
                    const active = form.medio_pago === m.value
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, medio_pago: m.value }))}
                        className={`flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs font-medium border transition-colors ${
                          active ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        <Icon size={15} />
                        {m.short}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Categoría *</label>
                <select required value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} className={inputCls}>
                  <option value="">Seleccionar...</option>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Monto *</label>
                <input
                  type="number"
                  required
                  min="1"
                  inputMode="numeric"
                  placeholder="ej: 25000"
                  value={form.monto}
                  onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Fecha *</label>
                <input type="date" required value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={inputCls} />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Detalle</label>
                <input
                  type="text"
                  placeholder="ej: Jumbo, farmacia, bencina..."
                  value={form.detalle}
                  onChange={e => setForm(f => ({ ...f, detalle: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors mt-2"
              >
                <Plus size={14} />
                {saving ? 'Guardando...' : 'Guardar Gasto'}
              </button>
              {success && <p className="text-center text-xs text-green-400 font-medium">Gasto registrado correctamente</p>}
              {error && <p className="text-center text-xs text-red-400">{error}</p>}
            </form>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Por persona</h3>
              <div className="space-y-3">
                {porPersona.map((p, i) => <Barra key={p.nombre} label={p.nombre} monto={p.monto} total={totalGastado} color={['#3b82f6', '#ec4899'][i]} />)}
              </div>
            </div>
            <div className="border-t border-gray-800 pt-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Por medio de pago</h3>
              <div className="space-y-3">
                {porMedio.map(m => <Barra key={m.value} label={m.label} monto={m.monto} total={totalGastado} color={m.color} />)}
              </div>
            </div>
            {porCategoria.length > 0 && (
              <div className="border-t border-gray-800 pt-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Por categoría</h3>
                <div className="space-y-3">
                  {porCategoria.map(([nombre, monto]) => <Barra key={nombre} label={nombre} monto={monto} total={totalGastado} color="#f59e0b" />)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Historial */}
        <div className="lg:col-span-2">
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-800">
              <div>
                <h3 className="text-sm font-semibold text-gray-200">Historial del mes</h3>
                <p className="text-xs text-gray-500 mt-0.5">Total: <span className="text-red-400 font-medium">{fmt(sum(visibles))}</span></p>
              </div>
              <div className="flex gap-1.5">
                {['', ...PERSONAS].map(p => (
                  <button
                    key={p || 'todos'}
                    onClick={() => setFiltroPersona(p)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                      filtroPersona === p ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {p || 'Todos'}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Fecha</th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Quién</th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Categoría</th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Medio</th>
                    <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Monto</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {loading ? (
                    <tr><td colSpan={6} className="text-center text-gray-500 py-10">Cargando...</td></tr>
                  ) : visibles.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-gray-500 py-10">Sin gastos personales este mes.</td></tr>
                  ) : visibles.map(g => {
                    const medio = medioInfo(g.medio_pago)
                    return (
                      <tr key={g.id} className="hover:bg-gray-800/50 transition-colors">
                        <td className="px-5 py-3 text-gray-300 text-xs font-mono whitespace-nowrap">{g.fecha}</td>
                        <td className="px-5 py-3 text-gray-200 text-xs font-medium">{g.persona}</td>
                        <td className="px-5 py-3 text-gray-300 text-xs">
                          {g.categoria}
                          {g.detalle && <span className="block text-gray-500">{g.detalle}</span>}
                        </td>
                        <td className="px-5 py-3 text-xs whitespace-nowrap" style={{ color: medio?.color }}>{medio?.short ?? g.medio_pago}</td>
                        <td className="px-5 py-3 text-right font-semibold text-red-400 whitespace-nowrap">{fmt(g.monto)}</td>
                        <td className="px-5 py-3">
                          <button onClick={() => eliminar(g.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
