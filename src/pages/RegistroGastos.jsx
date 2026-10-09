import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, CheckCircle2, AlertTriangle, Droplets } from 'lucide-react'

// Página para el encargado: solo permite registrar gastos. No muestra ingresos ni
// ninguna otra cifra del negocio. Se entra con /registro-gastos/<ACCESS_TOKEN>.
const ACCESS_TOKEN = '69zk4m1sn36fdk'

const STORAGE_KEY = 'registro-gastos:recientes'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0)

const METODOS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
]

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const emptyForm = () => ({ local_id: '', categoria_id: '', monto: '', metodo_pago: '', es_cuotas: false, num_cuotas: '', proveedor: '', notas: '', fecha: hoyLocal() })

function leerRecientes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

export default function RegistroGastos({ token }) {
  const [categorias, setCategorias] = useState([])
  const [locales, setLocales] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [recientes, setRecientes] = useState(leerRecientes)

  const autorizado = token === ACCESS_TOKEN

  useEffect(() => {
    if (!autorizado) return
    Promise.all([
      supabase.from('categorias_gasto').select('id, nombre').order('nombre'),
      supabase.from('locales').select('id, nombre').order('nombre'),
    ]).then(([{ data: cats }, { data: locs }]) => {
      setCategorias(cats ?? [])
      setLocales(locs ?? [])
    })
  }, [autorizado])

  if (!autorizado) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-300 flex items-center justify-center p-6 text-center">
        <p className="text-sm">Enlace no válido. Pide un enlace nuevo.</p>
      </div>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.monto || !form.categoria_id || !form.fecha || !form.local_id) return
    setSaving(true)
    setMsg(null)
    const { error } = await supabase.from('gastos').insert({
      local_id: Number(form.local_id),
      categoria_id: Number(form.categoria_id),
      monto: Number(form.monto),
      proveedor: form.proveedor || null,
      fecha: form.fecha,
      notas: form.notas || null,
      metodo_carga: 'encargado',
      metodo_pago: form.metodo_pago || null,
      es_cuotas: form.es_cuotas,
      num_cuotas: form.es_cuotas && form.num_cuotas ? Number(form.num_cuotas) : null,
    })
    setSaving(false)
    if (error) {
      setMsg({ ok: false, text: 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.' })
      return
    }
    const entrada = {
      ts: Date.now(),
      fecha: form.fecha,
      monto: Number(form.monto),
      categoria: categorias.find(c => String(c.id) === form.categoria_id)?.nombre ?? '',
      local: locales.find(l => String(l.id) === form.local_id)?.nombre ?? '',
      detalle: form.proveedor || '',
    }
    const nuevos = [entrada, ...recientes].slice(0, 15)
    setRecientes(nuevos)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevos)) } catch { /* sin almacenamiento local */ }
    setForm(f => ({ ...emptyForm(), local_id: f.local_id }))
    setMsg({ ok: true, text: 'Gasto registrado correctamente' })
    setTimeout(() => setMsg(null), 3500)
  }

  const inputCls = 'w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-sm text-gray-400 mb-1.5'

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-md mx-auto p-4 pb-10 space-y-5">
        <div className="flex items-center gap-3 pt-2">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <Droplets size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white">Alpha Cleaners</h1>
            <p className="text-sm text-gray-400">Registro de gastos</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div>
            <label className={labelCls}>Local *</label>
            <select required value={form.local_id} onChange={e => setForm(f => ({ ...f, local_id: e.target.value }))} className={inputCls}>
              <option value="">Seleccionar...</option>
              {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Categoría *</label>
            <select required value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))} className={inputCls}>
              <option value="">Seleccionar...</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Monto *</label>
            <input
              type="number" inputMode="numeric" required min="1" placeholder="ej: 25000"
              value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Medio de pago</label>
            <div className="grid grid-cols-3 gap-2">
              {METODOS.map(m => (
                <button
                  key={m.value} type="button"
                  onClick={() => setForm(f => ({ ...f, metodo_pago: f.metodo_pago === m.value ? '' : m.value }))}
                  className={`py-3 rounded-lg text-sm font-medium border transition-colors ${
                    form.metodo_pago === m.value ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-400 mt-3 select-none">
              <input
                type="checkbox" checked={form.es_cuotas}
                onChange={e => setForm(f => ({ ...f, es_cuotas: e.target.checked, num_cuotas: e.target.checked ? f.num_cuotas : '' }))}
                className="w-4 h-4 rounded border-gray-700 bg-gray-800"
              />
              Pago en cuotas
            </label>
            {form.es_cuotas && (
              <input
                type="number" inputMode="numeric" min="2" placeholder="N° de cuotas"
                value={form.num_cuotas} onChange={e => setForm(f => ({ ...f, num_cuotas: e.target.value }))}
                className={`${inputCls} mt-2`}
              />
            )}
          </div>

          <div>
            <label className={labelCls}>Proveedor / detalle</label>
            <input
              type="text" placeholder="ej: Sodimac, bencina, químicos..."
              value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))} className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Fecha *</label>
            <input type="date" required value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Notas</label>
            <textarea
              rows={2} placeholder="Detalles adicionales..."
              value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} className={`${inputCls} resize-none`}
            />
          </div>

          <button
            type="submit" disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-base font-medium py-3.5 rounded-lg transition-colors"
          >
            <Plus size={18} />
            {saving ? 'Guardando...' : 'Guardar gasto'}
          </button>

          {msg && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${msg.ok ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
              {msg.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              {msg.text}
            </div>
          )}
        </form>

        {recientes.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-gray-400">Registrados desde este teléfono</h2>
            {recientes.map(r => (
              <div key={r.ts} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-200 truncate">{r.categoria}{r.detalle ? ` · ${r.detalle}` : ''}</p>
                  <p className="text-xs text-gray-500 truncate">{r.local} · {r.fecha}</p>
                </div>
                <span className="text-sm font-semibold text-red-400 shrink-0 ml-3">{fmt(r.monto)}</span>
              </div>
            ))}
            <p className="text-xs text-gray-600">Si te equivocas en un gasto, avisa a la administración para corregirlo.</p>
          </div>
        )}
      </div>
    </div>
  )
}
