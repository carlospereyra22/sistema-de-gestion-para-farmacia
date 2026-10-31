ALTER TABLE "Category" DROP CONSTRAINT "Category_icon_allowed";
ALTER TABLE "Category" ADD CONSTRAINT "Category_icon_allowed" CHECK ("icon" IN ('auto', 'tag', 'pill', 'sparkles', 'shield', 'bag', 'spray', 'heart', 'box', 'baby', 'thermometer', 'bandage', 'syringe', 'stethoscope', 'first-aid', 'oral-care', 'eye', 'ear', 'drops', 'scissors', 'sun', 'leaf', 'bottle', 'flask'));
ALTER TABLE "Category" DROP CONSTRAINT "Category_color_allowed";
ALTER TABLE "Category" ADD CONSTRAINT "Category_color_allowed" CHECK ("color" IN ('auto', 'teal', 'blue', 'violet', 'rose', 'amber', 'emerald', 'slate', 'red', 'orange', 'yellow', 'lime', 'cyan', 'indigo', 'fuchsia', 'brown'));
