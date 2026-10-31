ALTER TABLE "Category" ADD COLUMN "icon" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "Category" ADD CONSTRAINT "Category_icon_allowed" CHECK ("icon" IN ('auto', 'tag', 'pill', 'sparkles', 'shield', 'bag', 'spray', 'heart', 'box'));
