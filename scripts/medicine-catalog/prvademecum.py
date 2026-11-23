"""Fichas de cada marca desde PR Vademécum Argentina (SISTEMA-123).

Arma el archivo que carga `catalogo-medicamentos monografias <archivo.json>`: por
cada marca, composición, indicaciones, modo de uso y presentaciones del prospecto,
con su enlace. Sólo páginas públicas que robots.txt permite, una consulta por
segundo y caché en disco: se puede cortar y retomar. No usa el buscador interno.

1. Recorre las páginas de principio activo (índice de productos).
2. Lee sólo las fichas cuyo nombre está en la base de medicamentos (`--nombres`,
   un nombre por línea, como `SELECT DISTINCT name FROM "MedicineCatalogItem"`).

Uso:
  uv run --python 3.12 python scripts/medicine-catalog/prvademecum.py \
      --cache data/medicine-catalog/prvademecum --nombres nombres.txt \
      --salida data/medicine-catalog/monografias.json
"""
import argparse
import html
import json
import pathlib
import re
import time
import unicodedata
import urllib.request

BASE = 'https://ar.prvademecum.com'
SECCIONES = ('Composición.', 'Indicaciones.', 'Modo de uso.', 'Posología.', 'Dosificación.', 'Presentación.',
             'Presentaciones.', 'Acción terapéutica.', 'Propiedades.', 'Contraindicaciones.', 'Reacciones adversas.',
             'Precauciones.', 'Advertencias.', 'Interacciones.', 'Sobredosificación.', 'Conservación.')
# Cómo se usa: la primera que aparezca.
USO = ('Modo de uso', 'Posología', 'Dosificación')


