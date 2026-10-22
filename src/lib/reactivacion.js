// Motor de análisis de reactivación de clientes para AlphaCleaners.
// Trabaja sobre transacciones_lavado (patente, monto, fecha), cruzado con
// patente_telefono (para resolver teléfono/nombre) y contactos_clientes (fallback de nombre).
// Objetivo: agrupar clientes por patente, segmentarlos por recencia/frecuencia,
// y armar una cola de mensajes de WhatsApp editable para reactivarlos.
// Este archivo solo produce la recomendación y la cola aprobada, nunca envía nada
// (el envío lo hace el agente de WhatsApp con la cola aprobada).

// Umbrales de segmentación, visibles y ajustables (no números mágicos escondidos).
// El caso conocido de referencia (~25 clientes, ~600 días sin volver, 1 sola visita)
// cae dentro de "perdido", que usa un corte más estricto que "muyFrio".
export const DEFAULT_SEGMENT_THRESHOLDS = {
  nuevo: { maxDaysFirst: 45, maxVisits: 2 },
  // Con 2+ visitas vuelven solos con más frecuencia (17% a los 60 días), así que se les espera hasta los 90.
  enRiesgo: { minDays: 60, maxDays: 179, minDaysRepetidores: 90 },
  muyFrio: { minDays: 180 },
  perdido: { minDays: 365 },
  // Candidatos a Membresía Gold (solo Fontova, que es donde se vende). Análisis 16-10-2026:
  // los socios usan 1,7 visitas/mes y casi ningún no-socio gasta $55.000 al mes (3 de 1.965),
  // así que el filtro es la FRECUENCIA (viene 2+ veces en un mes), no el gasto.
  membresia: { ventanaDias: 180, minVisitas: 3, maxDaysLast: 60, localId: 1 },
}

const ES_MEMBRESIA = /membres[ií]a/i

