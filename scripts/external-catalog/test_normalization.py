import unittest
from catalog_normalization import canonical_brand, canonical_records
from directory_rules import classify_product
from build_directory import conflicts
from rules import normalized, gtin_error


class NormalizationTests(unittest.TestCase):
    def test_barcode_aliases_and_brand(self):
        self.assertIsNone(gtin_error('070330731806'))
        self.assertEqual('070330731806'.zfill(14), '0070330731806'.zfill(14))
        self.assertEqual(canonical_brand('BIC ARGENTINA S.A.'), 'BIC')
        self.assertNotEqual(canonical_brand('UNILEVER'), canonical_brand('DOVE'))

    def test_originals_and_conflicts_survive_single_record(self):
        base = dict(code='070330717534',gtin14='00070330717534',name='BIC COMFORT3 NORM X1',brand='BIC',source='sepa',fingerprint='a',quantity='1',unit='EA',presentation='1 EA')
        alias = dict(base,brand='BIC ARGENTINA S.A.',name='MAQ.AFEITA BIC COMFORT AC.NORMAL 1un',unit='uni.',fingerprint='b')
        self.assertEqual(conflicts([base,alias]), '')
        result=canonical_records([base,alias])
        self.assertEqual(len(result),1)
        self.assertEqual(len(result[0]['evidence']),2)
        self.assertEqual(alias['brand'],'BIC ARGENTINA S.A.')
        different=dict(base,source='openbeauty',review_reason='presentaciones_contradictorias')
        self.assertEqual(len(canonical_records([base,different])),2)
        result=canonical_records([base,dict(alias,review_reason='presentaciones_contradictorias')])[0]
        self.assertIn('presentaciones_contradictorias',result['payload']['review_reason'])

    def test_observed_shorthand(self):
        for name,brand in [('BIC SOLEIL X1','BIC'),('AF BIC COMF3 SENSITIVE','BIC'),('NOSOTRAS PD NOR X160','NOSOTRAS'),('ALGABO GEL BRI C 150','ALGABO'),('AC JOHNSON ORIGINAL','JOHNSONS'),('REXONA FEM AER INVIS','REXONA'),('Desod Pvo Veritas Pedico x 180Gr','VERITAS')]:
            self.assertEqual(classify_product(name,brand)[0],'candidate', name)

    def test_out_of_scope_and_real_conflicts_remain(self):
        for name,brand in [('SOY PUPI COLITAS','GUADAL'),('BIC ENCENDEDOR MAXI 1U','BIC'),('BIC BOLIGRAFO CRISTAL','BIC'),('ACONDICIONADOR PISOS CLASICO','ECHO'),('PERFUME P/TELAS ALGABO','ALGABO'),('IBUPROFENO 400 COMPRIMIDOS','')]:
            self.assertNotEqual(classify_product(name,brand)[0],'candidate',name)
        rows=[dict(name='Gel 150 g',brand='ALGABO'),dict(name='Gel 500 g',brand='ALGABO')]
        self.assertIn('presentaciones_contradictorias',conflicts(rows))

    def test_mojibake_is_normalized_without_rewriting_original(self):
        original='JabÃ³n NIVEA avena'
        self.assertEqual(normalized(original),'jabon nivea avena')
        self.assertEqual(original,'JabÃ³n NIVEA avena')
