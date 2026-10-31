-- Independent database only. Never apply this to gestion_dev / gestion_prod.
CREATE SCHEMA IF NOT EXISTS reference_catalog;
CREATE SCHEMA IF NOT EXISTS beauty_odbl;
CREATE TABLE IF NOT EXISTS reference_catalog.import_batch (
  id text PRIMARY KEY,
  imported_at timestamptz NOT NULL DEFAULT now(),
  manifest jsonb NOT NULL,
  report jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS reference_catalog.candidate (
  source text NOT NULL,
  fingerprint text NOT NULL,
  gtin14 char(14) NOT NULL CHECK (gtin14 ~ '^[0-9]{14}$'),
  payload jsonb NOT NULL,
  batch_id text NOT NULL REFERENCES reference_catalog.import_batch(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source, fingerprint),
  CHECK (source <> 'openbeauty')
);
CREATE INDEX IF NOT EXISTS candidate_gtin ON reference_catalog.candidate(gtin14);
CREATE TABLE IF NOT EXISTS beauty_odbl.candidate (
  source text NOT NULL CHECK (source = 'openbeauty'),
  fingerprint text NOT NULL,
  gtin14 char(14) NOT NULL CHECK (gtin14 ~ '^[0-9]{14}$'),
  payload jsonb NOT NULL,
  batch_id text NOT NULL REFERENCES reference_catalog.import_batch(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source, fingerprint)
);
CREATE INDEX IF NOT EXISTS beauty_candidate_gtin ON beauty_odbl.candidate(gtin14);
ALTER TABLE reference_catalog.candidate ADD COLUMN IF NOT EXISTS eligible boolean NOT NULL DEFAULT true;
ALTER TABLE beauty_odbl.candidate ADD COLUMN IF NOT EXISTS eligible boolean NOT NULL DEFAULT true;
