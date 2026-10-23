import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Plus, Save, Copy, Check, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { LOCAL_FONTOVA, TAMANOS, MEDIOS, fmt, hoyLocal, cobradoDe, resumenDia, nombreServicio } from '../lib/caja'
import { CAJA_TOKEN } from './CajaLocal'

// Vista de dueños de la caja propia: cualquier día, comparación con Aquapp (piloto), catálogo y descuentos.

const card = 'bg-gray-900 border border-gray-800 rounded-xl'
const conSigno = (n, money) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${money ? fmt(Math.abs(n)) : Math.abs(n)}`
const inputCls = 'bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const moverDia = (fecha, n) => {
  const [y, m, d] = fecha.split('-').map(Number)
  return hoyLocal(new Date(y, m - 1, d + n))
}

// ---------- Día ----------
function Dia() {
  const [fecha, setFecha] = useState(hoyLocal())
  const [trabajos, setTrabajos] = useState([])
  const [pagos, setPagos] = useState([])
  const [cierre, setCierre] = useState(null)
  const [aquapp, setAquapp] = useState(null)
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    setLoading(true)
    const [t, p, c, ta, tx] = await Promise.all([
      supabase.from('caja_trabajos').select('*').eq('local_id', LOCAL_FONTOVA).eq('fecha', fecha).order('hora'),
      supabase.from('caja_pagos').select('*').eq('local_id', LOCAL_FONTOVA).eq('fecha', fecha),
      supabase.from('caja_cierres').select('*').eq('local_id', LOCAL_FONTOVA).eq('fecha', fecha).maybeSingle(),
      supabase.from('trabajos_aquapp').select('monto, descuento, cobrado').eq('local_id', LOCAL_FONTOVA).eq('fecha', fecha),
      supabase.from('transacciones_lavado').select('monto').eq('local_id', LOCAL_FONTOVA).eq('fecha', fecha),
    ])
    setTrabajos(t.data ?? [])
    setPagos(p.data ?? [])
    setCierre(c.data ?? null)
    const ta_ = ta.data ?? []
    setAquapp({
      trabajos: ta_.length,
      vendido: ta_.reduce((a, r) => a + Number(r.monto) - Number(r.descuento), 0),
      cobrado: (tx.data ?? []).reduce((a, r) => a + Number(r.monto), 0),
    })
    setLoading(false)
  }, [fecha])

  useEffect(() => { cargar() }, [cargar])

  const r = resumenDia(trabajos, pagos)
  const hayAquapp = aquapp && (aquapp.trabajos > 0 || aquapp.cobrado > 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setFecha(f => moverDia(f, -1))} className="p-2 text-gray-400 hover:text-white"><ChevronLeft size={18} /></button>
        <input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} className={inputCls} />
        <button onClick={() => setFecha(f => moverDia(f, 1))} className="p-2 text-gray-400 hover:text-white"><ChevronRight size={18} /></button>
        <button onClick={cargar} className="p-2 text-gray-400 hover:text-white ml-auto"><RefreshCw size={16} /></button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Trabajos', r.trabajos, false], ['Vendido', r.vendido, true], ['Cobrado', r.cobrado, true], ['Pendiente', r.pendiente, true]].map(([l, v, money]) => (
          <div key={l} className={`${card} p-4`}>
            <p className="text-xs text-gray-400">{l}</p>
            <p className="text-xl font-bold text-white">{money ? fmt(v) : v}</p>
          </div>
        ))}
      </div>

      {/* Piloto: comparación con lo registrado en Aquapp el mismo día */}
      <div className={`${card} p-4`}>
        <h3 className="text-sm font-semibold text-gray-200 mb-1">Comparación con Aquapp (piloto)</h3>
        <p className="text-xs text-gray-500 mb-3">Mientras se usen las dos cajas, los números del mismo día deberían ser iguales. Aquapp se actualiza con la carga diaria de las 10:00.</p>
        {!hayAquapp ? <p className="text-sm text-gray-500">Aquapp aún no tiene datos cargados para este día.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500 text-left"><th className="py-1 font-medium"></th><th className="py-1 font-medium text-right">Caja propia</th><th className="py-1 font-medium text-right">Aquapp</th><th className="py-1 font-medium text-right">Diferencia</th></tr></thead>
              <tbody className="text-gray-300">
                {[['Trabajos', r.trabajos, aquapp.trabajos, false], ['Vendido', r.vendido, aquapp.vendido, true], ['Cobrado', r.cobrado, aquapp.cobrado, true]].map(([l, a, b, money]) => {
                  const d = a - b
                  return (
                    <tr key={l} className="border-t border-gray-800">
                      <td className="py-1.5">{l}</td>
                      <td className="py-1.5 text-right">{money ? fmt(a) : a}</td>
                      <td className="py-1.5 text-right">{money ? fmt(b) : b}</td>
                      <td className={`py-1.5 text-right ${d === 0 ? 'text-green-400' : 'text-amber-400'}`}>{d === 0 ? 'cuadra' : conSigno(d, money)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={`${card} p-4`}>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Cobros por medio de pago</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {MEDIOS.map(m => <div key={m.key}><p className="text-xs text-gray-400">{m.label}</p><p className="text-gray-100 font-medium">{fmt(r.porMedio[m.key])}</p></div>)}
        </div>
        {cierre ? (
          <p className="text-xs text-gray-400 mt-3">
            Cierre guardado: efectivo contado {fmt(cierre.efectivo_contado)} · esperado {fmt(cierre.resumen?.efectivoEsperado)}
            {cierre.efectivo_contado !== null && cierre.resumen ? ` · diferencia ${conSigno(Number(cierre.efectivo_contado) - Number(cierre.resumen.efectivoEsperado), true)}` : ''}
            {cierre.notas ? ` · "${cierre.notas}"` : ''}
          </p>
        ) : <p className="text-xs text-gray-500 mt-3">Sin cierre de caja para este día.</p>}
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 text-left border-b border-gray-800">
              {['Hora', 'Patente', 'Cliente', 'Servicios', 'Descuento', 'Total', 'Cobrado', 'Medio'].map(h => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? <tr><td colSpan={8} className="text-center text-gray-500 py-8">Cargando...</td></tr>
              : trabajos.length === 0 ? <tr><td colSpan={8} className="text-center text-gray-500 py-8">Sin trabajos registrados en la caja propia este día.</td></tr>
              : trabajos.map(t => {
                const cob = cobradoDe(t, pagos)
                const medios = [...new Set(pagos.filter(p => p.trabajo_id === t.id).map(p => MEDIOS.find(m => m.key === p.medio)?.label))].join(', ')
                return (
                  <tr key={t.id} className={t.anulado ? 'opacity-40 line-through' : ''}>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{(t.hora || '').slice(0, 5)}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-200">{t.patente}</td>
                    <td className="px-4 py-2.5 text-gray-300">{t.cliente || '—'}{t.marca ? <span className="text-gray-500"> · {t.marca}</span> : null}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{(t.items || []).map(i => i.nombre).join(' + ')}</td>
                    <td className="px-4 py-2.5 text-xs text-purple-300">{t.descuento_nombre ? `${t.descuento_nombre} (−${fmt(t.descuento_monto)})` : ''}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-100">{fmt(t.total)}</td>
                    <td className={`px-4 py-2.5 text-right ${cob < Number(t.total) ? 'text-amber-400' : 'text-green-400'}`}>{fmt(cob)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{medios}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------- Catálogo de servicios ----------
function Servicios() {
  const [rows, setRows] = useState([])
  const [cambios, setCambios] = useState({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('caja_servicios').select('*').order('orden').order('nombre')
    setRows(data ?? []); setCambios({})
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const valor = (r, k) => (cambios[r.id] && k in cambios[r.id] ? cambios[r.id][k] : r[k])
  const editar = (id, k, v) => setCambios(c => ({ ...c, [id]: { ...(c[id] || {}), [k]: v } }))

  async function guardar() {
    setSaving(true); setMsg(null)
    for (const [id, cambio] of Object.entries(cambios)) {
      const limpio = Object.fromEntries(Object.entries(cambio).map(([k, v]) => [k, k.startsWith('precio_') ? (v === '' ? null : Number(v)) : v]))
      const { error } = await supabase.from('caja_servicios').update(limpio).eq('id', id)
      if (error) { setSaving(false); setMsg('No se pudo guardar algún cambio.'); return }
    }
    setSaving(false); setMsg('Cambios guardados.'); cargar()
  }

  async function nuevo() {
    const nombre = prompt('Nombre del nuevo servicio')
    if (!nombre?.trim()) return
    await supabase.from('caja_servicios').insert({ nombre: nombre.trim(), orden: 95 })
    cargar()
  }

  const nCambios = Object.keys(cambios).length
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-gray-500 flex-1 min-w-[200px]">Precios por tamaño que ve la caja. Vacío = el cajero escribe el precio. Copiado de Aquapp el 23-10-2026: revisa "Lavado por fuera" y "Lavado exterior", que en Aquapp tenían precios incompletos.</p>
        <button onClick={nuevo} className="flex items-center gap-1.5 text-sm text-gray-300 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5"><Plus size={14} /> Servicio</button>
        <button onClick={guardar} disabled={!nCambios || saving} className="flex items-center gap-1.5 text-sm text-white bg-blue-600 disabled:opacity-40 rounded-lg px-3 py-1.5"><Save size={14} /> Guardar {nCambios ? `(${nCambios})` : ''}</button>
      </div>
      {msg && <p className="text-sm text-gray-300">{msg}</p>}
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-500 text-left border-b border-gray-800">
            <th className="px-3 py-2 font-medium">Servicio</th>
            {TAMANOS.map(t => <th key={t.key} className="px-2 py-2 font-medium text-right">{t.label}</th>)}
            <th className="px-3 py-2 font-medium">Activo</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-800">
            {rows.map(r => (
              <tr key={r.id} className={valor(r, 'activo') ? '' : 'opacity-50'}>
                <td className="px-3 py-1.5 text-gray-200 whitespace-nowrap">{nombreServicio(r)}</td>
                {TAMANOS.map(t => (
                  <td key={t.key} className="px-1 py-1.5">
                    <input type="number" value={valor(r, `precio_${t.key}`) ?? ''} onChange={e => editar(r.id, `precio_${t.key}`, e.target.value)}
                      className={`${inputCls} w-24 text-right`} />
                  </td>
                ))}
                <td className="px-3 py-1.5"><input type="checkbox" checked={Boolean(valor(r, 'activo'))} onChange={e => editar(r.id, 'activo', e.target.checked)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------- Descuentos ----------
function Descuentos() {
  const [rows, setRows] = useState([])
  const [msg, setMsg] = useState(null)
  const cargar = useCallback(async () => {
    const { data } = await supabase.from('caja_descuentos').select('*').order('id')
    setRows(data ?? [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function guardar(r) {
    const { error } = await supabase.from('caja_descuentos').update({
      nombre: r.nombre, porcentaje: Number(r.porcentaje), solo_servicio: r.solo_servicio || null,
      campana: r.campana || null, vigente_hasta: r.vigente_hasta || null, activo: r.activo,
    }).eq('id', r.id)
    setMsg(error ? 'No se pudo guardar.' : `"${r.nombre}" guardado.`)
    cargar()
  }
  async function nuevo() {
    const nombre = prompt('Nombre del descuento')
    const pct = Number(prompt('Porcentaje (ej: 10)'))
    if (!nombre?.trim() || !pct) return
    await supabase.from('caja_descuentos').insert({ nombre: nombre.trim(), porcentaje: pct })
    cargar()
  }
  const set = (id, k, v) => setRows(rs => rs.map(r => r.id === id ? { ...r, [k]: v } : r))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs text-gray-500 flex-1">"Solo servicio" limita el descuento a ese servicio (ej. Lavado full). "Campaña" etiqueta el trabajo para medir cuántos vinieron por esa promoción.</p>
        <button onClick={nuevo} className="flex items-center gap-1.5 text-sm text-gray-300 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5"><Plus size={14} /> Descuento</button>
      </div>
      {msg && <p className="text-sm text-gray-300">{msg}</p>}
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-500 text-left border-b border-gray-800">
            {['Nombre', '%', 'Solo servicio', 'Campaña', 'Vigente hasta', 'Activo', ''].map(h => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-gray-800">
            {rows.map(r => (
              <tr key={r.id}>
                <td className="px-2 py-1.5"><input value={r.nombre} onChange={e => set(r.id, 'nombre', e.target.value)} className={`${inputCls} w-56`} /></td>
                <td className="px-2 py-1.5"><input type="number" value={r.porcentaje} onChange={e => set(r.id, 'porcentaje', e.target.value)} className={`${inputCls} w-16 text-right`} /></td>
                <td className="px-2 py-1.5"><input value={r.solo_servicio ?? ''} onChange={e => set(r.id, 'solo_servicio', e.target.value)} placeholder="todo el trabajo" className={`${inputCls} w-36`} /></td>
                <td className="px-2 py-1.5"><input value={r.campana ?? ''} onChange={e => set(r.id, 'campana', e.target.value)} className={`${inputCls} w-32`} /></td>
                <td className="px-2 py-1.5"><input type="date" value={r.vigente_hasta ?? ''} onChange={e => set(r.id, 'vigente_hasta', e.target.value)} className={inputCls} /></td>
                <td className="px-3 py-1.5"><input type="checkbox" checked={r.activo} onChange={e => set(r.id, 'activo', e.target.checked)} /></td>
                <td className="px-2 py-1.5"><button onClick={() => guardar(r)} className="text-xs text-blue-400 hover:text-blue-300">Guardar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------- Acceso del local ----------
function Acceso() {
  const [copiado, setCopiado] = useState(false)
  const url = `${window.location.origin}/local/${CAJA_TOKEN}`
  return (
    <div className={`${card} p-5 space-y-4 max-w-xl`}>
      <div>
        <h3 className="text-sm font-semibold text-gray-200">Link de la caja de Fontova</h3>
        <p className="text-xs text-gray-500 mt-1">Ábrelo en el computador y en el celular del local. Pide el PIN del local la primera vez y después lo recuerda.</p>
      </div>
      <div className="flex gap-2">
        <input readOnly value={url} className={`${inputCls} flex-1 font-mono text-xs`} />
        <button onClick={() => { navigator.clipboard?.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }}
          className="flex items-center gap-1.5 text-sm text-white bg-blue-600 rounded-lg px-3">{copiado ? <Check size={14} /> : <Copy size={14} />}{copiado ? 'Copiado' : 'Copiar'}</button>
      </div>
      <p className="text-xs text-gray-400">Ahí el trabajador ve solo los trabajos de hoy de Fontova, registra trabajos, cobra, ingresa gastos y hace el cierre. No ve informes, historial, ni el resto de esta app.</p>
      <div className="flex gap-2 text-xs text-amber-300/90 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <span>Seguridad pendiente: hoy la separación es solo de pantallas. Falta el inicio de sesión real con permisos en la base de datos, que acordamos hacer después.</span>
      </div>
    </div>
  )
}

const TABS = [
  { key: 'dia', label: 'Día' },
  { key: 'servicios', label: 'Servicios y precios' },
  { key: 'descuentos', label: 'Descuentos' },
  { key: 'acceso', label: 'Link del local' },
]

export default function CajaAdmin() {
  const [tab, setTab] = useState('dia')
  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl">
      <div>
        <h1 className="text-xl font-bold text-white">Caja Fontova</h1>
        <p className="text-sm text-gray-400 mt-0.5">Caja propia que reemplaza a Aquapp. En piloto: Aquapp sigue activo como respaldo.</p>
      </div>
      <div className="flex gap-1 border-b border-gray-800 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${tab === t.key ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'dia' && <Dia />}
      {tab === 'servicios' && <Servicios />}
      {tab === 'descuentos' && <Descuentos />}
      {tab === 'acceso' && <Acceso />}
    </div>
  )
}
