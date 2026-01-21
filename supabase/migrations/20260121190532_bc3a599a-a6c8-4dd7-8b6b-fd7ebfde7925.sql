-- 1. Limpar movimentações de estoque
DELETE FROM public.stock_movements;

-- 2. Limpar histórico de compras
DELETE FROM public.purchase_history;

-- 3. Limpar lançamentos financeiros
DELETE FROM public.financial_entries;

-- 4. Zerar quantidades e preços dos produtos (mantendo cadastro)
UPDATE public.products SET
  current_quantity = 0,
  average_price = 0,
  last_price = 0;

-- 5. Corrigir RLS de menu_items para permitir cozinha gerenciar
DROP POLICY IF EXISTS "Admin can manage menu" ON public.menu_items;

CREATE POLICY "Admin/Cozinha can manage menu"
ON public.menu_items FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'cozinha'::app_role));