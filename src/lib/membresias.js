// Ingresos de membresías cobradas en Zafepay (tabla membresias_zafepay, ver scripts/cargar_zafepay.py).
// Zafepay no informa el local: los planes de Curicó llevan "(Curicó)" en el nombre; el resto se cobra en Fontova.
export const localDeMembresia = (plan) => (/curic/i.test(plan || '') ? 2 : 1)

// Con un local filtrado, solo cuentan las membresías de ese local (los locales subarrendados no tienen).
export const membresiasDelLocal = (filas, localId) =>
  !localId ? filas : filas.filter(f => localDeMembresia(f.plan) === Number(localId))
