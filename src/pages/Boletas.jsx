import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Plus, X, Trash2, Pencil, Download, Printer, CheckCircle2, AlertTriangle, Receipt, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'

// Archivo de boletas de caja chica: se saca una foto de la boleta, se anota el monto y queda guardada
// por mes, con el total, lista para entregarle a la contadora (PDF con las fotos o planilla CSV).
// Vive dentro del panel (menú "Boletas", /boletas). Si se guarda solo con la foto (sin monto), queda "pendiente de
// lectura" y una tarea programada (scripts/boletas_lectura.py + tarea "boletas-leer") completa monto, comercio y fecha.
// SEGURIDAD PENDIENTE: el bucket y la tabla están abiertos temporalmente.
const LOCAL_ID = 1
const BUCKET = 'boletas'

const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0)
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const ddmm = (f) => f.split('-').reverse().slice(0, 2).join('-')
const nombreMes = (ym) => { const [y, m] = ym.split('-').map(Number); const n = new Date(y, m - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }); return n.charAt(0).toUpperCase() + n.slice(1) }
const sumarMes = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const finMes = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` }
const METODOS = [{ v: 'efectivo', l: 'Efectivo' }, { v: 'tarjeta', l: 'Tarjeta' }, { v: 'transferencia', l: 'Transferencia' }]
const nombreMetodo = (v) => METODOS.find(m => m.v === v)?.l ?? v

const inputCls = 'w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder:text-gray-500 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-sky-500'
const labelCls = 'block text-xs font-medium text-gray-400 mb-1'
const btnPrimario = 'inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold disabled:opacity-50 transition'
const btnSecundario = 'inline-flex items-center justify-center gap-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 font-medium transition'

const urlFoto = (path) => (path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null)

// Reduce la foto (los celulares sacan fotos de varios MB) y respeta la orientación
async function comprimir(file, maxLado = 1600, calidad = 0.82) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const esc = Math.min(1, maxLado / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * esc); c.height = Math.round(bmp.height * esc)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  return await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('No se pudo procesar la foto'))), 'image/jpeg', calidad))
}

function Modal({ titulo, onCerrar, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={onCerrar}>
      <div className="bg-gray-900 border border-gray-800 w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-bold text-gray-100">{titulo}</h2>
          <button onClick={onCerrar} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-800" aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="px-5 pb-4 overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-gray-800 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

function ModalBoleta({ boleta, categorias, onListo, onCerrar }) {
  const editando = Boolean(boleta)
  const [f, setF] = useState({
    monto: boleta?.monto ?? '', fecha: boleta?.fecha ?? hoyLocal(), comercio: boleta?.comercio ?? '',
    metodo_pago: boleta?.metodo_pago ?? 'efectivo', categoria_id: boleta?.categoria_id ?? '', notas: boleta?.notas ?? '',
  })
  const [archivo, setArchivo] = useState(null)       // foto nueva (ya comprimida)
  const [preview, setPreview] = useState(urlFoto(boleta?.foto_path))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const enviando = useRef(false)
  const inputFoto = useRef(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  async function elegirFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const blob = await comprimir(file)
      setArchivo(blob); setPreview(URL.createObjectURL(blob)); setError(null)
    } catch { setError('No se pudo leer la foto. Intenta de nuevo.') }
  }

  async function guardar() {
    if (enviando.current) return
    const conMonto = Number(f.monto) > 0
    if (f.monto !== '' && !conMonto) return setError('El monto debe ser mayor que cero.')
    if (!editando && !archivo) return setError('Saca o elige la foto de la boleta.')
    if (!conMonto && !preview) return setError('Ingresa el monto o saca la foto para que se lea sola.')
    if (editando && !conMonto) return setError('Ingresa el monto de la boleta.')
    enviando.current = true; setSaving(true)
    try {
      let foto_path = boleta?.foto_path ?? null
      if (archivo) {
        const nuevo = `${f.fecha.slice(0, 7)}/${crypto.randomUUID()}.jpg`
        const { error: eu } = await supabase.storage.from(BUCKET).upload(nuevo, archivo, { contentType: 'image/jpeg' })
        if (eu) throw eu
        if (foto_path) await supabase.storage.from(BUCKET).remove([foto_path])
        foto_path = nuevo
      }
      const fila = {
        local_id: LOCAL_ID, fecha: f.fecha, monto: conMonto ? Number(f.monto) : null, comercio: f.comercio.trim() || null, metodo_pago: f.metodo_pago,
        categoria_id: f.categoria_id ? Number(f.categoria_id) : null, notas: f.notas.trim() || null, foto_path,
        // Sin monto => queda para lectura automática; con monto escrito a mano => manual (una corrección también lo vuelve manual)
        lectura: conMonto ? 'manual' : 'pendiente',
      }
      const { error: ei } = editando
        ? await supabase.from('boletas').update(fila).eq('id', boleta.id)
        : await supabase.from('boletas').insert(fila)
      if (ei) throw ei
      onListo(editando ? 'Boleta actualizada.' : 'Boleta guardada.')
    } catch {
      enviando.current = false; setSaving(false)
      setError('No se pudo guardar. Revisa la conexión e intenta de nuevo.')
    }
  }

  return (
    <Modal titulo={editando ? 'Editar boleta' : 'Nueva boleta'} onCerrar={onCerrar}
      footer={<>
        <button onClick={onCerrar} className={`${btnSecundario} px-5 py-2.5`}>Cancelar</button>
        <button onClick={guardar} disabled={saving} className={`${btnPrimario} px-5 py-2.5`}>{saving ? 'Guardando...' : 'Guardar'}</button>
      </>}>
      <input ref={inputFoto} type="file" accept="image/*" capture="environment" onChange={elegirFoto} className="hidden" />
      {preview ? (
        <div className="space-y-2">
          <img src={preview} alt="Boleta" className="w-full max-h-72 object-contain rounded-lg bg-black" />
          <button onClick={() => inputFoto.current?.click()} className={`${btnSecundario} w-full py-2.5 text-sm`}><Camera size={16} /> Cambiar foto</button>
        </div>
      ) : (
        <button onClick={() => inputFoto.current?.click()} className="w-full rounded-xl border-2 border-dashed border-sky-600/60 bg-sky-950/30 py-10 flex flex-col items-center gap-2 text-sky-300">
          <Camera size={34} /><span className="font-semibold">Sacar foto de la boleta</span><span className="text-xs text-sky-300/70">o elegir una de la galería</span>
        </button>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Monto {editando ? '*' : '(opcional)'}</label><input type="number" inputMode="numeric" value={f.monto} onChange={e => { set('monto', e.target.value); setError(null) }} className={inputCls} placeholder="ej: 3500" /></div>
        <div><label className={labelCls}>Fecha</label><input type="date" value={f.fecha} onChange={e => e.target.value && set('fecha', e.target.value)} className={inputCls} /></div>
      </div>
      {!editando && !Number(f.monto) && preview && (
        <p className="text-xs text-sky-300 bg-sky-950/40 border border-sky-900 rounded-lg px-3 py-2">Si dejas el monto vacío, la boleta se guarda con la foto y el sistema la lee solo (monto, comercio y fecha) en la próxima revisión automática.</p>
      )}
      <div><label className={labelCls}>Comercio / qué se compró</label><input value={f.comercio} onChange={e => set('comercio', e.target.value)} className={inputCls} placeholder="ej: Estacionamiento, Lider, bencina" /></div>
      <div>
        <label className={labelCls}>¿Cómo se pagó?</label>
        <div className="grid grid-cols-3 gap-2">
          {METODOS.map(m => <button key={m.v} type="button" onClick={() => set('metodo_pago', m.v)}
            className={`py-2 rounded-lg text-sm border ${f.metodo_pago === m.v ? 'bg-sky-600 border-sky-600 text-white font-semibold' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>{m.l}</button>)}
        </div>
      </div>
      {categorias.length > 0 && (
        <div><label className={labelCls}>Categoría (opcional)</label>
          <select value={f.categoria_id} onChange={e => set('categoria_id', e.target.value)} className={inputCls}>
            <option value="">Sin categoría</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></div>
      )}
      <div><label className={labelCls}>Notas</label><input value={f.notas} onChange={e => set('notas', e.target.value)} className={inputCls} placeholder="Opcional" /></div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </Modal>
  )
}

