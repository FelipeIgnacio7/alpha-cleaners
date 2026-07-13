const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function fmtDay(dateStr) {
  const dt = new Date(dateStr + 'T00:00:00')
  return `${DAYS_ES[dt.getDay()]} ${dt.getDate()}`
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

    if (len >= 2) {
      recs.push({
        accent: 'amber',
        tag: `${branchLabel} · lluvia`,
        title: `${len} días de lluvia seguidos (${range})`,
        body: 'Prioriza venta de membresías y bonos prepago, y ofrece servicios de interior (detailing, tapiz, aromatización) que no dependen de que el auto esté seco. Aprovecha el tiempo del personal para llamar a clientes frecuentes.',
      })
    } else {
      recs.push({
        accent: 'blue',
        tag: `${branchLabel} · lluvia aislada`,
        title: `Lluvia puntual el ${range}`,
        body: 'Día suelto de lluvia, no debería afectar mucho el flujo. Ten servicios de interior como respaldo para ese día.',
      })
    }

    const nextIdx = end + 1
    if (nextIdx < days.length && !days[nextIdx].isRainy) {
      recs.push({
        accent: 'green',
        tag: `${branchLabel} · post-lluvia`,
        title: `Repunte esperado el ${fmtDay(days[nextIdx].date)}`,
        body: 'Primer día seco tras la lluvia: los autos llegan embarrados. Agenda desde ya lavado de bajos / antibarro y refuerza la dotación de personal para ese día.',
      })
    }
  })

  if (streaks.length === 0) {
    recs.push({
      accent: 'green',
      tag: `${branchLabel} · sin lluvia`,
      title: 'Semana despejada',
      body: 'No se esperan lluvias relevantes esta semana. Mantén la operación normal y aprovecha para impulsar RRSS en los días de mayor tráfico histórico.',
    })
  }

  return recs
}
