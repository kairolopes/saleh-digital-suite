-- Allow anyone to view recipes that are linked to available menu items
CREATE POLICY "Anyone can view menu recipes"
ON public.recipes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.menu_items
    WHERE menu_items.recipe_id = recipes.id
    AND menu_items.is_available = true
  )
);

-- Allow anyone to view restaurant settings (name, logo, etc.)
CREATE POLICY "Anyone can view restaurant settings"
ON public.restaurant_settings FOR SELECT
USING (true);