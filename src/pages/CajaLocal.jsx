import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Droplets, Lock, Plus, Search, X, CheckCircle2, AlertTriangle, ClipboardList, Receipt,
  Calculator, Crown, RefreshCw, Car,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  LOCAL_FONTOVA, TAMANOS, MEDIOS, fmt, hoyLocal, horaLocal, normalizePatente, nombreServicio,
  precioServicio, descuentoVigente, calcularTrabajo, cobradoDe, resumenDia, buscarPatente,
} from '../lib/caja'
import RegistroGastos, { ACCESS_TOKEN as GASTOS_TOKEN } from './RegistroGastos'

// Caja del local (reemplazo de Aquapp en Fontova). Se entra con /local/<CAJA_TOKEN> y el PIN del local.
// El trabajador solo ve los trabajos de HOY de su local y el cierre del día; nada de informes ni historial.
// OJO: la barrera es solo de pantalla; la seguridad real (inicio de sesión + permisos en la base) está pendiente.
export const CAJA_TOKEN = 'edg28xx8nyy'
const PIN_HASH = '869a038e14379e1f41f546899a09cd4a5d9d3e82eedc72e01ddd186e7c6a5e06'
const PIN_KEY = 'alpha:caja-fontova'
const LOCAL_NOMBRE = 'Fontova'

