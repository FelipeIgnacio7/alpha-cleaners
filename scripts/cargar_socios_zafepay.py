"""Carga a Supabase, desde la API de Zafepay, (1) los socios con membresía (tabla socios_zafepay, una fila por patente)
y (2) las cuotas y pagos de membresías (tabla membresias_zafepay: ingresos del panel). Reemplaza al CSV de scripts/cargar_zafepay.py.

Lee subscription_buyers (quién está inscrito en qué plan, su estado y las patentes que declaró) y los planes
(subscriptions) para el nombre. Usa ZAFEPAY_API_KEY / ZAFEPAY_API_SECRET de .env.local (solo lectura).
La tabla se reemplaza completa en cada corrida, así que repetir el comando no duplica nada.

  python scripts/cargar_socios_zafepay.py            # carga
  python scripts/cargar_socios_zafepay.py --probar   # solo muestra el resumen, no escribe
  python scripts/cargar_socios_zafepay.py --sin-cuotas  # solo socios
"""
import argparse, base64, json, os, re, sys, time, urllib.error, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATENTE = re.compile(r'^(?:[A-Z]{4}\d{2}|[A-Z]{2}\d{4})$')
PRIORIDAD = {'active': 0, 'indebt': 1, 'paused': 2, 'finished': 3, 'canceled': 4}


def env():
    out = {}
    with open(os.path.join(ROOT, '.env.local'), encoding='utf-8') as f:
        for l in f:
            if '=' in l and not l.lstrip().startswith('#'):
                k, v = l.strip().split('=', 1)
                out[k] = v.strip().strip('"').strip("'")
    return out


