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
