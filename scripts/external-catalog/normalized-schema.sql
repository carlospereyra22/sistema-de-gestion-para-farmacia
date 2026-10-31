-- Additive projection; originals remain in candidate. Independent database only.
CREATE TABLE IF NOT EXISTS reference_catalog.product (
  gtin14 char(14) PRIMARY KEY CHECK (gtin14 ~ '^[0-9]{14}$'),
  payload jsonb NOT NULL,
  evidence jsonb NOT NULL,
  batch_id text NOT NULL REFERENCES reference_catalog.import_batch(id),
  eligible boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS beauty_odbl.product (
  gtin14 char(14) PRIMARY KEY CHECK (gtin14 ~ '^[0-9]{14}$'),
  payload jsonb NOT NULL,
  evidence jsonb NOT NULL,
  batch_id text NOT NULL REFERENCES reference_catalog.import_batch(id),
  eligible boolean NOT NULL DEFAULT true
);
