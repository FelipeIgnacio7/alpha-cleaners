-- Caja propia: etapas del trabajo (como Aquapp: Finalizar / Entregar vehículo) y recargo por tarjeta de crédito.
-- Solo agrega columnas a tablas caja_*; idempotente.
alter table caja_trabajos add column if not exists estado text not null default 'ingresado';
alter table caja_trabajos add column if not exists finalizado_at timestamptz;
alter table caja_trabajos add column if not exists entregado_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'caja_trabajos_estado_chk') then
    alter table caja_trabajos add constraint caja_trabajos_estado_chk check (estado in ('ingresado', 'finalizado', 'entregado'));
  end if;
end $$;

-- Recargo cobrado aparte del precio (ej. 10% con tarjeta de crédito). `monto` sigue siendo lo que abona al trabajo.
alter table caja_pagos add column if not exists recargo numeric not null default 0;
