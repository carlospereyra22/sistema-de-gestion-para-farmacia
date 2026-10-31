import unittest
from catalog_normalization import canonical_records
from retail_metadata import deepest, clean


class MetadataTests(unittest.TestCase):
    def row(self, source='sepa', **kwargs):
        return dict(code='070330731806',gtin14='00070330731806',name='BIC Soleil x1',brand='',source=source,fingerprint=source,source_ref='https://example.test/product',**kwargs)

    def test_explicit_hierarchy_preserves_non_prefix_branches(self):
        self.assertEqual(deepest([['Cuidado personal'],['Cuidado personal','Cabello'],['Maquillaje','Accesorios']]),[['Cuidado personal','Cabello'],['Maquillaje','Accesorios']])

    def test_missing_attributes_use_exact_evidence_and_provenance(self):
        first=self.row('excel270')
        second=self.row('public_farmaplus',category_path=['Cuidado personal','Afeitado'])
        second['brand']='BIC'
        result=canonical_records([first,second])[0]['payload']
        self.assertEqual(result['brand'],'BIC')
        self.assertEqual(result['category_path'],['Cuidado personal','Afeitado'])
        self.assertEqual(result['attribute_sources']['brand']['source'],'public_farmaplus')
        self.assertEqual(first['brand'],'')

    def test_no_enrichment_across_conflicts_or_odbl(self):
        first=self.row('excel270',review_reason='presentaciones_contradictorias')
        second=self.row('public_farmaplus',category_path=['Cuidado personal','Afeitado'])
        second['brand']='BIC'
        self.assertEqual(canonical_records([first,second])[0]['payload']['brand'],'')
        beauty=self.row('openbeauty');beauty['brand']='BIC'
        own=[r for r in canonical_records([self.row('excel270'),beauty]) if not r['beauty']][0]
        self.assertEqual(own['payload']['brand'],'')

    def test_encoding_and_html_entities_are_not_new_product_facts(self):
        self.assertEqual(clean('DermocosmÃ©tica'),'Dermocosmética')
        self.assertEqual(clean('  Higiene &amp; cuidado  '),'Higiene & cuidado')