async function sha256(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const inputCls = 'w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs text-gray-400 mb-1'
const chip = (activo) => `px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
  activo ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`

const fechaLarga = (d = new Date()) => {
  const s = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function PinGate({ children }) {
  const [ok, setOk] = useState(() => { try { return localStorage.getItem(PIN_KEY) === PIN_HASH } catch { return false } })
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)
  if (ok) return children

  async function entrar(e) {
    e.preventDefault()
    if (!pin) return
    setChecking(true)
    const h = await sha256('alpha-cleaners-caja:' + pin.trim())
    if (h === PIN_HASH) {
      try { localStorage.setItem(PIN_KEY, h) } catch { /* pedirá el PIN de nuevo */ }
      setOk(true)
      return
    }
    await new Promise(r => setTimeout(r, 1200))
    setError(true); setPin(''); setChecking(false)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-6">
      <form onSubmit={entrar} className="w-full max-w-xs space-y-5 text-center">
        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto"><Droplets size={22} className="text-white" /></div>
        <div>
          <h1 className="font-bold text-white">Caja {LOCAL_NOMBRE}</h1>
          <p className="text-sm text-gray-400 mt-1">Ingresa el PIN del local</p>
        </div>
        <div className="relative">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input type="password" inputMode="numeric" autoFocus value={pin}
            onChange={e => { setPin(e.target.value); setError(false) }} placeholder="PIN"
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg pl-9 pr-3 py-3 text-base text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {error && <p className="text-sm text-red-400">PIN incorrecto</p>}
        <button type="submit" disabled={checking || !pin}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-3 rounded-lg">
          {checking ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

function Aviso({ msg }) {
  if (!msg) return null
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${msg.ok ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
      {msg.ok ? <CheckCircle2 size={15} className="shrink-0" /> : <AlertTriangle size={15} className="shrink-0" />}
      {msg.text}
    </div>
  )
}

// ---------- Cobrar un trabajo (total o parcial) ----------
function PanelCobro({ trabajo, pendiente, onListo, onCancelar }) {
  const [monto, setMonto] = useState(String(pendiente))
  const [medio, setMedio] = useState('debito')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function cobrar() {
    const m = Number(monto)
    if (!m || m <= 0) { setError('Ingresa un monto'); return }
    if (m > pendiente) { setError(`El máximo pendiente es ${fmt(pendiente)}`); return }
    setSaving(true)
    const { error: e } = await supabase.from('caja_pagos').insert({
      trabajo_id: trabajo.id, local_id: trabajo.local_id, fecha: hoyLocal(), monto: m, medio,
    })
    setSaving(false)
    if (e) { setError('No se pudo guardar el cobro. Revisa la conexión.'); return }
    onListo()
  }

  return (
    <div className="mt-3 border-t border-gray-800 pt-3 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {MEDIOS.map(m => <button key={m.key} type="button" onClick={() => setMedio(m.key)} className={chip(medio === m.key)}>{m.label}</button>)}
      </div>
      <div className="flex gap-2">
        <input type="number" inputMode="numeric" value={monto} onChange={e => { setMonto(e.target.value); setError(null) }} className={inputCls} />
        <button type="button" onClick={cobrar} disabled={saving}
          className="shrink-0 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-medium px-4 rounded-lg">
          {saving ? '...' : 'Cobrar'}
        </button>
        <button type="button" onClick={onCancelar} className="shrink-0 text-gray-400 px-2"><X size={18} /></button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}

// ---------- Lista de trabajos de hoy ----------
function TrabajosHoy({ trabajos, pagos, onCambio }) {
  const [cobrando, setCobrando] = useState(null)
  const r = resumenDia(trabajos, pagos)
  const ordenados = [...trabajos].sort((a, b) => (b.hora || '').localeCompare(a.hora || ''))

  async function anular(t) {
    if (pagos.some(p => p.trabajo_id === t.id)) {
      alert('Este trabajo ya tiene un cobro registrado. Pide a la administración que lo corrija.')
      return
    }
    if (!confirm(`¿Anular el trabajo de ${t.patente || 'sin patente'}? No se puede deshacer.`)) return
    const { error } = await supabase.from('caja_trabajos').update({ anulado: true }).eq('id', t.id)
    if (error) alert('No se pudo anular. Revisa la conexión.')
    onCambio()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ['Trabajos', r.trabajos, 'text-gray-100', false],
          ['Vendido', r.vendido, 'text-gray-100', true],
          ['Cobrado', r.cobrado, 'text-green-400', true],
          ['Pendiente', r.pendiente, 'text-amber-400', true],
        ].map(([label, v, color, money]) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
            <p className="text-xs text-gray-400">{label}</p>
            <p className={`text-lg font-bold ${color}`}>{money ? fmt(v) : v}</p>
          </div>
        ))}
      </div>

      {ordenados.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-sm text-gray-500">
          Todavía no hay trabajos hoy. Usa "Nuevo" para registrar el primero.
        </div>
      )}

      {ordenados.map(t => {
        const cobrado = cobradoDe(t, pagos)
        const pendiente = Math.max(0, Number(t.total) - cobrado)
        const mediosT = [...new Set(pagos.filter(p => p.trabajo_id === t.id).map(p => MEDIOS.find(m => m.key === p.medio)?.label))]
        return (
          <div key={t.id} className={`bg-gray-900 border rounded-xl p-4 ${t.anulado ? 'border-gray-800 opacity-50' : 'border-gray-800'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-semibold text-white">{t.patente || 'S/P'}</span>
                  <span className="text-xs text-gray-500">{(t.hora || '').slice(0, 5)}</span>
                  {t.campana && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300">{t.descuento_nombre || t.campana}</span>}
                </div>
                <p className="text-sm text-gray-300 truncate">{t.cliente || 'Sin nombre'}{t.marca ? ` · ${t.marca}` : ''}</p>
                <p className="text-xs text-gray-500 truncate">{(t.items || []).map(i => i.nombre).join(' + ')}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-white">{fmt(t.total)}</p>
                {t.anulado ? <p className="text-xs text-gray-500">Anulado</p>
                  : pendiente > 0 ? <p className="text-xs text-amber-400">Debe {fmt(pendiente)}</p>
                  : <p className="text-xs text-green-400">Pagado{mediosT.length ? ` · ${mediosT.join(', ')}` : ''}</p>}
              </div>
            </div>
            {!t.anulado && cobrando !== t.id && (
              <div className="flex gap-2 mt-3">
                {pendiente > 0 && (
                  <button onClick={() => setCobrando(t.id)} className="flex-1 bg-green-600/90 hover:bg-green-500 text-white text-sm font-medium py-2 rounded-lg">
                    Cobrar {fmt(pendiente)}
                  </button>
                )}
                <button onClick={() => anular(t)} className="text-xs text-gray-500 hover:text-red-400 px-3 py-2">Anular</button>
              </div>
            )}
            {cobrando === t.id && (
              <PanelCobro trabajo={t} pendiente={pendiente}
                onListo={() => { setCobrando(null); onCambio() }} onCancelar={() => setCobrando(null)} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------- Nuevo trabajo ----------
const formVacio = () => ({ patente: '', cliente: '', telefono: '', marca: '', modelo: '', tamano: '', notas: '' })

function NuevoTrabajo({ servicios, descuentos, onGuardado }) {
  const [form, setForm] = useState(formVacio)
  const [items, setItems] = useState([])
  const [descuentoId, setDescuentoId] = useState('')
  const [cobrarAhora, setCobrarAhora] = useState(true)
  const [medio, setMedio] = useState('debito')
  const [filtro, setFiltro] = useState('')
  const [info, setInfo] = useState(null)        // resultado de la búsqueda por patente
  const [buscando, setBuscando] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const ultimaBuscada = useRef('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const vigentes = descuentos.filter(d => descuentoVigente(d))
  const descuento = vigentes.find(d => String(d.id) === String(descuentoId)) || null
  const calc = calcularTrabajo(items, descuento)
  const rapidos = servicios.filter(s => s.orden <= 6)
  const filtrados = filtro.trim()
    ? servicios.filter(s => nombreServicio(s).toLowerCase().includes(filtro.trim().toLowerCase())).slice(0, 8)
    : []

  // Buscar la patente apenas tiene 6 caracteres
  useEffect(() => {
    const norm = normalizePatente(form.patente)
    if (norm.length < 6 || norm === ultimaBuscada.current) return
    const id = setTimeout(async () => {
      ultimaBuscada.current = norm
      setBuscando(true)
      try {
        const r = await buscarPatente(norm)
        setInfo(r)
        if (r?.encontrado) {
          setForm(f => ({
            ...f,
            cliente: f.cliente || r.cliente,
            telefono: f.telefono || r.telefono,
            marca: f.marca || r.marca,
            modelo: f.modelo || r.modelo,
            tamano: f.tamano || r.tamano,
          }))
        }
      } catch { setInfo(null) }
      setBuscando(false)
    }, 400)
    return () => clearTimeout(id)
  }, [form.patente])

  // Al cambiar el tamaño, actualizar los precios que no se editaron a mano
  useEffect(() => {
    setItems(prev => prev.map(it => {
      if (it.manual) return it
      const s = servicios.find(x => x.id === it.servicio_id)
      const p = precioServicio(s, form.tamano)
      return { ...it, precio: p ?? it.precio, sinPrecio: p === null && !it.precio }
    }))
  }, [form.tamano, servicios])

  function agregar(s) {
    const p = precioServicio(s, form.tamano)
    setItems(prev => [...prev, {
      key: `${s.id}-${Date.now()}`, servicio_id: s.id, nombre: nombreServicio(s), nombre_base: s.nombre,
      precio: p ?? 0, sinPrecio: p === null, manual: false, es_membresia: s.es_membresia,
    }])
    setFiltro('')
  }

  function cambiarPrecio(key, v) {
    setItems(prev => prev.map(it => it.key === key ? { ...it, precio: v === '' ? '' : Number(v), manual: true, sinPrecio: false } : it))
  }

  async function guardar() {
    setMsg(null)
    const patente = normalizePatente(form.patente)
    if (!patente) return setMsg({ ok: false, text: 'Falta la patente.' })
    if (!form.tamano) return setMsg({ ok: false, text: 'Elige el tamaño del vehículo.' })
    if (items.length === 0) return setMsg({ ok: false, text: 'Agrega al menos un servicio.' })
    if (items.some(it => it.precio === '' || (it.sinPrecio && !it.es_membresia))) {
      return setMsg({ ok: false, text: 'Hay un servicio sin precio. Escríbelo antes de guardar.' })
    }
    setSaving(true)
    const ahora = new Date()
    const { data, error } = await supabase.from('caja_trabajos').insert({
      local_id: LOCAL_FONTOVA,
      fecha: hoyLocal(ahora),
      hora: horaLocal(ahora),
      patente,
      cliente: form.cliente.trim() || null,
      telefono: form.telefono.trim() || null,
      marca: form.marca.trim() || null,
      modelo: form.modelo.trim() || null,
      tamano: form.tamano,
      items: items.map(({ servicio_id, nombre, nombre_base, precio, es_membresia }) => ({ servicio_id, nombre, nombre_base, precio: Number(precio) || 0, es_membresia })),
      subtotal: calc.subtotal,
      descuento_id: descuento?.id ?? null,
      descuento_nombre: descuento?.nombre ?? null,
      descuento_monto: calc.descuentoMonto,
      total: calc.total,
      campana: descuento?.campana ?? null,
      notas: form.notas.trim() || null,
    }).select('id').single()

    if (error || !data) {
      setSaving(false)
      return setMsg({ ok: false, text: 'No se pudo guardar. Revisa la conexión e intenta de nuevo.' })
    }
    if (cobrarAhora && calc.total > 0) {
      const { error: e2 } = await supabase.from('caja_pagos').insert({
        trabajo_id: data.id, local_id: LOCAL_FONTOVA, fecha: hoyLocal(ahora), monto: calc.total, medio,
      })
      if (e2) {
        setSaving(false)
        onGuardado('El trabajo quedó guardado, pero el cobro no. Cóbralo desde "Hoy".', false)
        return
      }
    }
    setSaving(false)
    setForm(formVacio()); setItems([]); setDescuentoId(''); setCobrarAhora(true); setInfo(null)
    ultimaBuscada.current = ''
    onGuardado(`Trabajo de ${patente} guardado${cobrarAhora && calc.total > 0 ? ' y cobrado' : ''}.`, true)
  }

  return (
    <div className="space-y-4">
      {/* Vehículo y cliente */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <div>
          <label className={labelCls}>Patente *</label>
          <div className="relative">
            <Car size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={form.patente} onChange={e => set('patente', e.target.value.toUpperCase())} placeholder="ABCD12"
              autoCapitalize="characters" autoComplete="off"
              className={`${inputCls} pl-9 font-mono tracking-wider uppercase`} />
            {buscando && <RefreshCw size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />}
          </div>
          {info && (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
              {info.encontrado
                ? <span className="text-green-400">Cliente conocido{info.ultimaVisita ? ` · última visita ${info.ultimaVisita.split('-').reverse().join('-')}` : ''}</span>
                : <span className="text-gray-400">Patente nueva</span>}
              {info.socio && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300"><Crown size={11} /> Socio con membresía</span>}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={labelCls}>Cliente</label><input value={form.cliente} onChange={e => set('cliente', e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Teléfono</label><input value={form.telefono} onChange={e => set('telefono', e.target.value)} inputMode="tel" placeholder="+569..." className={inputCls} /></div>
          <div><label className={labelCls}>Marca</label><input value={form.marca} onChange={e => set('marca', e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Modelo</label><input value={form.modelo} onChange={e => set('modelo', e.target.value)} className={inputCls} /></div>
        </div>
        <div>
          <label className={labelCls}>Tamaño *</label>
          <div className="grid grid-cols-5 gap-1.5">
            {TAMANOS.map(t => <button key={t.key} type="button" onClick={() => set('tamano', t.key)} className={`${chip(form.tamano === t.key)} px-1`}>{t.label}</button>)}
          </div>
        </div>
      </div>

      {/* Servicios */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <label className={labelCls}>Servicios *</label>
        <div className="flex flex-wrap gap-2">
          {rapidos.map(s => <button key={s.id} type="button" onClick={() => agregar(s)} className={chip(false)}>+ {nombreServicio(s)}</button>)}
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar otro servicio (tapiz, motor, cera...)" className={`${inputCls} pl-9`} />
        </div>
        {filtrados.length > 0 && (
          <div className="border border-gray-800 rounded-lg divide-y divide-gray-800">
            {filtrados.map(s => {
              const p = precioServicio(s, form.tamano)
              return (
                <button key={s.id} type="button" onClick={() => agregar(s)} className="w-full flex justify-between items-center px-3 py-2.5 text-left hover:bg-gray-800">
                  <span className="text-sm text-gray-200">{nombreServicio(s)}</span>
                  <span className="text-xs text-gray-400">{p !== null ? fmt(p) : form.tamano ? 'ingresar precio' : 'elige tamaño'}</span>
                </button>
              )
            })}
          </div>
        )}
        {items.length > 0 && (
          <div className="space-y-2">
            {items.map(it => (
              <div key={it.key} className="flex items-center gap-2">
                <span className="flex-1 text-sm text-gray-200 min-w-0 truncate">{it.nombre}</span>
                <input type="number" inputMode="numeric" value={it.precio} onChange={e => cambiarPrecio(it.key, e.target.value)}
                  className={`w-28 bg-gray-800 border ${it.sinPrecio && !it.es_membresia ? 'border-amber-500' : 'border-gray-700'} text-gray-100 rounded-lg px-2 py-2 text-right`} />
                <button type="button" onClick={() => setItems(prev => prev.filter(x => x.key !== it.key))} className="text-gray-500 hover:text-red-400 p-1"><X size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Descuento, total y pago */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <div>
          <label className={labelCls}>Descuento</label>
          <select value={descuentoId} onChange={e => setDescuentoId(e.target.value)} className={inputCls}>
            <option value="">Sin descuento</option>
            {vigentes.map(d => <option key={d.id} value={d.id}>{d.nombre} ({Number(d.porcentaje)}%)</option>)}
          </select>
          {descuento?.solo_servicio && calc.descuentoMonto === 0 && items.length > 0 && (
            <p className="text-xs text-amber-400 mt-1">Este descuento aplica solo a "{descuento.solo_servicio}".</p>
          )}
        </div>
        <div className="text-sm space-y-1">
          <div className="flex justify-between text-gray-400"><span>Subtotal</span><span>{fmt(calc.subtotal)}</span></div>
          {calc.descuentoMonto > 0 && <div className="flex justify-between text-purple-300"><span>Descuento</span><span>− {fmt(calc.descuentoMonto)}</span></div>}
          <div className="flex justify-between text-white text-lg font-bold pt-1"><span>Total</span><span>{fmt(calc.total)}</span></div>
        </div>
        {calc.total > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setCobrarAhora(true)} className={chip(cobrarAhora)}>Cobrar ahora</button>
              <button type="button" onClick={() => setCobrarAhora(false)} className={chip(!cobrarAhora)}>Queda pendiente</button>
            </div>
            {cobrarAhora && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {MEDIOS.map(m => <button key={m.key} type="button" onClick={() => setMedio(m.key)} className={chip(medio === m.key)}>{m.label}</button>)}
              </div>
            )}
          </div>
        )}
        <div><label className={labelCls}>Notas</label><input value={form.notas} onChange={e => set('notas', e.target.value)} placeholder="Opcional" className={inputCls} /></div>
        <button type="button" onClick={guardar} disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-3.5 rounded-lg">
          <Plus size={18} /> {saving ? 'Guardando...' : `Guardar trabajo · ${fmt(calc.total)}`}
        </button>
        <Aviso msg={msg} />
      </div>
    </div>
  )
}

// ---------- Cierre del día ----------
function CierreDia({ trabajos, pagos }) {
  const [gastosEfectivo, setGastosEfectivo] = useState(0)
  const [cierre, setCierre] = useState(null)
  const [contado, setContado] = useState('')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const hoy = hoyLocal()

  useEffect(() => {
    supabase.from('gastos').select('monto').eq('local_id', LOCAL_FONTOVA).eq('fecha', hoy).eq('metodo_pago', 'efectivo')
      .then(({ data }) => setGastosEfectivo((data ?? []).reduce((a, g) => a + Number(g.monto), 0)))
    supabase.from('caja_cierres').select('*').eq('local_id', LOCAL_FONTOVA).eq('fecha', hoy).maybeSingle()
      .then(({ data }) => {
        if (data) { setCierre(data); setContado(data.efectivo_contado ?? ''); setNotas(data.notas ?? '') }
      })
  }, [hoy])

  const r = resumenDia(trabajos, pagos, gastosEfectivo)
  const diferencia = contado === '' ? null : Number(contado) - r.efectivoEsperado

  async function guardar() {
    if (contado === '') return setMsg({ ok: false, text: 'Ingresa el efectivo contado.' })
    setSaving(true)
    const { data, error } = await supabase.from('caja_cierres').upsert({
      local_id: LOCAL_FONTOVA, fecha: hoy, resumen: r, efectivo_contado: Number(contado), notas: notas.trim() || null,
    }, { onConflict: 'local_id,fecha' }).select('*').single()
    setSaving(false)
    if (error) return setMsg({ ok: false, text: 'No se pudo guardar el cierre. Revisa la conexión.' })
    setCierre(data)
    setMsg({ ok: true, text: 'Cierre guardado.' })
  }

  const fila = (label, valor, cls = 'text-gray-200') => (
    <div className="flex justify-between py-1.5"><span className="text-gray-400">{label}</span><span className={cls}>{valor}</span></div>
  )

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm divide-y divide-gray-800">
        <div className="pb-2">
          {fila('Trabajos', r.trabajos)}
          {fila('Vendido', fmt(r.vendido), 'text-white font-semibold')}
          {fila('Pendiente de cobro', fmt(r.pendiente), 'text-amber-400')}
        </div>
        <div className="py-2">
          {MEDIOS.map(m => <div key={m.key}>{fila(m.label, fmt(r.porMedio[m.key]))}</div>)}
          {fila('Total cobrado', fmt(r.cobrado), 'text-green-400 font-semibold')}
        </div>
        <div className="pt-2">
          {fila('Efectivo cobrado', fmt(r.porMedio.efectivo))}
          {fila('Gastos pagados en efectivo', `− ${fmt(r.gastosEfectivo)}`)}
          {fila('Efectivo que debería haber', fmt(r.efectivoEsperado), 'text-white font-semibold')}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <div>
          <label className={labelCls}>Efectivo contado en caja *</label>
          <input type="number" inputMode="numeric" value={contado} onChange={e => setContado(e.target.value)} className={inputCls} />
          <p className="text-xs text-gray-500 mt-1">Cuenta solo el efectivo de las ventas de hoy, sin el sencillo con que se abrió la caja.</p>
        </div>
        {diferencia !== null && (
          <p className={`text-sm font-medium ${diferencia === 0 ? 'text-green-400' : 'text-amber-400'}`}>
            {diferencia === 0 ? 'La caja cuadra.' : diferencia > 0 ? `Sobran ${fmt(diferencia)}` : `Faltan ${fmt(-diferencia)}`}
          </p>
        )}
        <div><label className={labelCls}>Notas</label><input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" className={inputCls} /></div>
        <button type="button" onClick={guardar} disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-3 rounded-lg">
          {saving ? 'Guardando...' : cierre ? 'Actualizar cierre' : 'Guardar cierre del día'}
        </button>
        {cierre && <p className="text-xs text-gray-500">Último cierre guardado a las {new Date(cierre.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })}</p>}
        <Aviso msg={msg} />
      </div>
    </div>
  )
}

// ---------- Página ----------
const TABS = [
  { key: 'hoy', label: 'Hoy', icon: ClipboardList },
  { key: 'nuevo', label: 'Nuevo', icon: Plus },
  { key: 'gastos', label: 'Gastos', icon: Receipt },
  { key: 'cierre', label: 'Cierre', icon: Calculator },
]

function Caja() {
  const [tab, setTab] = useState('hoy')
  const [servicios, setServicios] = useState([])
  const [descuentos, setDescuentos] = useState([])
  const [trabajos, setTrabajos] = useState([])
  const [pagos, setPagos] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)

  const cargarDia = useCallback(async () => {
    const hoy = hoyLocal()
    const [t, p] = await Promise.all([
      supabase.from('caja_trabajos').select('*').eq('local_id', LOCAL_FONTOVA).eq('fecha', hoy),
      supabase.from('caja_pagos').select('*').eq('local_id', LOCAL_FONTOVA).eq('fecha', hoy),
    ])
    if (t.error || p.error) setMsg({ ok: false, text: 'No se pudieron cargar los trabajos. Revisa la conexión.' })
    setTrabajos(t.data ?? [])
    setPagos(p.data ?? [])
  }, [])

  useEffect(() => {
    (async () => {
      const [s, d] = await Promise.all([
        supabase.from('caja_servicios').select('*').eq('activo', true).order('orden').order('nombre'),
        supabase.from('caja_descuentos').select('*').eq('activo', true).order('id'),
      ])
      setServicios(s.data ?? [])
      setDescuentos(d.data ?? [])
      await cargarDia()
      setLoading(false)
    })()
  }, [cargarDia])

  const pendientes = useMemo(() => resumenDia(trabajos, pagos).pendiente, [trabajos, pagos])

  function onGuardado(text, ok) {
    setMsg({ ok, text })
    setTimeout(() => setMsg(null), 4000)
    cargarDia()
    if (ok) setTab('hoy')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-3xl mx-auto px-4 pt-3 pb-2 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0"><Droplets size={18} className="text-white" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-white text-sm">Caja {LOCAL_NOMBRE}</h1>
            <p className="text-xs text-gray-400 truncate">{fechaLarga()}</p>
          </div>
          <button onClick={cargarDia} className="text-gray-400 hover:text-white p-2" aria-label="Actualizar"><RefreshCw size={16} /></button>
        </div>
        <div className="max-w-3xl mx-auto px-2 grid grid-cols-4">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-2 text-xs sm:text-sm font-medium border-b-2 ${
                tab === key ? 'border-blue-500 text-white' : 'border-transparent text-gray-400'}`}>
              <Icon size={16} /> {label}{key === 'hoy' && pendientes > 0 ? <span className="text-amber-400">•</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 pb-16 space-y-4">
        <Aviso msg={msg} />
        {loading ? <p className="text-sm text-gray-500 text-center py-10">Cargando...</p> : (
          <>
            {tab === 'hoy' && <TrabajosHoy trabajos={trabajos} pagos={pagos} onCambio={cargarDia} />}
            {tab === 'nuevo' && <NuevoTrabajo servicios={servicios} descuentos={descuentos} onGuardado={onGuardado} />}
            {tab === 'gastos' && <RegistroGastos token={GASTOS_TOKEN} embedded />}
            {tab === 'cierre' && <CierreDia trabajos={trabajos} pagos={pagos} />}
          </>
        )}
      </div>
    </div>
  )
}

export default function CajaLocal({ token }) {
  if (token !== CAJA_TOKEN) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-300 flex items-center justify-center p-6 text-center">
        <p className="text-sm">Enlace no válido. Pide un enlace nuevo.</p>
      </div>
    )
  }
  return <PinGate><Caja /></PinGate>
}
