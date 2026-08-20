ALTER TABLE public.purchase_history ADD COLUMN brand text;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_history TO authenticated;
GRANT ALL ON public.purchase_history TO service_role;
