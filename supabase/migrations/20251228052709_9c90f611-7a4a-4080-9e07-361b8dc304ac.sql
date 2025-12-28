-- Add cancelled_by column to track who cancelled the order
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id);

-- Add cancelled_at column to track when the order was cancelled
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;