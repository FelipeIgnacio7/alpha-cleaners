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
export async function buscarPatente(patente) {
  const norm = normalizePatente(patente)
  if (norm.length < 5) return null
  const patron = patronPatente(norm)
  const hace90 = hoyLocal(new Date(Date.now() - 90 * 86400000))

  const [propios, ventas, trabajos, telefonos] = await Promise.all([
    supabase.from('caja_trabajos').select('cliente, telefono, marca, modelo, tamano, fecha, items')
      .eq('patente', norm).eq('anulado', false).order('created_at', { ascending: false }).limit(5),
    supabase.from('transacciones_lavado').select('patente, fecha, marca, modelo, tipo_servicio, cliente:webhook_raw->>cliente')
      .ilike('patente', patron).order('fecha', { ascending: false }).limit(50),
    supabase.from('trabajos_aquapp').select('patente, fecha, cliente, marca, modelo, es_membresia')
      .ilike('patente', patron).order('fecha', { ascending: false }).limit(50),
    supabase.from('patente_telefono').select('patente, telefono, nombre_contacto, nombre_venta').ilike('patente', patron).limit(10),
  ])

  const es = mismaPatente(norm)
  const p = propios.data?.[0]
  const v = (ventas.data ?? []).filter(es)
  const t = (trabajos.data ?? []).filter(es)
  const tel = (telefonos.data ?? []).find(es)
  const primero = (arr, campo) => arr.find(r => (r[campo] || '').trim())?.[campo]?.trim() || null

  const socio = t.some(r => r.es_membresia && r.fecha >= hace90)
    || v.some(r => /membres/i.test(r.tipo_servicio || '') && r.fecha >= hace90)
    || (propios.data ?? []).some(r => r.fecha >= hace90 && (r.items || []).some(i => i.es_membresia))

  const fechas = [...v.map(r => r.fecha), ...t.map(r => r.fecha), ...(propios.data ?? []).map(r => r.fecha)].sort()
  const encontrado = Boolean(p || v.length || t.length || tel)
  if (!encontrado) return { encontrado: false }

  return {
    encontrado: true,
    cliente: p?.cliente || tel?.nombre_contacto || primero(v, 'cliente') || primero(t, 'cliente') || tel?.nombre_venta || '',
    telefono: p?.telefono || tel?.telefono || '',
    marca: p?.marca || primero(v, 'marca') || primero(t, 'marca') || '',
    modelo: p?.modelo || primero(v, 'modelo') || primero(t, 'modelo') || '',
    tamano: p?.tamano || '',
    socio,
    ultimaVisita: fechas.length ? fechas[fechas.length - 1] : null,
  }
}
