"""One deterministic reference record per GTIN, with original evidence retained.

No fuzzy barcode matching and no merging of different source descriptions.
ODbL records must be passed as a separate collection.
"""
import re
from decimal import Decimal, InvalidOperation
from collections import defaultdict
from rules import normalized
from retail_metadata import clean

ALIASES = {
    "bic argentina s a": "BIC",
    "bic argentina sa": "BIC",
    "algabo s a": "ALGABO",
    "algabo sa": "ALGABO",
}


def canonical_brand(value):
    value = clean(value)
    key = re.sub(r"[^a-z0-9]+", " ", normalized(value)).strip()
    if key in {"s d", "sin marca", "s marca", "sm", "generico", "varios", "otras", "1"}:
        return ""
    return ALIASES.get(key, value.strip().upper())


def representative(rows):
    def score(row):
        return (
            row['source'] == 'excel270',
            not bool(row.get('scope_review_reason')),
            row['source'] in {'public_farmalife', 'public_farmar'},
            row['source'] in {'public_farmaplus', 'public_farmamix'},
            row.get('source_date', ''),
            bool(canonical_brand(row.get('brand', ''))),
            len(row['name']),
            row['source'], row['fingerprint'],
        )
    return max(rows, key=score)


def canonical_presentation(row):
    units = {'ea': 'unidad', 'uni': 'unidad', 'un': 'unidad', 'unidad': 'unidad', 'unidades': 'unidad', 'gr': 'g', 'grs': 'g', 'g': 'g', 'ml': 'ml', 'cc': 'ml', 'cm3': 'ml', 'kg': 'kg', 'l': 'l', 'lt': 'l', 'lts': 'l'}
    unit = units.get(normalized(row.get('unit','')).strip('. '))
    try:
        amount = Decimal(row.get('quantity','').replace(',','.'))
        if unit and amount.is_finite() and amount > 0:
            number = format(amount.normalize(), 'f')
            return number + ' ' + ('unidades' if unit == 'unidad' and amount != 1 else unit)
    except InvalidOperation:
        pass
    return row.get('presentation','')


def canonical_records(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[(row['source'] == 'openbeauty', row['gtin14'])].append(row)
    result = []
    for (beauty, gtin), evidence in sorted(groups.items()):
        chosen = representative(evidence)
        payload = dict(chosen)
        payload['brand'] = canonical_brand(chosen.get('brand', ''))
        payload['scope_group'] = {
            'Higiene personal': 'Higiene corporal',
            'Cosmética y piel': 'Dermocosmética',
        }.get(chosen['scope_group'], chosen['scope_group']) if 'scope_group' in chosen else ''
        if payload['scope_group'] == 'Ortopedia e insumos' and re.search(r'\balcohol\b.*\bgel\b', normalized(chosen['name'])):
            payload['scope_group'] = 'Insumos y primeros auxilios'
        if payload['scope_group'] == 'Bebés e incontinencia':
            text = normalized(chosen['name'] + ' ' + chosen.get('brand', ''))
            payload['scope_group'] = 'Bebés y maternidad' if re.search(r'\b(bebe|chupete|dispita|osito)\b', text) else 'Higiene corporal'
        payload['presentation'] = canonical_presentation(chosen)
        payload['evidence_count'] = len(evidence)
        payload['sources'] = sorted({r['source'] for r in evidence})
        payload['review_reason'] = '; '.join(sorted({r.get('review_reason', '') for r in evidence} - {''}))
        # Descriptive enrichment is exact-GTIN only, with field provenance.
        # Keep original rows and never merge across the ODbL boundary.
        payload['attribute_sources'] = {}
        if payload['brand']:
            payload['attribute_sources']['brand'] = {'source':chosen['source'],'source_ref':chosen.get('source_ref',''),'field':chosen.get('brand_source_field','brand')}
        compatible = not re.search(r'contradict|conflict', payload['review_reason'], re.I)
        if not payload['brand'] and compatible:
            branded = [row for row in evidence if canonical_brand(row.get('brand', ''))]
            if len({canonical_brand(row['brand']) for row in branded}) == 1:
                donor = representative(branded)
                payload['brand'] = canonical_brand(donor['brand'])
                payload['attribute_sources']['brand'] = {'source': donor['source'], 'source_ref': donor.get('source_ref', '')}
        path = chosen.get('category_path', [])
        donor = chosen
        if not path and compatible:
            candidates = [row for row in evidence if row.get('category_path')]
            if candidates:
                priority = {'public_farmalife':5,'public_farmaplus':4,'public_farmar':3,'public_farmamix':2,'public_farmacorp':1}
                donor = max(candidates,key=lambda row:(priority.get(row['source'],0),len(row['category_path']),row['fingerprint']))
                path = donor['category_path']
        payload['category_path'] = list(path)
        if path:
            payload['source_subcategory'] = path[-1] if len(path)>1 else ''
            payload['attribute_sources']['category_path'] = {'source': donor['source'], 'source_ref': donor.get('source_ref','')}
        type_reviews = sorted({row.get('type_review_reason', '') for row in evidence} - {''})
        payload['isMedication'] = None if type_reviews else False
        if type_reviews:
            payload['type_review_reason'] = '; '.join(type_reviews)
        # Names/presentation remain a whole chosen row; originals are accessible
        # in evidence, including original brand spelling and provenance.
        result.append(dict(gtin14=gtin, beauty=beauty, payload=payload, evidence=evidence))
    return result
