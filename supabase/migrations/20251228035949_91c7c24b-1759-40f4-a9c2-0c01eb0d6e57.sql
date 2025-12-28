-- Add rejection_reason to orders table for kitchen to reject with message
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Add payment_method to orders for payment tracking
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text;

-- Add paid_at timestamp
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;

-- Add confirmed_at, preparing_at, ready_at for tracking times
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS confirmed_at timestamp with time zone;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS preparing_at timestamp with time zone;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_at timestamp with time zone;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at timestamp with time zone;

-- Create function to deduct stock when order is delivered
CREATE OR REPLACE FUNCTION public.deduct_stock_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_record RECORD;
  recipe_item_record RECORD;
BEGIN
  -- Only process when status changes to 'delivered'
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
    -- Loop through all order items
    FOR item_record IN 
      SELECT oi.*, mi.recipe_id 
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE oi.order_id = NEW.id
    LOOP
      -- Loop through recipe items and deduct from stock
      FOR recipe_item_record IN
        SELECT ri.product_id, ri.quantity, ri.unit
        FROM recipe_items ri
        WHERE ri.recipe_id = item_record.recipe_id
        AND ri.product_id IS NOT NULL
      LOOP
        -- Deduct quantity * order_quantity from product
        UPDATE products
        SET current_quantity = current_quantity - (recipe_item_record.quantity * item_record.quantity)
        WHERE id = recipe_item_record.product_id;
        
        -- Create stock movement record
        INSERT INTO stock_movements (
          product_id, 
          movement_type, 
          quantity, 
          reference_type, 
          reference_id, 
          notes
        ) VALUES (
          recipe_item_record.product_id,
          'saida',
          recipe_item_record.quantity * item_record.quantity,
          'pedido',
          NEW.id,
          'Pedido #' || NEW.order_number || ' entregue'
        );
      END LOOP;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for stock deduction
DROP TRIGGER IF EXISTS trigger_deduct_stock_on_delivery ON orders;
CREATE TRIGGER trigger_deduct_stock_on_delivery
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.deduct_stock_on_delivery();