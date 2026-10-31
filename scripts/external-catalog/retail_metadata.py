"""Recover explicit retailer attributes without guessing a hierarchy from tags."""
import html
import json
import re
from pathlib import Path


def clean(value):
    value = html.unescape(str(value or '')).strip()
    # Some historical Farmar responses contain UTF-8 decoded as Latin-1.
    if any(marker in value for marker in ('Ã', 'Â', 'â€')):
        try:
            fixed = value.encode('latin1').decode('utf-8')
            if not any(marker in fixed for marker in ('Ã', 'Â', 'â€')):
                value = fixed
        except (UnicodeError, ValueError):
            pass
    return re.sub(r'\s+', ' ', value).strip()


def deepest(paths):
    paths = list(dict.fromkeys(tuple(clean(part) for part in path if clean(part)) for path in paths))
    return [list(path) for path in paths if path and not any(len(other) > len(path) and other[:len(path)] == path for other in paths)]


def source_metadata(root):
    result = {}
    for source in ('farmalife', 'farmaplus', 'farmar', 'farmamix', 'farmacorp'):
        directory = Path(root) / source
        if not (directory / 'catalogue.json').exists():
            continue
        products = json.loads((directory / 'catalogue.json').read_text(encoding='utf-8'))
        members = json.loads((directory / 'memberships.json').read_text(encoding='utf-8')) if source == 'farmar' else {}
        categories = {str(row['categoryId']): row for row in json.loads((directory / 'categories.json').read_text(encoding='utf-8'))} if source == 'farmar' and (directory / 'categories.json').exists() else {}
        recovered = {}
        if (directory / 'metadata.jsonl').exists():
            for line in (directory / 'metadata.jsonl').read_text(encoding='utf-8').splitlines():
                row = json.loads(line)
                if row.get('status') == 'ok':
                    recovered[str(row['source_id'])] = row
        for product in products:
            paths, primary, tags = [], [], []
            if source in ('farmalife', 'farmaplus'):
                for index, path in enumerate(product.get('categories', [])):
                    ids = (product.get('categoriesIds', []) + [''] * len(product.get('categories', [])))[index]
                    parts = [clean(part) for part in path.split('/') if clean(part)]
                    paths.append(parts)
                    if str(ids).strip('/').split('/')[-1] == str(product.get('categoryId')):
                        primary = parts
                entries = [(str(product['productId'])+':'+str(item['itemId']), item.get('ean')) for item in product.get('items', [])]
                brand = product.get('brand')
            elif source == 'farmar':
                for member in members.get(str(product['productId']), []):
                    node = categories.get(str(member['id']))
                    path, seen = [], set()
                    while node and str(node['categoryId']) not in seen:
                        seen.add(str(node['categoryId']))
                        path.insert(0, clean(node['description']))
                        node = categories.get(str(node.get('parentCategoryId')))
                    if path:
                        paths.append(path)
                entries = [(str(product['productId']), product.get('barcode'))]
                brand = product.get('brandDescription')
            elif source == 'farmamix':
                paths = [[clean(part) for part in product.get('category','').split(' / ') if clean(part)]]
                entries = [(str(product['source_id']), product.get('code'))]
                brand = product.get('brand')
            else:
                # Tags are explicit labels, NOT an ordered parent/child taxonomy.
                tags = [clean(tag) for tag in product.get('tags', [])]
                paths = [[clean(product['product_type'])]] if product.get('product_type') else []
                entries = [(str(item['id']), item.get('barcode') or item.get('sku')) for item in product.get('variants', [])]
                brand = product.get('vendor')
            paths = deepest(paths)
            for source_id, code in entries:
                extra = recovered.get(source_id, {})
                valid_extra = extra if str(extra.get('code','')).zfill(14) == str(code or '').zfill(14) else {}
                row_paths = deepest(paths + valid_extra.get('category_paths', []))
                result[('public_'+source, source_id)] = {
                    'brand': clean(brand) or clean(valid_extra.get('brand')),
                    'brand_source_field': 'vendor' if source == 'farmacorp' else 'brandDescription' if source == 'farmar' else 'brand',
                    'source_category_paths': row_paths,
                    'category_path': primary or (row_paths[0] if len(row_paths) == 1 else []),
                    'source_tags': tags,
                    **({'metadata_source_ref': valid_extra['source_ref'], 'metadata_sha256': valid_extra.get('sha256')} if valid_extra else {}),
                }
    return result


def enrich_candidate(row, metadata):
    facts = metadata.get((row.get('source'), str(row.get('source_id'))))
    if not facts:
        return dict(row)
    return {**row, **facts, 'original_brand': row.get('brand',''), 'brand': clean(row.get('brand')) or facts['brand']}
