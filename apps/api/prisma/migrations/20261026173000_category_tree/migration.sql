ALTER TABLE "Category" ADD COLUMN "parentId" UUID;
CREATE UNIQUE INDEX "Category_id_organizationId_key" ON "Category"("id", "organizationId");
ALTER TABLE "Category" ADD CONSTRAINT "Category_parent_tenant_fkey"
 FOREIGN KEY ("parentId", "organizationId") REFERENCES "Category"("id", "organizationId") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "Category" ADD CONSTRAINT "Category_not_own_parent" CHECK ("parentId" IS DISTINCT FROM "id");
DROP INDEX "Category_organizationId_name_key";
CREATE UNIQUE INDEX "Category_root_name_key" ON "Category" ("organizationId", lower(btrim("name"))) WHERE "parentId" IS NULL;
CREATE UNIQUE INDEX "Category_child_name_key" ON "Category" ("organizationId", "parentId", lower(btrim("name"))) WHERE "parentId" IS NOT NULL;
CREATE INDEX "Category_organizationId_parentId_idx" ON "Category" ("organizationId", "parentId");
