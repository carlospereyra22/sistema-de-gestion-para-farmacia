"""Exporta la base de medicamentos a un JSONL para importarla en PostgreSQL (SISTEMA-26).

Entrada: la carpeta de trabajo con catalogo_precios.db y padron_vivo.json. Solo lee.
Salida: una línea por laboratorio y por producto con precio y link. Lo que no tiene precio
queda afuera: se revisa en el Excel de productos sin link.

Uso:
  uv run --python 3.12 python scripts/medicine-catalog/exportar.py <carpeta> data/medicine-catalog/catalogo.jsonl
"""

import json
import re
import sqlite3
import sys
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

FUENTES = {'padron': 'official', 'remedios': 'preciosderemedios', 'alfabeta': 'alfabeta'}


def centavos(precio: float) -> int:
    return int((Decimal(str(precio)) * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def main(carpeta: Path, salida: Path) -> None:
    db = sqlite3.connect(f'file:{carpeta / "catalogo_precios.db"}?mode=ro', uri=True, timeout=60)
    padron = json.loads((carpeta / 'padron_vivo.json').read_text(encoding='utf-8'))
    bajas = {f'ab-{fila["CLAVE"]}' for fila in padron if str(fila.get('BAJA')) == '1'}
    codigos: dict[str, list[str]] = {}
    for codigo, producto in db.execute('SELECT codigo, producto_id FROM codigos'):
        codigos.setdefault(producto, []).append(codigo)

    salida.parent.mkdir(parents=True, exist_ok=True)
    cantidades: dict[str, int] = {}
    with salida.open('w', encoding='utf-8', newline='\n') as archivo:
        for previta, remedios, estado in db.execute('SELECT previta, remedios, estado FROM laboratorios_alias'):
            if previta and remedios:
                archivo.write(json.dumps({'kind': 'laboratory', 'catalogName': previta, 'sourceName': remedios,
                                          'status': estado}, ensure_ascii=False) + '\n')
        for (pid, nombre, presentacion, droga, laboratorio, forma, venta, fuente, precio, link, como, troquel,
             motivo) in db.execute('''
                SELECT p.id, p.nombre, p.presentacion, p.principio_activo, p.laboratorio, p.forma, p.condicion_venta,
                       c.fuente, c.precio, c.link, c.como_figura, c.troquel, c.motivo
                FROM productos p JOIN clasificacion c ON c.producto_id = p.id
                WHERE c.fuente IN ('padron', 'remedios', 'alfabeta') AND c.precio > 0
                ORDER BY p.id'''):
            distinto = re.search(r'laboratorio distinto \((.+)\)', motivo or '')
            # En AlfaBeta la fila se identifica por la presentación; en Remedios, por cómo figura allá
            fila = {'padron': '', 'remedios': como or '', 'alfabeta': presentacion or ''}[fuente]
            archivo.write(json.dumps({
                'kind': 'product', 'externalKey': pid, 'name': nombre, 'presentation': presentacion or '',
                'activeIngredient': droga or '', 'laboratory': laboratorio or '', 'pharmaceuticalForm': forma or '',
                'saleCondition': venta or '', 'troquel': troquel or '', 'priceSource': FUENTES[fuente],
                'priceMinor': centavos(precio), 'referenceUrl': None if fuente == 'padron' else link,
                'sourceRow': fila, 'officialDelisted': pid in bajas,
                'laboratoryMismatch': distinto.group(1) if distinto else None, 'barcodes': codigos.get(pid, []),
            }, ensure_ascii=False) + '\n')
            cantidades[fuente] = cantidades.get(fuente, 0) + 1
    print(f'{sum(cantidades.values())} productos en {salida}: {cantidades}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