function ModalVer({ b, nombreCat, onEditar, onEliminar, onCerrar }) {
  return (
    <Modal titulo={b.monto == null ? 'Pendiente de lectura' : fmt(b.monto)} onCerrar={onCerrar}
      footer={<>
        <button onClick={onEliminar} className={`${btnSecundario} px-4 py-2.5 !text-rose-400`}><Trash2 size={16} /> Eliminar</button>
        <button onClick={onEditar} className={`${btnPrimario} px-4 py-2.5`}><Pencil size={16} /> Editar</button>
      </>}>
      {b.foto_path && <a href={urlFoto(b.foto_path)} target="_blank" rel="noreferrer"><img src={urlFoto(b.foto_path)} alt="Boleta" className="w-full max-h-[60vh] object-contain rounded-lg bg-black" /></a>}
      <div className="text-sm text-gray-300 space-y-1">
        <p>{ddmm(b.fecha)} · {nombreMetodo(b.metodo_pago)}{nombreCat ? ` · ${nombreCat}` : ''}</p>
        {b.lectura === 'pendiente' && <p className="text-amber-300">Esperando la lectura automática. Si quieres, anota el monto tú con "Editar".</p>}
        {b.lectura === 'leida' && <p className="text-sky-300">Leída automáticamente: revisa que el monto y el comercio estén bien.</p>}
        {b.lectura === 'error' && <p className="text-rose-300">No se pudo leer la foto{b.lectura_nota ? `: ${b.lectura_nota}` : ''}. Anota el monto con "Editar".</p>}
        {b.comercio && <p className="font-medium text-gray-100">{b.comercio}</p>}
        {b.notas && <p className="text-gray-400">{b.notas}</p>}
      </div>
    </Modal>
  )
}

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// PDF del mes (se imprime/guarda desde el navegador): tabla con el total y, después, cada boleta con su foto
function abrirResumen(ym, filas, nombreCat) {
  const total = filas.reduce((a, b) => a + Number(b.monto), 0)
  const w = window.open('', '_blank')
  if (!w) return alert('El navegador bloqueó la ventana. Permite las ventanas emergentes e intenta de nuevo.')
  const tabla = filas.map((b, i) => `<tr><td>${i + 1}</td><td>${ddmm(b.fecha)}</td><td>${esc(b.comercio || '')}</td><td>${esc(nombreCat(b) || '')}</td><td>${esc(nombreMetodo(b.metodo_pago))}</td><td class="r">${fmt(b.monto)}</td></tr>`).join('')
  const fotos = filas.filter(b => b.foto_path).map((b, i) => `<div class="foto"><p>N° ${filas.indexOf(b) + 1} · ${ddmm(b.fecha)} · ${esc(b.comercio || '')} · <b>${fmt(b.monto)}</b></p><img src="${urlFoto(b.foto_path)}"></div>`).join('')
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Boletas ${nombreMes(ym)}</title><style>
    body{font-family:Arial,sans-serif;margin:24px;color:#111} h1{font-size:20px;margin:0 0 4px} p.sub{color:#555;margin:0 0 16px;font-size:13px}
    table{border-collapse:collapse;width:100%;font-size:13px} th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left} th{background:#f3f3f3} .r{text-align:right}
    tfoot td{font-weight:bold;border-top:2px solid #111} .foto{page-break-inside:avoid;margin:18px 0;text-align:center} .foto img{max-width:100%;max-height:640px}
    @media print{.noprint{display:none}}</style></head><body>
    <button class="noprint" onclick="window.print()" style="margin-bottom:12px;padding:8px 14px">Imprimir / guardar como PDF</button>
    <h1>Boletas de caja chica · ${nombreMes(ym)}</h1><p class="sub">Alpha Cleaners · ${filas.length} boletas · Total ${fmt(total)}</p>
    <table><thead><tr><th>N°</th><th>Fecha</th><th>Comercio</th><th>Categoría</th><th>Pago</th><th class="r">Monto</th></tr></thead><tbody>${tabla}</tbody>
    <tfoot><tr><td colspan="5">TOTAL</td><td class="r">${fmt(total)}</td></tr></tfoot></table>${fotos}</body></html>`)
  w.document.close()
}

function descargarCsv(ym, filas, nombreCat) {
  const cab = ['N°', 'Fecha', 'Comercio', 'Categoría', 'Pago', 'Monto', 'Notas']
  const lineas = filas.map((b, i) => [i + 1, b.fecha, b.comercio || '', nombreCat(b) || '', nombreMetodo(b.metodo_pago), Number(b.monto), b.notas || '']
    .map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
  const blob = new Blob(['﻿' + [cab.join(';'), ...lineas].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `boletas_${ym}.csv`; a.click()
}

export default function Boletas({ embedded = true }) {
  const autorizado = true
  const [ym, setYm] = useState(hoyLocal().slice(0, 7))
  const [filas, setFilas] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [modal, setModal] = useState(null)   // { tipo: 'nueva' | 'ver' | 'editar', b }
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('boletas').select('*').eq('local_id', LOCAL_ID)
      .gte('fecha', `${ym}-01`).lte('fecha', finMes(ym)).order('fecha').order('created_at')
    if (error) setMsg({ ok: false, text: 'No se pudieron cargar las boletas. Revisa la conexión.' })
    setFilas(data ?? [])
  }, [ym])

  useEffect(() => { if (autorizado) { setFilas(null); cargar() } }, [cargar, autorizado])
  useEffect(() => { if (autorizado) supabase.from('categorias_gasto').select('id, nombre').order('nombre').then(({ data }) => setCategorias(data ?? [])) }, [autorizado])

  const catPorId = useMemo(() => Object.fromEntries(categorias.map(c => [c.id, c.nombre])), [categorias])
  const nombreCat = (b) => catPorId[b.categoria_id]
  const conMonto = (filas ?? []).filter(b => b.monto != null)
  const pendientes = (filas ?? []).filter(b => b.monto == null)
  const total = conMonto.reduce((a, b) => a + Number(b.monto), 0)
  const porMetodo = METODOS.map(m => ({ ...m, total: conMonto.filter(b => b.metodo_pago === m.v).reduce((a, b) => a + Number(b.monto), 0) })).filter(m => m.total > 0)

  function aviso(text, ok = true) { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000) }

  async function eliminar(b) {
    if (!confirm(`¿Eliminar la boleta${b.monto != null ? ` de ${fmt(b.monto)}` : ''} del ${ddmm(b.fecha)}? No se puede deshacer.`)) return
    const { error } = await supabase.from('boletas').delete().eq('id', b.id)
    if (error) return aviso('No se pudo eliminar. Revisa la conexión.', false)
    if (b.foto_path) await supabase.storage.from(BUCKET).remove([b.foto_path])
    setModal(null); aviso('Boleta eliminada.'); cargar()
  }

  if (!autorizado) {
    return <div className="min-h-screen bg-gray-950 text-gray-300 flex items-center justify-center p-6 text-center"><p className="text-sm">Enlace no válido. Pide un enlace nuevo.</p></div>
  }

  return (
    <div className={embedded ? 'space-y-4' : 'min-h-screen bg-gray-950 text-gray-100 p-4 pb-28 max-w-2xl mx-auto space-y-4'}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center shrink-0"><Receipt size={20} className="text-white" /></div>
        <div><h1 className="text-xl font-bold">Boletas de caja chica</h1><p className="text-xs text-gray-400">Saca una foto, anota el monto y queda guardada por mes.</p></div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${msg.ok ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' : 'bg-rose-950/60 text-rose-300 border border-rose-800'}`}>
          {msg.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{msg.text}
        </div>
      )}

      <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-2 py-1.5">
        <button onClick={() => setYm(sumarMes(ym, -1))} className="p-2 text-gray-300" aria-label="Mes anterior"><ChevronLeft size={20} /></button>
        <p className="font-semibold">{nombreMes(ym)}</p>
        <button onClick={() => setYm(sumarMes(ym, 1))} disabled={ym >= hoyLocal().slice(0, 7)} className="p-2 text-gray-300 disabled:opacity-30" aria-label="Mes siguiente"><ChevronRight size={20} /></button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-2">
        <p className="text-xs font-semibold tracking-wide text-gray-500">TOTAL DEL MES</p>
        <p className="text-3xl font-bold text-sky-400">{fmt(total)}</p>
        <p className="text-xs text-gray-500">{filas ? `${conMonto.length} ${conMonto.length === 1 ? 'boleta' : 'boletas'}` : 'Cargando...'}</p>
        {pendientes.length > 0 && <p className="text-xs text-amber-300">{pendientes.length} {pendientes.length === 1 ? 'boleta pendiente de lectura' : 'boletas pendientes de lectura'} (aún no suman al total)</p>}
        {porMetodo.length > 0 && <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">{porMetodo.map(m => <span key={m.v}>{m.l}: <b className="text-gray-200">{fmt(m.total)}</b></span>)}</div>}
        {conMonto.length > 0 && (
          <div className="flex gap-2 pt-2">
            <button onClick={() => abrirResumen(ym, conMonto, nombreCat)} className={`${btnSecundario} flex-1 py-2.5 text-sm`}><Printer size={16} /> PDF para la contadora</button>
            <button onClick={() => descargarCsv(ym, conMonto, nombreCat)} className={`${btnSecundario} flex-1 py-2.5 text-sm`}><Download size={16} /> Planilla (CSV)</button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {filas && filas.length === 0 && <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-sm text-gray-500">Todavía no hay boletas en este mes.</div>}
        {[...(filas ?? [])].reverse().map(b => (
          <button key={b.id} onClick={() => setModal({ tipo: 'ver', b })} className="w-full flex items-center gap-3 bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-2.5 text-left">
            {b.foto_path ? <img src={urlFoto(b.foto_path)} alt="" loading="lazy" className="w-14 h-14 rounded-lg object-cover bg-black shrink-0" /> : <div className="w-14 h-14 rounded-lg bg-gray-800 shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-100 truncate">{b.comercio || (b.monto == null ? 'Boleta por leer' : 'Sin descripción')}</p>
              <p className="text-xs text-gray-400">{ddmm(b.fecha)} · {nombreMetodo(b.metodo_pago)}{nombreCat(b) ? ` · ${nombreCat(b)}` : ''}</p>
            </div>
            <div className="text-right">
              {b.monto == null ? <p className="text-xs font-semibold text-amber-300">{b.lectura === 'error' ? 'No se leyó' : 'Leyendo...'}</p> : <p className="font-bold text-gray-100">{fmt(b.monto)}</p>}
              {b.lectura === 'leida' && <p className="text-[10px] text-sky-300">leída auto</p>}
            </div>
          </button>
        ))}
      </div>

      <div className={embedded ? 'sticky bottom-4 flex justify-end' : 'fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-gray-950 via-gray-950/95 to-transparent'}>
        <button onClick={() => setModal({ tipo: 'nueva' })} className={`${btnPrimario} ${embedded ? 'px-5' : 'w-full max-w-2xl mx-auto'} py-3.5 text-base shadow-lg`}><Plus size={20} /> <Camera size={18} /> Nueva boleta</button>
      </div>

      {modal?.tipo === 'nueva' && <ModalBoleta categorias={categorias} onCerrar={() => setModal(null)} onListo={(t) => { setModal(null); aviso(t); cargar() }} />}
      {modal?.tipo === 'editar' && <ModalBoleta boleta={modal.b} categorias={categorias} onCerrar={() => setModal(null)} onListo={(t) => { setModal(null); aviso(t); cargar() }} />}
      {modal?.tipo === 'ver' && <ModalVer b={modal.b} nombreCat={nombreCat(modal.b)} onCerrar={() => setModal(null)} onEditar={() => setModal({ tipo: 'editar', b: modal.b })} onEliminar={() => eliminar(modal.b)} />}
    </div>
  )
}
