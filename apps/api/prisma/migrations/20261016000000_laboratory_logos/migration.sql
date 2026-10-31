ALTER TABLE "Laboratory" ADD COLUMN "logo" BYTEA,
ADD COLUMN "logoUpdatedAt" TIMESTAMPTZ(6);
ALTER TABLE "Laboratory" ADD CONSTRAINT "Laboratory_logo_size"
CHECK ("logo" IS NULL OR octet_length("logo") <= 61440);
