import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, AlertTriangle, MessageCircle, Check, Phone, PhoneOff, RotateCcw, ClipboardCopy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_SEGMENT_THRESHOLDS, buildClientAggregates, buildSegments,
  enrichWithContact, applyPersistedState, buildSendQueue, formatQueueForClipboard, interpolate,
} from '../lib/reactivacion'

const TEMPLATE_KEY = key => `reactivacion:template:${key}`
const SESSION_SENT_KEY = 'reactivacion:sentSession'

function copyWithFallback(text) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // permiso denegado o API no disponible; se intenta el fallback
  }
  copyWithFallback(text)
}

function CopyButton({ text, label = 'Copiar mensaje' }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await copyToClipboard(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // portapapeles no disponible; el texto ya queda visible para copiar manualmente
        }
      }}
      className="flex items-center gap-1.5 text-xs font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 hover:bg-gray-700 shrink-0"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <MessageCircle size={12} />}
      {copied ? 'Copiado' : label}
    </button>
  )
}

const ACCENTS = {
  blue: { border: 'border-blue-500/30 bg-blue-500/5', tag: 'bg-blue-500/20 text-blue-300' },
  green: { border: 'border-green-500/30 bg-green-500/5', tag: 'bg-green-500/20 text-green-300' },
  amber: { border: 'border-amber-500/30 bg-amber-500/5', tag: 'bg-amber-500/20 text-amber-300' },
  rose: { border: 'border-rose-500/30 bg-rose-500/5', tag: 'bg-rose-500/20 text-rose-300' },
  purple: { border: 'border-purple-500/30 bg-purple-500/5', tag: 'bg-purple-500/20 text-purple-300' },
}

function DataQualityBanner({ unresolvedCount, totalCount }) {
  if (totalCount === 0) return null
  const pct = Math.round((unresolvedCount / totalCount) * 100)
  return (
    <div className="border border-gray-800 bg-gray-900/60 rounded-xl p-3 text-xs text-gray-400 flex items-center gap-2">
      <AlertTriangle size={14} className="text-amber-400 shrink-0" />
      {unresolvedCount.toLocaleString('es-CL')} de {totalCount.toLocaleString('es-CL')} transacciones ({pct}%) no tienen patente registrada y no se pudieron vincular a un cliente.
    </div>
  )
}

function TemplateEditor({ segment, value, onChange, onReset }) {
  return (
    <div className="bg-black/20 border border-white/5 rounded-lg p-3 space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-xs text-gray-400">Plantilla de mensaje (usa {'{{nombre}}'} para personalizar)</p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 shrink-0"
            title="Restaurar plantilla sugerida"
          >
            <RotateCcw size={12} /> Restaurar sugerida
          </button>
          <CopyButton text={value} label="Copiar plantilla" />
        </div>
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-sm text-gray-200 resize-none focus:outline-none focus:border-blue-500/50"
      />
    </div>
  )
}

function ClientRow({ client, template, checked, onToggle }) {
  return (
    <tr className={`border-b border-gray-800/60 ${!client.hasPhone ? 'opacity-50' : ''}`}>
      <td className="py-2 pr-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={!client.hasPhone}
          onChange={onToggle}
          className="rounded border-gray-700 bg-gray-900"
        />
      </td>
      <td className="py-2 pr-3 text-gray-200">{client.nombre || 'Sin nombre'}</td>
      <td className="py-2 pr-3 text-gray-400 font-mono text-xs">{client.patente}</td>
      <td className="py-2 pr-3">
        {client.hasPhone
          ? <span className="flex items-center gap-1 text-gray-300 text-xs"><Phone size={11} /> {client.telefono}{client.telefonoPorNombre && <span className="text-amber-400/80" title="Teléfono asociado por coincidencia exacta de nombre, no por patente">· por nombre</span>}</span>
          : client.noContactar
            ? <span className="flex items-center gap-1 text-rose-400/80 text-xs"><PhoneOff size={11} /> no contactar</span>
            : <span className="flex items-center gap-1 text-gray-600 text-xs"><PhoneOff size={11} /> sin teléfono</span>}
      </td>
      <td className="py-2 pr-3 text-gray-400 text-xs">{client.daysSinceLast}d sin visita</td>
      <td className="py-2 pr-3 text-gray-400 text-xs">{client.visits} visitas</td>
      <td className="py-2">
        {client.hasPhone && (
          <CopyButton text={interpolate(template, client)} label="Copiar" />
        )}
      </td>
    </tr>
  )
}

