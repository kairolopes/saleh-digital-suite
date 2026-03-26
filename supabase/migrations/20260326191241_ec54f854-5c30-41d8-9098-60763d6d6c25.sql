
-- Create product_categories table
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text DEFAULT '#6b7280',
  display_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Staff can view product categories" ON public.product_categories
  FOR SELECT TO public USING (is_staff(auth.uid()));

CREATE POLICY "Admin/Estoque can manage product categories" ON public.product_categories
  FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'estoque'::app_role));

-- Add category_id to products
ALTER TABLE public.products ADD COLUMN category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL;

-- Insert default categories
INSERT INTO public.product_categories (name, color, display_order) VALUES
  ('Carnes', '#ef4444', 1),
  ('Laticínios', '#f59e0b', 2),
  ('Hortifruti', '#22c55e', 3),
  ('Grãos e Cereais', '#a16207', 4),
  ('Bebidas', '#3b82f6', 5),
  ('Temperos e Condimentos', '#8b5cf6', 6),
  ('Óleos e Gorduras', '#f97316', 7),
  ('Embalagens e Descartáveis', '#6b7280', 8),
  ('Limpeza e Higiene', '#06b6d4', 9),
  ('Outros', '#9ca3af', 10);
