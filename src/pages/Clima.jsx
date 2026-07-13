import { useEffect, useState } from 'react'
import {
  Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning,
  Droplets, Thermometer, RefreshCw, AlertTriangle, MessageCircle, Check, Target,
} from 'lucide-react'
import { fetchAllForecasts, weatherInfo } from '../lib/weather'
import { buildWeatherRecommendations, buildCrossBranchInsight, buildRainSeasonPlaybook } from '../lib/weatherInsights'

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const ICONS = {
  sun: Sun, 'cloud-sun': CloudSun, cloud: Cloud, fog: CloudFog,
  rain: CloudRain, snow: CloudSnow, storm: CloudLightning,
}

function DayCard({ day }) {
  const info = weatherInfo(day.code)
  const Icon = ICONS[info.icon] || Cloud
  const dt = new Date(day.date + 'T00:00:00')
  return (
    <div className={`flex-1 min-w-[110px] rounded-xl border p-3 text-center ${
      day.isRainy ? 'border-blue-500/30 bg-blue-500/5' : 'border-gray-800 bg-gray-900'
    }`}>
      <p className="text-xs font-medium text-gray-400">{DAYS_ES[dt.getDay()]} {dt.getDate()}</p>
      <Icon size={22} className={`mx-auto my-2 ${day.isRainy ? 'text-blue-400' : 'text-gray-400'}`} />
      <p className="text-xs text-gray-300">{info.label}</p>
      <p className="text-sm font-semibold text-white mt-1">
        {Math.round(day.tempMax)}° / {Math.round(day.tempMin)}°
      </p>
      <p className="text-xs text-blue-400 mt-1 flex items-center justify-center gap-1">
        <Droplets size={11} /> {day.precipProb}%
      </p>
    </div>
  )
}

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

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await copyToClipboard(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // portapapeles no disponible; el texto ya queda visible en la tarjeta para copiar manualmente
        }
      }}
      className="flex items-center gap-1.5 text-xs font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 hover:bg-gray-700 shrink-0"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <MessageCircle size={12} />}
      {copied ? 'Copiado' : 'Copiar mensaje'}
    </button>
  )
}

function InsightCard({ tag, title, body, whatsapp, accent = 'blue' }) {
  const accents = {
    blue: 'border-blue-500/30 bg-blue-500/5',
    green: 'border-green-500/30 bg-green-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
    rose: 'border-rose-500/30 bg-rose-500/5',
    purple: 'border-purple-500/30 bg-purple-500/5',
  }
  const tagColors = {
    blue: 'bg-blue-500/20 text-blue-300',
    green: 'bg-green-500/20 text-green-300',
    amber: 'bg-amber-500/20 text-amber-300',
    rose: 'bg-rose-500/20 text-rose-300',
    purple: 'bg-purple-500/20 text-purple-300',
  }
  return (
    <div className={`border rounded-xl p-5 ${accents[accent]}`}>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tagColors[accent]}`}>{tag}</span>
      </div>
      <h4 className="text-sm font-semibold text-white mt-1">{title}</h4>
      <p className="text-sm text-gray-300 leading-relaxed mt-1">{body}</p>
      {whatsapp && (
        <div className="mt-3 bg-black/20 border border-white/5 rounded-lg p-3">
          <p className="text-xs text-gray-400 italic leading-relaxed">"{whatsapp}"</p>
          <div className="mt-2">
            <CopyButton text={whatsapp} />
          </div>
        </div>
      )}
    </div>
  )
}

export default function Clima() {
  const [forecasts, setForecasts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAllForecasts()
      setForecasts(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="p-8 text-gray-400 flex items-center gap-2">
      <RefreshCw size={16} className="animate-spin" /> Cargando pronóstico...
    </div>
  )

  if (error) return (
    <div className="p-8 text-rose-400 flex items-center gap-2">
      <AlertTriangle size={16} /> {error}
    </div>
  )

  return (
    <div className="p-6 space-y-8 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Clima y Recomendaciones</h1>
          <p className="text-sm text-gray-400 mt-0.5">Pronóstico a 7 días por sucursal y acciones sugeridas para no perder venta</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-sm text-gray-300 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 hover:bg-gray-700"
        >
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {(() => {
        const crossInsight = buildCrossBranchInsight(forecasts)
        return crossInsight ? <InsightCard {...crossInsight} /> : null
      })()}

      {(() => {
        const playbook = buildRainSeasonPlaybook(forecasts)
        if (playbook.length === 0) return null
        return (
          <div className="space-y-4">
            <div className="border-l-2 border-blue-500 pl-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Target size={18} className="text-blue-400" /> Playbook de la semana de lluvia
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Jugadas de venta para no perder la semana. Cada mensaje está listo para copiar y enviar por WhatsApp.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {playbook.map((rec, i) => <InsightCard key={i} {...rec} />)}
            </div>
          </div>
        )
      })()}

      <div className="border-l-2 border-gray-700 pl-3">
        <h2 className="text-base font-bold text-white">Pronóstico y alertas por sucursal</h2>
        <p className="text-xs text-gray-400 mt-0.5">Acciones específicas según los días de lluvia de cada local.</p>
      </div>

      {forecasts.map(({ branch, days }) => (
        <div key={branch.key} className="space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Thermometer size={16} className="text-blue-400" /> {branch.label}
          </h2>

          <div className="flex gap-3 overflow-x-auto pb-1">
            {days.map(day => <DayCard key={day.date} day={day} />)}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {buildWeatherRecommendations(branch.label, days).map((rec, i) => (
              <InsightCard key={i} {...rec} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
