-- El puente caja -> ventas debe correr con permisos del dueño de la función: transacciones_lavado tiene RLS
-- y el link (rol anon) no puede escribirla; sin esto, Finalizar/Entregar fallaba con "No se pudo guardar".
alter function sync_caja_venta(uuid) security definer set search_path = public;
alter function trg_caja_pagos_venta() security definer set search_path = public;
alter function trg_caja_trabajos_venta() security definer set search_path = public;
