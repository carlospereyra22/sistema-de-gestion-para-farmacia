"""Attach only a cached photo tied to evidence for this exact canonical GTIN."""
import base64
import hashlib

PREFIX = 'data:image/jpeg;base64,'
# Tiendas argentinas para fotos de medicamentos, de la preferida a la última
# (SISTEMA-122). Farmacorp no: es de Bolivia y el envase puede ser otro.
MEDICINE_SOURCES = ('public_farmalife', 'public_farmaplus', 'public_farmar', 'public_farmamix')


def jpeg_bytes(data_url, sha256):
    """Bytes de una foto de la caché: JPEG completo, hasta 60 KB y con su huella."""
    if not data_url.startswith(PREFIX):
        raise ValueError('Photo must be JPEG')
    raw = base64.b64decode(data_url[len(PREFIX):], validate=True)
    if len(raw) > 60 * 1024 or not raw.startswith(b'\xff\xd8') or not raw.endswith(b'\xff\xd9') or hashlib.sha256(raw).hexdigest() != sha256:
        raise ValueError('Invalid cached photograph')
    return raw


def attach_image(record, image):
    if record['beauty'] or not image:
        return
    if image['gtin14'] != record['gtin14'] or image['canonical_fingerprint'] != record['payload']['fingerprint']:
        raise ValueError('Photo belongs to a different canonical record')
    matching = [row for row in record['evidence'] if row['source'] == image['source'] and row['fingerprint'] == image['source_fingerprint'] and row.get('image_url') == image['url']]
    if not matching:
        raise ValueError('Photo provenance missing from exact-code evidence')
    jpeg_bytes(image['data_url'], image['sha256'])
    record['payload']['image'] = {key: image[key] for key in ['data_url', 'url', 'source', 'source_ref', 'license', 'sha256']}
