CREATE TABLE "ProductImage" (
  "productId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "content" BYTEA NOT NULL,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("productId"),
  CONSTRAINT "ProductImage_content_size" CHECK (octet_length("content") BETWEEN 4 AND 61440),
  CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProductImage_organizationId_idx" ON "ProductImage"("organizationId");
