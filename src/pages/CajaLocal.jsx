import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Droplets, Lock, Plus, Search, X, CheckCircle2, AlertTriangle, ClipboardCheck, ArrowUpDown, Crown,
  RefreshCw, Car, Eye, CalendarDays, LogIn, ConciergeBell, DollarSign, Flag, CarFront, Trash2, Contact2 as IdCard,
  CreditCard, Banknote, Landmark, ChevronLeft, MapPin, Calculator, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  LOCAL_FONTOVA, TAMANOS, MEDIOS, fmt, hoyLocal, horaLocal, normalizePatente, nombreServicio,
  precioServicio, descuentoVigente, calcularTrabajo, cobradoDe, resumenDia, buscarPatente, tipoUsoMembresia,
  RECARGO_CREDITO,
} from '../lib/caja'

// Caja del local (reemplazo de Aquapp en Fontova). Se entra con /local/<CAJA_TOKEN> y el PIN del local.
// Imita la estructura de Aquapp (Trabajos / Caja, "Nuevo trabajo", "Registrar cobro", Finalizar, Entregar
// vehículo) para que los cajeros no se confundan, con estética "liquid glass".
// El trabajador solo ve el día de HOY de su local. OJO: la barrera es solo de pantalla; la seguridad real
// (inicio de sesión + permisos en la base) está pendiente.
export const CAJA_TOKEN = 'edg28xx8nyy'
const PIN_HASH = '869a038e14379e1f41f546899a09cd4a5d9d3e82eedc72e01ddd186e7c6a5e06'
const PIN_KEY = 'alpha:caja-fontova'
const LOCAL_NOMBRE = 'Fontova'
const LOCAL_DIRECCION = 'Av. Pedro Fontova 7420'

async function sha256(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// ---------- Estilo liquid glass ----------
const glass = 'bg-white/55 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 shadow-[0_8px_32px_rgba(15,23,42,0.08)]'
const glassFuerte = 'bg-white/80 backdrop-blur-2xl backdrop-saturate-150 border border-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.18)]'
const btnPrimario = 'inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#3d9bff] to-[#0a6cff] text-white font-semibold shadow-lg shadow-blue-500/30 hover:brightness-105 active:scale-[0.98] transition disabled:opacity-50'
const btnSecundario = 'inline-flex items-center justify-center gap-2 rounded-full bg-white/70 border border-slate-200/80 text-slate-700 font-medium hover:bg-white active:scale-[0.98] transition'
const inputCls = 'w-full bg-white/70 border border-slate-200/80 text-slate-900 placeholder:text-slate-400 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-sky-400/60'
const labelCls = 'block text-xs font-medium text-slate-500 mb-1'
const chip = (activo) => `px-3 py-2 rounded-xl text-sm font-medium border transition ${
  activo ? 'bg-sky-600 border-sky-600 text-white font-semibold shadow-md shadow-sky-600/30' : 'bg-white/70 border-slate-200/80 text-slate-700 hover:bg-white'}`

function Fondo() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-gradient-to-br from-sky-50 via-white to-indigo-50">
      <div className="absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-sky-300/40 blur-3xl" />
      <div className="absolute top-1/3 -right-24 w-[26rem] h-[26rem] rounded-full bg-violet-300/35 blur-3xl" />
      <div className="absolute -bottom-32 left-1/4 w-[30rem] h-[30rem] rounded-full bg-cyan-200/40 blur-3xl" />
    </div>
  )
}

const fechaLarga = (d = new Date()) => d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
const ICONO_MEDIO = { credito: CreditCard, debito: CreditCard, efectivo: Banknote, transferencia: Landmark }
const nombreMedio = (k) => MEDIOS.find(m => m.key === k)?.label ?? k

