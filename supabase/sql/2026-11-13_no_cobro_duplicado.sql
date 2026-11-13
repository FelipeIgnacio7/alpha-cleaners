-- Evita cobros duplicados (doble toque): un cobro no puede dejar lo cobrado de un trabajo sobre su total.
-- La propina va aparte (caja_propinas) y el recargo de crédito en su propia columna, así que no cuentan aquí.
create or replace function trg_caja_pago_no_exceder() returns trigger language plpgsql as $$
declare tot numeric; ya numeric;
begin
  select total into tot from caja_trabajos where id = new.trabajo_id;
  select coalesce(sum(monto), 0) into ya from caja_pagos where trabajo_id = new.trabajo_id;
  if tot is not null and ya + new.monto > tot + 0.5 then
    raise exception 'El trabajo ya está pagado (cobrado %, total %)', ya, tot;
  end if;
  return new;
end $$;
drop trigger if exists caja_pago_no_exceder on caja_pagos;
create trigger caja_pago_no_exceder before insert on caja_pagos for each row execute function trg_caja_pago_no_exceder();
