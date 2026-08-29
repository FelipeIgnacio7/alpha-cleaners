// Motor de análisis de reactivación de clientes para AlphaCleaners.
// Trabaja sobre transacciones_lavado (patente, monto, fecha), cruzado con
// patente_telefono (para resolver teléfono/nombre) y contactos_clientes (fallback de nombre).
// Objetivo: agrupar clientes por patente, segmentarlos por recencia/frecuencia,
// y armar una cola de mensajes de WhatsApp editable para reactivarlos vía Aquapp.
// El envío real sigue siendo manual en Aquapp (no tiene API) — este archivo solo
// produce la recomendación y la cola aprobada, nunca envía nada.

// Umbrales de segmentación, visibles y ajustables (no números mágicos escondidos).
// El caso conocido de referencia (~25 clientes, ~600 días sin volver, 1 sola visita)
// cae dentro de "perdido", que usa un corte más estricto que "muyFrio".
export const DEFAULT_SEGMENT_THRESHOLDS = {
  nuevo: { maxDaysFirst: 45, maxVisits: 2 },
  enRiesgo: { minDays: 60, maxDays: 180 },
  muyFrio: { minDays: 180, maxVisits: 2 },
  perdido: { minDays: 365 },
}

function normalizePatente(p) {
  return (p || '').trim().toUpperCase()
}

// Agrupa transacciones por patente. Filas sin patente quedan fuera de los
// agregados pero se cuentan aparte para reportar la fracción no vinculable.
export function buildClientAggregates(txnRows, now = new Date()) {
  const hoyMs = now.getTime()
  const byPatente = {}
  let unresolvedCount = 0

  txnRows.forEach(t => {
    const patente = normalizePatente(t.patente)
    if (!patente) { unresolvedCount++; return }
    if (!byPatente[patente]) byPatente[patente] = { visits: 0, total: 0, lastMs: 0, firstMs: Infinity }
    const d = byPatente[patente]
    const ms = new Date(t.fecha).getTime()
    d.visits++
    d.total += Number(t.monto) || 0
    if (ms > d.lastMs) d.lastMs = ms
    if (ms < d.firstMs) d.firstMs = ms
  })

  const aggregates = {}
  Object.entries(byPatente).forEach(([patente, d]) => {
    aggregates[patente] = {
      patente,
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
    description: 'Llevan mucho tiempo sin volver y pocas visitas en total',
    accent: 'rose',
  },
  perdido: {
    label: 'Perdidos',
    description: 'Más de un año sin volver — mensaje con mayor incentivo',
    accent: 'purple',
  },
}

// Arma los segmentos a partir de los agregados por patente (sin teléfono aún).
export function buildSegments(aggregates, thresholds = DEFAULT_SEGMENT_THRESHOLDS) {
  const buckets = { nuevo: [], enRiesgo: [], muyFrio: [], perdido: [] }

  Object.values(aggregates).forEach(c => {
    const { daysSinceLast, daysSinceFirst, visits } = c
    if (daysSinceFirst <= thresholds.nuevo.maxDaysFirst && visits <= thresholds.nuevo.maxVisits) {
      buckets.nuevo.push(c)
    }
    if (daysSinceLast >= thresholds.perdido.minDays) {
      buckets.perdido.push(c)
    } else if (daysSinceLast >= thresholds.muyFrio.minDays && visits <= thresholds.muyFrio.maxVisits) {
      buckets.muyFrio.push(c)
    } else if (daysSinceLast >= thresholds.enRiesgo.minDays && daysSinceLast <= thresholds.enRiesgo.maxDays) {
      buckets.enRiesgo.push(c)
    }
  })

  return Object.entries(buckets).map(([key, clients]) => ({
    key,
    ...SEGMENT_META[key],
    defaultTemplate: getDefaultTemplate(key),
    clients: clients.sort((a, b) => b.daysSinceLast - a.daysSinceLast),
  }))
}

// Resuelve teléfono/nombre por patente. Orden de prioridad para el nombre:
// nombre_contacto -> nombre_venta (de patente_telefono) -> match por teléfono
// en contactos_clientes -> null.
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

  return clients.map(c => {
    const match = telefonoPorPatente[c.patente]
    const telefono = match?.telefono || null
    const nombre = match?.nombre_contacto || match?.nombre_venta
      || contactoPorTelefono[telefono]?.nombre
      || null
    return { ...c, telefono, nombre, hasPhone: Boolean(telefono) }
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

// Plantilla default por segmento, inspirada en la plantilla real "recontacto"
// de Aquapp (15% de descuento). Es solo un punto de partida — se edita en la UI.
export function getDefaultTemplate(segmentKey, opts = {}) {
  const discountPct = opts.discountPct ?? 15
  const templates = {
    nuevo: 'Hola {{nombre}}! Vimos que nos visitaste hace poco en Alpha Cleaners 🚗✨ ¿Cómo te fue con el servicio? Cualquier cosa que necesites, escríbenos por aquí.',
    enRiesgo: `Hola {{nombre}}! Te extrañamos en Alpha Cleaners 👋 Hace un tiempo que no te vemos por el local. Te dejamos un ${discountPct}% de descuento en tu próxima visita para que vuelvas a dejar el auto como nuevo. ¿Te gustaría agendar?`,
    muyFrio: `Hola {{nombre}}! Ha pasado tiempo desde tu última visita a Alpha Cleaners 🚗 Queremos que vuelvas: tienes un ${discountPct}% de descuento en tu próximo lavado. ¿Agendamos esta semana?`,
    perdido: `Hola {{nombre}}! Te escribimos de Alpha Cleaners porque hace mucho no te vemos 🙌 Como cliente que valoramos, te dejamos un ${discountPct}% de descuento especial para que vuelvas a probarnos. ¿Te acomoda esta semana?`,
  }
  return templates[segmentKey] || templates.enRiesgo
}

export function interpolate(template, client) {
  return template.replace(/\{\{\s*nombre\s*\}\}/gi, client.nombre || 'estimado cliente')
}

// Arma la cola final de envío a partir de los clientes seleccionados de un segmento.
export function buildSendQueue(segment, selectedPatentes, editedTemplateText) {
  const template = editedTemplateText || segment.template || segment.defaultTemplate
  const selected = new Set(selectedPatentes)
  return segment.clients
    .filter(c => selected.has(c.patente) && c.hasPhone)
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
