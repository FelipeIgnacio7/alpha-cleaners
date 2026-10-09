import { useState } from 'react'
import { Droplets, Lock } from 'lucide-react'

// Clave de acceso al panel. Se guarda solo la huella SHA-256 (con sal), no el PIN.
// Es una barrera para que otras personas con el enlace no vean las cifras; no
// reemplaza un inicio de sesión real, porque la comprobación ocurre en el navegador.
const PIN_HASH = '1a41d71aed80081c1e55c487e5048861d3c3e05b653a1156eec2a54e22c45a2e'
const STORAGE_KEY = 'alpha:acceso'

async function sha256(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const hashDe = (pin) => sha256('alpha-cleaners:' + pin)

function yaAutorizado() {
  try { return localStorage.getItem(STORAGE_KEY) === PIN_HASH } catch { return false }
}

export default function AccessGate({ children }) {
  const [ok, setOk] = useState(yaAutorizado)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)

  if (ok) return children

  async function entrar(e) {
    e.preventDefault()
    if (!pin) return
    setChecking(true)
    const h = await hashDe(pin.trim())
    if (h === PIN_HASH) {
      try { localStorage.setItem(STORAGE_KEY, h) } catch { /* sin almacenamiento: pedirá la clave de nuevo */ }
      setOk(true)
      return
    }
    // pequeña espera para frenar intentos repetidos
    await new Promise(r => setTimeout(r, 1200))
    setError(true)
    setPin('')
    setChecking(false)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-6">
      <form onSubmit={entrar} className="w-full max-w-xs space-y-5 text-center">
        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto">
          <Droplets size={22} className="text-white" />
        </div>
        <div>
          <h1 className="font-bold text-white">Alpha Cleaners</h1>
          <p className="text-sm text-gray-400 mt-1">Ingresa la clave de acceso</p>
        </div>
        <div className="relative">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            value={pin}
            onChange={e => { setPin(e.target.value); setError(false) }}
            placeholder="Clave"
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg pl-9 pr-3 py-3 text-base text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {error && <p className="text-sm text-red-400">Clave incorrecta</p>}
        <button
          type="submit"
          disabled={checking || !pin}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors"
        >
          {checking ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
