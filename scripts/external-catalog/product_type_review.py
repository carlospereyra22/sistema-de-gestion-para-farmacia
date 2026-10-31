"""Item-level review signals. Never classify a manufacturer or brand as a drug.

Retail taxonomy is evidence, not regulatory verification. Preserve disagreements
for an explicit user decision rather than silently assigning a non-medicinal type.
"""
import re
from rules import normalized, gtin_error


def medicinal_taxonomy(row):
    path = normalized(row.get('category', '') + ' ' + ' / '.join(row.get('category_path', [])))
    return bool(re.search(r'\b(medicamentos?|venta libre)\b', path))


def annotate_type_reviews(rows, inventory):
    medicinal_codes = {row['code'].zfill(14) for row in inventory
                       if not gtin_error(row.get('code', '')) and medicinal_taxonomy(row)}
    result = []
    for original in rows:
        row = dict(original)
        # ODbL remains separate; do not enrich its facts from retail observations.
        if row['source'] != 'openbeauty' and row['gtin14'] in medicinal_codes:
            row['type_review_reason'] = 'Las fuentes difieren sobre si es medicamento. Confirmá el tipo con el envase antes de completar.'
        result.append(row)
    return result
