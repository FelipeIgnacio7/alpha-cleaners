import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CheckCircle2, Clock, AlertCircle, X, Save, RefreshCw, Plus, ChevronDown, ChevronUp, Trash2, Pencil } from 'lucide-react'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0)

// Locales con cuota DIARIA: lo acordado del mes es la cuota diaria por los días que tenga ese mes.
const CUOTA_DIARIA = {
  3: 180000, // Mall Plaza Alameda
  4: 250000, // Mall Curicó (subarrendado; independiente de las ventas propias de Curicó)
  6: 90000, // Líder Vicuña Mackenna
}
// Locales con monto fijo mensual
const MONTO_MENSUAL = {
  5: 3334000, // Tottus Santa Marta: todo incluido
  7: 2110000, // Ciudad Satélite de Maipú: $1.960.000 arriendo + $150.000 gastos comunes
  8: 1400000, // Copiapó: $700.000 el día 1 y $700.000 el día 15
  10: 0, // Mall Plaza Norte: monto pendiente de definir
}

const diasDelMes = (mes, anio) => new Date(anio, mes, 0).getDate()
const montoVigente = (localId, mes, anio) =>
  CUOTA_DIARIA[localId] ? CUOTA_DIARIA[localId] * diasDelMes(mes, anio) : (MONTO_MENSUAL[localId] ?? 0)
// Si el mes ya tiene abonos, manda el acordado guardado en ellos (se puede ajustar a mano en un abono);
// si no, se calcula con la cuota vigente. Cada mes se evalúa solo contra su propio acordado.
const acordadoDe = (localId, pagosLocal, mes, anio) => pagosLocal.length > 0
  ? Math.max(...pagosLocal.map(p => Number(p.monto_acordado ?? 0)))
  : montoVigente(localId, mes, anio)

