import contextlib
import csv
import io
import json
import pathlib
import sqlite3
import tempfile
import unittest

from build_directory import build, conflicts
from directory_rules import classify_product, quantity_signature
from scan_directory import FIELDS, scan


class DirectoryTest(unittest.TestCase):
    def test_scope_abbreviations_and_special_nutrition(self):
        for name in ["SH Pantene 400 ml", "ACOND Sedal", "DESOD Rexona", "Cereal infantil de arroz", "Leche Nutrilon etapa 1", "Tintura capilar Issue", "Pañales adultos", "APOSITOS DE TELA CURITAS"]:
            self.assertEqual(classify_product(name)[0], "candidate", name)
        self.assertEqual(classify_product("Tintura capilar Issue")[1], "Tinturas y coloración")
        for name in ["Arroz blanco", "Jabón para lavar ropa", "Ibuprofeno comprimidos", "Desodorante ambientes", "Perfume para perros", "AIRE ACOND BGH", "LAMPARA SOLAR", "MANTEL GASA", "SHAMPOO SILICONADO", "JABON EN POLVO", "TABLETA CHOCO LINDT EXCELLENCE"]:
            self.assertEqual(classify_product(name)[0], "discard", name)
        self.assertEqual(classify_product("Pantene", "Pantene")[0], "review")

    def test_conflicting_whole_rows_and_equivalent_units(self):
        self.assertEqual(quantity_signature("Champú 1 lt", "", ""), quantity_signature("Champú 1000 ml", "", ""))
        rows = [{"name": "Champú 400 ml", "brand": "Pantene"}, {"name": "Champú 200 ml", "brand": "Pantene"}]
        self.assertIn("presentaciones_contradictorias", conflicts(rows))

    def test_full_scan_merge_latest_and_review(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            inputs, cache, baseline, output = [root / name for name in ["input", "cache", "baseline", "output"]]
            baseline.mkdir()
            (baseline / "candidates.jsonl").write_text("", encoding="utf-8")
            for date, name in [("2026-10-17", "Champú 200 ml"), ("2026-10-23", "Champú 400 ml")]:
                folder = inputs / date
                folder.mkdir(parents=True)
                with (folder / "productos.csv").open("w", encoding="cp1252", newline="") as target:
                    writer = csv.writer(target, delimiter=";")
                    writer.writerow(FIELDS)
                    writer.writerows([["7500435211895", name, "Pantene", "1", "un", "1"]] * 3)
                    writer.writerow(["7500435211895", "Desodorante ambientes", "", "1", "un", "1"])
                    writer.writerow(["", "Champú sin código", "", "1", "un", "1"])
                    writer.writerow(["7500435211896", "Champú código inválido", "", "1", "un", "1"])
            with contextlib.redirect_stdout(io.StringIO()):
                scan(inputs, cache)
                build(cache, baseline, output)
            summary = json.loads((output / "report.json").read_text(encoding="utf-8"))["directory_summary"]
            self.assertEqual(summary["rows_read"], 12)
            self.assertEqual(summary["invalid_gtin_rows"], 4)
            self.assertEqual(summary["identical_duplicate_rows"], 4)
            self.assertEqual(summary["combined_codes"], 1)
            self.assertEqual(summary["main_conflict_codes"], 1)
            with (output / "CATALOGO_JUNCOS_REVISION.csv").open(encoding="utf-8-sig", newline="") as stream:
                self.assertIn("otra_descripcion_mismo_gtin_revisar:", next(csv.DictReader(stream))["motivo_revision"])
            with contextlib.closing(sqlite3.connect(output / "CATALOGO_JUNCOS_FARMACIA.sqlite")) as db:
                self.assertEqual(db.execute("select nombre, fecha_fuente, estado from productos").fetchone(), ("Champú 400 ml", "2026-10-23", "revision"))
                self.assertEqual(db.execute("select count(*) from evidencias").fetchone()[0], 2)


if __name__ == "__main__":
    unittest.main()
