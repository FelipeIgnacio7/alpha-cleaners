import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { RefreshCw, Zap, Filter, Trash2, Upload, X, CheckCircle2, AlertTriangle } from 'lucide-react'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0)

const TIPOS_SERVICIO = ['lavado_exterior', 'lavado_completo', 'lavado_premium', 'lavado_express']
const LOCALES_PROPIOS = [1, 2]

// Mapea el nombre de sucursal de Aquapp al local_id de la DB
function matchLocalId(sucursal) {
  if (!sucursal) return null
  const s = sucursal.toLowerCase()
  if (s.includes('fontov') || s.includes('fonseca')) return 1
  if (s.includes('curic') || s.includes('higgins')) return 2
  return null
}

function parseCSV(text) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(l => l.trim())
  const firstLine = lines[0]
  const delim = firstLine.includes(';') ? ';' : ','
  const headers = firstLine.split(delim).map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const values = []
    let cur = ''
    let inQ = false
    for (const ch of line) {
      if (ch === '"') inQ = !inQ
      else if (ch === delim && !inQ) { values.push(cur.trim()); cur = '' }
      else cur += ch
    }
    values.push(cur.trim())
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
  })
}

function ModalImport({ locales, onClose, onDone }) {
  const [rows, setRows] = useState(null)
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result)
      const enriched = parsed.map(r => ({
        raw: r,
        fecha: r['Fecha'] ?? '',
        sucursal: r['Sucursal'] ?? '',
        local_id: matchLocalId(r['Sucursal']),
        patente: r['Patente'] ?? '',
        tipo_servicio: r['Servicios'] ?? '',
        monto: Number(r['Monto cobrado'] ?? 0),
        cliente: r['Cliente'] ?? '',
        marca: r['Marca'] ?? '',
        modelo: r['Modelo'] ?? '',
      }))
      setRows(enriched)
    }
    reader.readAsText(file, 'utf-8')
  }

  const validos = rows?.filter(r => r.monto > 0 && r.local_id && r.fecha) ?? []
  const omitidos = (rows?.length ?? 0) - validos.length
  const totalMonto = validos.reduce((a, r) => a + r.monto, 0)

  async function importar() {
    setImporting(true)
    const inserts = validos.map(r => ({
      local_id: r.local_id,
      monto: r.monto,
      tipo_servicio: r.tipo_servicio,
      patente: r.patente || null,
      fecha: r.fecha,
      hora: '12:00:00',
      marca: r.marca || null,
      modelo: r.modelo || null,
      webhook_raw: { fuente: 'csv_aquapp', cliente: r.cliente, marca: r.marca, modelo: r.modelo },
    }))

    const { error } = await supabase.from('transacciones_lavado').insert(inserts)
    setImporting(false)
    if (error) {
      setResult({ ok: false, msg: error.message })
    } else {
      setResult({ ok: true, msg: `${validos.length} registros importados correctamente.` })
      setTimeout(() => { onDone(); onClose() }, 1500)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-white">Importar CSV de Aquapp</h3>
            <p className="text-xs text-gray-400 mt-0.5">Archivo: Ventas - [Mes] [Año].csv</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        {!rows ? (
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-700 hover:border-blue-500 rounded-xl p-10 cursor-pointer transition-colors group">
            <Upload size={28} className="text-gray-500 group-hover:text-blue-400 mb-3 transition-colors" />
            <p className="text-sm text-gray-400 group-hover:text-gray-200">Haz click para seleccionar el CSV</p>
            <p className="text-xs text-gray-600 mt-1">Exporta desde Aquapp → Ventas del mes</p>
            <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
          </label>
        ) : (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">Resumen del archivo</p>
              <div className="text-xs text-gray-500 mb-3 font-mono truncate">{fileName}</div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-xl font-bold text-blue-400">{validos.length}</p>
                  <p className="text-xs text-gray-400">a importar</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-green-400">{fmt(totalMonto)}</p>
                  <p className="text-xs text-gray-400">total</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-gray-500">{omitidos}</p>
                  <p className="text-xs text-gray-400">omitidos (monto $0)</p>
                </div>
              </div>
            </div>

            {/* Preview primeras 3 filas */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Vista previa:</p>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {validos.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 text-xs">
                    <span className="text-gray-400">{r.fecha}</span>
                    <span className="text-gray-300 truncate mx-2">{r.tipo_servicio} · {r.patente || '—'}</span>
                    <span className="text-green-400 shrink-0">{fmt(r.monto)}</span>
                  </div>
                ))}
                {validos.length > 5 && (
                  <p className="text-xs text-gray-600 text-center py-1">...y {validos.length - 5} más</p>
                )}
              </div>
            </div>

            {result && (
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${result.ok ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                {result.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {result.msg}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setRows(null); setResult(null) }} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium py-2.5 rounded-lg transition-colors">
                Cambiar archivo
              </button>
              <button
                onClick={importar}
                disabled={importing || validos.length === 0}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                <Upload size={14} />
                {importing ? 'Importando...' : `Importar ${validos.length} registros`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ModalImportMovimientos({ locales, onClose, onDone }) {
  const [rows, setRows] = useState(null)
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)

  function parseDate(dateStr) {
    if (!dateStr) return ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      const [d, m, y] = dateStr.split('/')
      return `${y}-${m}-${d}`
    }
    return dateStr
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result)
      const enriched = parsed.map(r => ({
        raw: r,
        fecha: parseDate(r['Fecha'] ?? ''),
        local_id: matchLocalId(r['Sucursal']),
        tipo: (r['Tipo'] ?? '').toLowerCase(),
        categoria: r['Categoria'] ?? r['Categoría'] ?? '',
        subcategoria: r['Subcategoría'] ?? r['Subcategoria'] ?? '',
        monto: Math.abs(Number(r['Monto'] ?? 0)),
        billetera: r['Billetera'] ?? '',
        moneda: r['Moneda'] ?? 'CLP',
        detalle: r['Detalle'] ?? '',
      }))
      setRows(enriched)
    }
    reader.readAsText(file, 'utf-8')
  }

  const validos = rows?.filter(r => r.monto > 0 && r.fecha && r.moneda.toLowerCase() === 'clp') ?? []
  const ingresos = validos.filter(r => r.tipo === 'ingreso')
  const totalMonto = ingresos.reduce((a, r) => a + r.monto, 0)
  const omitidos = (rows?.length ?? 0) - validos.length

  async function importar() {
    setImporting(true)
    const inserts = validos.map(r => ({
      local_id: r.local_id || null,
      tipo: r.tipo || 'ingreso',
      categoria: r.categoria || null,
      subcategoria: r.subcategoria || null,
      monto: r.monto,
      billetera: r.billetera || null,
      fecha: r.fecha,
      detalle: r.detalle || null,
    }))
    const { error } = await supabase.from('movimientos_caja').insert(inserts)
    setImporting(false)
    if (error) {
      setResult({ ok: false, msg: error.message })
    } else {
      setResult({ ok: true, msg: `${validos.length} movimientos importados.` })
      setTimeout(() => { onDone(); onClose() }, 1500)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-white">Importar Movimientos de Caja</h3>
            <p className="text-xs text-gray-400 mt-0.5">Archivo: Movimientos Caja - [Mes] [Año].csv · solo CLP</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        {!rows ? (
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-700 hover:border-blue-500 rounded-xl p-10 cursor-pointer transition-colors group">
            <Upload size={28} className="text-gray-500 group-hover:text-blue-400 mb-3 transition-colors" />
            <p className="text-sm text-gray-400 group-hover:text-gray-200">Haz click para seleccionar el CSV</p>
            <p className="text-xs text-gray-600 mt-1">Exporta desde Aquapp → Movimientos de Caja</p>
            <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
          </label>
        ) : (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">Resumen del archivo</p>
              <div className="text-xs text-gray-500 mb-3 font-mono truncate">{fileName}</div>
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center">
                  <p className="text-xl font-bold text-blue-400">{validos.length}</p>
                  <p className="text-xs text-gray-400">a importar</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-green-400">{ingresos.length}</p>
                  <p className="text-xs text-gray-400">ingresos</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-red-400">{validos.length - ingresos.length}</p>
                  <p className="text-xs text-gray-400">egresos</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-gray-500">{omitidos}</p>
                  <p className="text-xs text-gray-400">omitidos</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-2">Vista previa:</p>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {validos.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 text-xs">
                    <span className="text-gray-400 shrink-0">{r.fecha}</span>
                    <span className="text-gray-300 truncate mx-2">{r.categoria} · {r.billetera || '—'}</span>
                    <span className={`shrink-0 font-medium ${r.tipo === 'ingreso' ? 'text-green-400' : 'text-red-400'}`}>{fmt(r.monto)}</span>
                  </div>
                ))}
                {validos.length > 5 && (
                  <p className="text-xs text-gray-600 text-center py-1">...y {validos.length - 5} más</p>
                )}
              </div>
            </div>

            {result && (
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${result.ok ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                {result.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {result.msg}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setRows(null); setResult(null) }} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium py-2.5 rounded-lg transition-colors">
                Cambiar archivo
              </button>
              <button
                onClick={importar}
                disabled={importing || validos.length === 0}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                <Upload size={14} />
                {importing ? 'Importando...' : `Importar ${validos.length} registros`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Ingresos() {
  const [rows, setRows] = useState([])
  const [locales, setLocales] = useState([])
  const [loading, setLoading] = useState(true)
  const [simulating, setSimulating] = useState(false)
  const [filtroLocal, setFiltroLocal] = useState('')
  const [filtroMes, setFiltroMes] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showImportMov, setShowImportMov] = useState(false)

  useEffect(() => {
    supabase.from('locales').select('*').eq('tipo', 'propio').then(({ data }) => setLocales(data ?? []))
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [{ data: lavado }, { data: membresia }] = await Promise.all([
      supabase.from('transacciones_lavado').select('id, monto, tipo_servicio, patente, fecha, hora, local_id, locales(nombre)').order('fecha', { ascending: false }).order('hora', { ascending: false }).limit(200),
      supabase.from('pagos_membresia').select('id, monto, plan, cliente_nombre, fecha_pago, local_id, locales(nombre)').order('fecha_pago', { ascending: false }).limit(200),
    ])

    const combined = [
      ...(lavado ?? []).map(r => ({ ...r, _tipo: 'Lavado', _fecha: r.fecha, _desc: r.tipo_servicio ?? 'Lavado', _sub: r.patente ?? '—' })),
      ...(membresia ?? []).map(r => ({ ...r, _tipo: 'Membresía', _fecha: r.fecha_pago, _desc: r.plan ?? 'Membresía', _sub: r.cliente_nombre ?? '—' })),
    ].sort((a, b) => new Date(b._fecha) - new Date(a._fecha))

    setRows(combined)
    setLoading(false)
  }

  async function simularWebhook() {
    setSimulating(true)
    const localId = LOCALES_PROPIOS[Math.floor(Math.random() * LOCALES_PROPIOS.length)]
    const tipo = TIPOS_SERVICIO[Math.floor(Math.random() * TIPOS_SERVICIO.length)]
    const monto = Math.round((Math.random() * 15000 + 5000) / 1000) * 1000
    const letras = 'ABCDEFGHJKLMNPRSTUVWXYZ'
    const nums = () => Math.floor(Math.random() * 10)
    const patente = `${letras[Math.floor(Math.random() * letras.length)]}${letras[Math.floor(Math.random() * letras.length)]}${letras[Math.floor(Math.random() * letras.length)]}-${nums()}${nums()}${nums()}${nums()}`
    const now = new Date()

    await supabase.from('transacciones_lavado').insert({
      local_id: localId, monto, tipo_servicio: tipo, patente,
      fecha: now.toISOString().split('T')[0],
      hora: now.toTimeString().slice(0, 8),
      webhook_raw: { simulado: true },
    })
    await load()
    setSimulating(false)
  }

  async function eliminar(r) {
    const tabla = r._tipo === 'Lavado' ? 'transacciones_lavado' : 'pagos_membresia'
    await supabase.from(tabla).delete().eq('id', r.id)
    await load()
  }

  const filtered = rows.filter(r => {
    if (filtroLocal && r.local_id !== Number(filtroLocal)) return false
    if (filtroMes && r._fecha.slice(0, 7) !== filtroMes) return false
    if (filtroTipo && r._tipo !== filtroTipo) return false
    return true
  })

  const currentMonth = new Date().toISOString().slice(0, 7)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Ingresos</h2>
          <p className="text-sm text-gray-400">Transacciones de los 2 locales propios</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportMov(true)}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Upload size={14} />
            Movimientos Caja
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Upload size={14} />
            Ventas CSV
          </button>
          <button
            onClick={simularWebhook}
            disabled={simulating}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-40"
            title="Solo para pruebas — genera una transacción falsa"
          >
            <Zap size={14} />
            {simulating ? 'Simulando...' : 'Simular'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 bg-gray-900 border border-gray-800 rounded-xl p-4">
        <Filter size={14} className="text-gray-500 mt-2 shrink-0" />
        <select value={filtroLocal} onChange={e => setFiltroLocal(e.target.value)} className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="">Todos los locales</option>
          {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
        <input type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} defaultValue={currentMonth} className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="">Todos los tipos</option>
          <option value="Lavado">Lavado</option>
          <option value="Membresía">Membresía</option>
        </select>
        <button onClick={load} className="ml-auto flex items-center gap-1.5 text-gray-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors">
          <RefreshCw size={13} />
          Actualizar
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Fecha</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Local</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Tipo</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Servicio</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Patente</th>
              <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Monto</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr><td colSpan={7} className="text-center text-gray-500 py-10">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-gray-500 py-10">Sin registros. Importa el CSV de Aquapp o usa Simular.</td></tr>
            ) : filtered.map((r, i) => (
              <tr key={i} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-5 py-3 text-gray-300">{r._fecha}</td>
                <td className="px-5 py-3 text-gray-300">{r.locales?.nombre ?? '—'}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${r._tipo === 'Lavado' ? 'bg-blue-900/40 text-blue-300' : 'bg-purple-900/40 text-purple-300'}`}>
                    {r._tipo}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-300">{r._desc}</td>
                <td className="px-5 py-3 text-gray-400 font-mono text-xs">{r._sub}</td>
                <td className="px-5 py-3 text-right font-semibold text-green-400">{fmt(r.monto)}</td>
                <td className="px-3 py-3">
                  <button onClick={() => eliminar(r)} className="text-gray-600 hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="border-t border-gray-800 px-5 py-3 flex justify-between items-center">
            <span className="text-xs text-gray-500">{filtered.length} registros</span>
            <span className="text-sm font-semibold text-green-400">
              Total: {fmt(filtered.reduce((a, r) => a + Number(r.monto), 0))}
            </span>
          </div>
        )}
      </div>

      {showImport && (
        <ModalImport
          locales={locales}
          onClose={() => setShowImport(false)}
          onDone={load}
        />
      )}
      {showImportMov && (
        <ModalImportMovimientos
          locales={locales}
          onClose={() => setShowImportMov(false)}
          onDone={load}
        />
      )}
    </div>
  )
}
