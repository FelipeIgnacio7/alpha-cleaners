// Utilidades de gastos compartidas por la pantalla de Gastos y el formulario del encargado.

const pad = (n) => String(n).padStart(2, '0')

// Suma `meses` a una fecha YYYY-MM-DD conservando el día (si el mes no tiene ese día, usa el último).
export function sumarMeses(fecha, meses) {
  const [y, m, d] = fecha.split('-').map(Number)
  const base = new Date(y, m - 1 + meses, 1)
  const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(Math.min(d, ultimo))}`
}

// Las tarjetas de crédito facturan el día 24: lo comprado hasta el 24 entra en la facturación de ese mes y se paga
// a comienzos del mes siguiente; lo comprado después del 24 entra en la facturación siguiente y se paga un mes después.
export const DIA_FACTURACION = 24
export const DIA_PAGO = 5   // día con que queda anotada cada cuota dentro del mes en que se paga

// Fecha de pago de la primera cuota de una compra con tarjeta hecha el `fechaCompra` (YYYY-MM-DD)
export function fechaPrimeraCuota(fechaCompra) {
  const [y, m, d] = fechaCompra.split('-').map(Number)
  const base = new Date(y, m - 1 + (d > DIA_FACTURACION ? 2 : 1), 1)
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(DIA_PAGO)}`
}

// Divide un total en N cuotas mensuales. Los pesos sobrantes van a la última. Con tarjeta, la primera cuota cae en el
// mes en que se paga según la facturación; con otros medios, desde la fecha de compra.
// Cada cuota queda como un gasto propio, así el gasto de cada mes muestra solo lo que corresponde pagar ese mes.
export function dividirEnCuotas({ monto, cuotas, fecha, metodo }) {
  const primera = metodo === 'tarjeta' && fecha ? fechaPrimeraCuota(fecha) : fecha
  const total = Math.round(Number(monto))
  const n = Math.max(1, Math.floor(Number(cuotas)))
  const base = Math.floor(total / n)
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    monto: i === n - 1 ? total - base * (n - 1) : base,
    fecha: sumarMeses(primera, i),
  }))
}

export const notaCuota = (numero, n, total, notas, fechaCompra) => {
  const monto = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(total)
  const compra = fechaCompra ? `, compra ${fechaCompra.split('-').reverse().join('-')}` : ''
  return [`Cuota ${numero}/${n} (total ${monto}${compra})`, notas].filter(Boolean).join(' · ')
}

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// Primer y último día de un mes "YYYY-MM"
export function rangoMes(ym) {
  const [y, m] = ym.split('-').map(Number)
  return { desde: `${y}-${pad(m)}-01`, hasta: `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}` }
}
