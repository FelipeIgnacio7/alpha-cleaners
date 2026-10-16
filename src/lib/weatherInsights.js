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

// Qué se puede prometer en los mensajes (confirmado con el catálogo y Aquapp):
//  - El lavado (simple, full, cera, chasis) es por orden de llegada: no se agenda ni se "guardan cupos".
//  - Servicios con reserva opcional: tapiz, pulido, detailing, sellado cerámico, motor con vapor, chasis.
//  - Membresía Gold: desde $39.990/mes (autos) y $44.990/mes (camionetas), se contrata en alphacleaners.cl.
//  - No hay descuentos de campaña creados en Aquapp: no se prometen. Si se decide hacer uno, crearlo primero ahí.
const BAJA = ''
const MEMBRESIA = 'Membresía Gold: desde $39.990 al mes (autos) o $44.990 (camionetas). Detalles y contratación en alphacleaners.cl.'
const SIN_RESERVA = 'Atendemos por orden de llegada, sin reserva.'

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
        body: 'Es el mejor momento para ofrecer cera o sellado cerámico: el auto queda protegido y el barro se pega menos cuando llueva. La cera se agrega al lavado por orden de llegada; el sellado cerámico es de reserva opcional. Publica una historia de "última oportunidad antes de la lluvia".',
        whatsapp: `🚗☔ Se viene la lluvia. Antes de que llegue, protege tu auto con cera o sellado cerámico: el barro se pega mucho menos. La cera la agregamos a tu lavado en Alpha Cleaners (${SIN_RESERVA}). Si prefieres el sellado cerámico, escríbenos por aquí y reservamos tu hora.${BAJA}`,
      })
    }

    if (weekendHit) {
      recs.push({
        accent: 'rose',
        tag: `${branchLabel} · fin de semana en riesgo`,
        title: `La lluvia pega el fin de semana (${range})`,
        body: 'El fin de semana suele ser el de mayor venta, no lo dejes ir sin pelear. Antes del viernes, contacta a tus clientes frecuentes para ofrecerles la membresía (cobras caja aunque llueva) y refuerza en redes los servicios de interior para captar algo de tráfico igual.',
        whatsapp: `Hola 👋 este fin de semana viene con lluvia. Si nos visitas seguido, conoce la ${MEMBRESIA}${BAJA}`,
      })
    } else if (len >= 2) {
      recs.push({
        accent: 'amber',
        tag: `${branchLabel} · lluvia`,
        title: `${len} días de lluvia seguidos (${range})`,
        body: 'Prioriza la venta de membresías llamando a la lista de clientes frecuentes, y ofrece servicios que no dependen de que el auto esté seco: detailing interior, limpieza de tapiz, sanitizado interior, pulido de focos. Si manejas pauta publicitaria (Meta/Google), reduce las palabras clave de lavado exterior estos días y redirige el presupuesto hacia membresías y servicios de interior. Aprovecha también la baja demanda para mantención de equipos, capacitación del personal y pedir reseñas a los clientes satisfechos que sí alcancen a venir. Si decides hacer una promo para atraer gente, créala antes en Aquapp (Descuentos) para que el cajero pueda aplicarla.',
        whatsapp: `Hola! Esta semana viene con lluvia 🌧️ Es un buen momento para conocer la ${MEMBRESIA}${BAJA}`,
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
        whatsapp: '⚠️ Por el pronóstico de tormenta o granizo, hoy podemos atender con horario reducido por seguridad. Cualquier cambio te lo avisamos por aquí. ¡Gracias por tu comprensión!',
      })
    }

    const nextIdx = end + 1
    if (nextIdx < days.length && !days[nextIdx].isRainy) {
      recs.push({
        accent: 'green',
        tag: `${branchLabel} · post-lluvia`,
        title: `Repunte esperado el ${fmtDay(days[nextIdx].date)}`,
        body: 'Primer día seco tras la lluvia: los autos llegan embarrados y con restos de barro y sal en la carrocería y el chasis. Destaca el lavado full y el lavado de chasis + ducha grafitada (se atiende de a un auto a la vez), y refuerza la dotación de personal porque habrá más demanda de la normal. El lavado es por orden de llegada, así que avisa en qué horarios hay menos fila para repartirla. Si quieres incentivarlo con un descuento por ir temprano, créalo antes en Aquapp.',
        whatsapp: `☀️ ¡Ya paró la lluvia! Si tu auto quedó con barro, pasa por Alpha Cleaners: lavado full y lavado de chasis + ducha grafitada para sacar el barro de abajo. ${SIN_RESERVA} Para el chasis también puedes reservar escribiéndonos por aquí.${BAJA}`,
      })
    }
  })

  if (streaks.length === 0) {
    recs.push({
      accent: 'green',
      tag: `${branchLabel} · sin lluvia`,
      title: 'Semana despejada',
      body: 'No se esperan lluvias relevantes esta semana. Es el momento ideal para invertir en publicidad y contenido en RRSS los días de mayor tráfico histórico, y para empujar servicios exteriores de mayor ticket (pulido, sellado cerámico, cera) que rinden mejor con el auto seco.',
      whatsapp: `☀️ Semana ideal para dejar tu auto como nuevo en Alpha Cleaners: lavado full, pulido o sellado cerámico con el clima a favor. El lavado es por orden de llegada, sin reserva; para pulido y sellado cerámico puedes reservar hora escribiéndonos por aquí.${BAJA}`,
    })
  }

  return recs
}

