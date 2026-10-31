import unittest
from directory_rules import classify_product


class CoverageTest(unittest.TestCase):
    def test_source_abbreviations_recover_personal_products(self):
        for name, brand in [
            ("ANTIT.REXONA MEN X150ML INVISIBLE", ""),
            ("DEO DOVE +ALL BODY", "DOVE"),
            ("CREMA CORP.REPARA.P/PIEL ASPE. Y EXT.SECA NIVEA BOT 400 ML", "NIVEA"),
            ("CR NIVEA Q10 COLLAGEN", "NIVEA"),
            ("CR DENT ODOL DOBLE ACCI", "ODOL"),
            ("FECULA JOHNSON BABY ORIGINAL ROSA X 200 GR", "Johnson Baby"),
            ("ESPONJA D/BAÑO LOOFAH C/SOGA BASICARE BLI 1 UNI", "BASICARE"),
            ("LIMPIADOR CERAVE ESPUMOSO", "CERAVE"),
            ("AC RITUAL REPARAC COCO DP", "DOVE"),
            ("CORTAUÑAS GRANDE", "JESSAMY"),
            ("pañales PAMPERS premium care med 72u PET-72-un.", "PAMPERS"),
            ("PRESERV. PRIME X 12 SUPERFINO", "PRIME"),
            ("ANTITR.CREMA CLEAN REXONA BAR 58 ML", "REXONA"),
        ]:
            self.assertEqual(classify_product(name, brand)[0], "candidate", name)

    def test_brand_does_not_approve_food_household_or_unknown_type(self):
        for name, brand in [
            ("LIMPIADOR MULTISUPERFICIES FLORAL", "BLEM"),
            ("ACEITE DE OLIVA", "COCINERO"),
            ("FECULA DE MAIZ", "MAIZENA"),
            ("LIMA FRUTA FRESCA", ""),
            ("AC AIRE ACOND 3000W", ""),
            ("BOLSA ALGODON", ""),
            ("NIVEA", "NIVEA"),
            ("SHAMPOO PET'S CLASS", "PET'S CLASS"),
            ("DEO LYSOFORM AIRE DE MONT", "LYSOFORM"),
            ("CHOCOLATE C/LECHE CREMOSO Y SUAVE", "NESTLE"),
            ("DEO MULTIMAX LAVANDA", "MULTIMAX"),
            ("ALICATE CORTE AISLADO CARREFOUR", "CARREFOUR"),
            ("CEPILLO DE BAÑO C/DEPOSITO", "TRASH"),
        ]:
            self.assertNotEqual(classify_product(name, brand)[0], "candidate", name)


if __name__ == "__main__":
    unittest.main()
