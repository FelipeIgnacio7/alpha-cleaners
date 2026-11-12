-- Puente caja propia -> ventas (transacciones_lavado). 12-11-2026.
-- Problema: dashboard, Ingresos, Personal, Analytics y Reactivación leen transacciones_lavado (Aquapp),
-- y los trabajos ingresados por el link /local solo vivían en caja_trabajos/caja_pagos: no se veían.
-- Solución: cada trabajo con cobros genera/actualiza UNA fila en transacciones_lavado (monto = lo cobrado, sin recargo ni propina).
-- Aquapp dejó de cargar datos el 10-11, así que no hay doble conteo desde el 11-11.

alter table transacciones_lavado add column if not exists caja_trabajo_id uuid;
create unique index if not exists transacciones_lavado_caja_trabajo_uq on transacciones_lavado (caja_trabajo_id) where caja_trabajo_id is not null;

create or replace function sync_caja_venta(p_trabajo uuid) returns void language plpgsql as $$
declare t caja_trabajos%rowtype; cobrado numeric;
begin
  select * into t from caja_trabajos where id = p_trabajo;
  if not found then
    delete from transacciones_lavado where caja_trabajo_id = p_trabajo; return;
  end if;
  select coalesce(sum(monto), 0) into cobrado from caja_pagos where trabajo_id = p_trabajo;
  if t.anulado or cobrado <= 0 then
    delete from transacciones_lavado where caja_trabajo_id = p_trabajo; return;
  end if;
  insert into transacciones_lavado (local_id, monto, tipo_servicio, patente, fecha, hora, marca, modelo, webhook_raw, caja_trabajo_id)
  values (
    t.local_id, cobrado,
    coalesce((select string_agg(i->>'nombre', ' | ') from jsonb_array_elements(t.items) i), 'Servicio'),
    t.patente, t.fecha, t.hora, t.marca, t.modelo,
    jsonb_build_object('fuente', 'caja_propia', 'cliente', t.cliente, 'marca', t.marca, 'modelo', t.modelo, 'caja_trabajo_id', t.id),
    t.id)
  on conflict (caja_trabajo_id) where caja_trabajo_id is not null do update
    set monto = excluded.monto, tipo_servicio = excluded.tipo_servicio, patente = excluded.patente,
        fecha = excluded.fecha, hora = excluded.hora, marca = excluded.marca, modelo = excluded.modelo, webhook_raw = excluded.webhook_raw;
end $$;

create or replace function trg_caja_pagos_venta() returns trigger language plpgsql as $$
begin
  perform sync_caja_venta(coalesce(new.trabajo_id, old.trabajo_id));
  return null;
end $$;
drop trigger if exists caja_pagos_venta on caja_pagos;
create trigger caja_pagos_venta after insert or update or delete on caja_pagos for each row execute function trg_caja_pagos_venta();

create or replace function trg_caja_trabajos_venta() returns trigger language plpgsql as $$
begin
  perform sync_caja_venta(coalesce(new.id, old.id));
  return null;
end $$;
drop trigger if exists caja_trabajos_venta on caja_trabajos;
create trigger caja_trabajos_venta after update or delete on caja_trabajos for each row execute function trg_caja_trabajos_venta();

-- Relleno de lo ya ingresado (desde que partió la caja propia)
select sync_caja_venta(id) from caja_trabajos where fecha >= '2026-11-11';