function Modal({ titulo, subtitulo, onCerrar, children, footer, ancho = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/25 backdrop-blur-sm p-0 sm:p-4" onClick={onCerrar}>
      <div className={`${glassFuerte} w-full ${ancho} rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900">{titulo}</h2>
            {subtitulo}
          </div>
          <button onClick={onCerrar} className="p-1.5 rounded-full text-slate-500 hover:bg-slate-100" aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="px-5 pb-4 overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-200/70 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

function Aviso({ msg }) {
  if (!msg) return null
  return (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
      {msg.ok ? <CheckCircle2 size={15} className="shrink-0" /> : <AlertTriangle size={15} className="shrink-0" />}
      {msg.text}
    </div>
  )
}

const ChipTrabajo = ({ t }) => (
  <span className="inline-flex items-center gap-1 mt-1 text-[11px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
    {t.cliente || 'Sin nombre'} · <Car size={11} /> {t.marca || ''} {t.patente}
  </span>
)

// ---------- PIN del local ----------
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
    <div className="min-h-screen relative flex items-center justify-center p-6 text-slate-900">
      <Fondo />
      <form onSubmit={entrar} className={`${glass} w-full max-w-xs rounded-3xl p-7 space-y-5 text-center`}>
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-[#3d9bff] to-[#0a6cff] flex items-center justify-center mx-auto shadow-lg shadow-blue-500/30">
          <Droplets size={26} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Alpha Cleaners</h1>
          <p className="text-sm text-slate-500 mt-0.5">Caja {LOCAL_NOMBRE} · ingresa el PIN</p>
        </div>
        <div className="relative">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="password" inputMode="numeric" autoFocus value={pin} placeholder="PIN"
            onChange={e => { setPin(e.target.value); setError(false) }}
            className={`${inputCls} pl-9 text-center tracking-[0.4em]`} />
        </div>
        {error && <p className="text-sm text-rose-600">PIN incorrecto</p>}
        <button type="submit" disabled={checking || !pin} className={`${btnPrimario} w-full py-3`}>
          {checking ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

// ---------- Registrar cobro (como Aquapp: primero "¿Dónde ingresó el dinero?") ----------
function ModalCobro({ trabajo, pendiente, onListo, onCerrar }) {
  const [medio, setMedio] = useState(null)
  const [monto, setMonto] = useState(String(pendiente))
  const [conRecargo, setConRecargo] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const recargo = medio === 'credito' && conRecargo ? Math.round((Number(monto) || 0) * RECARGO_CREDITO) : 0

  async function registrar() {
    const m = Number(monto)
    if (!m || m <= 0) return setError('Ingresa el monto.')
    if (m > pendiente) return setError(`El máximo pendiente es ${fmt(pendiente)}.`)
    setSaving(true)
    const { error: e } = await supabase.from('caja_pagos').insert({
      trabajo_id: trabajo.id, local_id: trabajo.local_id, fecha: hoyLocal(), monto: m, medio, recargo,
    })
    setSaving(false)
    if (e) return setError('No se pudo registrar el cobro. Revisa la conexión.')
    onListo()
  }

  return (
    <Modal titulo="Registrar cobro" subtitulo={<ChipTrabajo t={trabajo} />} onCerrar={onCerrar}
      footer={medio && <>
        <button onClick={() => setMedio(null)} className={`${btnSecundario} px-4 py-2.5`}><ChevronLeft size={16} /> Volver</button>
        <button onClick={registrar} disabled={saving} className={`${btnPrimario} px-5 py-2.5`}>{saving ? 'Registrando...' : `Registrar ${fmt((Number(monto) || 0) + recargo)}`}</button>
      </>}>
      {!medio ? (
        <>
          <p className="font-semibold text-slate-800">¿Dónde ingresó el dinero?</p>
          <div className="space-y-2">
            {MEDIOS.map(m => {
              const Icon = ICONO_MEDIO[m.key]
              return (
                <button key={m.key} onClick={() => setMedio(m.key)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/80 border border-slate-200/80 hover:border-sky-300 hover:bg-white text-left transition">
                  <span className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center"><Icon size={16} /></span>
                  <span className="flex-1 font-medium text-slate-800">{m.label}</span>
                  <span className="text-xs text-slate-400">Pendiente {fmt(pendiente)}</span>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-500">Billetera: <span className="font-semibold text-slate-800">{nombreMedio(medio)}</span></p>
          <div>
            <label className={labelCls}>Monto que abona al trabajo</label>
            <input type="number" inputMode="numeric" value={monto} onChange={e => { setMonto(e.target.value); setError(null) }} className={inputCls} />
            <p className="text-xs text-slate-400 mt-1">Si paga una parte, escribe solo lo que pagó; el resto queda pendiente.</p>
          </div>
          {medio === 'credito' && (
            <label className="flex items-center gap-2 text-sm text-slate-700 select-none">
              <input type="checkbox" checked={conRecargo} onChange={e => setConRecargo(e.target.checked)} className="w-4 h-4" />
              Recargo {Math.round(RECARGO_CREDITO * 100)}% tarjeta de crédito (+{fmt(Math.round((Number(monto) || 0) * RECARGO_CREDITO))})
            </label>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </>
      )}
    </Modal>
  )
}

// ---------- Acciones de un trabajo (como el menú de Aquapp) ----------
function ModalAcciones({ trabajo, pagos, onCobrar, onCambio, onCerrar }) {
  const cobrado = cobradoDe(trabajo, pagos)
  const pendiente = Math.max(0, Number(trabajo.total) - cobrado)
  const susPagos = pagos.filter(p => p.trabajo_id === trabajo.id)

  async function actualizar(campos) {
    const { error } = await supabase.from('caja_trabajos').update(campos).eq('id', trabajo.id)
    if (error) alert('No se pudo guardar. Revisa la conexión.')
    onCambio(); onCerrar()
  }
  async function anular() {
    if (susPagos.length) return alert('Este trabajo ya tiene un cobro registrado. Pide a la administración que lo corrija.')
    if (!confirm(`¿Eliminar el trabajo de ${trabajo.patente}? No se puede deshacer.`)) return
    actualizar({ anulado: true })
  }

  const Opcion = ({ icon: Icon, label, onClick, peligro, deshabilitado, nota }) => (
    <button onClick={onClick} disabled={deshabilitado}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition disabled:opacity-40 ${peligro ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-800 hover:bg-white/80'}`}>
      <Icon size={18} className={peligro ? '' : 'text-slate-500'} />
      <span className="flex-1 font-medium">{label}</span>
      {nota && <span className="text-xs text-slate-400">{nota}</span>}
    </button>
  )

  return (
    <Modal titulo={trabajo.cliente || 'Sin nombre'} subtitulo={<ChipTrabajo t={trabajo} />} onCerrar={onCerrar}>
      <div className="rounded-2xl bg-white/70 border border-slate-200/70 p-3 text-sm space-y-1">
        {(trabajo.items || []).map((i, k) => (
          <div key={k} className="flex justify-between text-slate-700"><span>{i.nombre}</span><span>{fmt(i.precio)}</span></div>
        ))}
        {Number(trabajo.descuento_monto) > 0 && <div className="flex justify-between text-violet-600"><span>{trabajo.descuento_nombre}</span><span>− {fmt(trabajo.descuento_monto)}</span></div>}
        <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200/70"><span>Total</span><span>{fmt(trabajo.total)}</span></div>
        <div className="flex justify-between text-slate-500"><span>Cobrado</span><span>{fmt(cobrado)}{susPagos.length ? ` · ${[...new Set(susPagos.map(p => nombreMedio(p.medio)))].join(', ')}` : ''}</span></div>
        {pendiente > 0 && <div className="flex justify-between text-amber-600 font-medium"><span>Pendiente</span><span>{fmt(pendiente)}</span></div>}
      </div>
      <div className="space-y-0.5">
        <Opcion icon={DollarSign} label="Registrar cobro" onClick={onCobrar} deshabilitado={pendiente <= 0} nota={pendiente <= 0 ? 'Pagado' : fmt(pendiente)} />
        <Opcion icon={Flag} label="Finalizar" deshabilitado={trabajo.estado !== 'ingresado'} nota={trabajo.estado !== 'ingresado' ? 'Listo' : ''}
          onClick={() => actualizar({ estado: 'finalizado', finalizado_at: new Date().toISOString() })} />
        <Opcion icon={CarFront} label="Entregar vehículo" deshabilitado={trabajo.estado === 'entregado'} nota={trabajo.estado === 'entregado' ? 'Entregado' : ''}
          onClick={() => actualizar({ estado: 'entregado', entregado_at: new Date().toISOString(), finalizado_at: trabajo.finalizado_at || new Date().toISOString() })} />
        <div className="border-t border-slate-200/70 my-1" />
        <Opcion icon={Trash2} label="Eliminar" peligro onClick={anular} />
      </div>
    </Modal>
  )
}

// ---------- Lista de trabajos (como Aquapp) ----------
const ESTADO = {
  ingresado: { label: 'En proceso', cls: 'bg-sky-100 text-sky-700' },
  finalizado: { label: 'Listo', cls: 'bg-emerald-100 text-emerald-700' },
  entregado: { label: 'Entregado', cls: 'bg-slate-200 text-slate-600' },
}

