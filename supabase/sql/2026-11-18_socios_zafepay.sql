-- Socios con membresía según Zafepay (una fila por patente). Se reemplaza completa en cada carga
-- (scripts/cargar_socios_zafepay.py, leyendo la API de Zafepay). La caja del local la consulta para marcar socios.
-- SEGURIDAD PENDIENTE: política abierta temporal, igual que el resto.
create table if not exists socios_zafepay (
  patente text primary key,
  nombre text,
  plan text,
  estado text not null,            -- active | indebt | paused | finished | canceled (tal como lo entrega Zafepay)
  proximo_cobro date,
  ultimo_pago date,
  actualizado timestamptz not null default now()
);
alter table socios_zafepay enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'socios_zafepay' and policyname = 'abierto_temporal') then
    create policy abierto_temporal on socios_zafepay for all using (true) with check (true);
  end if;
end $$;