class Lector:
    def __init__(self, cache: pathlib.Path, espera: float = 1.0):
        self.cache = cache
        self.cache.mkdir(parents=True, exist_ok=True)
        self.espera = espera
        self.ultimo = 0.0

    def pagina(self, ruta: str) -> str:
        archivo = self.cache / (re.sub(r'[^a-z0-9]+', '_', ruta.lower()).strip('_') + '.html')
        if archivo.exists():
            return archivo.read_text(encoding='utf-8')
        demora = self.espera - (time.time() - self.ultimo)
        if demora > 0:
            time.sleep(demora)
        texto = ''
        for intento in range(3):
            try:
                pedido = urllib.request.Request(BASE + ruta, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(pedido, timeout=30) as respuesta:
                    texto = respuesta.read().decode('utf-8', 'ignore')
                break
            except Exception:
                time.sleep(5 * (intento + 1))
        self.ultimo = time.time()
        # Una falla de red no se guarda: se vuelve a pedir la próxima vez.
        if texto:
            archivo.write_text(texto, encoding='utf-8')
        return texto


def lineas(fragmento: str) -> list[str]:
    t = re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>', ' ', fragmento)
    t = re.sub(r'<sup>([^<]*)</sup>', r'\1', t)
    t = html.unescape(re.sub(r'<[^>]+>', '\n', t))
    return [l for l in (re.sub(r'\s+', ' ', x).strip() for x in t.split('\n')) if l]


def secciones(ls: list[str], hasta: str) -> dict[str, str]:
    inicio = next((i for i, l in enumerate(ls) if l in SECCIONES), None)
    if inicio is None:
        return {}
    fin = next((j for j in range(inicio, len(ls)) if ls[j].startswith(hasta)), len(ls))
    datos: dict[str, str] = {}
    actual = None
    for l in ls[inicio:fin]:
        if l in SECCIONES:
            actual = l.rstrip('.')
            datos.setdefault(actual, '')
        elif actual:
            datos[actual] = (datos[actual] + ' ' + l).strip()
    return datos


def principio_activo(lector: Lector, id_: int) -> dict | None:
    t = lector.pagina(f'/principio-activo/x-{id_}/')
    ls = lineas(t)
    if 'Detalle de Principio Activo' not in ls:
        return None
    k = ls.index('Detalle de Principio Activo')
    nombre = ls[k + 1] if len(ls) > k + 1 else ''
    if not nombre or nombre.startswith('No se encontró') or nombre in SECCIONES:
        return None
    enlaces = r'/medicamento/([a-z0-9-]+)-(\d+)/'
    productos = {(s, int(n)) for s, n in re.findall(enlaces, t)}
    # Los listados van de a páginas: una sola droga (pagina_mono) y combinaciones
    # (pagina_multi). Se avanza hasta que una página no trae productos nuevos.
    for tipo in ('mono', 'multi'):
        if f'pagina_{tipo}=2' not in t:
            continue
        for numero in range(2, 60):
            otra = lector.pagina(f'/principio-activo/x-{id_}/?pagina_{tipo}={numero}')
            nuevos = {(s, int(n)) for s, n in re.findall(enlaces, otra)} - productos
            if not nuevos:
                break
            productos |= nuevos
    return {'id': id_, 'nombre': nombre, 'productos': sorted(productos)}


def medicamento(lector: Lector, id_: int) -> dict | None:
    t = lector.pagina(f'/medicamento/x-{id_}/')
    ls = lineas(t)
    if 'Ver Precios' not in ls:
        return None
    k = ls.index('Ver Precios')
    cabecera = ls[k + 1:k + 4]
    if not cabecera or cabecera[0].startswith('Principios Activos') or cabecera[0].startswith('No se encontró'):
        return None
    datos = secciones(ls, 'Principios Activos de')
    accion = cabecera[2] if len(cabecera) > 2 and cabecera[2] not in SECCIONES else datos.get('Acción terapéutica', '')
    uso = next((datos[s] for s in USO if datos.get(s)), '')
    slug = re.search(r'/medicamento/([a-z0-9-]+)-' + str(id_) + r'/', t)
    return {
        'sourceId': id_,
        'name': cabecera[0],
        'laboratory': cabecera[1] if len(cabecera) > 1 and cabecera[1] not in SECCIONES else '',
        'therapeuticAction': accion,
        'composition': datos.get('Composición', ''),
        'indications': datos.get('Indicaciones', ''),
        'dosage': uso,
        'presentations': datos.get('Presentación') or datos.get('Presentaciones', ''),
        'sourceUrl': f'{BASE}/medicamento/{slug.group(1) if slug else "x"}-{id_}/',
    }


def clave(nombre: str) -> str:
    s = unicodedata.normalize('NFKD', nombre.lower())
    return re.sub(r'[^a-z0-9]+', '', ''.join(c for c in s if not unicodedata.combining(c)))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--cache', type=pathlib.Path, required=True)
    p.add_argument('--nombres', type=pathlib.Path, required=True)
    p.add_argument('--salida', type=pathlib.Path, required=True)
    p.add_argument('--hasta-activo', type=int, default=2200)
    a = p.parse_args()
    lector = Lector(a.cache)
    buscados = {clave(n) for n in a.nombres.read_text(encoding='utf-8').splitlines() if n.strip()}

    # 1. Índice: productos de cada principio activo. Se corta tras 150 números
    #    seguidos sin página, pasado el último conocido.
    productos: dict[int, str] = {}
    vacios = 0
    for i in range(1, a.hasta_activo + 1):
        activo = principio_activo(lector, i)
        if activo:
            vacios = 0
            for slug, id_ in activo['productos']:
                productos[id_] = slug
        else:
            vacios += 1
            if i > 1700 and vacios > 150:
                break
        if i % 200 == 0:
            print('principios activos', i, 'productos', len(productos), flush=True)

    # 2. Fichas cuyo nombre (por el enlace) está en la base.
    elegidos = sorted(i for i, slug in productos.items() if clave(slug) in buscados)
    print('fichas a leer', len(elegidos), 'de', len(productos), flush=True)
    fichas = []
    for n, id_ in enumerate(elegidos, 1):
        ficha = medicamento(lector, id_)
        if ficha and clave(ficha['name']) in buscados:
            fichas.append(ficha)
        if n % 200 == 0:
            print('fichas', n, '/', len(elegidos), flush=True)
    a.salida.parent.mkdir(parents=True, exist_ok=True)
    a.salida.write_text(json.dumps(fichas, ensure_ascii=False), encoding='utf-8')
    print('LISTO', len(fichas), 'fichas en', a.salida)


if __name__ == '__main__':
    main()
