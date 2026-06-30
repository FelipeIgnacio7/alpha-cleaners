import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, RefreshCw } from 'lucide-react'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0)

const DEFAULT_FORM = { local_id: '', categoria_id: '', monto: '', proveedor: '', fecha: new Date().toISOString().split('T')[0], notas: '' }

export default function Gastos() {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [categorias, setCategorias] = useState([])
  const [locales, setLocales] = useState([])
  const [gastos, setGastos] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('categorias_gasto').select('*').order('nombre'),
      supabase.from('locales').select('*').order('nombre'),
    ]).then(([{ data: cats }, { data: locs }]) => {
      setCategorias(cats ?? [])
      setLocales(locs ?? [])
    })
    loadGastos()
  }, [])

  async function loadGastos() {
    setLoading(true)
    const { data } = await supabase
      .from('gastos')
      .select('*, categorias_gasto(nombre, color), locales(nombre)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)
    setGastos(data ?? [])
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.monto || !form.categoria_id || !form.fecha) return
    setSaving(true)
    await supabase.from('gastos').insert({
      local_id: form.local_id ? Number(form.local_id) : null,
      categoria_id: Number(form.categoria_id),
      monto: Number(form.monto),
      proveedor: form.proveedor || null,
      fecha: form.fecha,
      notas: form.notas || null,
      metodo_carga: 'manual',
    })
    setForm(DEFAULT_FORM)
    setSaving(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 2500)
    await loadGastos()
  }

  async function eliminar(id) {
    await supabase.from('gastos').delete().eq('id', id)
    await loadGastos()
  }

  const totalMes = gastos
    .filter(g => g.fecha?.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((a, g) => a + Number(g.monto), 0)

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Gastos</h2>
        <p className="text-sm text-gray-400">Registro manual de gastos operacionales</p>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Formulario */}
        <div className="col-span-1">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Nuevo Gasto</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Categoría *</label>
                <select
                  required
                  value={form.categoria_id}
                  onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar...</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Local (opcional)</label>
                <select
                  value={form.local_id}
                  onChange={e => setForm(f => ({ ...f, local_id: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sin local específico</option>
                  {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Monto *</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="ej: 150000"
                  value={form.monto}
                  onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Proveedor</label>
                <input
                  type="text"
                  placeholder="ej: Sodimac, AES Gener..."
                  value={form.proveedor}
                  onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Fecha *</label>
                <input
                  type="date"
                  required
                  value={form.fecha}
                  onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Notas</label>
                <textarea
                  rows={2}
                  placeholder="Detalles adicionales..."
                  value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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

              {success && (
                <p className="text-center text-xs text-green-400 font-medium">Gasto registrado correctamente</p>
              )}
            </form>

            {/* Placeholder Fase 2 */}
            {/* FASE 2: Carga por foto con IA
            <div className="mt-4 pt-4 border-t border-gray-800">
              <button disabled className="w-full flex items-center justify-center gap-2 bg-gray-800 text-gray-500 text-sm py-2.5 rounded-lg cursor-not-allowed">
                <Camera size={14} />
                Subir Foto (próximamente)
              </button>
            </div>
            */}
          </div>
        </div>

        {/* Tabla */}
        <div className="col-span-2">
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <div>
                <h3 className="text-sm font-semibold text-gray-200">Historial de Gastos</h3>
                <p className="text-xs text-gray-500 mt-0.5">Este mes: <span className="text-red-400 font-medium">{fmt(totalMes)}</span></p>
              </div>
              <button onClick={loadGastos} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors">
                <RefreshCw size={13} />
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Fecha</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Categoría</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Proveedor</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Local</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Monto</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loading ? (
                  <tr><td colSpan={6} className="text-center text-gray-500 py-10">Cargando...</td></tr>
                ) : gastos.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-gray-500 py-10">Sin gastos registrados.</td></tr>
                ) : gastos.map(g => (
                  <tr key={g.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-5 py-3 text-gray-300 text-xs font-mono">{g.fecha}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-200">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.categorias_gasto?.color ?? '#6b7280' }} />
                        {g.categorias_gasto?.nombre ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-sm">{g.proveedor ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{g.locales?.nombre ?? 'General'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-red-400">{fmt(g.monto)}</td>
                    <td className="px-5 py-3">
                      <button onClick={() => eliminar(g.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