E = env()
for k in ('ZAFEPAY_API_KEY', 'ZAFEPAY_API_SECRET', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'):
    if not E.get(k):
        sys.exit(f'Falta {k} en .env.local')
ZP = 'https://api.zafepay.com/api/v1/integration/'
ZH = {'Authorization': 'Basic ' + base64.b64encode(f"{E['ZAFEPAY_API_KEY']}:{E['ZAFEPAY_API_SECRET']}".encode()).decode(), 'Accept': 'application/json'}
SB = E['VITE_SUPABASE_URL'].rstrip('/') + '/rest/v1/'
SH = {'apikey': E['VITE_SUPABASE_ANON_KEY'], 'Authorization': 'Bearer ' + E['VITE_SUPABASE_ANON_KEY'], 'Content-Type': 'application/json; charset=utf-8'}


def zp(ruta):
    req = urllib.request.Request(ZP + ruta, headers=ZH)
    for intento in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code < 500 or intento == 4:
                raise
        except urllib.error.URLError:
            if intento == 4:
                raise
        time.sleep(2 * (intento + 1))


def todas(ruta):
    filas, pag = [], 1
    while True:
        d = zp(f'{ruta}{"&" if "?" in ruta else "?"}page={pag}')
        filas += d['data']
        if pag >= d['meta']['pages']:
            return filas
        pag += 1


def sb(metodo, ruta, cuerpo=None, extra=None):
    req = urllib.request.Request(SB + ruta, method=metodo, headers={**SH, **(extra or {})},
                                 data=json.dumps(cuerpo, ensure_ascii=False).encode('utf-8') if cuerpo is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            t = r.read()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        sys.exit(f'ERROR {e.code} en {metodo} {ruta}: {e.read().decode("utf-8", "replace")[:300]}')


def fecha(s):
    return s[:10] if s else None


ESTADO_CUOTA = {'paid': 'Pagado', 'pending': 'Pendiente', 'expired': 'En deuda', 'refunded': 'Reembolsado'}


def armar_cuotas(inscritos, planes):
    cuotas = []
    for s in inscritos:
        for c in todas(f"subscription_buyers/{s['id']}/installments"):
            cuotas.append(dict(
                plan=planes.get(s['subscription_id']) or 'Sin plan', tipo='Suscripción', valor=float(c['amount']),
                fecha_vencimiento=fecha(c.get('due_date')), fecha_pago=fecha(c.get('payment_date')),
                referencia=c.get('external_id'), estado=ESTADO_CUOTA.get(c['status'], 'Pendiente')))
    return cuotas


def cargar_cuotas(cuotas):
    # Reemplazo completo: primero se carga, y solo si salió bien se borra lo anterior.
    antes = sb('GET', 'membresias_zafepay?select=id&order=id.desc&limit=1')
    corte = antes[0]['id'] if antes else 0
    for i in range(0, len(cuotas), 500):
        sb('POST', 'membresias_zafepay', cuotas[i:i + 500], {'Prefer': 'return=minimal'})
    if corte:
        sb('DELETE', f'membresias_zafepay?id=lte.{corte}', None, {'Prefer': 'return=minimal'})
    n = 0
    for off in range(0, 1_000_000, 1000):
        pag = sb('GET', f'membresias_zafepay?select=id&order=id&offset={off}&limit=1000') or []
        n += len(pag)
        if len(pag) < 1000:
            break
    print(f'[cuotas_zafepay] base: {n} filas -> {"CUADRA" if n == len(cuotas) else "REVISAR (esperaba " + str(len(cuotas)) + ")"}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--probar', action='store_true')
    ap.add_argument('--sin-cuotas', action='store_true')
    a = ap.parse_args()

    planes = {p['id']: p['name'] for p in todas('subscriptions')}
    inscritos = todas('subscription_buyers')
    por_patente = {}
    for s in inscritos:
        estado = s['status']
        ci = s.get('current_installment') or {}
        fila_base = dict(nombre=(s.get('buyer') or {}).get('name'), plan=planes.get(s['subscription_id']), estado=estado,
                         proximo_cobro=fecha(ci.get('due_date')) if ci.get('status') != 'paid' else None,
                         ultimo_pago=fecha(ci.get('payment_date')))
        for v in (s.get('extra_fields') or {}).values():
            pat = re.sub(r'[^A-Za-z0-9]', '', str(v)).upper()
            if not PATENTE.match(pat):
                continue
            previa = por_patente.get(pat)
            # Si una patente aparece en varias inscripciones, queda la más vigente (active > indebt > ...)
            if not previa or PRIORIDAD.get(estado, 9) < PRIORIDAD.get(previa['estado'], 9):
                por_patente[pat] = dict(patente=pat, **fila_base)

    filas = list(por_patente.values())
    cuenta = {}
    for f in filas:
        cuenta[f['estado']] = cuenta.get(f['estado'], 0) + 1
    print(f'[socios_zafepay] {len(inscritos)} inscripciones, {len(filas)} patentes: {cuenta}')
    if len(filas) < 30:
        sys.exit('Muy pocas patentes; parece un error de lectura. No se carga nada.')
    cuotas = [] if a.sin_cuotas else armar_cuotas(inscritos, planes)
    if cuotas:
        pag = [c for c in cuotas if c['estado'] == 'Pagado']
        print(f'[cuotas_zafepay] {len(cuotas)} cuotas, {len(pag)} pagadas, ${int(sum(c["valor"] for c in pag)):,} cobrado en total')
        if len(cuotas) < 500:
            sys.exit('Muy pocas cuotas; parece un error de lectura. No se carga nada.')
    if a.probar:
        return
    ahora = datetime.now(timezone.utc).isoformat()
    for f in filas:
        f['actualizado'] = ahora
    sb('DELETE', 'socios_zafepay?patente=not.is.null')
    for i in range(0, len(filas), 200):
        sb('POST', 'socios_zafepay', filas[i:i + 200], {'Prefer': 'return=minimal'})
    print(f'[socios_zafepay] cargadas {len(filas)} filas')
    if cuotas:
        cargar_cuotas(cuotas)


if __name__ == '__main__':
    main()