function FilaTrabajo({ t, pagos, onClick }) {
  const cobrado = cobradoDe(t, pagos)
  const pct = Number(t.total) > 0 ? Math.min(100, (cobrado / Number(t.total)) * 100) : 100
  const est = ESTADO[t.estado] || ESTADO.ingresado
  return (
    <button onClick={onClick}
      className="w-full text-left rounded-2xl bg-white/70 border border-white/80 hover:bg-white hover:shadow-md transition px-4 py-3 grid grid-cols-[1fr_auto] md:grid-cols-[1.3fr_1.1fr_0.8fr_1.4fr_auto] gap-x-4 gap-y-1.5 items-center">
      <div className="min-w-0">
        <p className="font-semibold text-slate-900 truncate">{t.cliente || 'Sin nombre'}</p>
        <p className="text-xs text-slate-400 flex items-center gap-1"><LogIn size={12} /> {(t.hora || '').slice(0, 5)}</p>
      </div>
      <div className="min-w-0 order-2 md:order-none">
        <p className="text-sm font-medium text-slate-700 truncate">{t.marca || '—'} {t.modelo || ''}</p>
        <p className="text-sm text-sky-600 flex items-center gap-1 font-mono"><IdCard size={13} /> {t.patente}</p>
      </div>
      <div className="text-right md:text-left order-1 md:order-none">
        <p className="font-bold text-slate-900">{fmt(t.total)}</p>
        <div className="h-1.5 w-14 rounded-full bg-slate-200 mt-1 ml-auto md:ml-0 overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="min-w-0 order-3 md:order-none space-y-0.5">
        {(t.items || []).map((i, k) => (
          <p key={k} className="text-sm text-slate-700 flex items-center gap-1.5 truncate"><ConciergeBell size={13} className="text-slate-400 shrink-0" /> {i.nombre}</p>
        ))}
        {t.campana && <p className="text-[11px] text-violet-600">{t.descuento_nombre}</p>}
      </div>
      <span className={`order-4 md:order-none justify-self-end text-[11px] font-semibold px-2 py-1 rounded-full ${est.cls}`}>{est.label}</span>
    </button>
  )
}

function Resumen({ r }) {
  return (
    <div className={`${glass} rounded-3xl p-5 space-y-4`}>
      <div>
        <p className="text-xs font-semibold tracking-wide text-slate-400">TRABAJOS ({r.trabajos})</p>
        <p className="text-3xl font-bold text-slate-900">{fmt(r.vendido)}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
        <div className="rounded-2xl bg-white/70 p-3">
          <p className="text-xs text-slate-500">Cobrado</p>
          <p className="text-xl font-bold text-emerald-600">{fmt(r.cobrado)}</p>
          <p className="text-xs text-slate-400">{r.cobros} cobros registrados</p>
        </div>
        <div className="rounded-2xl bg-white/70 p-3">
          <p className="text-xs text-slate-500">Pendiente</p>
          <p className="text-xl font-bold text-amber-600">{fmt(r.pendiente)}</p>
          <p className="text-xs text-slate-400">{r.conDeuda} trabajos con deuda</p>
        </div>
      </div>
      {r.recargos > 0 && <p className="text-xs text-slate-500">Pagos extra (recargo crédito): {fmt(r.recargos)}</p>}
    </div>
  )
}

function VistaTrabajos({ trabajos, pagos, busqueda, onNuevo, onAbrir }) {
  const q = busqueda.trim().toLowerCase()
  const visibles = trabajos.filter(t => !t.anulado)
    .filter(t => !q || [t.cliente, t.patente, t.marca, t.modelo].some(v => (v || '').toLowerCase().includes(q)))
    .sort((a, b) => (b.hora || '').localeCompare(a.hora || ''))
  const r = resumenDia(trabajos, pagos)

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
      <section className={`${glass} rounded-3xl p-4 md:p-6`}>
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">Trabajos</h1>
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Eye size={12} /> Fecha de ingreso ({visibles.length})</p>
          </div>
          <button onClick={onNuevo} className={`${btnPrimario} hidden md:inline-flex px-5 py-2.5`}><Plus size={18} /> Nuevo trabajo</button>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl bg-white/70 border border-slate-200/80 px-3 py-2 mb-4 text-sky-600 font-medium">
          <CalendarDays size={16} /> {fechaLarga()}
        </div>
        <div className="space-y-2">
          {visibles.length === 0 && (
            <div className="rounded-2xl bg-white/60 border border-white/80 p-10 text-center text-sm text-slate-500">
              {q ? 'Ningún trabajo coincide con la búsqueda.' : 'Todavía no hay trabajos hoy. Toca "Nuevo trabajo" para registrar el primero.'}
            </div>
          )}
          {visibles.map(t => <FilaTrabajo key={t.id} t={t} pagos={pagos} onClick={() => onAbrir(t)} />)}
        </div>
      </section>
      <Resumen r={r} />
    </div>
  )
}

// ---------- Uso de la membresía Gold ----------
const ddmm = (f) => f.split('-').reverse().slice(0, 2).join('-')
const MES = () => new Date().toLocaleDateString('es-CL', { month: 'long' })

