"""Lectura de boletas de caja chica (las lee Claude con visión; este script solo mueve datos).

  python scripts/boletas_lectura.py listar [carpeta]
      Descarga las fotos de las boletas pendientes (lectura='pendiente') a una carpeta y muestra, por cada una,
      el id, la fecha en que se subió y la ruta de la imagen para leerla.
  python scripts/boletas_lectura.py guardar <id> <monto> [--comercio "..."] [--fecha AAAA-MM-DD] [--pago efectivo|tarjeta|transferencia] [--nota "..."]
      Completa la boleta (lectura='leida').
  python scripts/boletas_lectura.py error <id> "motivo"
      Marca que no se pudo leer (lectura='error'); la boleta queda para que se anote a mano.

Usa VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY de .env.local. Solo toca boletas pendientes (nunca las manuales).
"""
import argparse, json, os, sys, tempfile, urllib.parse, urllib.request
from datetime import datetime, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def env():
    out = {}
    with open(os.path.join(RAIZ, '.env.local'), encoding='utf-8') as f:
        for linea in f:
            if '=' in linea and not linea.lstrip().startswith('#'):
                k, v = linea.strip().split('=', 1)
                out[k] = v.strip().strip('"').strip("'")
    return out['VITE_SUPABASE_URL'].rstrip('/'), out['VITE_SUPABASE_ANON_KEY']


URL, KEY = env()
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}


def api(metodo, ruta, cuerpo=None, extra=None):
    req = urllib.request.Request(f'{URL}/rest/v1/{ruta}', method=metodo, headers={**H, **(extra or {})},
                                 data=json.dumps(cuerpo).encode() if cuerpo is not None else None)
    with urllib.request.urlopen(req, timeout=30) as r:
        t = r.read()
        return json.loads(t) if t else None


def listar(carpeta):
    filas = api('GET', 'boletas?select=id,fecha,created_at,foto_path&lectura=eq.pendiente&foto_path=not.is.null&order=created_at')
    if not filas:
        print('SIN_PENDIENTES')
        return
    os.makedirs(carpeta, exist_ok=True)
    for f in filas:
        destino = os.path.join(carpeta, f['id'] + '.jpg')
        ruta = urllib.parse.quote(f['foto_path'])
        with urllib.request.urlopen(f'{URL}/storage/v1/object/public/boletas/{ruta}', timeout=60) as r, open(destino, 'wb') as o:
            o.write(r.read())
        print(json.dumps({'id': f['id'], 'fecha_subida': f['created_at'][:10], 'fecha_actual': f['fecha'], 'imagen': destino}, ensure_ascii=False))


def guardar(a):
    # Pesos chilenos: sin decimales; se quitan $, puntos y espacios ("$3.990" -> 3990)
    digitos = ''.join(c for c in str(a.monto) if c.isdigit())
    if not digitos:
        sys.exit(f'Monto inválido: {a.monto}')
    monto = float(digitos)
    if monto <= 0:
        sys.exit('El monto debe ser mayor que cero')
    campos = {'monto': monto, 'lectura': 'leida', 'lectura_at': datetime.now(timezone.utc).isoformat(), 'lectura_nota': a.nota}
    if a.comercio:
        campos['comercio'] = a.comercio.strip()
    if a.fecha:
        datetime.strptime(a.fecha, '%Y-%m-%d')
        campos['fecha'] = a.fecha
    if a.pago:
        if a.pago not in ('efectivo', 'tarjeta', 'transferencia'):
            sys.exit('pago debe ser efectivo, tarjeta o transferencia')
        campos['metodo_pago'] = a.pago
    r = api('PATCH', f'boletas?id=eq.{a.id}&lectura=eq.pendiente', campos, {'Prefer': 'return=representation'})
    print('OK' if r else 'NO_ACTUALIZADA (ya no estaba pendiente)', a.id, monto)


def error(a):
    r = api('PATCH', f'boletas?id=eq.{a.id}&lectura=eq.pendiente',
            {'lectura': 'error', 'lectura_at': datetime.now(timezone.utc).isoformat(), 'lectura_nota': a.motivo}, {'Prefer': 'return=representation'})
    print('MARCADA_ERROR' if r else 'NO_ACTUALIZADA', a.id)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='cmd', required=True)
    s1 = sub.add_parser('listar'); s1.add_argument('carpeta', nargs='?', default=os.path.join(tempfile.gettempdir(), 'boletas_pendientes'))
    s2 = sub.add_parser('guardar'); s2.add_argument('id'); s2.add_argument('monto'); s2.add_argument('--comercio'); s2.add_argument('--fecha'); s2.add_argument('--pago'); s2.add_argument('--nota', default='Leída por Claude desde la foto')
    s3 = sub.add_parser('error'); s3.add_argument('id'); s3.add_argument('motivo')
    a = p.parse_args()
    {'listar': lambda: listar(a.carpeta), 'guardar': lambda: guardar(a), 'error': lambda: error(a)}[a.cmd]()
