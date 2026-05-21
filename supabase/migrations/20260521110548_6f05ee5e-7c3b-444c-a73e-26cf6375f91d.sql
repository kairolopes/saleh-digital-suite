ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_visible_in_recipes BOOLEAN NOT NULL DEFAULT true;

UPDATE public.products p
SET is_visible_in_recipes = false
WHERE NOT EXISTS (
  SELECT 1 FROM public.recipe_items ri WHERE ri.product_id = p.id
);