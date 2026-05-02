-- Tabela de apelidos para fornecedores
CREATE TABLE public.supplier_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  cnpj TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);

CREATE UNIQUE INDEX supplier_aliases_alias_norm_unique ON public.supplier_aliases (alias_normalized);
CREATE INDEX supplier_aliases_cnpj_idx ON public.supplier_aliases (cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX supplier_aliases_supplier_idx ON public.supplier_aliases (supplier_id);

ALTER TABLE public.supplier_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Estoque can manage supplier aliases"
ON public.supplier_aliases FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'estoque'::app_role));

CREATE POLICY "Staff can view supplier aliases"
ON public.supplier_aliases FOR SELECT
USING (is_staff(auth.uid()));

-- Estender pending_whatsapp_purchases para suporte multi-item
ALTER TABLE public.pending_whatsapp_purchases
  ADD COLUMN IF NOT EXISTS items JSONB,
  ADD COLUMN IF NOT EXISTS current_item_index INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS detected_supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS detected_supplier_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'text';

ALTER TABLE public.pending_whatsapp_purchases
  ALTER COLUMN product_id DROP NOT NULL,
  ALTER COLUMN quantity DROP NOT NULL,
  ALTER COLUMN total_price DROP NOT NULL,
  ALTER COLUMN unit DROP NOT NULL;

ALTER TABLE public.pending_whatsapp_purchases
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 minutes');

-- RLS para pending (estava sem policies)
ALTER TABLE public.pending_whatsapp_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view pending purchases" ON public.pending_whatsapp_purchases;
CREATE POLICY "Staff can view pending purchases"
ON public.pending_whatsapp_purchases FOR SELECT
USING (is_staff(auth.uid()));