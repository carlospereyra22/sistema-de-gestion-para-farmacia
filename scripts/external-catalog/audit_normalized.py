"""Validate the completed local import and export its canonical PostgreSQL records."""
import argparse
import csv
import hashlib
import json
import pathlib
from collections import Counter
from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
import psycopg
from install import local_credentials, DB
from rules import gtin_error


def audit(scan, before, after):
    inventory = json.loads((scan / 'inventory.json').read_text(encoding='utf-8'))
    assert inventory['complete'] and not any(f['status']=='failed' for f in inventory['files'])
    hashes = set()
    for f in inventory['files']:
        # Identical copies within this run can reuse the freshly parsed content.
        assert not f['reused_content_cache'] or f['sha256'] in hashes
        hashes.add(f['sha256'])
    expected = {f['file'] for f in inventory['files']}
    assert expected == {p.relative_to(pathlib.Path(inventory['root'])).as_posix() for p in pathlib.Path(inventory['root']).rglob('*.csv')}
    old = [json.loads(line) for line in (before/'candidates.jsonl').read_text(encoding='utf-8').splitlines()]
    rows = [json.loads(line) for line in (after/'candidates.jsonl').read_text(encoding='utf-8').splitlines()]
    old_codes = {r['gtin14'] for r in old}
    codes = {r['gtin14'] for r in rows}
    assert old_codes <= codes
    # Check all SEPA facts against freshly read whole tuples, including old facts.
    source_tuples = set()
    targets = {'070330731806'.zfill(14), '7791274201653'.zfill(14), '070330717534'.zfill(14)}
    occurrences = Counter()
    for f in inventory['files']:
        if f['status']!='processed': continue
        for line in (scan/'cache'/(f['sha256']+'.jsonl')).open(encoding='utf-8'):
            code,name,brand,q,u,flag,count = json.loads(line)
            source_tuples.add((code,name,brand,q,u))
            if code.zfill(14) in targets: occurrences[code.zfill(14)] += count
    old_keys = {(r['source'],r['fingerprint']) for r in old}
    added_rows = [r for r in rows if r['source']=='sepa' and (r['source'],r['fingerprint']) not in old_keys]
    assert all(tuple(r.get(k,'') for k in ('code','name','brand','quantity','unit')) in source_tuples for r in added_rows)
    with psycopg.connect(**local_credentials(), dbname=DB, options='-c default_transaction_read_only=on') as conn:
        main = [r[0] for r in conn.execute('SELECT payload FROM reference_catalog.product WHERE eligible ORDER BY gtin14')]
        beauty = [r[0] for r in conn.execute('SELECT payload FROM beauty_odbl.product WHERE eligible ORDER BY gtin14')]
        evidence_count = conn.execute('SELECT sum(jsonb_array_length(evidence)) FROM reference_catalog.product WHERE eligible').fetchone()[0]
        assert conn.execute('SELECT count(*) FROM reference_catalog.candidate WHERE eligible').fetchone()[0] == evidence_count
    assert {r['gtin14'] for r in main+beauty} == codes
    assert all(not gtin_error(r['code']) for r in main+beauty)
    assert len(main) == len({r['gtin14'] for r in main})
    selected = {r['gtin14']:r for r in main if r['gtin14'] in targets}
    assert len(selected)==3
    assert selected['070330717534'.zfill(14)]['brand']=='BIC'
    assert not selected['070330717534'.zfill(14)]['review_reason']
    assert selected['7791274201653'.zfill(14)]['source_review_reason']
    columns = ['code','gtin14','name','brand','scope_group','presentation','source','review_reason','evidence_count','source_ref']
    def write_csv(name, data):
        with (after/name).open('w',encoding='utf-8-sig',newline='') as f:
            writer=csv.DictWriter(f,fieldnames=columns,extrasaction='ignore');writer.writeheader();writer.writerows(data)
    write_csv('PRODUCTOS_NORMALIZADOS.csv',main)
    write_csv('NUEVOS_CODIGOS.csv',[r for r in main if r['gtin14'] not in old_codes])
    book=Workbook(write_only=True)
    def sheet(name, header, data):
        tab=book.create_sheet(name);tab.append(header);tab.freeze_panes='A2'
        for row in data:
            cells=[]
            for value in row:
                cell=WriteOnlyCell(tab,value=value)
                if isinstance(value,str): cell.data_type='s'
                cells.append(cell)
            tab.append(cells)
    sheet('Productos',columns,([r.get(c,'') for c in columns] for r in main))
    for field,title in [('brand','Marcas'),('scope_group','Categorias'),('source','Fuente principal')]:
        sheet(title,[field,'cantidad'],sorted(Counter(r.get(field,'') for r in main).items()))
    book.save(after/'PRODUCTOS_NORMALIZADOS.xlsx')
    stats=json.loads((after/'report.json').read_text(encoding='utf-8'))['directory_summary']
    db=json.loads((after/'postgres-result.json').read_text(encoding='utf-8'))
    assert db['commercial_counts_unchanged'] and db['unique_codes_in_database']==len(codes)
    result=dict(previous_codes=len(old_codes),unique_imported_codes=len(codes),new_codes=len(codes-old_codes),normalized_reference_products=len(main),separate_odbl_products=len(beauty),reference_evidence_rows=int(evidence_count),redundant_reference_cards_removed=int(evidence_count)-len(main),fresh_csv_files=inventory['detected_csv'],product_files=stats['files_processed'],raw_rows=stats['rows_read'],invalid_rows=stats['invalid_gtin_rows'],malformed_rows=stats['malformed_rows'],unique_rejected_codes=stats['rejected_unique_codes'],identical_duplicate_rows=stats['identical_duplicate_rows'],new_source_rows_verified=len(added_rows),targets_in_raw_files=dict(occurrences),targets=selected,commercial_counts_unchanged=True,production_enabled=False)
    (after/'normalization-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    text=f'''# Revisión y normalización — 25/10/2026

Se releyeron desde cero {inventory['detected_csv']} CSV ({stats['files_processed']} de productos), {stats['rows_read']:,} filas. No se usaron las cachés anteriores para esta lectura. Se conservaron todos los códigos previos.

- Códigos únicos confirmados en PostgreSQL externo: {len(codes):,} (antes {len(old_codes):,}; nuevos {len(codes-old_codes):,}).
- Fichas de consulta de referencia: {len(main):,}, una por GTIN; {int(evidence_count):,} evidencias originales preservadas.
- Open Beauty Facts: {len(beauty)} fichas en su esquema y exportación separados. Pueden coincidir con referencia; no se suman sin deduplicar.
- Repeticiones idénticas en filas SEPA: {stats['identical_duplicate_rows']:,}.
- Filas con formato/checksum inválido o circulación restringida: {stats['invalid_gtin_rows']:,}; filas malformadas: {stats['malformed_rows']:,}.
- Códigos distintos con alguna observación descartada: {stats['rejected_unique_codes']:,}. Incluye rubros ajenos y códigos con otra observación válida; no equivale a productos perdidos.

070330731806 está en SEPA como BIC SOLEIL X1: se recuperó la clasificación del modelo abreviado. 070330717534 tenía BIC y BIC ARGENTINA S.A.; se normalizó ese alias y las unidades, manteniendo ambos registros de origen.

7791274201653 no aparece en ninguno de los CSV aportados. Se descargó realmente una ficha pública de Farmacorp (Bolivia), con nombre, marca y código explícitos: https://farmacorp.com/products/7791274201653 . Se agregó como referencia separada, pendiente de confirmar el envase; no se certifica comercialización argentina. La tienda del fabricante aparecía indexada pero su descarga falló (HTTP 406 y 404); NO se informó como importación desde Algabo. No se copiaron precios, stock ni afirmaciones medicinales. No se atribuye licencia abierta a esta fuente.

La revisión amplió abreviaturas observadas de afeitado, cabello, higiene femenina, bebés, bucal y desodorantes, y corrigió codificación reversible para clasificar. Los nombres originales no se reconstruyeron. Una ficha única no significa coincidencia comprobada: los conflictos de presentación, marca o alcance siguen marcados y sus evidencias no se borran.

PRODUCTOS_NORMALIZADOS.xlsx/CSV reflejan las fichas efectivamente consultables en PostgreSQL. NUEVOS_CODIGOS.csv identifica incorporaciones. CATALOGO_JUNCOS_DESCARTADOS.csv, ERRORES_LECTURA.csv y CATALOGO_JUNCOS_REVISION.csv detallan exclusiones y pendientes; los ambiguos no importados están separados de las fichas consultables. normalization-audit.json conserva métricas y los tres códigos de prueba. postgres-result.json confirma los conteos comerciales sin cambios.

Respaldo pg_dump previo verificado con pg_restore --list; no se ensayó una restauración completa. Producción permanece desactivada.
'''
    (after/'INFORME_NORMALIZACION.md').write_text(text,encoding='utf-8')
    (after/'SHA256SUMS_NORMALIZACION.json').write_text(json.dumps({f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in after.iterdir() if f.is_file() and f.suffix in {'.csv','.xlsx','.jsonl'}},indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='targets'},indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('scan',type=pathlib.Path);p.add_argument('before',type=pathlib.Path);p.add_argument('after',type=pathlib.Path)
    a=p.parse_args();audit(a.scan,a.before,a.after)