function SegmentCard({ segment, template, onTemplateChange, onResetTemplate, selected, onToggleClient, onMarkSent }) {
  const accent = ACCENTS[segment.accent] || ACCENTS.blue
  const selectedCount = selected.size

  return (
    <div className={`border rounded-xl p-5 ${accent.border}`}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${accent.tag}`}>{segment.label}</span>
          <span className="text-xs text-gray-500">
            {segment.counts.total} clientes · {segment.counts.withPhone} con teléfono
          </span>
        </div>
      </div>
      <p className="text-sm text-gray-400 mb-3">{segment.description}</p>

      <TemplateEditor
        segment={segment}
        value={template}
        onChange={onTemplateChange}
        onReset={onResetTemplate}
      />

      {segment.clients.length === 0 ? (
        <p className="text-xs text-gray-500 mt-3">Sin clientes en este segmento por ahora.</p>
      ) : (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                <th className="py-1.5 pr-3 font-medium">Listo</th>
                <th className="py-1.5 pr-3 font-medium">Nombre</th>
                <th className="py-1.5 pr-3 font-medium">Patente</th>
                <th className="py-1.5 pr-3 font-medium">Teléfono</th>
                <th className="py-1.5 pr-3 font-medium">Recencia</th>
                <th className="py-1.5 pr-3 font-medium">Visitas</th>
                <th className="py-1.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {segment.clients.map(c => (
                <ClientRow
                  key={c.patente}
                  client={c}
                  template={template}
                  checked={selected.has(c.patente)}
                  onToggle={() => onToggleClient(c.patente)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedCount > 0 && (
        <div className="mt-3 flex items-center justify-between flex-wrap gap-2 bg-black/20 border border-white/5 rounded-lg p-3">
          <p className="text-xs text-gray-400">{selectedCount} cliente(s) seleccionados para contactar</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onMarkSent(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 hover:bg-gray-700"
            >
              <ClipboardCopy size={12} /> Copiar lista completa
            </button>
            <button
              onClick={() => onMarkSent(false)}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg px-2.5 py-1.5 hover:bg-blue-700"
            >
              <Check size={12} /> Marcar como enviado
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Reactivacion() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [txns, setTxns] = useState([])
  const [patenteTelefono, setPatenteTelefono] = useState([])
  const [contactos, setContactos] = useState([])
  const [sentRecords, setSentRecords] = useState([])
  const [sentTableAvailable, setSentTableAvailable] = useState(true)
  const [templates, setTemplates] = useState({})
  const [selectedBySegment, setSelectedBySegment] = useState({})

  useEffect(() => {
    async function fetchAllPaginated(table, columns, orderCol) {
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true })
      const total = count || 0
      const pageSize = 1000
      const pages = Math.max(1, Math.ceil(total / pageSize))
      const fetches = Array.from({ length: pages }, (_, i) =>
        supabase.from(table).select(columns).order(orderCol).range(i * pageSize, (i + 1) * pageSize - 1)
      )
      const results = await Promise.all(fetches)
      return results.flatMap(r => r.data || [])
    }

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [txnRows, ptRows, contactoRows] = await Promise.all([
          fetchAllPaginated('transacciones_lavado', 'patente, monto, fecha, cliente:webhook_raw->>cliente', 'id'),
          fetchAllPaginated('patente_telefono', 'patente, telefono, nombre_venta, nombre_contacto', 'patente'),
          fetchAllPaginated('contactos_clientes', 'nombre, telefono, email, no_contactar, opt_out_at', 'id'),
        ])
        setTxns(txnRows)
        setPatenteTelefono(ptRows)
        setContactos(contactoRows)

        // reactivacion_envios puede no existir todavía (migración pendiente) — degradar con gracia.
        const { data: sentData, error: sentError } = await supabase
          .from('reactivacion_envios')
          .select('patente, segment_key')
        if (sentError) {
          setSentTableAvailable(false)
          const sessionSent = JSON.parse(sessionStorage.getItem(SESSION_SENT_KEY) || '[]')
          setSentRecords(sessionSent)
        } else {
          setSentRecords(sentData || [])
        }

        const savedTemplates = {}
        Object.keys(DEFAULT_SEGMENT_THRESHOLDS).forEach(key => {
          const saved = localStorage.getItem(TEMPLATE_KEY(key))
          if (saved) savedTemplates[key] = saved
        })
        setTemplates(savedTemplates)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const { aggregates, unresolvedCount, totalCount } = useMemo(
    () => buildClientAggregates(txns),
    [txns]
  )

  const segments = useMemo(() => {
    const raw = buildSegments(aggregates)
    const enriched = raw.map(s => ({ ...s, clients: enrichWithContact(s.clients, patenteTelefono, contactos) }))
    return applyPersistedState(enriched, sentRecords, templates)
  }, [aggregates, patenteTelefono, contactos, sentRecords, templates])

  function handleTemplateChange(segmentKey, text) {
    setTemplates(prev => ({ ...prev, [segmentKey]: text }))
    localStorage.setItem(TEMPLATE_KEY(segmentKey), text)
  }

  function handleResetTemplate(segmentKey) {
    setTemplates(prev => {
      const next = { ...prev }
      delete next[segmentKey]
      return next
    })
    localStorage.removeItem(TEMPLATE_KEY(segmentKey))
  }

  function toggleClient(segmentKey, patente) {
    setSelectedBySegment(prev => {
      const current = new Set(prev[segmentKey] || [])
      if (current.has(patente)) current.delete(patente)
      else current.add(patente)
      return { ...prev, [segmentKey]: current }
    })
  }

  async function handleMarkSent(segment, copyOnly) {
    const selected = selectedBySegment[segment.key] || new Set()
    if (selected.size === 0) return
    const queue = buildSendQueue(segment, selected, templates[segment.key])

    if (copyOnly || queue.length === 0) {
      await copyToClipboard(formatQueueForClipboard(queue))
      return
    }

    const newRecords = queue.map(r => ({
      patente: r.patente,
      segment_key: segment.key,
      telefono: r.telefono,
      mensaje_enviado: r.mensaje,
    }))

    // No confiar en el estado `sentTableAvailable` (podría estar obsoleto por el
    // batching de setState) — decidir en base al resultado real de este insert.
    let persistedToDb = false
    if (sentTableAvailable) {
      const { error: insertError } = await supabase.from('reactivacion_envios').insert(newRecords)
      persistedToDb = !insertError
      if (insertError) setSentTableAvailable(false)
    }

    if (!persistedToDb) {
      // Respaldo de sesión: sobrevive a re-renders, se pierde al recargar la página.
      const sessionSent = JSON.parse(sessionStorage.getItem(SESSION_SENT_KEY) || '[]')
      sessionStorage.setItem(SESSION_SENT_KEY, JSON.stringify([...sessionSent, ...newRecords]))
    }
    setSentRecords(prev => [...prev, ...newRecords])

    setSelectedBySegment(prev => ({ ...prev, [segment.key]: new Set() }))
  }

  if (loading) return (
    <div className="p-8 text-gray-400 flex items-center gap-2">
      <RefreshCw size={16} className="animate-spin" /> Cargando clientes...
    </div>
  )

  if (error) return (
    <div className="p-8 text-rose-400 flex items-center gap-2">
      <AlertTriangle size={16} /> {error}
    </div>
  )

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-xl font-bold text-white">Reactivación de Clientes</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Segmentos recomendados con plantilla editable para reenganchar clientes vía WhatsApp (Aquapp). El envío sigue siendo manual.
        </p>
      </div>

      <DataQualityBanner unresolvedCount={unresolvedCount} totalCount={totalCount} />

      {!sentTableAvailable && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl p-3 text-xs text-amber-300 flex items-center gap-2">
          <AlertTriangle size={14} className="shrink-0" />
          La tabla de tracking de envíos aún no existe en Supabase — el "marcado como enviado" es solo de esta sesión (se pierde al recargar).
        </div>
      )}

      <div className="grid gap-4">
        {segments.map(segment => (
          <SegmentCard
            key={segment.key}
            segment={segment}
            template={templates[segment.key] || segment.defaultTemplate}
            onTemplateChange={text => handleTemplateChange(segment.key, text)}
            onResetTemplate={() => handleResetTemplate(segment.key)}
            selected={selectedBySegment[segment.key] || new Set()}
            onToggleClient={patente => toggleClient(segment.key, patente)}
            onMarkSent={copyOnly => handleMarkSent(segment, copyOnly)}
          />
        ))}
      </div>
    </div>
  )
}
