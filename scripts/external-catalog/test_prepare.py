import json
import pathlib
import tempfile
import unittest
from prepare import Importer

class ImportTest(unittest.TestCase):
    def test_duplicates_and_conflicts_keep_whole_source_records(self):
        with tempfile.TemporaryDirectory() as directory:
            importer = Importer(pathlib.Path(directory))
            importer.row("sepa", "7500435211895", "Shampoo Pantene 750 ml", "Pantene", presentation="750 ml", flag="1", count=12)
            importer.row("sepa", "07500435211895", "Shampoo Pantene 750 ml", "Pantene", presentation="750 ml", flag="1")
            importer.row("sepa", "7500435211895", "Shampoo otra descripcion", "Otra marca", presentation="200 ml", flag="1")
            self.assertEqual(len(importer.entries), 2)
            self.assertEqual(importer.stats["sepa"]["duplicate_rows"], 12)
            self.assertEqual({r["presentation"] for r in importer.entries.values()}, {"750 ml", "200 ml"})
            importer.rejected.close()

    def test_rejects_unknown_flag_and_keeps_beauty_argentina_only(self):
        with tempfile.TemporaryDirectory() as directory:
            importer = Importer(pathlib.Path(directory))
            importer.row("sepa", "7500435211895", "Shampoo", flag="")
            importer.row("openbeauty", "7500435211895", "Shampoo", evidence="en:france")
            self.assertEqual(len(importer.entries), 0)
            importer.rejected.close()
            rejected = [json.loads(line) for line in (pathlib.Path(directory) / "rejected.jsonl").read_text().splitlines()]
            self.assertEqual([r["reason"] for r in rejected], ["not_explicitly_ean", "not_argentina"])

if __name__ == "__main__": unittest.main()
