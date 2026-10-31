import unittest
import tempfile
import json
import io
from pathlib import Path
from contextlib import redirect_stdout
from product_type_review import annotate_type_reviews
from retail_prepare import retail_scope, prepare, presentation, stated_presentation, variants
from catalog_normalization import canonical_records


class ProductTypeReviewTests(unittest.TestCase):
    def test_explicit_capsule_counts_are_package_facts_not_medicinal_classification(self):
        self.assertEqual(presentation('Menacor Omega 3 Concentrado X 30 Cápsulas'), '30 cápsulas')
        self.assertEqual(presentation('Producto 600 mg x 20 comprimidos'), '20 comprimidos')
        self.assertEqual(presentation('Producto 600 mg'), '')
        self.assertEqual(stated_presentation({'description': '<p>Presentación: 30 cápsulas.</p><p>Tomar 2 cápsulas.</p>'}), '30 cápsulas')
        self.assertEqual(stated_presentation({'description': 'Modo de uso: tomar 2 cápsulas.'}), '')
        product = dict(productName='Producto', productId='test', link='https://example.test',
                       description='<p>Presentación: 30 cápsulas.</p>', items=[dict(itemId='one', name='Producto', ean='7798008191792')])
        self.assertEqual(next(variants('farmalife', [product]))['presentation'], '30 cápsulas')
        product['items'].append(dict(itemId='two', name='Otra variante', ean='070330731806'))
        self.assertTrue(all(not row['presentation'] for row in variants('farmalife', [product])))

    def test_recovered_breadcrumb_is_used_before_rejecting_an_unclassified_title(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'farmar'
            source.mkdir()
            product = dict(productId='fixture', barcode='070330731806', description='Artículo documentado',
                           brandDescription='', url='fixture', imageUrl='')
            for name, value in [('catalogue.json', [product]), ('coverage.json', {}), ('memberships.json', {})]:
                (source / name).write_text(json.dumps(value), encoding='utf8')
            (source / 'metadata.jsonl').write_text(json.dumps(dict(status='ok', source_id='fixture',
                code=product['barcode'], source_ref='https://www.farmar.com.ar/producto/fixture',
                category_paths=[['Hogar y alimentos', 'Bazar']]))+'\n', encoding='utf8')
            baseline = root / 'baseline.jsonl'
            baseline.write_text('', encoding='utf8')
            with redirect_stdout(io.StringIO()):
                prepare(root, baseline, root / 'prepared', sources=['farmar'], full_catalog=True)
            inventory = json.loads((root / 'prepared/inventory.jsonl').read_text(encoding='utf8'))
            self.assertEqual(inventory['status'], 'candidate')
            self.assertEqual(inventory['category_path'], ['Hogar y alimentos', 'Bazar'])

    def test_same_manufacturer_does_not_decide_type(self):
        self.assertEqual(retail_scope('Pasta dental Sensodyne 90 g', 'Haleon', 'Cuidado Oral')[0], 'candidate')
        for name in ['Alikal 30 sobres', 'Uvasal 30 sobres']:
            self.assertEqual(retail_scope(name, 'Haleon', 'Medicamentos de Venta Libre')[0], 'discard')
        self.assertEqual(retail_scope('Menacor Omega 3 30 cápsulas', 'Laboratorio', 'Suplementos Dietarios')[0], 'candidate')

    def test_exact_code_disagreement_does_not_silently_become_non_medication(self):
        row = dict(code='7798008191792', gtin14='07798008191792', source='public_farmalife',
                   name='Producto', brand='Laboratorio', fingerprint='one', presentation='')
        inventory = [dict(row, category='Medicamentos de Venta Libre')]
        reviewed = annotate_type_reviews([row], inventory)
        result = canonical_records(reviewed)[0]['payload']
        self.assertIsNone(result['isMedication'])
        self.assertTrue(result['type_review_reason'])
        self.assertNotIn('type_review_reason', row)

    def test_no_brand_propagation_no_invalid_code_no_odbl_enrichment(self):
        row = dict(code='7798008191792', gtin14='07798008191792', source='public_farmalife', brand='Haleon')
        other = dict(row, code='7794640170850', category='Medicamentos')
        self.assertNotIn('type_review_reason', annotate_type_reviews([row], [other])[0])
        invalid = dict(row, code='7798008191793', category='Medicamentos')
        self.assertNotIn('type_review_reason', annotate_type_reviews([row], [invalid])[0])
        beauty = dict(row, source='openbeauty')
        self.assertNotIn('type_review_reason', annotate_type_reviews([beauty], [dict(row, category='Medicamentos')])[0])
