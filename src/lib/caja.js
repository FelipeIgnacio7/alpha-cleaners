// Lógica de la caja propia (reemplazo de Aquapp en Fontova).
// Tablas: caja_servicios, caja_descuentos, caja_trabajos, caja_pagos, caja_cierres
// (ver supabase/sql/2026-10-23_caja.sql).
import { supabase } from './supabase'

export const LOCAL_FONTOVA = 1

export const TAMANOS = [
  { key: 'pequeno', label: 'Pequeño' },
  { key: 'mediano', label: 'Mediano' },
  { key: 'grande', label: 'Grande' },
  { key: 'xl', label: 'XL' },
  { key: 'moto', label: 'Moto' },
]

export const MEDIOS = [
  { key: 'debito', label: 'Débito' },
  { key: 'credito', label: 'Crédito' },
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'transferencia', label: 'Transferencia' },
]

export const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(n ?? 0))

const pad = (n) => String(n).padStart(2, '0')
// Fecha y hora del computador del local (Chile), no la del servidor.
export const hoyLocal = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const horaLocal = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

export const normalizePatente = (p) => (p || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// En las tablas antiguas la misma patente aparece en muchos formatos ("TB FG 96", "tbfg96", "TB.FG.96",
// "TBFG 96"...). Este patrón ilike acepta cualquier separador y mayúsculas/minúsculas entre los caracteres;
// después se confirma con normalizePatente para descartar coincidencias falsas.
export const patronPatente = (p) => normalizePatente(p).split('').join('%')
const mismaPatente = (norm) => (r) => normalizePatente(r.patente) === norm

export const nombreServicio = (s) => (s.detalle ? `${s.nombre} (${s.detalle})` : s.nombre)

export function precioServicio(servicio, tamano) {
  if (!servicio || !tamano) return null
  const v = servicio[`precio_${tamano}`]
  return v === null || v === undefined ? null : Number(v)
}

export function descuentoVigente(d, fecha = hoyLocal()) {
  return d.activo && (!d.vigente_hasta || d.vigente_hasta >= fecha)
}

// items: [{ servicio_id, nombre, precio }]. Un descuento con `solo_servicio` aplica solo a ese servicio.
export function calcularTrabajo(items, descuento) {
  const subtotal = items.reduce((a, it) => a + (Number(it.precio) || 0), 0)
  let base = subtotal
  if (descuento?.solo_servicio) {
    const objetivo = descuento.solo_servicio.trim().toLowerCase()
    base = items.filter(it => (it.nombre_base || it.nombre || '').trim().toLowerCase() === objetivo)
      .reduce((a, it) => a + (Number(it.precio) || 0), 0)
  }
  const descuentoMonto = descuento ? Math.round(base * Number(descuento.porcentaje) / 100) : 0
  return { subtotal, descuentoMonto, total: Math.max(0, subtotal - descuentoMonto) }
}

export const cobradoDe = (trabajo, pagos) =>
  pagos.filter(p => p.trabajo_id === trabajo.id).reduce((a, p) => a + Number(p.monto), 0)

// Resumen del día para la caja y el cierre.
export function resumenDia(trabajos, pagos, gastosEfectivo = 0) {
  const validos = trabajos.filter(t => !t.anulado)
  const vendido = validos.reduce((a, t) => a + Number(t.total), 0)
  const porMedio = Object.fromEntries(MEDIOS.map(m => [m.key, 0]))
  pagos.forEach(p => { porMedio[p.medio] = (porMedio[p.medio] || 0) + Number(p.monto) })
  const cobrado = Object.values(porMedio).reduce((a, b) => a + b, 0)
  const pendiente = validos.reduce((a, t) => a + Math.max(0, Number(t.total) - cobradoDe(t, pagos)), 0)
  return {
    trabajos: validos.length,
    anulados: trabajos.length - validos.length,
    vendido,
    cobrado,
    porMedio,
    pendiente,
    gastosEfectivo,
    efectivoEsperado: porMedio.efectivo - gastosEfectivo,
  }
}

// Busca lo que sabemos de una patente: primero en la caja propia, después en el historial de Aquapp.
// ---------- Membresía Gold ----------
// En Aquapp el uso de la membresía se registra como "Membresía Full" (lavado con interior) o
// "Membresía simple" (solo exterior). La Gold incluye exteriores ilimitados y 2 lavados con interior al mes.
export const MEMBRESIA = { cupoInteriorMes: 2 }
export const tipoUsoMembresia = (texto) => {
  const t = (texto || '').toLowerCase()
  if (!t.includes('membres')) return null
  return t.includes('simple') ? 'exterior' : 'interior'
}
export const inicioMes = (d = new Date()) => hoyLocal(new Date(d.getFullYear(), d.getMonth(), 1))

// ---------- Tamaño del vehículo según lo que pagó ----------
// Si un "Lavado full" se cobró a $22.990, era Grande. Acepta también el precio con 10% de recargo.
// Solo se miran ventas recientes, para no confundirse con listas de precios antiguas.
const DESDE_TAMANO = '2026-04-01'
function tamanoPorPrecio(servicios, nombreServ, monto) {
  const nom = (nombreServ || '').trim().toLowerCase()
  const s = servicios.find(x => !x.detalle && x.nombre.trim().toLowerCase() === nom)
  if (!s || !monto) return null
  const m = Math.round(Number(monto))
  const hits = TAMANOS.map(t => t.key).filter(k => {
    const p = s[`precio_${k}`]
    return p && (Math.round(p) === m || Math.round(p * 1.1) === m)
  })
  return hits.length === 1 ? hits[0] : null   // si dos tamaños tienen el mismo precio, no se puede saber
}

function tamanoDeHistorial(servicios, ventas, trabajos) {
  const filas = [
    ...ventas.map(r => ({ fecha: r.fecha, serv: r.tipo_servicio, monto: r.monto })),
    ...trabajos.map(r => ({ fecha: r.fecha, serv: r.servicios, monto: r.monto })),
  ].filter(r => r.fecha >= DESDE_TAMANO && r.serv && !r.serv.includes('|'))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
  for (const r of filas) {
    const t = tamanoPorPrecio(servicios, r.serv, r.monto)
    if (t) return t
  }
  return null
}

// Si la patente no tiene historial útil, se usa el tamaño más común de ese mismo modelo en otros clientes.
async function tamanoDeModelo(servicios, marca, modelo) {
  if (!marca || !modelo || modelo.length < 2) return null
  const { data } = await supabase.from('transacciones_lavado').select('fecha, tipo_servicio, monto')
    .ilike('marca', marca).ilike('modelo', modelo).gte('fecha', DESDE_TAMANO).limit(300)
  const votos = {}
  for (const r of data ?? []) {
    if (!r.tipo_servicio || r.tipo_servicio.includes('|')) continue
    const t = tamanoPorPrecio(servicios, r.tipo_servicio, r.monto)
    if (t) votos[t] = (votos[t] || 0) + 1
  }
  const orden = Object.entries(votos).sort((a, b) => b[1] - a[1])
  const total = orden.reduce((a, [, n]) => a + n, 0)
  // Solo si hay suficientes casos y un tamaño claramente dominante
  return orden.length && orden[0][1] >= 3 && orden[0][1] / total >= 0.6 ? orden[0][0] : null
}

// Busca lo que sabemos de una patente: primero en la caja propia, después en el historial de Aquapp.
// `servicios` (catálogo) se usa para deducir el tamaño del vehículo a partir de lo que pagó.
export async function buscarPatente(patente, servicios = []) {
  const norm = normalizePatente(patente)
  if (norm.length < 5) return null
  const patron = patronPatente(norm)
  const hace90 = hoyLocal(new Date(Date.now() - 90 * 86400000))
  const mesActual = inicioMes()

  const [propios, ventas, trabajos, telefonos] = await Promise.all([
    supabase.from('caja_trabajos').select('cliente, telefono, marca, modelo, tamano, fecha, items')
      .eq('patente', norm).eq('anulado', false).order('created_at', { ascending: false }).limit(60),
    supabase.from('transacciones_lavado').select('patente, fecha, marca, modelo, tipo_servicio, monto, cliente:webhook_raw->>cliente')
      .ilike('patente', patron).order('fecha', { ascending: false }).limit(50),
    supabase.from('trabajos_aquapp').select('patente, fecha, cliente, marca, modelo, servicios, monto, es_membresia')
      .ilike('patente', patron).order('fecha', { ascending: false }).limit(50),
    supabase.from('patente_telefono').select('patente, telefono, nombre_contacto, nombre_venta').ilike('patente', patron).limit(10),
  ])

  const es = mismaPatente(norm)
  const prop = propios.data ?? []
  const p = prop[0]
  const v = (ventas.data ?? []).filter(es)
  const t = (trabajos.data ?? []).filter(es)
  const tel = (telefonos.data ?? []).find(es)
  const primero = (arr, campo) => arr.find(r => (r[campo] || '').trim())?.[campo]?.trim() || null

  const socio = t.some(r => r.es_membresia && r.fecha >= hace90)
    || v.some(r => /membres/i.test(r.tipo_servicio || '') && r.fecha >= hace90)
    || prop.some(r => r.fecha >= hace90 && (r.items || []).some(i => i.es_membresia))

  // Usos de la membresía este mes. Durante el piloto un mismo lavado puede estar en Aquapp y en la caja
  // propia, por eso se cuenta una vez por día y tipo.
  const usos = new Map()
  const anotar = (fecha, tipo, fuente) => { if (tipo && fecha >= mesActual) { const k = `${fecha}|${tipo}`; if (!usos.has(k)) usos.set(k, { fecha, tipo, fuente }) } }
  prop.forEach(r => (r.items || []).forEach(i => anotar(r.fecha, i.es_membresia ? tipoUsoMembresia(i.nombre_base || i.nombre) : null, 'caja')))
  t.forEach(r => anotar(r.fecha, r.es_membresia ? tipoUsoMembresia(r.servicios) : null, 'aquapp'))
  const usosMes = [...usos.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))

  const fechas = [...v.map(r => r.fecha), ...t.map(r => r.fecha), ...prop.map(r => r.fecha)].sort()
  const encontrado = Boolean(p || v.length || t.length || tel)
  if (!encontrado) return { encontrado: false }

  const marca = p?.marca || primero(v, 'marca') || primero(t, 'marca') || ''
  const modelo = p?.modelo || primero(v, 'modelo') || primero(t, 'modelo') || ''
  let tamano = p?.tamano || ''
  let tamanoFuente = tamano ? 'caja' : null
  if (!tamano && servicios.length) {
    tamano = tamanoDeHistorial(servicios, v, t) || ''
    if (tamano) tamanoFuente = 'historial'
    else {
      tamano = (await tamanoDeModelo(servicios, marca, modelo)) || ''
      if (tamano) tamanoFuente = 'modelo'
    }
  }

  return {
    encontrado: true,
    cliente: p?.cliente || tel?.nombre_contacto || primero(v, 'cliente') || primero(t, 'cliente') || tel?.nombre_venta || '',
    telefono: p?.telefono || tel?.telefono || '',
    marca,
    modelo,
    tamano,
    tamanoFuente,
    socio,
    membresia: socio ? {
      interioresUsados: usosMes.filter(u => u.tipo === 'interior').length,
      exterioresUsados: usosMes.filter(u => u.tipo === 'exterior').length,
      cupoInterior: MEMBRESIA.cupoInteriorMes,
      usos: usosMes,
    } : null,
    ultimaVisita: fechas.length ? fechas[fechas.length - 1] : null,
  }
}
