-- Complete public-source inventory, including rejected codes and out-of-scope
-- products. Separate from eligible lookup records and all commercial tables.
CREATE TABLE IF NOT EXISTS reference_catalog.source_record (
  source text NOT NULL,
  source_id text NOT NULL,
  fingerprint char(64) NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL,
  batch_id text NOT NULL REFERENCES reference_catalog.import_batch(id),
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, source_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS source_record_batch_source_idx
  ON reference_catalog.source_record (batch_id, source);

-- Exact-code fallback for medicines absent from the official barcode index.
-- Retailer records remain separate from the official medicine reference.
CREATE INDEX IF NOT EXISTS source_record_medicine_code_idx
  ON reference_catalog.source_record ((lpad(payload->>'code', 14, '0')))
  WHERE status = 'discard' AND payload->>'reason' = 'medicamento_en_categoria_fuente';

CREATE OR REPLACE VIEW reference_catalog.medicine_fallback AS
SELECT lpad(payload->>'code', 14, '0')::char(14) AS gtin14,
       source, source_id, payload, observed_at
FROM reference_catalog.source_record
WHERE status = 'discard'
  AND payload->>'reason' = 'medicamento_en_categoria_fuente'
  AND source IN ('public_farmalife', 'public_farmar', 'public_farmaplus',
                 'public_farmacorp', 'public_farmamix')
  AND payload->>'code' ~ '^[0-9]{8,14}$';
