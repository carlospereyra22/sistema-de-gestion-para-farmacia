"""Exact, visually reviewed retailer associations; never equates different GTINs."""

REVIEWS = {
    ('public_farmalife', '19483:19502', '8410190629523'): {
        'url': 'https://farmalife.vteximg.com.br/arquivos/ids/216107/8410190635920.jpg?v=639289611733930000',
        'label': '8410190635920',
        'checked_at': '2026-11-05',
        'basis': 'Exact Farmalife SKU 19502 and visual review: Adolfo Dominguez Bambu gift set, EDP 120 ml, deodorant 150 ml and EDP 10 ml. Filename differs; no GTIN equivalence or physical verification granted.',
    },
    ('public_farmalife', '15891:15891', '4005808516674'): {
        'url': 'https://farmalife.vteximg.com.br/arquivos/ids/197019/4005808944385_0.jpg.jpg?v=638799986972330000',
        'label': '4005808944385_0.jpg',
        'checked_at': '2026-10-29',
        'basis': 'Exact retailer SKU association and visual review: Nivea Kids Swim & Play FPS 60, 150 ml. Filename differs; no GTIN equivalence or physical verification granted.',
    },
}


def reviewed_image(row, label=None):
    review = REVIEWS.get((row.get('source'), row.get('source_id'), row.get('code')))
    if not review or (label is not None and (label != review['label'] or row.get('image_url') != review['url'])):
        return False
    row['image_url'] = review['url']
    row.pop('image_review_reason', None)
    row['image_review'] = dict(review, original_reason='image_label_barcode_mismatch')
    return True
