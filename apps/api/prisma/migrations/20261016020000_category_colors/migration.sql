ALTER TABLE "Category" ADD COLUMN "color" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "Category" ADD CONSTRAINT "Category_color_allowed" CHECK ("color" IN ('auto', 'teal', 'blue', 'violet', 'rose', 'amber', 'emerald', 'slate'));
