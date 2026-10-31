import base64
import hashlib
import io
import json
import tempfile
from contextlib import redirect_stdout
from pathlib import Path
import unittest
from retail_prepare import variants, presentation, retail_scope, prepare
from retail_images import compress, permitted, select_image, alternate_images
from image_payload import attach_image
from PIL import Image
from rules import gtin_error


class RetailTests(unittest.TestCase):
    def test_supplements_are_not_rejected_for_capsule_or_tablet_presentation(self):
        for name, category in [
            ('Menacor Omega 3 Concentrado X 30 Cápsulas', '/Salud y Farmacia/Suplementos y Multivitamínicos/'),
            ('Suplemento Omega 3 Menacor Concentrado 30 Cápsulas', '/Suplementos y Nutrición/Suplementos Dietarios/Colesterol/'),
            ('Creatina X 60 Comprimidos', 'Suplementos'),
        ]:
            self.assertEqual(retail_scope(name, 'Marca', category)[:2], ('candidate', 'Suplementos y nutrición'))
        self.assertNotEqual(retail_scope('Ibuprofeno 400 mg cápsulas', 'Marca', 'Suplementos')[0], 'candidate')
        self.assertEqual(retail_scope('Omega 3', 'Marca', 'Medicamentos | Suplementos')[0], 'discard')

    def test_full_retail_scope_uses_source_taxonomy_but_keeps_drugs_out(self):
        self.assertEqual(retail_scope('Teatrical Agua Micelar Suavizante X 600 Ml', 'Teatrical', '/Cuidado Personal/Cuidado de la piel/Desmaquillante/', full_catalog=True)[0], 'candidate')
        self.assertEqual(retail_scope('Detergente Ala', 'ALA', 'Hogar y Alimentos/Limpieza', full_catalog=True)[0], 'candidate')
        self.assertNotEqual(retail_scope('Anagen Minoxidil 5%', 'Anagen', 'Cuidado Personal/Capilar', full_catalog=True)[0], 'candidate')
        self.assertNotEqual(retail_scope('Desconocido cápsulas', '', '', full_catalog=True)[0], 'candidate')

    def test_photo_fallback_requires_exact_code_and_compatible_evidence(self):
        good = {'gtin14': '00070330731806', 'source': 'public_farmamix', 'image_url': 'https://example.test/other.jpg'}
        record = {'gtin14': good['gtin14'], 'beauty': False, 'payload': {},
                  'evidence': [good, dict(good, gtin14='07793008021193'), dict(good, source='openbeauty'), dict(good, image_review_reason='mismatch')]}
        self.assertEqual(alternate_images(record, 'https://example.test/failed.jpg'), [good])
        record['payload']['review_reason'] = 'Conflicting presentations'
        self.assertEqual(alternate_images(record, 'https://example.test/failed.jpg'), [])

    def test_single_frame_gif_photo_is_normalized_to_jpeg(self):
        source = io.BytesIO()
        Image.new('RGB', (20, 30), 'white').save(source, format='GIF')
        result = compress(source.getvalue())
        with Image.open(io.BytesIO(result)) as image:
            self.assertEqual(image.format, 'JPEG')
            self.assertEqual(image.size, (20, 30))

    def test_retain_retired_reference_but_not_newly_excluded_code(self):
        prior = {'code': '070330731806', 'gtin14': '00070330731806', 'name': 'BIC SOLEIL X1',
                 'brand': 'BIC', 'category': 'Afeitado', 'presentation': '1 unidad',
                 'scope_group': 'Afeitado y depilación', 'source': 'public_farmacorp',
                 'source_ref': 'https://farmacorp.com/products/test', 'fingerprint': 'prior',
                 'argentina_evidence': 'not_confirmed_bolivia'}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            baseline, previous = root/'baseline.jsonl', root/'previous.jsonl'
            baseline.write_text('', encoding='utf-8')
            previous.write_text(json.dumps(prior)+'\n', encoding='utf-8')
            for source in ['farmar', 'farmalife', 'farmacorp']:
                target = root/source
                target.mkdir()
                for name, data in [('catalogue.json', []), ('coverage.json', {}), ('memberships.json', {})]:
                    (target/name).write_text(json.dumps(data), encoding='utf-8')
            with redirect_stdout(io.StringIO()):
                prepare(root, baseline, root/'prepared', previous=previous)
            result = json.loads((root/'prepared/canonical.json').read_text())
            self.assertTrue(result[0]['payload']['historical_reference'])
            self.assertTrue(result[0]['payload']['review_reason'])
            excluded = {'title': 'Detergente Ala', 'vendor': 'ALA', 'product_type': 'Hogar', 'handle': 'test',
                        'variants': [{'id': 1, 'barcode': prior['code'], 'title': 'Default Title'}]}
            (root/'farmacorp/catalogue.json').write_text(json.dumps([excluded]), encoding='utf-8')
            with redirect_stdout(io.StringIO()):
                prepare(root, baseline, root/'prepared', previous=previous)
            self.assertEqual(json.loads((root/'prepared/canonical.json').read_text()), [])
            with redirect_stdout(io.StringIO()):
                prepare(root, baseline, root/'prepared', previous=previous, full_catalog=True)
            expanded = json.loads((root/'prepared/canonical.json').read_text())
            self.assertEqual(expanded[0]['payload']['name'], 'Detergente Ala')
            self.assertEqual(expanded[0]['payload']['scope_group'], 'Hogar y alimentos')

    def test_legacy_out_of_scope_is_quarantined_with_evidence_not_lost(self):
        good = {'code':'070330731806','gtin14':'00070330731806','name':'BIC SOLEIL X1','brand':'BIC','category':'','presentation':'1 unidad','scope_group':'Afeitado y depilación','source':'sepa','source_ref':'https://example.test/sepa','fingerprint':'good','argentina_evidence':'SEPA'}
        bad = dict(good, code='3616958742243',gtin14='03616958742243',name='ALGODON DE AZUCAR OOSH',brand='GENERICO',fingerprint='bad',scope_review_reason='catalogo_previo_revisar_alcance:uso_no_personal')
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            baseline=root/'baseline.jsonl'
            baseline.write_text('\n'.join(json.dumps(row) for row in [good,bad]),encoding='utf-8')
            for source in ['farmar','farmalife','farmacorp']:
                target=root/source;target.mkdir()
                for name,data in [('catalogue.json',[]),('coverage.json',{}),('memberships.json',{})]:
                    (target/name).write_text(json.dumps(data),encoding='utf-8')
            with redirect_stdout(io.StringIO()):
                prepare(root,baseline,root/'prepared')
            active=[json.loads(line) for line in (root/'prepared/candidates.jsonl').read_text(encoding='utf-8').splitlines()]
            quarantined=[json.loads(line) for line in (root/'prepared/baseline-quarantine.jsonl').read_text(encoding='utf-8').splitlines()]
            self.assertEqual([r['code'] for r in active],[good['code']])
            self.assertEqual(quarantined[0]['name'],bad['name'])
            self.assertEqual(quarantined[0]['audit_reason'],'uso_no_personal')

    def test_context_recovers_cosmetic_colors_and_abbreviated_diapers(self):
        cases = [
            ('Sensor Freestyle Libre', 'Abbott', 'Salud / Diabetes'),
            ('Estetoscopio Coronet', 'Coronet', 'Complementos de Farmacia'),
            ('Pastillero Semanal', 'Apper', 'Salud y Farmacia'),
            ('Secador Profesional', 'Gama', 'Electro Belleza'),
            ('PAMPERS BABYSAN MED X72 -8541', 'PAMPERS', 'Universo Bebé'),
            ('REVLON RUBOR PVO PARA MEJILLAS 004', 'REVLON', 'Maquillaje'),
            ('Esmalte Vogue Rápido Secado Vino Argentino', 'VOGUE', 'Maquillaje'),
            ('Pincel Blender De Ojos Pelo Sintético', 'FASCINO', 'Maquillaje'),
            ('Anua Rice Enzyme Limpiador Enzimático En Polvo', 'ANUA', '/Dermo/Limpieza/'),
            ('Afeitadora Tiny Go Mujer USB', 'GAMA', 'Electro Belleza'),
            ('CHUPETE SILICONADO COLOR 11105', 'DISPITA', ''),
            ('ACONDICIONA.HAIR FOOD MANTECA D/CACAO', 'GARNIER FRUCTIS', ''),
        ]
        for name, brand, category in cases:
            self.assertEqual(retail_scope(name, brand, category)[0], 'candidate', name)
        for name, brand, category in [
            ('Suavizante Comfort', 'COMFORT', 'Limpieza'),
            ('Detergente en polvo Ala', 'ALA', 'Maquillaje'),
            ('Polvo compacto medicinal', 'REVLON', 'Venta Libre'),
            ('Colgate', 'COLGATE', ''),
            ('PAMPERS', 'PAMPERS', ''),
            ('JUGUETE PHIPHIPETS CHUPETE PARA MORDER', 'PHIPHIPETS', ''),
        ]:
            self.assertNotEqual(retail_scope(name, brand, category)[0], 'candidate', name)

    def test_source_taxonomy_never_turns_otc_medicine_into_cosmetics(self):
        self.assertEqual(retail_scope('Crema', 'Marca', 'Venta Libre | Farmacia')[0], 'discard')
        self.assertEqual(retail_scope('Balsamo Cher Hyaluron Lip Skin x3.5gr', 'CHER', 'Bálsamos | Labios | Maquillaje')[1], 'Maquillaje y uñas')
        self.assertEqual(retail_scope('Isdin Isdinceutics Essential Cleansing X 200Ml', 'ISDIN', '/Dermo/Limpieza/')[0], 'candidate')
        self.assertNotEqual(retail_scope('Jabón Líquido Ala', 'ALA', '/Hogar y Alimentos/Limpieza/')[0], 'candidate')

    def test_shopify_internal_sku_not_accepted_as_gtin(self):
        row = next(variants('farmacorp', [{'title': 'Kit', 'handle': '535105', 'variants': [{'id': 1, 'sku': '535105'}]}]))
        self.assertIsNotNone(gtin_error(row['code']))

    def test_variant_photo_not_shared_across_ambiguous_variants(self):
        product = {'title': 'Shampoo', 'handle': 'shampoo', 'images': [{'src': 'photo'}], 'variants': [{'id': 1}, {'id': 2}]}
        self.assertTrue(all(not row['image_url'] for row in variants('farmacorp', [product])))

    def test_exact_farmar_barcode_and_image_no_price(self):
        row = next(variants('farmar', [{'productId': 814156, 'barcode': '7798336948785', 'description': 'Balsamo Cher x3.5gr', 'url': '814156-balsamo', 'imageUrl': 'https://example/image', 'pricePublic': 100}]))
        self.assertIsNone(gtin_error(row['code']))
        self.assertEqual(presentation(row['name']), '3.5 gr')
        self.assertNotIn('pricePublic', row)

    def test_photo_allowlist_and_compression(self):
        self.assertFalse(permitted('https://farmalife.vteximg.com.br.evil.test/photo'))
        self.assertFalse(permitted('http://127.0.0.1/photo'))
        self.assertFalse(permitted('https://user@cdn.shopify.com/photo'))
        self.assertTrue(permitted('https://cdn.shopify.com/photo'))
        original = io.BytesIO()
        Image.new('RGBA', (1200, 1000), (255, 0, 0, 100)).save(original, 'PNG')
        data = compress(original.getvalue())
        self.assertLessEqual(len(data), 60 * 1024)
        with Image.open(io.BytesIO(data)) as photo:
            self.assertEqual(photo.format, 'JPEG')
            self.assertLessEqual(max(photo.size), 800)
            self.assertFalse(photo.getexif())

    def test_conflicting_sources_cannot_supply_fallback_photo(self):
        record = {'beauty': False, 'payload': {'review_reason': 'conflict'}, 'evidence': [{'image_url': 'photo'}]}
        self.assertIsNone(select_image(record))
        record['payload']['image_url'] = 'own-source'
        self.assertEqual(select_image(record), record['payload'])

    def test_image_import_rejects_different_gtin_or_source(self):
        raw = b'\xff\xd8test\xff\xd9'
        row = {'fingerprint': 'a', 'source': 'public_farmar', 'image_url': 'photo'}
        record = {'beauty': False, 'gtin14': '07798336948785', 'payload': dict(row), 'evidence': [row]}
        image = {'gtin14': record['gtin14'], 'canonical_fingerprint': 'a', 'source_fingerprint': 'a', 'source': row['source'], 'source_ref': 'https://www.farmar.com.ar/', 'url': 'photo', 'license': 'no-open-license', 'sha256': hashlib.sha256(raw).hexdigest(), 'data_url': 'data:image/jpeg;base64,' + base64.b64encode(raw).decode()}
        attach_image(record, image)
        self.assertIn('image', record['payload'])
        with self.assertRaises(ValueError):
            attach_image(record, dict(image, gtin14='00070330731806'))
        with self.assertRaises(ValueError):
            attach_image(record, dict(image, source_fingerprint='other'))


if __name__ == '__main__':
    unittest.main()
