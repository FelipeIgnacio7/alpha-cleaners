"""Carga a Supabase los CSV de Aquapp (Movimientos de caja y Trabajos).

Hace lo mismo que los botones "Ventas / Servicios" y "Trabajos" de Ingresos:
  - Movimientos de caja -> transacciones_lavado (solo agrega lo que falta; reintentos no duplican)
  - Trabajos            -> trabajos_aquapp (reemplaza el rango de fechas del archivo)

Uso:
  python scripts/cargar_aquapp.py                       # toma los CSV más recientes de Descargas
  python scripts/cargar_aquapp.py --caja a.csv --trabajos b.csv
"""
import argparse, collections, csv, glob, io, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOWNLOADS = os.path.join(os.path.expanduser('~'), 'Downloads')


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


def fetch_all(table, select, filters):
    out = []
    for offset in range(0, 1_000_000, 1000):
        q = f'{table}?select={urllib.parse.quote(select, safe=",:>-")}&{filters}&order=id&offset={offset}&limit=1000'
        page = api('GET', q)
        out += page
        if len(page) < 1000:
            return out


def read_csv(path):
    text = open(path, 'rb').read().decode('utf-8-sig', errors='replace')
    return list(csv.DictReader(io.StringIO(text)))


def local_id(sucursal):
    s = (sucursal or '').lower()
    if 'fontov' in s or 'fonseca' in s:
        return 1
    if 'curic' in s or 'higgins' in s:
        return 2
    return None


DETALLE_RE = re.compile(
    r'^Vinculado (?:a venta|al trabajo) del \S+ \d{2}/\d{2}/\d{4} a (.+?) \(([^,)]+)(?:, patente ([^)]+))?\)\.\s*\|\s*Servicios prestados:\s*(.+)\.$')


def cargar_caja(path):
    rows = read_csv(path)
    ventas, sin_parsear = [], 0
    for r in rows:
        if r.get('Tipo') != 'Ingreso':
            continue
        m = DETALLE_RE.match((r.get('Detalle') or '').strip())
        lid = local_id(r.get('Sucursal'))
        monto = float(r.get('Monto') or 0)
        if not m or monto <= 0 or not lid or not r.get('Fecha'):
            sin_parsear += 1
            continue
        cliente, marca_modelo, patente, servicios = m.groups()
        partes = marca_modelo.strip().split()
        marca, modelo = (partes[0] if partes else ''), ' '.join(partes[1:])
        ventas.append(dict(
            local_id=lid, monto=monto,
            tipo_servicio=' | '.join(s.strip() for s in servicios.split(',') if s.strip()),
            patente=(patente or '').strip() or None, fecha=r['Fecha'], hora='12:00:00',
            marca=marca or None, modelo=modelo or None,
            webhook_raw=dict(fuente='csv_aquapp_movcaja', cliente=cliente.strip(), marca=marca, modelo=modelo)))
    if not ventas:
        print(f'[caja] {os.path.basename(path)}: sin ventas válidas, nada que cargar')
        return
    desde, hasta = min(v['fecha'] for v in ventas), max(v['fecha'] for v in ventas)
    key = lambda f, l, p, m, t, c: (f, l, p or '', float(m), t or '', c or '')
    existentes = fetch_all('transacciones_lavado', 'fecha,local_id,patente,monto,tipo_servicio,cliente:webhook_raw->>cliente',
                           f'fecha=gte.{desde}&fecha=lte.{hasta}')
    tiene = collections.Counter(key(r['fecha'], r['local_id'], r['patente'], r['monto'], r['tipo_servicio'], r['cliente']) for r in existentes)
    vistas, nuevas = collections.Counter(), []
    for v in ventas:
        k = key(v['fecha'], v['local_id'], v['patente'], v['monto'], v['tipo_servicio'], v['webhook_raw']['cliente'])
        n = vistas[k]
        vistas[k] += 1
        if n < tiene[k]:
            continue
        if n > 0:
            v['webhook_raw']['dup_n'] = str(n)
        nuevas.append(v)
    for i in range(0, len(nuevas), 200):
        api('POST', 'transacciones_lavado', nuevas[i:i + 200], prefer='return=minimal')
    despues = fetch_all('transacciones_lavado', 'monto', f'fecha=gte.{desde}&fecha=lte.{hasta}')
    print(f'[caja] {os.path.basename(path)} ({desde} a {hasta})')
    print(f'       archivo: {len(ventas)} ventas, ${int(sum(v["monto"] for v in ventas)):,} | sin parsear: {sin_parsear}')
    print(f'       agregadas ahora: {len(nuevas)} (${int(sum(v["monto"] for v in nuevas)):,})')
    print(f'       base en ese rango: {len(despues)} ventas, ${int(sum(r["monto"] for r in despues)):,}'
          f'  -> {"CUADRA con el archivo" if len(despues) == len(ventas) else "DIFERENCIA, revisar"}')


def cargar_trabajos(path):
    rows = read_csv(path)
    f = lambda r, k: float(r.get(k) or 0)
    out = []
    for r in rows:
        lid = local_id(r.get('Sucursal'))
        if not lid or not r.get('Fecha'):
            continue
        out.append(dict(
            fecha=r['Fecha'], local_id=lid, cliente=(r.get('Cliente') or '').strip() or None,
            marca=(r.get('Marca') or '').strip() or None, modelo=(r.get('Modelo') or '').strip() or None,
            patente=(r.get('Patente') or '').strip() or None, servicios=(r.get('Servicios') or '').strip() or None,
            monto=f(r, 'Monto'), descuento=f(r, 'Monto descuentos'), cobrado=f(r, 'Monto cobrado'),
            es_membresia='membres' in (r.get('Servicios') or '').lower()))
    if not out:
        print(f'[trabajos] {os.path.basename(path)}: vacío, nada que cargar')
        return
    desde, hasta = min(o['fecha'] for o in out), max(o['fecha'] for o in out)
    api('DELETE', f'trabajos_aquapp?fecha=gte.{desde}&fecha=lte.{hasta}', prefer='return=minimal')
    for i in range(0, len(out), 300):
        api('POST', 'trabajos_aquapp', out[i:i + 300], prefer='return=minimal')
    en_base = fetch_all('trabajos_aquapp', 'monto,descuento,cobrado', f'fecha=gte.{desde}&fecha=lte.{hasta}')
    neto = sum(o['monto'] - o['descuento'] for o in out)
    cobrado = sum(o['cobrado'] for o in out)
    print(f'[trabajos] {os.path.basename(path)} ({desde} a {hasta})')
    print(f'       {len(out)} trabajos | venta neta ${int(neto):,} | cobrado ${int(cobrado):,} | por cobrar ${int(neto - cobrado):,}')
    print(f'       base en ese rango: {len(en_base)} trabajos -> {"CUADRA" if len(en_base) == len(out) else "DIFERENCIA, revisar"}')


def mas_reciente(patron, max_dias=3):
    archivos = [p for p in glob.glob(os.path.join(DOWNLOADS, patron)) if time.time() - os.path.getmtime(p) < max_dias * 86400]
    return max(archivos, key=os.path.getmtime) if archivos else None


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--caja')
    ap.add_argument('--trabajos')
    a = ap.parse_args()
    caja = a.caja or mas_reciente('Movimientos Caja - *.csv')
    trab = a.trabajos or mas_reciente('Trabajos - *.csv')
    if not caja and not trab:
        sys.exit('No hay CSV recientes de Aquapp en Descargas (menos de 3 días).')
    if caja:
        cargar_caja(caja)
    if trab:
        cargar_trabajos(trab)
