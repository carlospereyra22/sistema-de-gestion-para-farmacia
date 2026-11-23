"""Fotos de medicamentos (SISTEMA-122).

Las tiendas publican medicamentos que la preparación descarta del catálogo no
medicinal; sus fotos no se bajaban. Este paso baja una foto por código de barras
desde las tiendas argentinas, para que la API la ponga en los productos que
coinciden con la base de medicamentos. Farmacorp (Bolivia) no se usa: su envase
puede ser otro aunque el código coincida.

No decide qué es un medicamento ni compara con la base: eso lo hace la API con
el código exacto. Sólo junta fotos de fichas descartadas con código válido que
todavía no tienen foto argentina en la proyección.
"""
import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Semaphore

from image_payload import MEDICINE_SOURCES as FUENTES
from retail_images import HOSTS, fetch_photo, new_client, previous_failures_of
from rules import gtin_error
LICENCIA = 'SOURCE_IMAGE_NO_OPEN_LICENSE_GRANTED'


def gtin_valido(code):
    code = (code or '').strip()
    return '' if not code or gtin_error(code) else code.zfill(14)


def con_foto_argentina(imagenes):
    """Códigos que ya tienen foto de una tienda argentina en la proyección."""
    return {fila['gtin14'] for fila in imagenes if fila.get('source') in FUENTES}


def elegir(inventario, ya_tienen):
    """Por código, las fichas descartadas con foto, de la tienda preferida a la última."""
    por_codigo = {}
    for fila in inventario:
        if fila.get('source') not in FUENTES or fila.get('status') != 'discard' or not fila.get('image_url'):
            continue
        gtin14 = gtin_valido(fila.get('code'))
        if not gtin14 or gtin14 in ya_tienen:
            continue
        por_codigo.setdefault(gtin14, []).append(fila)
    elegidas = {}
    for gtin14, filas in por_codigo.items():
        vistas = set()
        orden = []
        for fila in sorted(filas, key=lambda f: (FUENTES.index(f['source']), f.get('source_ref') or '', f['image_url'])):
            if fila['image_url'] not in vistas:
                vistas.add(fila['image_url'])
                orden.append(fila)
        elegidas[gtin14] = orden
    return elegidas


def leer_jsonl(path):
    if not path.exists():
        return []
    return [json.loads(linea) for linea in path.read_text(encoding='utf-8').splitlines() if linea.strip()]


def run(prepared, cache):
    cache.mkdir(parents=True, exist_ok=True)
    elegidas = elegir(leer_jsonl(prepared / 'inventory.jsonl'), con_foto_argentina(leer_jsonl(prepared / 'images.jsonl')))
    reporte = prepared / 'medicine-image-report.json'
    previas = previous_failures_of(reporte)
    limites = {host: Semaphore(4) for host in HOSTS}
    client = new_client()

    def bajar(par):
        gtin14, filas = par
        intentos = []
        for fila in filas:
            try:
                foto = fetch_photo(fila['image_url'], cache, client, limites, previas)
            except Exception as error:
                foto = {'url': fila['image_url'], 'error': type(error).__name__ + ': ' + str(error)}
            if 'error' in foto:
                intentos.append(dict(foto, gtin14=gtin14))
                continue
            return {'gtin14': gtin14, 'source': fila['source'], 'source_id': fila.get('source_id', ''),
                    'source_ref': fila.get('source_ref', ''), 'url': fila['image_url'], 'sha256': foto['sha256'],
                    'data_url': foto['data_url'], 'license': LICENCIA}, intentos
        return None, intentos

    buenas, fallidas, pedidos_fallidos = [], [], []
    with ThreadPoolExecutor(max_workers=12) as executor:
        for indice, (foto, intentos) in enumerate(executor.map(bajar, sorted(elegidas.items())), 1):
            pedidos_fallidos.extend(intentos)
            if foto:
                buenas.append(foto)
            else:
                fallidas.append(intentos[-1])
            if indice % 100 == 0:
                print('medicine images', indice, '/', len(elegidas), 'failed', len(fallidas), flush=True)
    client.close()
    with (prepared / 'medicine-images.jsonl').open('w', encoding='utf-8') as stream:
        for fila in buenas:
            stream.write(json.dumps(fila) + '\n')
    por_fuente = {}
    for fila in buenas:
        por_fuente[fila['source']] = por_fuente.get(fila['source'], 0) + 1
    reporte.write_text(json.dumps({'codigos': len(elegidas), 'bajadas': len(buenas), 'por_fuente': por_fuente,
                                   'failures': fallidas, 'failed_requests': pedidos_fallidos}, indent=2), encoding='utf-8')
    print('Medicine images downloaded', len(buenas), 'failed', len(fallidas))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('prepared', type=Path)
    parser.add_argument('--cache', type=Path, required=True)
    args = parser.parse_args()
    run(args.prepared, args.cache)