const ANIOS = Array.from({ length: new Date().getFullYear() + 1 - 2024 + 1 }, (_, i) => 2024 + i)

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function ModalAbono({ local, mes, anio, montoAcordado, abono, onClose, onSaved }) {
  const editando = Boolean(abono)
  const [monto, setMonto] = useState(editando ? String(abono.monto_pagado) : '')
  const [fecha, setFecha] = useState(editando ? abono.fecha_pago : new Date().toISOString().split('T')[0])
  const [notas, setNotas] = useState(editando ? (abono.notas ?? '') : '')
  const [acordado, setAcordado] = useState(String(montoAcordado))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function save() {
    if (!monto || Number(monto) <= 0) return
    setSaving(true)
    setError(null)
    let err
    if (editando) {
      // Edición directa del abono. Si cambió el acordado del mes, se actualiza en todos los abonos de ese local y período.
      ;({ error: err } = await supabase.from('pagos_subarriendo').update({
        monto_pagado: Number(monto), fecha_pago: fecha, notas: notas || null,
      }).eq('id', abono.id))
      if (!err && Number(acordado) !== Number(montoAcordado)) {
        ;({ error: err } = await supabase.from('pagos_subarriendo').update({ monto_acordado: Number(acordado) })
          .eq('local_id', local.id).eq('mes_periodo', mes).eq('anio_periodo', anio))
      }
    } else {
      ;({ error: err } = await supabase.from('pagos_subarriendo').insert({
        local_id: local.id,
        monto_acordado: Number(acordado) || montoAcordado,
        monto_pagado: Number(monto),
        fecha_pago: fecha,
        mes_periodo: mes,
        anio_periodo: anio,
        estado: 'pagado',
        notas: notas || null,
      }))
    }
    setSaving(false)
    if (err) { setError('No se pudo guardar. Revisa la conexión e intenta de nuevo.'); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-white">{editando ? 'Editar Abono' : 'Agregar Abono'}</h3>
            <p className="text-sm text-gray-400">{local?.nombre} · {MESES[mes - 1]} {anio}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Monto del abono</label>
            <input
              type="number"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder={`ej: ${(montoAcordado / 2).toLocaleString('es-CL')}`}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Acordado del mes</label>
            <input
              type="number"
              value={acordado}
              onChange={e => setAcordado(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Solo de {MESES[mes - 1]} {anio}; no cambia los otros meses.</p>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Fecha del abono</label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Notas (opcional)</label>
            <input
              type="text"
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="ej: Transferencia, primera cuota..."
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium py-2.5 rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={save} disabled={saving || !monto} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
            <Save size={14} />
            {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar Abono'}
          </button>
        </div>
        {error && <p className="text-xs text-red-400 mt-3 text-center">{error}</p>}
      </div>
    </div>
  )
}

function FilaLocal({ local, pagos, mes, anio, onAbonar, onEditAbono, onDeleteAbono }) {
  const [expanded, setExpanded] = useState(false)
  const montoAcordado = acordadoDe(local.id, pagos, mes, anio)
  const totalPagado = pagos.reduce((a, p) => a + Number(p.monto_pagado ?? 0), 0)
  const pct = montoAcordado > 0 ? Math.min((totalPagado / montoAcordado) * 100, 100) : 0
  const saldo = montoAcordado - totalPagado

  const estado = totalPagado === 0
    ? { label: 'Pendiente', color: 'bg-amber-900/40 text-amber-300', icon: <Clock size={11} /> }
    : totalPagado >= montoAcordado
    ? { label: 'Pagado', color: 'bg-green-900/40 text-green-300', icon: <CheckCircle2 size={11} /> }
    : { label: 'Parcial', color: 'bg-blue-900/40 text-blue-300', icon: <AlertCircle size={11} /> }

  return (
    <>
      <tr className="hover:bg-gray-800/40 transition-colors">
        <td className="px-5 py-3.5 font-medium text-gray-200">{local.nombre}</td>
        <td className="px-5 py-3.5 text-gray-400 text-sm">{local.ciudad}</td>
        <td className="px-5 py-3.5 text-right text-gray-300">
          {fmt(montoAcordado)}
          {CUOTA_DIARIA[local.id] && <p className="text-xs text-gray-500">{fmt(CUOTA_DIARIA[local.id])} × {diasDelMes(mes, anio)} días</p>}
        </td>
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-800 rounded-full h-1.5 min-w-[60px]">
              <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-medium text-gray-200 shrink-0">{fmt(totalPagado)}</span>
          </div>
          {saldo > 0 && totalPagado > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">Saldo: {fmt(saldo)}</p>
          )}
        </td>
        <td className="px-5 py-3.5">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${estado.color}`}>
            {estado.icon} {estado.label}
          </span>
        </td>
        <td className="px-5 py-3.5 text-center">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => onAbonar(local)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={11} />
              Abono
            </button>
            {pagos.length > 0 && (
              <button onClick={() => setExpanded(e => !e)} className="text-gray-500 hover:text-gray-300 transition-colors">
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && pagos.map(p => (
        <tr key={p.id} className="bg-gray-950/60">
          <td colSpan={2} className="pl-10 pr-5 py-2 text-xs text-gray-500">Abono del {p.fecha_pago}</td>
          <td className="px-5 py-2" />
          <td className="px-5 py-2 text-xs text-green-400 font-medium">{fmt(p.monto_pagado)}</td>
          <td className="px-5 py-2 text-xs text-gray-500 italic">{p.notas ?? '—'}</td>
          <td className="px-5 py-2 text-center whitespace-nowrap">
            <button onClick={() => onEditAbono(local, p)} className="text-gray-500 hover:text-blue-400 transition-colors mr-3" title="Editar abono">
              <Pencil size={12} />
            </button>
            <button onClick={() => onDeleteAbono(p.id)} className="text-gray-600 hover:text-red-400 transition-colors" title="Eliminar abono">
              <Trash2 size={12} />
            </button>
          </td>
        </tr>
      ))}
    </>
  )
}

export default function Subarriendos() {
  const [locales, setLocales] = useState([])
  const [pagos, setPagos] = useState([])
  const [modal, setModal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [anio, setAnio] = useState(new Date().getFullYear())

  useEffect(() => { loadAll() }, [mes, anio])

  async function loadAll() {
    setLoading(true)
    const [{ data: loc }, { data: pag }] = await Promise.all([
      supabase.from('locales').select('*').eq('tipo', 'subarrendado').order('id'),
      supabase.from('pagos_subarriendo').select('*').eq('mes_periodo', mes).eq('anio_periodo', anio).order('fecha_pago'),
    ])
    setLocales(loc ?? [])
    setPagos(pag ?? [])
    setLoading(false)
  }

  async function deleteAbono(id) {
    if (!confirm('¿Eliminar este abono?')) return
    await supabase.from('pagos_subarriendo').delete().eq('id', id)
    await loadAll()
  }

  const acordadoLocal = (l) => acordadoDe(l.id, pagos.filter(p => p.local_id === l.id), mes, anio)
  const totalAcordado = locales.reduce((a, l) => a + acordadoLocal(l), 0)
  const totalPagado = pagos.reduce((a, p) => a + Number(p.monto_pagado ?? 0), 0)
  const pagadosCompletos = locales.filter(l => {
    const lPagos = pagos.filter(p => p.local_id === l.id)
    return lPagos.reduce((a, p) => a + Number(p.monto_pagado ?? 0), 0) >= acordadoLocal(l)
  }).length

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Subarriendos</h2>
          <p className="text-sm text-gray-400">{locales.length} locales · puedes agregar abonos parciales</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={mes} onChange={e => setMes(Number(e.target.value))} className="flex-1 sm:flex-none bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500">
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="flex-1 sm:flex-none bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500">
            {ANIOS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={loadAll} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Pagados completos</p>
          <p className="text-2xl font-bold text-green-400">{pagadosCompletos} <span className="text-sm text-gray-500">/ {locales.length}</span></p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Total abonado</p>
          <p className="text-2xl font-bold text-blue-400">{fmt(totalPagado)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Saldo pendiente</p>
          <p className="text-2xl font-bold text-amber-400">{fmt(Math.max(0, totalAcordado - totalPagado))}</p>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Local</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Ciudad</th>
              <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Acordado</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Abonado</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Estado</th>
              <th className="text-center text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr><td colSpan={6} className="text-center text-gray-500 py-10">Cargando...</td></tr>
            ) : locales.map(local => (
              <FilaLocal
                key={local.id}
                local={local}
                pagos={pagos.filter(p => p.local_id === local.id)}
                mes={mes}
                anio={anio}
                onAbonar={(l) => setModal({ local: l })}
                onEditAbono={(l, p) => setModal({ local: l, abono: p })}
                onDeleteAbono={deleteAbono}
              />
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <ModalAbono
          key={modal.abono?.id ?? `nuevo-${modal.local.id}`}
          local={modal.local}
          abono={modal.abono}
          mes={mes}
          anio={anio}
          montoAcordado={acordadoDe(modal.local.id, pagos.filter(p => p.local_id === modal.local.id), mes, anio)}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadAll() }}
        />
      )}
    </div>
  )
}