function PanelMembresia({ membresia, servicios, items, onAgregar, onQuitar }) {
  const servInterior = servicios.find(s => s.es_membresia && tipoUsoMembresia(s.nombre) === 'interior')
  const servExterior = servicios.find(s => s.es_membresia && tipoUsoMembresia(s.nombre) === 'exterior')
  const enFormulario = (tipo) => items.filter(i => i.es_membresia && tipoUsoMembresia(i.nombre_base || i.nombre) === tipo)
  const usadosInt = membresia.usos.filter(u => u.tipo === 'interior')
  const nuevosInt = enFormulario('interior')
  const nuevosExt = enFormulario('exterior')
  const quedan = Math.max(0, membresia.cupoInterior - usadosInt.length - nuevosInt.length)

  return (
    <div className="rounded-2xl border border-amber-300/70 bg-gradient-to-br from-amber-50/90 to-yellow-50/70 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-700"><Crown size={16} /> Membresía Gold · uso de {MES()}</div>
      <div>
        <p className="text-xs text-slate-600 mb-1.5">
          Lavados con interior: <b>{usadosInt.length} de {membresia.cupoInterior}</b> usados
          {quedan > 0 ? ` · le ${quedan === 1 ? 'queda 1' : `quedan ${quedan}`}` : ''}
        </p>
        <div className="space-y-1.5">
          {Array.from({ length: Math.max(membresia.cupoInterior, usadosInt.length + nuevosInt.length) }).map((_, i) => {
            if (i < usadosInt.length) {
              return <label key={i} className="flex items-center gap-2 text-sm text-slate-400"><input type="checkbox" checked disabled className="w-4 h-4" /> Lavado con interior {i + 1} · usado el {ddmm(usadosInt[i].fecha)}</label>
            }
            const nuevo = nuevosInt[i - usadosInt.length]
            const extra = i >= membresia.cupoInterior
            return (
              <label key={i} className={`flex items-center gap-2 text-sm ${nuevo ? 'text-amber-800 font-medium' : 'text-slate-700'}`}>
                <input type="checkbox" className="w-4 h-4" checked={Boolean(nuevo)}
                  onChange={() => nuevo ? onQuitar(nuevo.key) : servInterior && onAgregar(servInterior)} />
                Lavado con interior {i + 1}{nuevo ? ' · se usa ahora' : ' · disponible'}{extra ? ' (sobre el cupo)' : ''}
              </label>
            )
          })}
        </div>
        {usadosInt.length >= membresia.cupoInterior && nuevosInt.length === 0 && (
          <p className="text-xs text-amber-700 mt-1.5">Ya usó sus {membresia.cupoInterior} lavados con interior de este mes. Si quiere otro, se cobra como servicio normal.</p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-slate-600">Lavados exteriores: ilimitados · {membresia.exterioresUsados} este mes{nuevosExt.length ? ` (+${nuevosExt.length} ahora)` : ''}</p>
        {nuevosExt.length
          ? <button type="button" onClick={() => onQuitar(nuevosExt[nuevosExt.length - 1].key)} className="text-xs text-slate-500 hover:text-rose-600">Quitar lavado exterior</button>
          : <button type="button" onClick={() => servExterior && onAgregar(servExterior)} className={chip(false)}>+ Usar lavado exterior</button>}
      </div>
    </div>
  )
}

// ---------- Creando trabajo (modal, como Aquapp) ----------
const formVacio = () => ({ patente: '', cliente: '', telefono: '', marca: '', modelo: '', tamano: '', notas: '' })

function ModalNuevoTrabajo({ servicios, descuentos, onGuardado, onCerrar }) {
  const [form, setForm] = useState(formVacio)
  const [items, setItems] = useState([])
  const [descuentoId, setDescuentoId] = useState('')
  const [filtro, setFiltro] = useState('')
  const [info, setInfo] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const ahora = useRef(new Date()).current
  const ultimaBuscada = useRef('')
  const autollenado = useRef({})   // campos que llenó la búsqueda (se reemplazan si cambia la patente)
  const patenteActual = useRef('')
  const formRef = useRef(form)
  formRef.current = form
  const serviciosRef = useRef(servicios)
  serviciosRef.current = servicios

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const vigentes = descuentos.filter(d => descuentoVigente(d))
  const descuento = vigentes.find(d => String(d.id) === String(descuentoId)) || null
  const calc = calcularTrabajo(items, descuento)
  const rapidos = servicios.filter(s => s.orden <= 6 && !s.es_membresia)
  const filtrados = filtro.trim()
    ? servicios.filter(s => nombreServicio(s).toLowerCase().includes(filtro.trim().toLowerCase())).slice(0, 8)
    : []
  const etiquetaPrecio = (s) => {
    if (!form.tamano) return 'elige tamaño'
    const p = precioServicio(s, form.tamano)
    return p === null ? 'precio a ingresar' : fmt(p)
  }
  const tamanoSugerido = info?.tamanoFuente && form.tamano && autollenado.current.tamano === form.tamano
    ? { caja: 'el registrado la última vez', historial: 'según lo que pagó antes', modelo: 'según su modelo' }[info.tamanoFuente]
    : null

  const buscar = useCallback(async (norm) => {
    ultimaBuscada.current = norm
    setBuscando(true)
    let r = null
    try { r = await buscarPatente(norm, serviciosRef.current) } catch { r = null }
    if (patenteActual.current !== norm) { setBuscando(false); return }   // la patente cambió mientras buscaba
    setInfo(r)
    // Reemplaza lo que había llenado una búsqueda anterior; respeta lo que escribió el cajero.
    const f = formRef.current
    const cambios = {}
    const llenados = {}
    for (const k of ['cliente', 'telefono', 'marca', 'modelo', 'tamano']) {
      const puedo = !f[k] || autollenado.current[k] === f[k]
      const nuevo = r?.encontrado ? (r[k] || '') : ''
      if (puedo) { cambios[k] = nuevo; if (nuevo) llenados[k] = nuevo }
    }
    autollenado.current = llenados
    setForm(prev => ({ ...prev, ...cambios }))
    setBuscando(false)
  }, [])

  // Buscar la patente apenas tiene 6 caracteres (las de moto, con el botón "Buscar")
  useEffect(() => {
    const norm = normalizePatente(form.patente)
    patenteActual.current = norm
    if (norm !== ultimaBuscada.current && info) setInfo(null)
    if (norm.length < 6 || norm === ultimaBuscada.current) return
    const id = setTimeout(() => buscar(norm), 400)
    return () => clearTimeout(id)
  }, [form.patente]) // eslint-disable-line react-hooks/exhaustive-deps

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
      key: `${s.id}-${Date.now()}-${Math.random()}`, servicio_id: s.id, nombre: nombreServicio(s), nombre_base: s.nombre,
      precio: p ?? 0, sinPrecio: p === null, manual: false, es_membresia: s.es_membresia,
    }])
    setFiltro('')
  }
  const quitar = (key) => setItems(prev => prev.filter(x => x.key !== key))
  const cambiarPrecio = (key, v) => setItems(prev => prev.map(it => it.key === key ? { ...it, precio: v === '' ? '' : Number(v), manual: true, sinPrecio: false } : it))

  async function crear() {
    setMsg(null)
    const patente = normalizePatente(form.patente)
    if (!patente) return setMsg({ ok: false, text: 'Falta la patente del vehículo.' })
    if (!form.tamano) return setMsg({ ok: false, text: 'Elige el tamaño del vehículo.' })
    if (items.length === 0) return setMsg({ ok: false, text: 'Agrega al menos un servicio.' })
    if (items.some(it => it.precio === '' || (it.sinPrecio && !it.es_membresia))) {
      return setMsg({ ok: false, text: 'Hay un servicio sin precio. Escríbelo antes de crear el trabajo.' })
    }
    setSaving(true)
    const ya = new Date()
    const { error } = await supabase.from('caja_trabajos').insert({
      local_id: LOCAL_FONTOVA,
      fecha: hoyLocal(ya),
      hora: horaLocal(ya),
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
    })
    setSaving(false)
    if (error) return setMsg({ ok: false, text: 'No se pudo crear el trabajo. Revisa la conexión e intenta de nuevo.' })
    onGuardado(`Trabajo de ${patente} creado. Cuando pague, tócalo y elige "Registrar cobro".`)
  }

  return (
    <Modal titulo="Creando trabajo" onCerrar={onCerrar} ancho="max-w-2xl"
      footer={<>
        <button onClick={onCerrar} className={`${btnSecundario} px-5 py-2.5`}>Cerrar</button>
        <button onClick={crear} disabled={saving} className={`${btnPrimario} px-5 py-2.5`}>{saving ? 'Creando...' : `Crear trabajo · ${fmt(calc.total)}`}</button>
      </>}>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="rounded-xl bg-white/60 border border-slate-200/70 px-3 py-2">
          <p className="text-[10px] text-slate-400">Fecha de ingreso</p>
          <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5"><CalendarDays size={14} /> {ahora.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
        <div className="rounded-xl bg-white/60 border border-slate-200/70 px-3 py-2">
          <p className="text-[10px] text-slate-400">Horario</p>
          <p className="text-sm font-medium text-slate-800">{horaLocal(ahora).slice(0, 5)}</p>
        </div>
      </div>

      {/* Vehículo */}
      <div>
        <label className={labelCls}>Vehículo · patente *</label>
        <div className="relative">
          <Car size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={form.patente} onChange={e => set('patente', e.target.value.toUpperCase())} placeholder="ABCD12"
            autoCapitalize="characters" autoComplete="off" autoFocus
            className={`${inputCls} pl-9 font-mono tracking-wider uppercase text-lg`} />
          {buscando
            ? <RefreshCw size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
            : normalizePatente(form.patente).length >= 5 && !info && (
              <button type="button" onClick={() => buscar(normalizePatente(form.patente))} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-sky-600 px-2 py-1">Buscar</button>
            )}
        </div>
        {info && (
          <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
            {info.encontrado
              ? <span className="text-emerald-600 font-medium">Cliente conocido{info.ultimaVisita ? ` · última visita ${info.ultimaVisita.split('-').reverse().join('-')}` : ''}</span>
              : <span className="text-slate-500">Patente nueva</span>}
            {info.socio && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium"><Crown size={11} /> Socio con membresía</span>}
          </div>
        )}
      </div>
      {info?.membresia && <PanelMembresia membresia={info.membresia} servicios={servicios} items={items} onAgregar={agregar} onQuitar={quitar} />}

      {/* Cliente */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className={labelCls}>Cliente</label><input value={form.cliente} onChange={e => set('cliente', e.target.value)} className={inputCls} /></div>
        <div><label className={labelCls}>Teléfono</label><input value={form.telefono} onChange={e => set('telefono', e.target.value)} inputMode="tel" placeholder="+569..." className={inputCls} /></div>
        <div><label className={labelCls}>Marca</label><input value={form.marca} onChange={e => set('marca', e.target.value)} className={inputCls} /></div>
        <div><label className={labelCls}>Modelo</label><input value={form.modelo} onChange={e => set('modelo', e.target.value)} className={inputCls} /></div>
      </div>
      <div>
        <label className={labelCls}>Tamaño *{tamanoSugerido && <span className="text-sky-600"> · sugerido {tamanoSugerido} (puedes cambiarlo)</span>}</label>
        <div className="grid grid-cols-5 gap-1.5">
          {TAMANOS.map(t => <button key={t.key} type="button" onClick={() => set('tamano', t.key)} className={`${chip(form.tamano === t.key)} px-1`}>{t.label}</button>)}
        </div>
      </div>

      {/* Servicios */}
      <div className="space-y-2">
        <label className={labelCls}>Servicio/s *</label>
        <div className="flex flex-wrap gap-2">
          {rapidos.map(s => (
            <button key={s.id} type="button" onClick={() => agregar(s)} className={`${chip(false)} text-left`}>
              + {nombreServicio(s)} <span className="text-xs text-slate-400 font-normal">· {etiquetaPrecio(s)}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar otro servicio (tapiz, motor, cera...)" className={`${inputCls} pl-9`} />
        </div>
        {filtrados.length > 0 && (
          <div className="rounded-xl border border-slate-200/80 bg-white/80 divide-y divide-slate-100">
            {filtrados.map(s => (
              <button key={s.id} type="button" onClick={() => agregar(s)} className="w-full flex justify-between items-center px-3 py-2.5 text-left hover:bg-sky-50">
                <span className="text-sm text-slate-800">{nombreServicio(s)}</span>
                <span className="text-xs text-slate-400">{etiquetaPrecio(s)}</span>
              </button>
            ))}
          </div>
        )}
        {items.length > 0 && (
          <div className="rounded-xl bg-white/60 border border-slate-200/70 p-2 space-y-1.5">
            {items.map(it => (
              <div key={it.key} className="flex items-center gap-2">
                <ConciergeBell size={14} className="text-slate-400 shrink-0" />
                <span className="flex-1 text-sm text-slate-800 min-w-0 truncate">{it.nombre}</span>
                <input type="number" inputMode="numeric" value={it.precio} onChange={e => cambiarPrecio(it.key, e.target.value)}
                  className={`w-28 bg-white border ${it.sinPrecio && !it.es_membresia ? 'border-amber-400' : 'border-slate-200'} text-slate-900 rounded-lg px-2 py-1.5 text-right`} />
                <button type="button" onClick={() => quitar(it.key)} className="text-slate-400 hover:text-rose-600 p-1"><X size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Descuento y total */}
      <div className="grid sm:grid-cols-2 gap-3 items-end">
        <div>
          <label className={labelCls}>Descuento</label>
          <select value={descuentoId} onChange={e => setDescuentoId(e.target.value)} className={inputCls}>
            <option value="">Sin descuento</option>
            {vigentes.map(d => <option key={d.id} value={d.id}>{d.nombre} ({Number(d.porcentaje)}%)</option>)}
          </select>
        </div>
        <div className="rounded-xl bg-white/70 border border-slate-200/70 px-3 py-2 text-sm">
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{fmt(calc.subtotal)}</span></div>
          {calc.descuentoMonto > 0 && <div className="flex justify-between text-violet-600"><span>Descuento</span><span>− {fmt(calc.descuentoMonto)}</span></div>}
          <div className="flex justify-between text-slate-900 font-bold text-base"><span>Total</span><span>{fmt(calc.total)}</span></div>
        </div>
      </div>
      {descuento?.solo_servicio && calc.descuentoMonto === 0 && items.length > 0 && (
        <p className="text-xs text-amber-600">Este descuento aplica solo a "{descuento.solo_servicio}".</p>
      )}
      <div><label className={labelCls}>Notas</label><input value={form.notas} onChange={e => set('notas', e.target.value)} placeholder="Opcional" className={inputCls} /></div>
      <Aviso msg={msg} />
    </Modal>
  )
}

// ---------- Caja: movimientos del día, flujo, billeteras y cierre (como Aquapp) ----------
const METODOS_GASTO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
]

function ModalMovimiento({ onGuardado, onCerrar }) {
  const [categorias, setCategorias] = useState([])
  const [f, setF] = useState({ categoria_id: '', monto: '', metodo_pago: 'efectivo', proveedor: '', notas: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => { supabase.from('categorias_gasto').select('id, nombre').order('nombre').then(({ data }) => setCategorias(data ?? [])) }, [])

  async function guardar() {
    if (!f.categoria_id || !Number(f.monto)) return setError('Elige la categoría y escribe el monto.')
    setSaving(true)
    const { error: e } = await supabase.from('gastos').insert({
      local_id: LOCAL_FONTOVA, categoria_id: Number(f.categoria_id), monto: Number(f.monto), proveedor: f.proveedor || null,
      fecha: hoyLocal(), notas: f.notas || null, metodo_carga: 'encargado', metodo_pago: f.metodo_pago, es_cuotas: false, num_cuotas: null,
    })
    setSaving(false)
    if (e) return setError('No se pudo guardar. Revisa la conexión.')
    onGuardado('Salida de dinero registrada.')
  }

  return (
    <Modal titulo="Nuevo movimiento" subtitulo={<p className="text-xs text-slate-500 mt-0.5">Salida de dinero (gasto del local)</p>} onCerrar={onCerrar}
      footer={<>
        <button onClick={onCerrar} className={`${btnSecundario} px-5 py-2.5`}>Cerrar</button>
        <button onClick={guardar} disabled={saving} className={`${btnPrimario} px-5 py-2.5`}>{saving ? 'Guardando...' : 'Guardar'}</button>
      </>}>
      <div>
        <label className={labelCls}>Categoría *</label>
        <select value={f.categoria_id} onChange={e => setF(x => ({ ...x, categoria_id: e.target.value }))} className={inputCls}>
          <option value="">Seleccionar...</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div><label className={labelCls}>Monto *</label><input type="number" inputMode="numeric" value={f.monto} onChange={e => setF(x => ({ ...x, monto: e.target.value }))} className={inputCls} /></div>
      <div>
        <label className={labelCls}>¿De dónde salió el dinero?</label>
        <div className="grid grid-cols-3 gap-2">
          {METODOS_GASTO.map(m => <button key={m.value} type="button" onClick={() => setF(x => ({ ...x, metodo_pago: m.value }))} className={chip(f.metodo_pago === m.value)}>{m.label}</button>)}
        </div>
      </div>
      <div><label className={labelCls}>Detalle / proveedor</label><input value={f.proveedor} onChange={e => setF(x => ({ ...x, proveedor: e.target.value }))} placeholder="ej: químicos, bencina, ferretería..." className={inputCls} /></div>
      <div><label className={labelCls}>Notas</label><input value={f.notas} onChange={e => setF(x => ({ ...x, notas: e.target.value }))} placeholder="Opcional" className={inputCls} /></div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </Modal>
  )
}

function VistaCaja({ trabajos, pagos, gastos, onNuevoMovimiento }) {
  const gastosEfectivo = gastos.filter(g => g.metodo_pago === 'efectivo').reduce((a, g) => a + Number(g.monto), 0)
  const totalGastos = gastos.reduce((a, g) => a + Number(g.monto), 0)
  const r = resumenDia(trabajos, pagos, gastosEfectivo)
  const porId = Object.fromEntries(trabajos.map(t => [t.id, t]))
  const movimientos = [
    ...pagos.map(p => ({ tipo: 'ingreso', ts: p.created_at, monto: Number(p.monto) + Number(p.recargo || 0), p, t: porId[p.trabajo_id] })),
    ...gastos.map(g => ({ tipo: 'salida', ts: g.created_at, monto: Number(g.monto), g })),
  ].sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))

  // Cierre
  const [cierre, setCierre] = useState(null)
  const [contado, setContado] = useState('')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const hoy = hoyLocal()
  useEffect(() => {
    supabase.from('caja_cierres').select('*').eq('local_id', LOCAL_FONTOVA).eq('fecha', hoy).maybeSingle()
      .then(({ data }) => { if (data) { setCierre(data); setContado(data.efectivo_contado ?? ''); setNotas(data.notas ?? '') } })
  }, [hoy])
  const diferencia = contado === '' ? null : Number(contado) - r.efectivoEsperado

  async function guardarCierre() {
    if (contado === '') return setMsg({ ok: false, text: 'Ingresa el efectivo contado.' })
    setSaving(true)
    const { data, error } = await supabase.from('caja_cierres').upsert({
      local_id: LOCAL_FONTOVA, fecha: hoy, resumen: r, efectivo_contado: Number(contado), notas: notas.trim() || null,
    }, { onConflict: 'local_id,fecha' }).select('*').single()
    setSaving(false)
    if (error) return setMsg({ ok: false, text: 'No se pudo guardar el cierre. Revisa la conexión.' })
    setCierre(data); setMsg({ ok: true, text: 'Cierre de caja guardado.' })
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
      <section className={`${glass} rounded-3xl p-4 md:p-6`}>
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">Caja</h1>
            <p className="text-xs text-slate-400 mt-0.5">Movimientos de hoy ({movimientos.length})</p>
          </div>
          <button onClick={onNuevoMovimiento} className={`${btnPrimario} hidden md:inline-flex px-5 py-2.5`}><Plus size={18} /> Nuevo movimiento</button>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl bg-white/70 border border-slate-200/80 px-3 py-2 mb-4 text-sky-600 font-medium">
          <CalendarDays size={16} /> {fechaLarga()}
        </div>
        <div className="hidden md:grid grid-cols-[1fr_0.7fr_1fr_2fr] gap-3 px-4 pb-2 text-[11px] font-semibold tracking-wide text-slate-400">
          <span>CATEGORÍA</span><span>MONTO</span><span>DETALLE</span><span>INFO</span>
        </div>
        <div className="space-y-2">
          {movimientos.length === 0 && <div className="rounded-2xl bg-white/60 p-10 text-center text-sm text-slate-500">Sin movimientos todavía.</div>}
          {movimientos.map((m, i) => (
            <div key={i} className="rounded-2xl bg-white/70 border border-white/80 px-4 py-3 grid grid-cols-[1fr_auto] md:grid-cols-[1fr_0.7fr_1fr_2fr] gap-x-3 gap-y-1 items-center text-sm">
              <span className="font-medium text-slate-800 flex items-center gap-2">
                {m.tipo === 'ingreso' ? <ArrowDownLeft size={15} className="text-emerald-500" /> : <ArrowUpRight size={15} className="text-rose-500" />}
                {m.tipo === 'ingreso' ? 'Cobro por trabajos' : (m.g.categorias_gasto?.nombre || 'Gasto')}
              </span>
              <span className={`font-bold text-right md:text-left ${m.tipo === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'}`}>{m.tipo === 'ingreso' ? '' : '− '}{fmt(m.monto)}</span>
              <span className="text-slate-700 truncate">{m.tipo === 'ingreso' ? (m.t?.cliente || 'Sin nombre') : (m.g.proveedor || '—')}</span>
              <span className="text-xs text-slate-500 col-span-2 md:col-span-1">
                {m.tipo === 'ingreso'
                  ? <>Vinculado al trabajo de {m.t?.cliente || 'sin nombre'} ({m.t?.marca || 'sin marca'}, patente {m.t?.patente}). Servicios: {(m.t?.items || []).map(x => x.nombre).join(', ')}. Billetera: {nombreMedio(m.p.medio)}{Number(m.p.recargo) > 0 ? ` (incluye recargo ${fmt(m.p.recargo)})` : ''}.</>
                  : <>Salida de dinero · {METODOS_GASTO.find(x => x.value === m.g.metodo_pago)?.label || 'sin medio'}{m.g.notas ? ` · ${m.g.notas}` : ''}</>}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-4">
        <div className={`${glass} rounded-3xl p-5 space-y-2 text-sm`}>
          <p className="font-semibold text-slate-900">Flujo de dinero</p>
          <div className="flex justify-between text-slate-600"><span>Ingresos de dinero</span><span className="text-emerald-600 font-semibold">{fmt(r.cobrado)}</span></div>
          <div className="flex justify-between text-slate-600"><span>Salidas de dinero</span><span className="text-rose-600 font-semibold">− {fmt(totalGastos)}</span></div>
          <div className="flex justify-between text-slate-900 font-bold pt-1 border-t border-slate-200/70"><span>Flujo de dinero</span><span>{fmt(r.cobrado - totalGastos)}</span></div>
        </div>
        <div className={`${glass} rounded-3xl p-5 space-y-2 text-sm`}>
          <p className="font-semibold text-slate-900">Balances por billetera</p>
          {MEDIOS.map(m => {
            const Icon = ICONO_MEDIO[m.key]
            const salida = m.key === 'efectivo' ? gastosEfectivo : 0
            return <div key={m.key} className="flex justify-between text-slate-600"><span className="flex items-center gap-2"><Icon size={14} /> {m.label}</span><span className="font-semibold text-slate-800">{fmt(r.porMedio[m.key] - salida)}</span></div>
          })}
        </div>
        <div className={`${glass} rounded-3xl p-5 space-y-3`}>
          <p className="font-semibold text-slate-900 flex items-center gap-2"><Calculator size={16} /> Cierre de caja</p>
          <div className="text-sm flex justify-between text-slate-600"><span>Efectivo que debería haber</span><span className="font-bold text-slate-900">{fmt(r.efectivoEsperado)}</span></div>
          <div>
            <label className={labelCls}>Efectivo contado *</label>
            <input type="number" inputMode="numeric" value={contado} onChange={e => setContado(e.target.value)} className={inputCls} />
            <p className="text-[11px] text-slate-400 mt-1">Sin contar el sencillo con que se abrió la caja.</p>
          </div>
          {diferencia !== null && (
            <p className={`text-sm font-semibold ${diferencia === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {diferencia === 0 ? 'La caja cuadra.' : diferencia > 0 ? `Sobran ${fmt(diferencia)}` : `Faltan ${fmt(-diferencia)}`}
            </p>
          )}
          <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas (opcional)" className={inputCls} />
          <button onClick={guardarCierre} disabled={saving} className={`${btnPrimario} w-full py-2.5`}>{saving ? 'Guardando...' : cierre ? 'Actualizar cierre' : 'Guardar cierre del día'}</button>
          {cierre && <p className="text-[11px] text-slate-400">Cierre guardado a las {new Date(cierre.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })}</p>}
          <Aviso msg={msg} />
        </div>
      </div>
    </div>
  )
}

// ---------- Página ----------
const NAV = [
  { key: 'trabajos', label: 'Trabajos', icon: ClipboardCheck },
  { key: 'caja', label: 'Caja', icon: ArrowUpDown },
]

function Caja() {
  const [vista, setVista] = useState('trabajos')
  const [servicios, setServicios] = useState([])
  const [descuentos, setDescuentos] = useState([])
  const [trabajos, setTrabajos] = useState([])
  const [pagos, setPagos] = useState([])
  const [gastos, setGastos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [modal, setModal] = useState(null)   // { tipo: 'nuevo' | 'acciones' | 'cobro' | 'movimiento', trabajo }
  const [msg, setMsg] = useState(null)

  const cargarDia = useCallback(async () => {
    const hoy = hoyLocal()
    const [t, p, g] = await Promise.all([
      supabase.from('caja_trabajos').select('*').eq('local_id', LOCAL_FONTOVA).eq('fecha', hoy),
      supabase.from('caja_pagos').select('*').eq('local_id', LOCAL_FONTOVA).eq('fecha', hoy),
      supabase.from('gastos').select('id, monto, proveedor, notas, metodo_pago, created_at, categorias_gasto(nombre)').eq('local_id', LOCAL_FONTOVA).eq('fecha', hoy),
    ])
    if (t.error || p.error) setMsg({ ok: false, text: 'No se pudieron cargar los datos. Revisa la conexión.' })
    setTrabajos(t.data ?? [])
    setPagos(p.data ?? [])
    setGastos(g.data ?? [])
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

  // Refresca cada minuto por si hay otro dispositivo registrando (computador y celular a la vez)
  useEffect(() => { const id = setInterval(cargarDia, 60000); return () => clearInterval(id) }, [cargarDia])

  function aviso(text, ok = true) { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000) }
  const trabajoActual = modal?.trabajo ? trabajos.find(t => t.id === modal.trabajo.id) || modal.trabajo : null
  const pendienteActual = trabajoActual ? Math.max(0, Number(trabajoActual.total) - cobradoDe(trabajoActual, pagos)) : 0
  const pendientesHoy = useMemo(() => resumenDia(trabajos, pagos).conDeuda, [trabajos, pagos])

  return (
    <div className="min-h-screen relative text-slate-900" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Inter, Roboto, sans-serif' }}>
      <Fondo />
      <div className="flex gap-4 p-3 md:p-4 max-w-[1440px] mx-auto">
        {/* Menú lateral (computador) */}
        <aside className="hidden md:flex w-60 shrink-0 flex-col gap-3 sticky top-4 h-[calc(100vh-2rem)]">
          <div className={`${glass} rounded-2xl p-3 flex items-center gap-3`}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-[#3d9bff] to-[#0a6cff] flex items-center justify-center shadow-md shadow-blue-500/30 shrink-0"><Droplets size={20} className="text-white" /></div>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">Alpha Cleaners</p>
              <p className="text-[11px] text-slate-500 truncate flex items-center gap-1"><MapPin size={11} /> {LOCAL_DIRECCION}</p>
            </div>
          </div>
          <nav className={`${glass} rounded-2xl p-2 space-y-0.5`}>
            {NAV.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setVista(key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] transition ${vista === key ? 'bg-white/90 shadow-sm font-semibold text-slate-900' : 'text-slate-600 hover:bg-white/60'}`}>
                <Icon size={18} /> {label}
                {key === 'trabajos' && pendientesHoy > 0 && <span className="ml-auto text-[11px] px-1.5 rounded-full bg-amber-100 text-amber-700">{pendientesHoy}</span>}
              </button>
            ))}
          </nav>
          <p className="mt-auto text-[11px] text-slate-400 px-2">Caja {LOCAL_NOMBRE} · solo el día de hoy</p>
        </aside>

        <main className="flex-1 min-w-0 space-y-4 pb-28 md:pb-4">
          {/* Barra superior */}
          <div className="flex items-center gap-3">
            <div className="md:hidden w-10 h-10 rounded-xl bg-gradient-to-b from-[#3d9bff] to-[#0a6cff] flex items-center justify-center shadow-md shadow-blue-500/30 shrink-0"><Droplets size={20} className="text-white" /></div>
            <div className={`${glass} rounded-2xl flex-1 flex items-center gap-2 px-3`}>
              <Search size={18} className="text-slate-400" />
              <input value={busqueda} onChange={e => { setBusqueda(e.target.value); setVista('trabajos') }} placeholder="Buscar cliente, patente, vehículo..."
                className="flex-1 min-w-0 bg-transparent py-3 text-[15px] placeholder:text-slate-400 focus:outline-none" />
              {busqueda && <button onClick={() => setBusqueda('')} className="text-slate-400"><X size={16} /></button>}
            </div>
            <button onClick={cargarDia} className={`${glass} rounded-2xl p-3 text-slate-500 hover:text-slate-800`} aria-label="Actualizar"><RefreshCw size={18} /></button>
          </div>

          <Aviso msg={msg} />
          {loading ? <div className={`${glass} rounded-3xl p-10 text-center text-slate-500`}>Cargando...</div> : (
            vista === 'trabajos'
              ? <VistaTrabajos trabajos={trabajos} pagos={pagos} busqueda={busqueda} onNuevo={() => setModal({ tipo: 'nuevo' })} onAbrir={(t) => setModal({ tipo: 'acciones', trabajo: t })} />
              : <VistaCaja trabajos={trabajos} pagos={pagos} gastos={gastos} onNuevoMovimiento={() => setModal({ tipo: 'movimiento' })} />
          )}
        </main>
      </div>

      {/* Barra inferior (celular) */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 p-3">
        <div className={`${glassFuerte} rounded-3xl flex items-center gap-2 p-2`}>
          {NAV.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setVista(key)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-2xl text-[11px] font-medium ${vista === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              <Icon size={20} /> {label}
            </button>
          ))}
          <button onClick={() => vista === 'caja' ? setModal({ tipo: 'movimiento' }) : setModal({ tipo: 'nuevo' })} className={`${btnPrimario} px-4 py-3 text-sm`}>
            <Plus size={18} /> {vista === 'caja' ? 'Movimiento' : 'Nuevo trabajo'}
          </button>
        </div>
      </div>

      {modal?.tipo === 'nuevo' && (
        <ModalNuevoTrabajo servicios={servicios} descuentos={descuentos} onCerrar={() => setModal(null)}
          onGuardado={(text) => { setModal(null); aviso(text); cargarDia() }} />
      )}
      {modal?.tipo === 'acciones' && trabajoActual && (
        <ModalAcciones trabajo={trabajoActual} pagos={pagos} onCambio={cargarDia} onCerrar={() => setModal(null)}
          onCobrar={() => setModal({ tipo: 'cobro', trabajo: trabajoActual })} />
      )}
      {modal?.tipo === 'cobro' && trabajoActual && (
        <ModalCobro trabajo={trabajoActual} pendiente={pendienteActual} onCerrar={() => setModal(null)}
          onListo={() => { setModal(null); aviso('Cobro registrado.'); cargarDia() }} />
      )}
      {modal?.tipo === 'movimiento' && (
        <ModalMovimiento onCerrar={() => setModal(null)} onGuardado={(text) => { setModal(null); aviso(text); cargarDia() }} />
      )}
    </div>
  )
}

export default function CajaLocal({ token }) {
  if (token !== CAJA_TOKEN) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-600 flex items-center justify-center p-6 text-center">
        <p className="text-sm">Enlace no válido. Pide un enlace nuevo.</p>
      </div>
    )
  }
  return <PinGate><Caja /></PinGate>
}
