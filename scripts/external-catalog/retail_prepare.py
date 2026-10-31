"""Validate public retail variants; preserve originals and every rejected record.

Never treats an internal SKU as a barcode unless it passes GTIN validation.
Marketing descriptions, stock and prices are deliberately excluded from candidates.
"""
import argparse
import hashlib
import json
import re
import html
from collections import Counter, defaultdict
from pathlib import Path
from datetime import datetime, timezone
from rules import gtin_error, normalized
from directory_rules import classify_product
from catalog_normalization import canonical_records
from build_directory import conflicts
from retail_recovery import recover_retail
from retail_metadata import source_metadata, enrich_candidate
from product_type_review import annotate_type_reviews
from reviewed_images import reviewed_image


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def variants(source, products, memberships=None):
    for product in products:
        if source in ('farmalife', 'farmaplus'):
            for item in product.get('items', []):
                images = item.get('images', [])
                title = item.get('nameComplete') or item.get('name') or product['productName']
                # VTEX may concatenate two full synonymous titles. Use the
                # original product title only for a single variant whose stated
                # presentation agrees; never remove distinguishing variants.
                if len(product.get('items', [])) == 1 and presentation(product['productName']) and presentation(product['productName']) == presentation(item.get('name') or ''):
                    title = product['productName']
                yield {'code': str(item.get('ean') or '').strip(), 'name': title,
                       'brand': product.get('brand') or '', 'category': ' | '.join(product.get('categories') or []),
                       'source_ref': product['link'], 'source_id': str(product['productId']) + ':' + str(item['itemId']),
                       'presentation': stated_presentation(item) or (stated_presentation(product) if len(product.get('items', [])) == 1 else '') or presentation(title),
                       'image_url': images[0]['imageUrl'] if images else '',
                       'image_label': (images[0].get('imageText') or '') if images else ''}
        elif source == 'farmamix':
            yield dict(product)
        elif source == 'farmar':
            categories = sorted((memberships or {}).get(str(product['productId']), []), key=lambda x: x['level'], reverse=True)
            yield {'code': str(product.get('barcode') or '').strip(), 'name': product['description'].strip(),
                   'brand': product.get('brandDescription') or '', 'category': ' | '.join(c['name'] for c in categories),
                   'source_ref': 'https://www.farmar.com.ar/producto/' + product['url'], 'source_id': str(product['productId']),
                   'image_url': product.get('imageUrl') or '', 'image_label': ''}
        else:
            for variant in product.get('variants', []):
                title = variant.get('title', '')
                image = variant.get('featured_image')
                if not image and len(product.get('variants', [])) == 1:
                    image = next(iter(product.get('images', [])), None)
                yield {'code': str(variant.get('barcode') or variant.get('sku') or '').strip(),
                       'name': product['title'] + ((' · ' + title) if title and title != 'Default Title' else ''),
                       'brand': product.get('vendor', ''), 'category': product.get('product_type', ''),
                       'source_ref': 'https://farmacorp.com/products/' + product['handle'], 'source_id': str(variant['id']),
                       'image_url': (image or {}).get('src', ''), 'image_label': ''}


def presentation(name):
    # Only an explicit measure in the source title, never infer a package size.
    matches = re.findall(r'(?<!\d)(\d+(?:[.,]\d+)?)\s*(ml|cc|cm3|kg|grs?|g|litros?|lts?|l|unidades?|unds?|un|c[aá]psulas?(?:\s+blandas)?|comprimidos?(?:\s+recubiertos)?|tabletas?|sobres?|sachets?|ampollas?|toallitas?|pa[nñ]ales?)\b', name, re.I)
    return ' + '.join(number + ' ' + unit.lower() for number, unit in matches)


def stated_presentation(product):
    """Extract explicit package facts, never a dosage or an inferred unit count."""
    for field, value in product.items():
        if normalized(field) in {'presentacion', 'contenido neto'}:
            values = value if isinstance(value, list) else [value]
            for item in values:
                if isinstance(item, str) and (found := presentation(item)):
                    return found
    description = html.unescape(re.sub(r'<[^>]+>', ' ', str(product.get('description') or '')))
    match = re.search(r'\bpresentaci[oó]n\s*:\s*((?:(?:caja|frasco|envase|pote|pack|paquete|bl[ií]ster)\s*(?:de|con|x)?\s*)?\d[^;\n]{0,100})', description, re.I)
    return presentation(re.split(r'\.(?:\s|$)', match.group(1), maxsplit=1)[0]) if match else ''


def fingerprint(row):
    return hashlib.sha256(json.dumps([row['gtin14'], row['name'], row['brand'], row['category'], row['presentation']], ensure_ascii=False).encode()).hexdigest()