// Playbook estratégico para una semana con lluvia. Ideas accionables de
// marketing/ventas propias del rubro lavado de autos, agrupadas por objetivo.
// Se muestra una sola vez (no por sucursal) cuando hay lluvia relevante.
// Las tarjetas marcadas "Idea a evaluar" proponen algo que hoy NO existe en el catálogo
// ni en Aquapp, por eso no traen mensaje: primero hay que definirlo y crearlo.
export function buildRainSeasonPlaybook(forecasts) {
  const maxRainy = Math.max(...forecasts.map(f => f.days.filter(d => d.isRainy).length))
  if (maxRainy < 2) return []

  return [
    // ---- Capturar caja AHORA, aunque no laven esta semana ----
    {
      accent: 'purple',
      tag: '1 · Captura caja ahora',
      title: 'Llama a tus candidatos a membresía',
      body: 'Usa el tiempo muerto de los lavadores para telefonear. En Inteligencia → sección de candidatos a membresía ya tienes la lista de clientes frecuentes que aún no son socios. La lluvia es la mejor excusa para cerrarlos: cobras caja hoy aunque no laven esta semana, y aseguras sus próximas visitas. Fija una meta diaria de llamados por sucursal.',
      whatsapp: `Hola [nombre] 👋 Vemos que nos visitas seguido en Alpha Cleaners. Te cuento de la ${MEMBRESIA}${BAJA}`,
    },
    {
      accent: 'amber',
      tag: '1 · Idea a evaluar',
      title: 'Bonos y gift cards prepago (hoy no existen)',
      body: '"Compra ahora, usa cuando pare la lluvia" genera ingreso inmediato sin necesitar box ni lavadores. Pero hoy no hay un bono o pack prepago en el catálogo ni en Aquapp. Si decides lanzarlo (por ejemplo un pack de lavados), defínelo con su precio, créalo primero en Aquapp y recién ahí anúncialo. Sirve también como regalo en fechas especiales.',
    },

    // ---- Vender lo que la lluvia SÍ hace necesario ----
    {
      accent: 'blue',
      tag: '2 · Productos de lluvia',
      title: 'Sellado cerámico: tu producto de protección para el invierno',
      body: 'Esto no se pierde con la lluvia: se vende más por la lluvia. El sellado cerámico protege la pintura y hace que el agua y el barro resbalen. Es de ticket alto y de reserva opcional, así que avísale al cliente que puede reservar hora. El sellado ya incluye el pulido completo básico.',
      whatsapp: `🌧️ ¿Sabías que el sellado cerámico hace que el agua y el barro resbalen en la pintura de tu auto? Es ideal para el invierno y lo hacemos en Alpha Cleaners. Escríbenos por aquí y te cotizamos y reservamos hora.${BAJA}`,
    },
    {
      accent: 'blue',
      tag: '2 · Productos de lluvia',
      title: 'Cuida el interior antes de que se humedezca',
      body: 'Con lluvia la gente entra y sale del auto mojada: tapices y alfombras sufren, y aparecen la humedad y el olor. Ofrece limpieza de tapiz (asientos, puertas, techo) y sanitizado interior, servicios de interior que se pueden hacer aunque llueva.',
      whatsapp: `💺 Con la lluvia el interior del auto se humedece y agarra olor. En Alpha Cleaners hacemos limpieza de tapiz y sanitizado interior para dejarlo fresco. El sanitizado es por orden de llegada; para la limpieza de tapiz puedes reservar hora escribiéndonos por aquí.${BAJA}`,
    },

    // ---- Servicios que no dependen del clima ----
    {
      accent: 'amber',
      tag: '3 · Servicios sin clima',
      title: 'Reorienta la oferta al interior y al detailing',
      body: 'Todo lo que no se arruina si llueve después: detailing interior, limpieza profunda de tapiz, sanitizado interior, pulido de focos, pulido completo. Ponlos al frente en el cartel de precios y en RRSS estos días. Un pulido de focos o un detailing interior mantiene el ticket aunque no laves por fuera.',
      whatsapp: `✨ ¿Llueve y no vale la pena lavar por fuera? Aprovecha para el interior: detailing interior, limpieza de tapiz o pulido de focos. Escríbenos por aquí y reservamos tu hora.${BAJA}`,
    },

    // ---- Llevar el lavado bajo techo ----
    {
      accent: 'amber',
      tag: '4 · Idea a evaluar',
      title: 'Lavado bajo techo o a domicilio (hoy no existe)',
      body: 'La lluvia no importa si el auto está bajo techo, y lavar en estacionamientos de edificios u oficinas es una venta que la competencia deja pasar. Pero hoy no ofrecemos lavado a domicilio ni en estacionamientos. Si quieres explorarlo (convenios con edificios u oficinas), defínelo como servicio con su precio en Aquapp antes de anunciarlo.',
    },

    // ---- Repartir la demanda del primer día seco ----
    {
      accent: 'green',
      tag: '5 · Primer día seco',
      title: 'Avisa el día seco: llegan todos a la vez',
      body: 'Apenas pare, todos van a querer sacarse el barro y se arma fila. Como el lavado es por orden de llegada (no se agendan horas), avisa a tus clientes los horarios con menos fila según tu historial, para repartir la demanda, y refuerza el personal. Si quieres incentivar ir en horario tranquilo con un descuento, créalo antes en Aquapp.',
      whatsapp: `📍 La lluvia pasa y el barro queda. Cuando salga el sol, pasa por Alpha Cleaners: atendemos por orden de llegada y el primer día seco se arma fila, así que mientras más temprano llegues, mejor.${BAJA}`,
    },

    // ---- Campaña masiva ----
    {
      accent: 'rose',
      tag: '6 · Campaña masiva',
      title: 'Mensaje a toda la base de clientes',
      body: 'Combina las dos jugadas en un solo envío por WhatsApp a tu base: protección ANTES de la lluvia (cera o sellado cerámico) y aviso de que DESPUÉS se atiende por orden de llegada. Segmenta si puedes: a los socios recuérdales su membresía, a los frecuentes ofréceles la membresía, y a los inactivos escríbeles desde Reactivación con la plantilla de recontacto.',
      whatsapp: `¡Hola! ☔ Se viene semana de lluvia. Dos ideas para tu auto: 1) protégelo antes con cera o sellado cerámico, y 2) cuando pare, pasa a sacar el barro con un lavado full o de chasis. ${SIN_RESERVA} Para el sellado cerámico y el chasis también puedes reservar hora escribiéndonos por aquí.${BAJA}`,
    },

    // ---- Aprovechar el bache de tráfico ----
    {
      accent: 'amber',
      tag: '7 · Aprovecha el bache',
      title: 'Convierte el tiempo muerto en inversión',
      body: 'Si igual hay menos autos, que no se pierda el día: mantención de box y equipos, capacitación del personal en servicios de mayor margen (detailing, sellado cerámico), y trabajo administrativo atrasado. Pide reseñas en Google a tus clientes fieles (sube tu ranking justo para cuando vuelva el sol) y evalúa un programa de referidos. Graba contenido para RRSS: tips de manejo en lluvia, antes y después de un sellado cerámico.',
    },
  ]
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
