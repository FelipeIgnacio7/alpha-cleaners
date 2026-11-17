-- Archivo de boletas de caja chica (foto + monto, por mes). 17-11-2026.
-- Independiente de la tabla gastos. Bucket público con nombres aleatorios (uuid).
-- SEGURIDAD PENDIENTE: políticas abiertas temporales, igual que el resto.
create table if not exists boletas (
  id uuid primary key default gen_random_uuid(),
  local_id int not null references locales(id),
  fecha date not null,
  monto numeric not null check (monto > 0),
  comercio text,
  metodo_pago text not null default 'efectivo' check (metodo_pago in ('efectivo','tarjeta','transferencia')),
  categoria_id int references categorias_gasto(id) on delete set null,
  notas text,
  foto_path text,
  created_at timestamptz not null default now()
);
create index if not exists boletas_local_fecha_idx on boletas (local_id, fecha);
alter table boletas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'boletas' and policyname = 'abierto_temporal') then
    create policy abierto_temporal on boletas for all using (true) with check (true);
  end if;
end $$;

insert into storage.buckets (id, name, public) values ('boletas', 'boletas', true) on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'boletas_abierto_temporal') then
    create policy boletas_abierto_temporal on storage.objects for all to anon, authenticated
      using (bucket_id = 'boletas') with check (bucket_id = 'boletas');
  end if;
end $$;

-- Lectura automática: la boleta puede guardarse solo con la foto (monto null, lectura 'pendiente');
-- una tarea programada la lee y completa monto/comercio/fecha (lectura 'leida'; 'error' si no se pudo).
alter table boletas alter column monto drop not null;
alter table boletas drop constraint if exists boletas_monto_check;
alter table boletas add constraint boletas_monto_check check (monto is null or monto > 0);
alter table boletas add column if not exists lectura text not null default 'manual';
alter table boletas drop constraint if exists boletas_lectura_check;
alter table boletas add constraint boletas_lectura_check check (lectura in ('manual','pendiente','leida','error'));
alter table boletas add column if not exists lectura_at timestamptz;
alter table boletas add column if not exists lectura_nota text;
create index if not exists boletas_lectura_idx on boletas (lectura) where lectura = 'pendiente';
