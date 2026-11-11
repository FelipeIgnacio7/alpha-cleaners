-- Propinas del equipo de trabajo (caja propia). 12-11-2026.
-- Tabla nueva; no toca nada existente. Idempotente.
-- La propina NO es ingreso del negocio (es del equipo): va aparte de caja_pagos y no suma a ventas ni a ingresos.
-- SEGURIDAD PENDIENTE: política abierta temporal, igual que el resto de la caja.
create table if not exists caja_propinas (
  id uuid primary key default gen_random_uuid(),
  local_id int not null references locales(id),
  trabajo_id uuid references caja_trabajos(id) on delete set null,   -- null = propina suelta, sin trabajo asociado
  fecha date not null,
  monto numeric not null check (monto > 0),
  medio text not null check (medio in ('efectivo', 'debito', 'credito', 'transferencia')),
  notas text,
  created_at timestamptz not null default now()
);
create index if not exists caja_propinas_local_fecha_idx on caja_propinas (local_id, fecha);
create index if not exists caja_propinas_trabajo_idx on caja_propinas (trabajo_id);

alter table caja_propinas enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'caja_propinas' and policyname = 'abierto_temporal') then
    create policy abierto_temporal on caja_propinas for all using (true) with check (true);
  end if;
end $$;
