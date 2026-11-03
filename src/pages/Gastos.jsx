import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, RefreshCw, Pencil, X } from 'lucide-react'
import { dividirEnCuotas, notaCuota, MESES, rangoMes } from '../lib/gastos'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0)

const DEFAULT_FORM = { local_id: '', categoria_id: '', monto: '', proveedor: '', fecha: new Date().toISOString().split('T')[0], notas: '', metodo_pago: '', es_cuotas: false, num_cuotas: '' }

const METODOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'automatico_cta_cte', label: 'Automático cta. cte.' },
]

const METODO_LABEL = Object.fromEntries(METODOS_PAGO.map(m => [m.value, m.label]))

const mesActual = () => new Date().toISOString().slice(0, 7)

// Meses para el filtro: desde 2024-01 hasta 3 meses adelante (las cuotas caen en meses futuros)
function opcionesMes() {
  const out = []
  const hoy = new Date()
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 3, 1)
  for (let d = new Date(fin); d >= new Date(2024, 0, 1); d.setMonth(d.getMonth() - 1)) {
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${MESES[d.getMonth()]} ${d.getFullYear()}` })
  }
  return out
}

export default function Gastos() {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [categorias, setCategorias] = useState([])
  const [locales, setLocales] = useState([])
  const [gastos, setGastos] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(null)
  const [editando, setEditando] = useState(null)   // gasto que se está editando (null = formulario de gasto nuevo)
  const [errorMsg, setErrorMsg] = useState(null)
  // Filtros del historial
  const [filtroMes, setFiltroMes] = useState(mesActual())   // 'YYYY-MM' o 'todos'
  const [filtroCat, setFiltroCat] = useState('')
  const [filtroLocal, setFiltroLocal] = useState('')
  const meses = opcionesMes()

  useEffect(() => {
    Promise.all([
      supabase.from('categorias_gasto').select('*').order('nombre'),
      supabase.from('locales').select('*').order('nombre'),
    ]).then(([{ data: cats }, { data: locs }]) => {
      setCategorias(cats ?? [])
      setLocales(locs ?? [])
    })
  }, [])

  useEffect(() => { loadGastos() }, [filtroMes, filtroCat, filtroLocal])

  async function loadGastos() {
    setLoading(true)
    let q = supabase
      .from('gastos')
      .select('*, categorias_gasto(nombre, color), locales(nombre)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000)
    if (filtroMes !== 'todos') {
      const { desde, hasta } = rangoMes(filtroMes)
      q = q.gte('fecha', desde).lte('fecha', hasta)
    }
    if (filtroCat) q = q.eq('categoria_id', Number(filtroCat))
    if (filtroLocal === 'general') q = q.is('local_id', null)
    else if (filtroLocal) q = q.eq('local_id', Number(filtroLocal))
    const { data } = await q
    setGastos(data ?? [])
    setLoading(false)
  }

  const avisar = (text) => { setSuccess(text); setTimeout(() => setSuccess(null), 3000) }
  const cuotasPrevia = form.es_cuotas && Number(form.num_cuotas) >= 2 && Number(form.monto) > 0 && !editando
    ? dividirEnCuotas({ monto: form.monto, cuotas: form.num_cuotas, fecha: form.fecha })
    : null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.monto || !form.categoria_id || !form.fecha) return
    setSaving(true)
    setErrorMsg(null)
    const base = {
      local_id: form.local_id ? Number(form.local_id) : null,
      categoria_id: Number(form.categoria_id),
      proveedor: form.proveedor || null,
      metodo_pago: form.metodo_pago || null,
    }

    let error
    if (editando) {
      // Edición directa: se modifica ese mismo gasto (si es una cuota, solo esa cuota)
      ;({ error } = await supabase.from('gastos').update({
        ...base, monto: Number(form.monto), fecha: form.fecha, notas: form.notas || null,
      }).eq('id', editando.id))
    } else if (cuotasPrevia) {
      // Gasto en cuotas: el total se divide en N gastos mensuales
      const total = Math.round(Number(form.monto))
      const n = cuotasPrevia.length
      ;({ error } = await supabase.from('gastos').insert(cuotasPrevia.map(c => ({
        ...base, monto: c.monto, fecha: c.fecha, notas: notaCuota(c.numero, n, total, form.notas),
        metodo_carga: 'manual', es_cuotas: true, num_cuotas: n,
      }))))
    } else {
      ;({ error } = await supabase.from('gastos').insert({
        ...base, monto: Number(form.monto), fecha: form.fecha, notas: form.notas || null,
        metodo_carga: 'manual', es_cuotas: form.es_cuotas, num_cuotas: form.es_cuotas && form.num_cuotas ? Number(form.num_cuotas) : null,
      }))
    }
    setSaving(false)
    if (error) { setErrorMsg('No se pudo guardar. Revisa la conexión e intenta de nuevo.'); return }

    const eraEdicion = Boolean(editando)
    const nCuotas = cuotasPrevia?.length
    setForm({ ...DEFAULT_FORM, fecha: new Date().toISOString().split('T')[0] })
    setEditando(null)
    avisar(eraEdicion ? 'Cambios guardados' : nCuotas ? `Gasto registrado en ${nCuotas} cuotas` : 'Gasto registrado correctamente')
    await loadGastos()
  }

  function editar(g) {
    setEditando(g)
    setErrorMsg(null)
    setForm({
      local_id: g.local_id ? String(g.local_id) : '',
      categoria_id: String(g.categoria_id),
      monto: String(g.monto),
      proveedor: g.proveedor ?? '',
      fecha: g.fecha,
      notas: g.notas ?? '',
      metodo_pago: g.metodo_pago ?? '',
      es_cuotas: Boolean(g.es_cuotas),
      num_cuotas: g.num_cuotas ? String(g.num_cuotas) : '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelarEdicion() {
    setEditando(null)
    setErrorMsg(null)
    setForm(DEFAULT_FORM)
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este gasto?')) return
    await supabase.from('gastos').delete().eq('id', id)
    if (editando?.id === id) cancelarEdicion()
    await loadGastos()
  }

  const totalFiltrado = gastos.reduce((a, g) => a + Number(g.monto), 0)
  const porCategoria = Object.values(gastos.reduce((acc, g) => {
    const k = g.categorias_gasto?.nombre ?? 'Sin categoría'
    acc[k] = acc[k] || { nombre: k, color: g.categorias_gasto?.color ?? '#6b7280', total: 0 }
    acc[k].total += Number(g.monto)
    return acc
  }, {})).sort((a, b) => b.total - a.total)
  const etiquetaPeriodo = filtroMes === 'todos' ? 'Todos los meses' : meses.find(m => m.value === filtroMes)?.label ?? filtroMes

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Gastos</h2>
        <p className="text-sm text-gray-400">Registro manual de gastos operacionales</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Formulario */}
        <div className="lg:col-span-1">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-200">{editando ? 'Editando gasto' : 'Nuevo Gasto'}</h3>
              {editando && (
                <button type="button" onClick={cancelarEdicion} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white">
                  <X size={13} /> Cancelar
                </button>
              )}
            </div>
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
                <label className="block text-xs text-gray-400 mb-1.5">Medio de pago</label>
                <select
                  value={form.metodo_pago}
                  onChange={e => setForm(f => ({ ...f, metodo_pago: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sin especificar</option>
                  {METODOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.es_cuotas}
                    disabled={Boolean(editando)}
                    onChange={e => setForm(f => ({ ...f, es_cuotas: e.target.checked, num_cuotas: e.target.checked ? f.num_cuotas : '' }))}
                    className="rounded border-gray-700 bg-gray-800"
                  />
                  Pago en cuotas (el total se divide en una cuota por mes)
                </label>
                {cuotasPrevia && (
                  <p className="text-xs text-purple-300 mt-2">
                    {cuotasPrevia.length} cuotas de {fmt(cuotasPrevia[0].monto)} · desde {cuotasPrevia[0].fecha} hasta {cuotasPrevia[cuotasPrevia.length - 1].fecha}
                    {cuotasPrevia[cuotasPrevia.length - 1].monto !== cuotasPrevia[0].monto ? ` (la última, ${fmt(cuotasPrevia[cuotasPrevia.length - 1].monto)})` : ''}
                  </p>
                )}
                {editando?.es_cuotas && (
                  <p className="text-xs text-gray-500 mt-2">Esto edita solo esta cuota. Para cambiar el total o la cantidad, elimina las cuotas y vuelve a ingresar el gasto.</p>
                )}
                {form.es_cuotas && !editando && (
                  <input
                    type="number"
                    min="2"
                    placeholder="N° de cuotas"
                    value={form.num_cuotas}
                    onChange={e => setForm(f => ({ ...f, num_cuotas: e.target.value }))}
                    className="w-full mt-2 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
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
                {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Guardar Gasto'}
              </button>

              {success && (
                <p className="text-center text-xs text-green-400 font-medium">{success}</p>
              )}
              {errorMsg && (
                <p className="text-center text-xs text-red-400 font-medium">{errorMsg}</p>
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
        <div className="lg:col-span-2">
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-200">Historial de Gastos</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{etiquetaPeriodo}: <span className="text-red-400 font-semibold text-sm">{fmt(totalFiltrado)}</span> · {gastos.length} gastos</p>
                </div>
                <button onClick={loadGastos} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors">
                  <RefreshCw size={13} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)} className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="todos">Todos los meses</option>
                  {meses.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)} className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">Todas las categorías</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <select value={filtroLocal} onChange={e => setFiltroLocal(e.target.value)} className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">Todos los locales</option>
                  <option value="general">General (sin local)</option>
                  {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </div>
              {porCategoria.length > 0 && !filtroCat && (
                <div className="flex flex-wrap gap-1.5">
                  {porCategoria.map(c => (
                    <span key={c.nombre} className="inline-flex items-center gap-1.5 text-xs bg-gray-800 border border-gray-700 rounded-full px-2.5 py-1 text-gray-300">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.nombre} <span className="text-gray-100 font-medium">{fmt(c.total)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Fecha</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Categoría</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Proveedor</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Medio</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Local</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Ingresado por</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Monto</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loading ? (
                  <tr><td colSpan={8} className="text-center text-gray-500 py-10">Cargando...</td></tr>
                ) : gastos.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-gray-500 py-10">Sin gastos en este período.</td></tr>
                ) : gastos.map(g => (
                  <tr key={g.id} className={`hover:bg-gray-800/50 transition-colors ${editando?.id === g.id ? 'bg-blue-500/10' : ''}`}>
                    <td className="px-5 py-3 text-gray-300 text-xs font-mono">{g.fecha}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-200">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.categorias_gasto?.color ?? '#6b7280' }} />
                        {g.categorias_gasto?.nombre ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-sm">
                      {g.proveedor ?? '—'}
                      {g.notas && <span className="block text-xs text-gray-600 max-w-[220px] truncate" title={g.notas}>{g.notas}</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">
                      {g.metodo_pago ? (METODO_LABEL[g.metodo_pago] ?? g.metodo_pago) : '—'}
                      {g.es_cuotas && (
                        <span className="block text-purple-400">{g.num_cuotas ? `${g.num_cuotas} cuotas` : 'en cuotas'}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{g.locales?.nombre ?? 'General'}</td>
                    <td className="px-5 py-3 text-xs">
                      {g.metodo_carga === 'encargado'
                        ? <span className="inline-block px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300">Edison · link</span>
                        : <span className="inline-block px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300">App</span>}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-red-400">{fmt(g.monto)}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <button onClick={() => editar(g)} className="text-gray-500 hover:text-blue-400 transition-colors mr-3" title="Editar">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => eliminar(g.id)} className="text-gray-600 hover:text-red-400 transition-colors" title="Eliminar">
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
    </div>
  )
}
