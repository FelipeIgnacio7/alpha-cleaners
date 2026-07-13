// Clima vía Open-Meteo (gratis, sin API key)
export const BRANCHES = [
  { key: 'fontova', label: 'Av. Pedro Fontova', lat: -33.383, lon: -70.669 },
  { key: 'curico', label: 'Curicó', lat: -34.9828, lon: -71.2394 },
]

const WEATHER_CODES = {
  0: { label: 'Despejado', icon: 'sun' },
  1: { label: 'Mayormente despejado', icon: 'sun' },
  2: { label: 'Parcialmente nublado', icon: 'cloud-sun' },
  3: { label: 'Nublado', icon: 'cloud' },
  45: { label: 'Niebla', icon: 'fog' },
  48: { label: 'Niebla escarchada', icon: 'fog' },
  51: { label: 'Llovizna leve', icon: 'rain' },
  53: { label: 'Llovizna', icon: 'rain' },
  55: { label: 'Llovizna intensa', icon: 'rain' },
  61: { label: 'Lluvia leve', icon: 'rain' },
  63: { label: 'Lluvia', icon: 'rain' },
  65: { label: 'Lluvia intensa', icon: 'rain' },
  66: { label: 'Lluvia helada', icon: 'rain' },
  67: { label: 'Lluvia helada intensa', icon: 'rain' },
  71: { label: 'Nieve leve', icon: 'snow' },
  73: { label: 'Nieve', icon: 'snow' },
  75: { label: 'Nieve intensa', icon: 'snow' },
  80: { label: 'Chubascos leves', icon: 'rain' },
  81: { label: 'Chubascos', icon: 'rain' },
  82: { label: 'Chubascos intensos', icon: 'rain' },
  95: { label: 'Tormenta eléctrica', icon: 'storm' },
  96: { label: 'Tormenta con granizo', icon: 'storm' },
  99: { label: 'Tormenta con granizo intensa', icon: 'storm' },
}

export function weatherInfo(code) {
  return WEATHER_CODES[code] || { label: 'Sin datos', icon: 'cloud' }
}

// Lluvia relevante si hay alta probabilidad o volumen apreciable
export function isRainyDay({ precipProb, precipMm }) {
  return precipProb >= 50 || precipMm >= 1
}

// Tormenta eléctrica, granizo o lluvia/chubascos intensos
const SEVERE_CODES = new Set([65, 66, 67, 82, 95, 96, 99])
export function isSevereWeather(code) {
  return SEVERE_CODES.has(code)
}

export async function fetchBranchForecast(branch) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${branch.lat}&longitude=${branch.lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=America%2FSantiago&forecast_days=7`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No se pudo obtener el clima de ${branch.label}`)
  const data = await res.json()
  const {
    time, weathercode,
    temperature_2m_max, temperature_2m_min,
    precipitation_sum, precipitation_probability_max,
  } = data.daily

  return time.map((date, i) => {
    const precipProb = precipitation_probability_max[i] ?? 0
    const precipMm = precipitation_sum[i] ?? 0
    return {
      date,
      code: weathercode[i],
      tempMax: temperature_2m_max[i],
      tempMin: temperature_2m_min[i],
      precipMm,
      precipProb,
      isRainy: isRainyDay({ precipProb, precipMm }),
    }
  })
}

export async function fetchAllForecasts() {
  return Promise.all(
    BRANCHES.map(async (branch) => ({
      branch,
      days: await fetchBranchForecast(branch),
    }))
  )
}
