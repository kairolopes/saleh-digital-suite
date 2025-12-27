-- Corrigir search_path mutable nas funções
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.update_stock_after_purchase() SET search_path = public;