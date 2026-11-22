import unittest

from retail_prepare import retail_scope


class RetailScopeTest(unittest.TestCase):
    def test_feminine_fragrance_is_not_intimate_hygiene(self):
        status, group, subcategory, reason = retail_scope(
            'Benetton Colors Unlimited For Her Edt 80Ml',
            'BENETTON',
            '/Fragancias/Semiselectivas/Femeninas/',
            full_catalog=True,
        )
        self.assertEqual((status, group, subcategory, reason),
                         ('candidate', 'Perfumería', 'Fragancias', ''))


    def test_suplementos_con_las_categorias_nuevas_de_farmamix(self):
        for name, category in [
            ('Redoxon Suplemento Dietario A Base De Vitaminas (10 Comprimidos)',
             'Nutrición & Deporte / Nutrición Funcional / Nutrientes Esenciales'),
            ('Geonat Magnesio 400 Mg (30 Comprimidos)', 'Nutrición & Deporte / Nutrición Funcional'),
            ('Omega 3 Natufarma 60 Cápsulas', 'Nutrición & Deporte / Nutrición Diaria / Omega 3'),
        ]:
            self.assertEqual(retail_scope(name, 'Marca', category, full_catalog=True)[:2],
                             ('candidate', 'Suplementos y nutrición'))
        self.assertEqual(retail_scope('Inmovilizador De Dedo Pulgar Y Muñeca Derecha', 'Body Care',
                                      'Bienestar y Cuidado / Soporte y Movilidad / Brazos y Muñecas',
                                      full_catalog=True)[:2], ('candidate', 'Ortopedia'))
        self.assertEqual(retail_scope('Coronet Bolsa De Agua Caliente Reforzada 1 Unidad', 'Coronet',
                                      'Bienestar y Cuidado / Accesorios de Cuidado / Bolsa para Agua Caliente',
                                      full_catalog=True)[:2], ('candidate', 'Insumos y primeros auxilios'))
        # Un principio activo medicinal en el nombre sigue mandando.
        self.assertNotEqual(retail_scope('Ibuprofeno 400 mg (10 Comprimidos)', 'Marca',
                                         'Nutrición & Deporte / Nutrición Funcional')[0], 'candidate')


if __name__ == '__main__':
    unittest.main()
