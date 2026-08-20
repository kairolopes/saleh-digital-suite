INSERT INTO public.product_categories (name, color, display_order) VALUES 
('Laticínios', '#9b87f5', 11),
('Feijão', '#8e9196', 12),
('Leguminosas', '#7e69ab', 13);
GRANT ALL ON public.product_categories TO authenticated, service_role;
GRANT SELECT ON public.product_categories TO anon;