def retail_scope(name, brand, category, full_catalog=False):
    status, group, sub, reason = classify_product(name, brand, category)
    path = normalized(category)
    if re.search(r'\b(venta libre|medicamentos?)\b', path):
        return 'discard', '', '', 'medicamento_en_categoria_fuente'
    # Capsules/tablets describe presentation, not whether an item is a drug.
    # Explicit dietary taxonomy is authoritative for supplements, unless a
    # medicinal active ingredient/type in the title contradicts it.
    medicinal = re.search(r'\b(ibuprofeno|paracetamol|aspirina|amoxicilina|diclofenac|omeprazol|loratadina|minoxidil|ketoconazol|hidrocortisona|antibiotico\w*|antimicotico\w*|antiparasitario\w*|permetrina)\b', normalized(name))
    if re.search(r'\b(suplementos?|multivitaminicos?|nutricion deportiva)\b', path) and not medicinal:
        return 'candidate', 'Suplementos y nutrición', '', ''
    if full_catalog and status != 'candidate' and not medicinal:
        # The narrow SEPA classifier must not discard explicit retail departments.
        # Unclassified medicinal-looking titles still require review; a broad
        # "Salud y Farmacia" breadcrumb alone does not identify a product type.
        if re.search(r'\b(hogar|alimentos|supermercado|limpieza|juguetes|libreria|mascotas)\b', path) and not re.search(r'\b(dermo|dermocosmetica|facial|capilar|bucal|piel)\b', path):
            return 'candidate', 'Hogar y alimentos', '', ''
        if reason != 'medicamento_o_ambiguo':
            for pattern, mapped in [
                (r'\b(bienestar sexual|salud sexual)\b', 'Otros productos de farmacia'),
                (r'\b(electrosalud|equipos medicos|botiquin|primeros auxilios)\b', 'Insumos y primeros auxilios'),
                (r'\b(almohadillas termicas|pastilleros|organizadores de pastillas)\b', 'Insumos y primeros auxilios'),
                (r'\b(accesorios de belleza|espejos)\b', 'Otros productos de farmacia'),
                (r'\b(dermo|dermocosmetica|cuidado de la piel|desmaquillante)\b', 'Dermocosmética'),
                (r'\b(capilar|cabello)\b', 'Cabello'),
                (r'\b(maquillaje|manicura)\b', 'Maquillaje y uñas'),
                (r'\b(cuidado oral|higiene bucal|salud bucal)\b', 'Higiene bucal'),
                (r'\b(perfumes|fragancias|colonias)\b', 'Perfumería'),
                (r'\b(bebes|maternidad|universo bebe)\b', 'Bebés y maternidad'),
                (r'\b(ortopedia)\b', 'Ortopedia'),
                (r'\b(afeitado|depilacion)\b', 'Afeitado y depilación'),
                (r'\b(higiene|bano)\b', 'Higiene corporal'),
            ]:
                if re.search(pattern, path):
                    return 'candidate', mapped, '', ''
    if status != 'candidate':
        recovered = recover_retail(name, brand, category, reason)
        if recovered:
            status, group, sub, reason = 'candidate', *recovered, ''
    if reason in {'no_identificado_como_farmacia', 'marca_pertinente_descripcion_insuficiente', 'jabon_uso_personal_no_confirmado'}:
        if re.search(r'\b(dermo|dermocosmetica)\b', path) and not re.search(r'\b(cicatrizante|farmacia|medicinal)\b', path):
            status, group, sub, reason = 'candidate', 'Dermocosmética', 'Categoría explícita de la tienda', ''
        elif re.search(r'\bmaquillaje\b', path):
            status, group, sub, reason = 'candidate', 'Maquillaje y uñas', 'Categoría explícita de la tienda', ''
        elif re.search(r'\bcuidado oral\b', path):
            status, group, sub, reason = 'candidate', 'Higiene bucal', 'Categoría explícita de la tienda', ''
        elif reason == 'jabon_uso_personal_no_confirmado' and re.search(r'\bcuidado personal\b', path) and not re.search(r'\b(antiseptico|azufre|sarnol)\b', normalized(name)):
            status, group, sub, reason = 'candidate', 'Higiene corporal', 'Jabones de uso personal', ''
    # Explicit retailer taxonomy refines a candidate, never overrules exclusion.
    if status == 'candidate':
        for pattern, mapped in [
            (r'\b(tinturas?|coloracion)\b', 'Tinturas y coloración'),
            (r'\bmaquillaje\b', 'Maquillaje y uñas'),
            (r'\b(cuidado oral|dental|dentales|bucal|ortodoncia)\b', 'Higiene bucal'),
            (r'\b(afeitado|depilacion)\b', 'Afeitado y depilación'),
            (r'\b(desodorantes?|antitranspirantes?)\b', 'Desodorantes'),
            (r'\b(proteccion femenina|higiene femenina)\b', 'Higiene femenina'),
            (r'\b(panales para adultos|incontinencia)\b', 'Adultos e incontinencia'),
            (r'\b(cuidado capilar|capilar|cabello|shampoo)\b', 'Cabello'),
            (r'\b(fragancias|perfumes)\b', 'Perfumería'),
            (r'\bsolar\b', 'Protección solar'),
        ]:
            if re.search(pattern, path):
                group = mapped
                break
    return status, group, sub, reason


