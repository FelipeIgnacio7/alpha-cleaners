// Utilidades de gastos compartidas por la pantalla de Gastos y el formulario del encargado.

const pad = (n) => String(n).padStart(2, '0')

// Suma `meses` a una fecha YYYY-MM-DD conservando el día (si el mes no tiene ese día, usa el último).
export function sumarMeses(fecha, meses) {
  const [y, m, d] = fecha.split('-').map(Number)
  const base = new Date(y, m - 1 + meses, 1)
  const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(Math.min(d, ultimo))}`
}

// Divide un total en N cuotas mensuales: una por mes desde `fecha`. Los pesos sobrantes van a la última.
// Cada cuota queda como un gasto propio, así el gasto de cada mes muestra solo lo que corresponde pagar ese mes.
export function dividirEnCuotas({ monto, cuotas, fecha }) {
  const total = Math.round(Number(monto))
  const n = Math.max(1, Math.floor(Number(cuotas)))
  const base = Math.floor(total / n)
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    monto: i === n - 1 ? total - base * (n - 1) : base,
    fecha: sumarMeses(fecha, i),
  }))
}

export const notaCuota = (numero, n, total, notas) =>
  [`Cuota ${numero}/${n} (total ${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(total)})`, notas].filter(Boolean).join(' · ')

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// Primer y último día de un mes "YYYY-MM"
export function rangoMes(ym) {
  const [y, m] = ym.split('-').map(Number)
  return { desde: `${y}-${pad(m)}-01`, hasta: `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}` }
}
