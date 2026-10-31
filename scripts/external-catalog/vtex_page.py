"""Read exact product facts embedded in a public VTEX page when search omits it."""
import json
import re
from urllib.parse import urlsplit


def page_product(document, url):
    slug = urlsplit(url).path.removesuffix('/p').strip('/')
    for block in re.findall(r'<template[^>]+data-varname="__STATE__"[^>]*>\s*<script>(.*?)</script>', document, re.S):
        state = json.loads(block)
        product = state.get('Product:' + slug)
        if not isinstance(product, dict) or product.get('linkText') != slug or not product.get('productId'):
            continue
        def resolve(value, depth=0):
            if depth > 8:
                raise ValueError('Embedded product reference depth exceeded')
            if isinstance(value, list):
                return [resolve(item, depth + 1) for item in value]
            if isinstance(value, dict) and value.get('type') == 'json':
                return value.get('json')
            if isinstance(value, dict) and value.get('type') == 'id':
                return state.get(value.get('id'))
            return value
        result = {key: resolve(product.get(key)) for key in ['productId', 'productName', 'brand', 'brandId', 'categoryId', 'categories', 'description']}
        if not result['productName']:
            continue
        result['link'] = url
        result['items'] = []
        for item in resolve(product.get('items') or []):
            if not isinstance(item, dict) or not item.get('itemId'):
                raise ValueError('Embedded SKU reference is incomplete')
            row = {key: item.get(key) for key in ['itemId', 'name', 'nameComplete', 'ean']}
            row['images'] = [{key: image.get(key) for key in ['imageUrl', 'imageText']}
                             for image in resolve(item.get('images') or [])
                             if isinstance(image, dict) and image.get('imageUrl')]
            result['items'].append(row)
        if result['items']:
            return result
    return None