def prepare(root, baseline, out, sources=None, previous=None, full_catalog=False):
    out.mkdir(parents=True, exist_ok=True)
    metadata = source_metadata(root)
    baseline_rows = [json.loads(line) for line in baseline.read_text(encoding='utf-8').splitlines()]
    rows = []
    quarantined = []
    for baseline_row in baseline_rows:
        row = dict(baseline_row)
        if row.get('scope_review_reason') and row['source'] != 'openbeauty':
            status, group, sub, reason = retail_scope(row['name'], row['brand'], row['category'])
            if status != 'candidate':
                quarantined.append(dict(row, audit_status=status, audit_reason=reason))
                continue
            old_warning = row.pop('scope_review_reason')
            row['review_reason'] = '; '.join(part.strip() for part in row.get('review_reason', '').split(';') if part.strip() != old_warning)
            row['scope_group'], row['subcategory'] = group, sub
        rows.append(row)
    inventory = []
    coverage = {}
    for source in sources or ('farmalife', 'farmar', 'farmacorp', 'farmaplus', 'farmamix'):
        directory = root / source
        if not directory.exists() and source in ('farmaplus', 'farmamix'):
            continue
        coverage[source] = read(directory / 'coverage.json')
        if coverage[source].get('unresolved_sitemap_urls'):
            raise ValueError('Source download incomplete: ' + source)
        if any(partition.get('error') for partition in coverage[source].get('brand_partitions', [])):
            raise ValueError('Source brand partitions incomplete: ' + source)
        observed_date = datetime.fromtimestamp((directory / 'catalogue.json').stat().st_mtime, timezone.utc).date().isoformat()
        memberships = read(directory / 'memberships.json') if source == 'farmar' else None
        for item in variants(source, read(directory / 'catalogue.json'), memberships):
            row = dict(item, source='public_' + source, presentation=item.get('presentation') or presentation(item['name']),
                       license='PUBLIC_FACTS_NO_OPEN_LICENSE_GRANTED', verification='CHECKSUM_VALID_NOT_PHYSICALLY_VERIFIED',
                       source_date=(item.get('source_observed_at') or observed_date)[:10], argentina_evidence='retailer_argentina' if source != 'farmacorp' else 'not_confirmed_bolivia')
            row = enrich_candidate(row, metadata)
            error = gtin_error(row['code'])
            classification_path = row['category'] + ' | ' + ' / '.join(row.get('category_path', []))
            # Shopify tags are unordered labels. Use an explicit non-medicinal
            # department as scope evidence, never manufacture a breadcrumb.
            if source == 'farmacorp' and 'Supermercado' in row.get('source_tags', []) and 'Salud y Medicamentos' not in row.get('source_tags', []):
                classification_path += ' | Supermercado'
            status, group, sub, reason = retail_scope(row['name'], row['brand'], classification_path, full_catalog=full_catalog)
            row.update(scope_group=group, subcategory=sub)
            # The image must not advertise a different valid barcode.
            image_label = row.pop('image_label')
            label_codes = re.findall(r'(?<!\d)\d{8,14}(?!\d)', image_label)
            if any(not gtin_error(code) and code.zfill(14) != row['code'].zfill(14) for code in label_codes) and not reviewed_image(row, image_label):
                row['image_review_reason'] = 'image_label_barcode_mismatch'
                row['image_url'] = ''
            row['status'] = 'invalid_code' if error else status
            row['reason'] = error or reason
            inventory.append(row)
            if error or status != 'candidate':
                continue
            row = dict(row, gtin14=row['code'].zfill(14))
            row['fingerprint'] = fingerprint(row)
            if source == 'farmacorp':
                row['source_review_reason'] = 'Confirmar envase y comercialización argentina: fuente pública de Bolivia.'
            rows.append(row)
    retained = set()
    if previous:
        present = {row['gtin14'] for row in rows}
        observed = {row['code'].zfill(14) for row in inventory if not gtin_error(row['code'])}
        current_codes = present | observed
        for line in previous.read_text(encoding='utf-8').splitlines():
            prior = json.loads(line)
            if prior['source'].startswith('public_') and prior['gtin14'] not in current_codes:
                status, _, _, _ = retail_scope(prior['name'], prior.get('brand', ''), prior.get('category', ''), full_catalog=full_catalog and prior['source'].startswith('public_'))
                if not gtin_error(prior['code']) and status == 'candidate':
                    prior['historical_reference'] = True
                    prior['source_review_reason'] = 'Ficha de una captura anterior, ausente del listado vigente; cotejar el envase.'
                    prior['review_reason'] = '; '.join(filter(None, [prior.get('review_reason', ''), 'Referencia histórica ausente del listado vigente']))
                    rows.append(prior)
                    retained.add(prior['gtin14'])
    unique = {(row['source'], row['fingerprint']): row for row in rows}
    rows = list(unique.values())
    rows = [enrich_candidate(row, metadata) for row in rows]
    inventory = [enrich_candidate(row, metadata) for row in inventory]
    rows = annotate_type_reviews(rows, inventory)
    grouped = defaultdict(list)
    for row in rows:
        if row['source'] != 'openbeauty':
            grouped[row['gtin14']].append(row)
    for group in grouped.values():
        reason = conflicts(group)
        argentine = any(row['argentina_evidence'] not in ('not_confirmed_bolivia', '') and row['source'] != 'public_farmacorp' for row in group)
        for row in group:
            row['review_reason'] = '; '.join(filter(None, [row.get('review_reason', ''), reason]))
            if row['source'] == 'public_farmacorp' and argentine:
                row['argentina_evidence'] = 'exact_gtin_in_argentine_sources'
                row['source_review_reason'] = 'Código también presente en fuentes argentinas; cotejar variante con el envase.'
    for name, data in [('candidates.jsonl', rows), ('inventory.jsonl', inventory), ('baseline-quarantine.jsonl', quarantined)]:
        with (out / name).open('w', encoding='utf-8') as stream:
            for row in data:
                stream.write(json.dumps(row, ensure_ascii=False) + '\n')
    normalized = canonical_records(rows)
    save = lambda name, data: (out / name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    baseline_codes = {r['gtin14'] for r in baseline_rows}
    codes = {r['gtin14'] for r in rows}
    accepted_retail = [r for r in inventory if r['status'] == 'candidate']
    retail_codes = {r['code'].zfill(14) for r in accepted_retail}
    report = {'sources': dict(Counter(r['source'] for r in rows)), 'unique_codes': len(codes),
              'new_codes': len(codes - baseline_codes), 'baseline_codes_preserved': baseline_codes <= codes,
              'downloaded_variants': len(inventory), 'disposition': dict(Counter(r['status'] for r in inventory)),
              'duplicate_accepted_evidence_rows': len(rows) - len(codes), 'coverage': coverage}
    report.update(retail_unique_codes=len(retail_codes), retail_duplicate_rows=len(accepted_retail)-len(retail_codes),
                  retail_codes_already_in_baseline=len(retail_codes & baseline_codes),
                  retailer_category_missing=sum(not r['category'] for r in inventory),
                  invalid_code_reasons=dict(Counter(r['reason'] for r in inventory if r['status'] == 'invalid_code')))
    report['baseline_quarantined_rows'] = len(quarantined)
    report['retained_previous_codes'] = sorted(retained)
    report['baseline_codes_removed_from_suggestions'] = sorted(baseline_codes - codes)
    save('report.json', report)
    save('manifest.json', {'sources': coverage, 'full_retail_catalog': full_catalog, 'baseline_sha256': hashlib.sha256(baseline.read_bytes()).hexdigest()})
    save('canonical.json', normalized)
    print(json.dumps({k:v for k,v in report.items() if k not in {'coverage', 'baseline_codes_removed_from_suggestions'}}, indent=2))


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--retail', type=Path, required=True)
    p.add_argument('--baseline', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--sources', nargs='+', choices=['farmalife', 'farmar', 'farmacorp', 'farmaplus', 'farmamix'])
    p.add_argument('--previous', type=Path, help='Previous installed candidates: retain valid missing historical references')
    p.add_argument('--full-retail-catalog', action='store_true', help='Include explicit non-medicinal retail departments, including supplements and household items')
    a = p.parse_args()
    prepare(a.retail, a.baseline, a.output, a.sources, a.previous, a.full_retail_catalog)
