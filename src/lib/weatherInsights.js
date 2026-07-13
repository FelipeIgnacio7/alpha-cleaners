import { isSevereWeather } from './weather'

const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function dayOf(dateStr) {
  return new Date(dateStr + 'T00:00:00')
}

function fmtDay(dateStr) {
  const dt = dayOf(dateStr)
  return `${DAYS_ES[dt.getDay()]} ${dt.getDate()}`
}

function isWeekend(dateStr) {
  const dow = dayOf(dateStr).getDay()
  return dow === 0 || dow === 6
}

function findRainyStreaks(days) {
  const streaks = []
  let start = null
  days.forEach((d, i) => {
    if (d.isRainy) {
      if (start === null) start = i
    } else if (start !== null) {
      streaks.push([start, i - 1])
      start = null
    }
  })
  if (start !== null) streaks.push([start, days.length - 1])
  return streaks
}

// Recomendaciones de negocio en base al pronóstico de una sucursal
export function buildWeatherRecommendations(branchLabel, days) {
  const recs = []
  const streaks = findRainyStreaks(days)

  streaks.forEach(([start, end]) => {
    const len = end - start + 1
    const range = len === 1 ? fmtDay(days[start].date) : `${fmtDay(days[start].date)} a ${fmtDay(days[end].date)}`
    const streakDays = days.slice(start, end + 1)
    const weekendHit = streakDays.some(d => isWeekend(d.date))
    const hasSevere = streakDays.some(d => isSevereWeather(d.code))

    // Aviso el día previo, para vender protección antes de que llegue el agua
    if (start > 0 && !days[start - 1].isRainy) {
      recs.push({
        accent: 'blue',
        tag: `${branchLabel} · última oportunidad`,
        title: `Prepara el ${fmtDay(days[start - 1].date)}, antes de la lluvia`,
        body: 'Es el mejor momento para vender sellado cerámico, cera o nano-sellante: el auto queda protegido y el barro no se pega tanto cuando llueva. Publica una historia de "última oportunidad antes de la lluvia" y ofrece agendar hora para cuando pare.',
      })
    }

    if (weekendHit) {
      recs.push({
        accent: 'rose',
        tag: `${branchLabel} · fin de semana en riesgo`,
        title: `La lluvia pega el fin de semana (${range})`,
        body: 'El fin de semana suele ser el día de mayor venta — no lo dejes ir sin pelear. Antes del viernes, asegura ingresos con venta anticipada de membresías y bonos, y confirma las horas ya agendadas para que no se caigan. Refuerza en redes los servicios de interior para captar algo de tráfico igual.',
      })
    } else if (len >= 2) {
      recs.push({
        accent: 'amber',
        tag: `${branchLabel} · lluvia`,
        title: `${len} días de lluvia seguidos (${range})`,
        body: 'Prioriza venta de membresías y bonos prepago llamando a la lista de clientes frecuentes, y ofrece servicios que no dependen de que el auto esté seco: detailing interior, limpieza de tapiz, aromatización, pulido de focos. Aprovecha la baja demanda para mantención de equipos y capacitación del personal, y si algún día la lluvia es más débil, arma una promo relámpago para captar a los que sí se animan a venir.',
      })
    } else {
      recs.push({
        accent: 'blue',
        tag: `${branchLabel} · lluvia aislada`,
        title: `Lluvia puntual el ${range}`,
        body: 'Día suelto de lluvia, no debería afectar mucho el flujo. Ten servicios de interior como respaldo para ese día.',
      })
    }

    if (hasSevere) {
      recs.push({
        accent: 'rose',
        tag: `${branchLabel} · alerta`,
        title: `Riesgo de tormenta o granizo en ${range}`,
        body: 'Puede haber tormenta eléctrica, granizo o chubascos intensos. Evalúa resguardar equipos y autos en espera bajo techo, y si vas a operar con horario reducido, avísalo en redes sociales para que los clientes no lleguen y se encuentren cerrado.',
      })
    }

    const nextIdx = end + 1
    if (nextIdx < days.length && !days[nextIdx].isRainy) {
      recs.push({
        accent: 'green',
        tag: `${branchLabel} · post-lluvia`,
        title: `Repunte esperado el ${fmtDay(days[nextIdx].date)}`,
        body: 'Primer día seco tras la lluvia: los autos llegan embarrados y con restos de barro/sal en la carrocería y el chasis. Agenda desde ya lavado de bajos (antibarro) como servicio estrella, arma un combo "post-lluvia" (lavado + bajos + aspirado interior) con un pequeño descuento para subir el ticket promedio, un descuento madrugador para repartir la fila durante el día, y refuerza la dotación de personal porque va a haber más demanda de la normal.',
      })
    }
  })

  if (streaks.length === 0) {
    recs.push({
      accent: 'green',
      tag: `${branchLabel} · sin lluvia`,
      title: 'Semana despejada',
      body: 'No se esperan lluvias relevantes esta semana. Es el momento ideal para invertir en publicidad y contenido en RRSS los días de mayor tráfico histórico, y para empujar servicios exteriores de mayor ticket (pulido, sellado cerámico, cera) que rinden mejor con el auto seco.',
    })
  }

  return recs
}

// Comparativo entre sucursales: sugiere mover presupuesto/foco hacia la que tenga mejor clima
export function buildCrossBranchInsight(forecasts) {
  if (forecasts.length < 2) return null

  const withCounts = forecasts.map(f => ({
    label: f.branch.label,
    rainyDays: f.days.filter(d => d.isRainy).length,
  }))

  const wetter = withCounts.reduce((a, b) => (b.rainyDays > a.rainyDays ? b : a))
  const drier = withCounts.reduce((a, b) => (b.rainyDays < a.rainyDays ? b : a))

  if (wetter.label === drier.label || wetter.rainyDays - drier.rainyDays < 2) return null

  return {
    accent: 'blue',
    tag: 'Comparativo sucursales',
    title: `${wetter.label} tiene más lluvia esta semana que ${drier.label}`,
    body: `${wetter.label}: ${wetter.rainyDays} días de lluvia vs ${drier.label}: ${drier.rainyDays}. Considera mover parte del presupuesto de publicidad o promociones hacia ${drier.label} esta semana, ya que va a tener más tráfico potencial disponible.`,
  }
}
