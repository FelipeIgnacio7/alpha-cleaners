"""Carga a Supabase los pagos de membresías de Zafepay (sección "Cuotas y Pagos").

El CSV lo arma la lectura del panel de Zafepay en Chrome (columnas: plan;tipo;valor;fecha_vencimiento;
fecha_pago;referencia;estado). No lleva nombres ni correos de clientes.

La tabla se reemplaza completa en cada carga (son ~1.000 filas), así que repetir el comando no duplica nada.

Uso:
  python scripts/cargar_zafepay.py                      # toma el "Zafepay Pagos *.csv" más reciente de Descargas
  python scripts/cargar_zafepay.py --csv archivo.csv
"""
import argparse, csv, glob, io, json, os, sys, urllib.error, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOWNLOADS = os.path.join(os.path.expanduser('~'), 'Downloads')
TABLA = 'membresias_zafepay'


def load_env():
    env = {}
    with open(os.path.join(ROOT, '.env.local'), encoding='utf-8') as f:
        for line in f:
            if '=' in line and not line.startswith('#'):
                k, v = line.strip().split('=', 1)
                env[k] = v
    return env['VITE_SUPABASE_URL'].rstrip('/') + '/rest/v1/', env['VITE_SUPABASE_ANON_KEY']


BASE, KEY = load_env()
HEADERS = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json; charset=utf-8'}


def api(method, path, body=None, prefer=None):
    headers = dict(HEADERS)
    if prefer:
        headers['Prefer'] = prefer
    data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f'ERROR {e.code} en {method} {path}: {e.read().decode("utf-8", "replace")}')


def leer(path):
    text = open(path, 'rb').read().decode('utf-8-sig', errors='replace')
    filas = []
    for r in csv.DictReader(io.StringIO(text), delimiter=';'):
        if not (r.get('plan') or '').strip() or not (r.get('valor') or '').strip():
            continue
        filas.append(dict(
            plan=r['plan'].strip(),
            tipo=(r.get('tipo') or '').strip() or None,
            valor=float(r['valor']),
            fecha_vencimiento=(r.get('fecha_vencimiento') or '').strip() or None,
            fecha_pago=(r.get('fecha_pago') or '').strip() or None,
            referencia=(r.get('referencia') or '').strip() or None,
            estado=(r.get('estado') or '').strip() or 'Pendiente',
        ))
    return filas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv')
    args = ap.parse_args()
    path = args.csv
    if not path:
        candidatos = sorted(glob.glob(os.path.join(DOWNLOADS, 'Zafepay Pagos*.csv')), key=os.path.getmtime, reverse=True)
        if not candidatos:
            raise SystemExit('No encontré ningún "Zafepay Pagos*.csv" en Descargas.')
        path = candidatos[0]
    filas = leer(path)
    if len(filas) < 50:
        raise SystemExit(f'El archivo solo trae {len(filas)} filas; parece incompleto. No se carga nada.')
    pagadas = [f for f in filas if f['estado'] == 'Pagado']
    print(f'[zafepay] {os.path.basename(path)}: {len(filas)} cuotas, {len(pagadas)} pagadas, ${int(sum(f["valor"] for f in pagadas)):,} cobrado en total')

    # Reemplazo completo: primero se carga, y solo si salió bien se borra lo anterior.
    antes = api('GET', f'{TABLA}?select=id&order=id.desc&limit=1')
    corte = antes[0]['id'] if antes else 0
    for i in range(0, len(filas), 500):
        api('POST', TABLA, filas[i:i + 500], prefer='return=minimal')
    if corte:
        api('DELETE', f'{TABLA}?id=lte.{corte}', prefer='return=minimal')

    n = 0
    for off in range(0, 1_000_000, 1000):
        pagina = api('GET', f'{TABLA}?select=id&order=id&offset={off}&limit=1000') or []
        n += len(pagina)
        if len(pagina) < 1000:
            break
    print(f'[zafepay] base: {n} filas -> {"CUADRA" if n == len(filas) else "REVISAR (esperaba " + str(len(filas)) + ")"}')
    import calendar, datetime
    hoy = datetime.date.today()
    for k in (1, 0):
        y, m = (hoy.year, hoy.month - 1) if k and hoy.month > 1 else ((hoy.year - 1, 12) if k else (hoy.year, hoy.month))
        mes, ultimo = f'{y}-{m:02d}', calendar.monthrange(y, m)[1]
        ds = api('GET', f'{TABLA}?select=valor&estado=eq.Pagado&fecha_pago=gte.{mes}-01&fecha_pago=lte.{mes}-{ultimo}&limit=1000') or []
        print(f'          {mes}: {len(ds)} cobros, ${int(sum(float(d["valor"]) for d in ds)):,}')


if __name__ == '__main__':
    main()
