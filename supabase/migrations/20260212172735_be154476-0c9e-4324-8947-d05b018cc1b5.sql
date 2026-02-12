
CREATE TABLE public.pending_whatsapp_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  message_original TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes')
);

ALTER TABLE public.pending_whatsapp_purchases ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_pending_purchases_phone ON public.pending_whatsapp_purchases(phone);
CREATE INDEX idx_pending_purchases_expires ON public.pending_whatsapp_purchases(expires_at);