function normalizeNombre(n) {
  return (n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizePatente(p) {
  return (p || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Agrupa transacciones por patente. Filas sin patente quedan fuera de los
// agregados pero se cuentan aparte para reportar la fracción no vinculable.
// `trabajosRows` (trabajos_aquapp: patente, fecha, es_membresia) completa la última visita con
// trabajos que no dejaron una venta pagada (membresías, deudas, cobros pendientes) y detecta socios.
export function buildClientAggregates(txnRows, now = new Date(), trabajosRows = []) {
  const hoyMs = now.getTime()
  const byPatente = {}
  let unresolvedCount = 0

  txnRows.forEach(t => {
    const patente = normalizePatente(t.patente)
    if (!patente) { unresolvedCount++; return }
    if (!byPatente[patente]) byPatente[patente] = { visits: 0, total: 0, lastMs: 0, firstMs: Infinity, nombreVenta: null, marca: null, marcaMs: 0, socio: false, diasMemb: new Set() }
    const d = byPatente[patente]
    const ms = new Date(t.fecha).getTime()
    const cfg = DEFAULT_SEGMENT_THRESHOLDS.membresia
    if (ES_MEMBRESIA.test(t.tipo_servicio || '')) {
      if (hoyMs - ms <= 90 * 86400000) d.socio = true
    } else if (t.local_id === cfg.localId && hoyMs - ms <= cfg.ventanaDias * 86400000) {
      d.diasMemb.add(String(t.fecha).slice(0, 10))
    }
    d.visits++
    d.total += Number(t.monto) || 0
    const nombre = (t.cliente || '').replace(/\s+/g, ' ').trim()
    const marca = (t.marca || '').replace(/\s+/g, ' ').trim()
    if (marca && ms >= d.marcaMs) { d.marca = marca; d.marcaMs = ms }
    if (ms > d.lastMs) {
      d.lastMs = ms
      if (nombre) d.nombreVenta = nombre
    } else if (nombre && !d.nombreVenta) {
      d.nombreVenta = nombre
    }
    if (ms < d.firstMs) d.firstMs = ms
  })

  const hace90Ms = hoyMs - 90 * 86400000
  trabajosRows.forEach(t => {
    const d = byPatente[normalizePatente(t.patente)]
    if (!d) return
    const ms = new Date(t.fecha).getTime()
    if (ms > d.lastMs) d.lastMs = ms
    if (t.es_membresia && ms >= hace90Ms) d.socio = true
  })

  const aggregates = {}
  Object.entries(byPatente).forEach(([patente, d]) => {
    // Frecuencia reciente en Fontova, para candidatos a membresía
    const dias = [...d.diasMemb]
    const porMes = {}
    dias.forEach(f => { porMes[f.slice(0, 7)] = (porMes[f.slice(0, 7)] || 0) + 1 })
    const diaSemana = f => new Date(`${f}T12:00:00`).getDay()
    aggregates[patente] = {
      visitasRecientes: dias.length,
      mesesCon2: Object.values(porMes).filter(n => n >= 2).length,
      visitasLaV: dias.filter(f => diaSemana(f) >= 1 && diaSemana(f) <= 5).length,
      patente,
      nombreVenta: d.nombreVenta,
      marca: d.marca,
      socio: d.socio,
      visits: d.visits,
      avgTicket: d.visits > 0 ? d.total / d.visits : 0,
      daysSinceLast: Math.floor((hoyMs - d.lastMs) / 86400000),
      daysSinceFirst: Math.floor((hoyMs - d.firstMs) / 86400000),
    }
  })

  return { aggregates, unresolvedCount, totalCount: txnRows.length }
}

const SEGMENT_META = {
  nuevo: {
    label: 'Nuevos',
    description: 'Primera visita reciente, todavía sin fidelizar',
    accent: 'blue',
  },
  enRiesgo: {
    label: 'En riesgo',
    description: 'Empiezan a espaciarse, conviene contactarlos antes de perderlos',
    accent: 'amber',
  },
  muyFrio: {
    label: 'Muy frío',
    description: 'Entre 6 meses y 1 año sin volver',
    accent: 'rose',
  },
  membresia: {
    label: 'Candidatos a membresía',
    description: 'Clientes de Fontova que no son socios, con 3+ visitas en los últimos 6 meses (la mayoría de lunes a viernes) y la última hace menos de 60 días. Prioridad alta: vinieron 2+ veces en al menos dos meses distintos.',
    accent: 'green',
  },
  membresiaFinde: {
    label: 'Membresía · clientes de fin de semana',
    description: 'Mismo criterio, pero vienen sobre todo sábado o domingo, que es cuando hay más fila. La membresía es de lunes a viernes, así que el mensaje les vende cambiar al día de semana: menos espera y lavados ilimitados.',
    accent: 'green',
  },
  perdido: {
    label: 'Perdidos',
    description: 'Más de un año sin volver — mensaje con mayor incentivo',
    accent: 'purple',
  },
}

export const SEGMENT_KEYS = Object.keys(SEGMENT_META)

const ORDEN_PRIORIDAD = { alta: 0, media: 1, base: 2 }

// Arma los segmentos a partir de los agregados por patente (sin teléfono aún).
export function buildSegments(aggregates, thresholds = DEFAULT_SEGMENT_THRESHOLDS) {
  const buckets = { membresia: [], membresiaFinde: [], nuevo: [], enRiesgo: [], muyFrio: [], perdido: [] }
  const m = thresholds.membresia

  Object.values(aggregates).forEach(c => {
    if (c.socio) return // socios con membresía vigente: no se les recontacta
    const { daysSinceLast, daysSinceFirst, visits } = c
    if (c.visitasRecientes >= m.minVisitas && daysSinceLast <= m.maxDaysLast) {
      c.prioridad = c.mesesCon2 >= 2 ? 'alta' : (c.mesesCon2 === 1 || c.visitasRecientes >= 4) ? 'media' : 'base'
      // La membresía es de lunes a viernes: a quien viene sobre todo el fin de semana se le vende el cambio de día.
      buckets[c.visitasLaV * 2 >= c.visitasRecientes ? 'membresia' : 'membresiaFinde'].push(c)
    }
    if (daysSinceFirst <= thresholds.nuevo.maxDaysFirst && visits <= thresholds.nuevo.maxVisits) {
      buckets.nuevo.push(c)
    }
    if (daysSinceLast >= thresholds.perdido.minDays) {
      buckets.perdido.push(c)
    } else if (daysSinceLast >= thresholds.muyFrio.minDays) {
      buckets.muyFrio.push(c)
    } else if (
      daysSinceLast >= (visits >= 2 ? thresholds.enRiesgo.minDaysRepetidores : thresholds.enRiesgo.minDays)
      && daysSinceLast <= thresholds.enRiesgo.maxDays
    ) {
      buckets.enRiesgo.push(c)
    }
  })

  return Object.entries(buckets).map(([key, clients]) => ({
    key,
    ...SEGMENT_META[key],
    defaultTemplate: getDefaultTemplate(key),
    clients: key.startsWith('membresia')
      ? clients.sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] || b.visitasRecientes - a.visitasRecientes)
      : clients.sort((a, b) => a.daysSinceLast - b.daysSinceLast),
  }))
}

// Resuelve teléfono/nombre por patente. Orden de prioridad para el nombre:
// nombre_contacto -> nombre_venta (de patente_telefono) -> match por teléfono
// en contactos_clientes -> nombre registrado en la última venta -> null.
export function enrichWithContact(clients, patenteTelefonoRows, contactosRows) {
  const telefonoPorPatente = {}
  patenteTelefonoRows.forEach(r => {
    const p = normalizePatente(r.patente)
    if (p) telefonoPorPatente[p] = r
  })
  const contactoPorTelefono = {}
  contactosRows.forEach(c => {
    if (c.telefono) contactoPorTelefono[c.telefono] = c
  })

  // Respaldo por nombre completo: solo si ese nombre apunta a un único teléfono
  // (con varios no se puede saber cuál es, y escribirle a otra persona es peor que no escribir).
  const telefonosPorNombre = {}
  const addNombre = (nombre, telefono) => {
    const key = normalizeNombre(nombre)
    if (!telefono || key.split(' ').length < 2) return
    ;(telefonosPorNombre[key] ||= new Set()).add(telefono)
  }
  patenteTelefonoRows.forEach(r => { addNombre(r.nombre_venta, r.telefono); addNombre(r.nombre_contacto, r.telefono) })
  contactosRows.forEach(c => addNombre(c.nombre, c.telefono))

  return clients.map(c => {
    const match = telefonoPorPatente[c.patente]
    let telefono = match?.telefono || null
    let telefonoPorNombre = false
    if (!telefono) {
      const candidatos = telefonosPorNombre[normalizeNombre(c.nombreVenta)]
      if (candidatos && candidatos.size === 1) {
        telefono = [...candidatos][0]
        telefonoPorNombre = true
      }
    }
    const contacto = contactoPorTelefono[telefono]
    const noContactar = Boolean(contacto?.no_contactar || contacto?.opt_out_at)
    const nombre = match?.nombre_contacto || match?.nombre_venta
      || contacto?.nombre
      || c.nombreVenta
      || null
    return { ...c, telefono, nombre, telefonoPorNombre, noContactar, hasPhone: Boolean(telefono) && !noContactar }
  })
}

// Aplica estado persistido: excluye clientes ya contactados para ese segmento
// y trae de vuelta la plantilla editada guardada (si existe).
export function applyPersistedState(segments, sentRecords = [], savedTemplates = {}) {
  const sentKey = (patente, segmentKey) => `${patente}::${segmentKey}`
  const sentSet = new Set(sentRecords.map(r => sentKey(normalizePatente(r.patente), r.segment_key)))

  return segments.map(s => ({
    ...s,
    template: savedTemplates[s.key] || s.defaultTemplate,
    clients: s.clients
      .filter(c => !sentSet.has(sentKey(c.patente, s.key)))
      .map(c => ({ ...c, status: 'pending' })),
  })).map(s => ({
    ...s,
    counts: {
      total: s.clients.length,
      withPhone: s.clients.filter(c => c.hasPhone).length,
      withoutPhone: s.clients.filter(c => !c.hasPhone).length,
    },
  }))
}

// Plantilla default por segmento. Es solo un punto de partida — se edita en la UI.
const DIRECCION = 'Av. Pedro Fontova 7420, Huechuraba'

const BENEFICIOS_GOLD = '✅ Lavados exteriores ilimitados\n✅ 2 limpiezas interiores al mes\n✅ 10% de descuento en todos nuestros servicios\n✅ Café o agua en cada visita'
const PRECIO_GOLD = '💳 *$55.000 al mes* (autos) o *$65.000* (camionetas), válida de lunes a viernes.'
const CIERRE_GOLD = 'Contrátala en alphacleaners.cl o escríbenos por aquí y te ayudamos.'

// Campaña de recontacto: descuento de lunes a viernes (sábado y domingo ya hay fila), vigente hasta fin
// de noviembre 2026. Si se cambia la fecha, avisarle también a Claudio (el bot) para que responda lo mismo.
// El lavado es por orden de llegada, por eso no se invita a "agendar".
export const PROMO_VENCE = '30 de noviembre'
export function getDefaultTemplate(segmentKey, opts = {}) {
  const pct = opts.discountPct ?? 40
  // Mensaje de recontacto v2 (formato corto elegido por Felipe, 22-10-2026): abre con una pregunta, se presenta,
  // ofrece el Lavado Full con descuento y cierra con una pregunta. Sin mención al auto (ni marca ni modelo).
  const recontacto = `Hola {{nombre}}, ¿cómo has estado? 🚗 Te escribe el equipo de Alpha Cleaners.

Hace {{hace}} nos visitaste y te queremos dar *${pct}% de descuento en tu próximo Lavado Full* (lunes a viernes, hasta el ${PROMO_VENCE}).

¿Qué día te acomoda?

📍 ${DIRECCION}
Sin reserva: te atendemos por orden de llegada.`
  const templates = {
    nuevo: `Hola {{nombre}} 👋\n\n¡Gracias por visitar Alpha Cleaners! 🚗✨\n\n¿Cómo te fue con el servicio? Tu opinión nos ayuda a mejorar.\n\nSi necesitas algo, escríbenos por aquí.`,
    enRiesgo: recontacto,
    muyFrio: recontacto,
    perdido: recontacto,
    // Precios de alphacleaners.cl al 16-10-2026. Sin descuento: el gancho es la conveniencia.
    membresia: `Hola {{nombre}} 👋\n\nGracias por preferirnos: en los últimos 6 meses nos visitaste {{visitas}} veces en Alpha Cleaners 🚗✨\n\nComo vienes seguido, te cuento de nuestra *Membresía Gold* 🏅\n${BENEFICIOS_GOLD}\n\n${PRECIO_GOLD}\n\nSi lavas 2 o más veces al mes, te conviene. ${CIERRE_GOLD}`,
    // Vienen el fin de semana, cuando hay más fila (sábado ~32 ventas/día vs. 13–21 de lunes a viernes):
    // se les vende cambiar al día de semana, sin espera y sin pagar cada lavado.
    membresiaFinde: `Hola {{nombre}} 👋\n\nGracias por preferirnos: en los últimos 6 meses nos visitaste {{visitas}} veces en Alpha Cleaners 🚗✨\n\nVimos que sueles venir el fin de semana, que es cuando más fila hay. ¿Te tinca lavar de lunes a viernes, con menos espera y sin pagar cada lavado? Para eso es nuestra *Membresía Gold* 🏅\n${BENEFICIOS_GOLD}\n\n${PRECIO_GOLD}\n\nPasa el día de semana que más te acomode. ${CIERRE_GOLD}`,
  }
  return templates[segmentKey] || templates.enRiesgo
}

const ES_EMPRESA = /\b(spa|ltda|limitada|s\.a|sociedad|empresa|ingenier\w*|servicios|transportes?|constructora|comercial|inversiones|consultor\w*)\b/i

// "MIGUEL DIAZ" / "juan pablo muñoz" -> "Miguel" / "Juan". Empresas y nombres dudosos -> null.
export function nombreParaSaludo(nombre) {
  const limpio = (nombre || '').replace(/\s+/g, ' ').trim()
  if (!limpio || ES_EMPRESA.test(limpio)) return null
  const primero = limpio.split(' ')[0]
  if (primero.length < 2 || !/^[\p{L}'-]+$/u.test(primero)) return null
  const minusc = primero.toLocaleLowerCase('es-CL')
  const bonito = NOMBRES_CON_TILDE[minusc] || minusc.charAt(0).toLocaleUpperCase('es-CL') + minusc.slice(1)
  return bonito
}

// En la base los nombres suelen venir sin tilde; así los saludos no se ven descuidados.
const NOMBRES_CON_TILDE = {
  maria: 'María', belen: 'Belén', marcos: 'Marcos', jose: 'José', rene: 'René', sebastian: 'Sebastián', andres: 'Andrés', matias: 'Matías',
  nicolas: 'Nicolás', tomas: 'Tomás', joaquin: 'Joaquín', ramon: 'Ramón', ivan: 'Iván', adrian: 'Adrián',
  cristian: 'Cristian', julian: 'Julián', martin: 'Martín', agustin: 'Agustín', hector: 'Héctor', victor: 'Víctor',
  german: 'Germán', fabian: 'Fabián', esteban: 'Esteban', angel: 'Ángel', oscar: 'Óscar', cesar: 'César',
  lucia: 'Lucía', valentina: 'Valentina', monica: 'Mónica', veronica: 'Verónica', angelica: 'Angélica',
  jesus: 'Jesús', raul: 'Raúl', ruben: 'Rubén', ines: 'Inés', claudia: 'Claudia', sofia: 'Sofía',
}

// "Hyundai" -> "tu *Hyundai*"; sin marca -> "tu auto". Marcas en minúscula se capitalizan (RAM y similares quedan igual).
export function textoAuto(marca) {
  const m = (marca || '').trim()
  if (!m) return 'tu auto'
  const bonita = m === m.toLowerCase() ? m.replace(/(^|[\s-])(\p{L})/gu, (_, sep, l) => sep + l.toLocaleUpperCase('es-CL')) : m
  return `tu ${bonita}`
}

// Días sin venir -> "unos 3 meses" / "más de un año".
export function textoHace(dias) {
  const d = Number(dias) || 0
  if (d >= 365) return 'más de un año'
  const meses = Math.max(2, Math.round(d / 30))
  return `unos ${meses} meses`
}

export function interpolate(template, client) {
  return template
    .replace(/\{\{\s*nombre\s*\}\}/gi, nombreParaSaludo(client.nombre) || 'estimado cliente')
    .replace(/\{\{\s*vence\s*\}\}/gi, PROMO_VENCE)
    .replace(/\{\{\s*auto\s*\}\}/gi, textoAuto(client.marca))
    .replace(/\{\{\s*hace\s*\}\}/gi, textoHace(client.daysSinceLast))
    .replace(/\{\{\s*visitas\s*\}\}/gi, String(client.visitasRecientes || client.visits || ''))
}

// Arma la cola final de envío a partir de los clientes seleccionados de un segmento.
export function buildSendQueue(segment, selectedPatentes, editedTemplateText) {
  const template = editedTemplateText || segment.template || segment.defaultTemplate
  const selected = new Set(selectedPatentes)
  const telefonosVistos = new Set() // una misma persona con varios autos recibe un solo mensaje
  return segment.clients
    .filter(c => selected.has(c.patente) && c.hasPhone)
    .filter(c => !telefonosVistos.has(c.telefono) && telefonosVistos.add(c.telefono))
    .map(c => ({
      patente: c.patente,
      nombre: c.nombre || 'Sin nombre',
      telefono: c.telefono,
      mensaje: interpolate(template, c),
    }))
}

// Formato de texto plano para copiar la cola completa (ej. pegar en una nota
// mientras se hacen los envíos uno por uno en Aquapp).
export function formatQueueForClipboard(queueRows) {
  return queueRows
    .map(r => `${r.nombre} (${r.telefono}):\n${r.mensaje}`)
    .join('\n\n---\n\n')
}
