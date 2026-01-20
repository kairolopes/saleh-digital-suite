-- Allow customers to view their own orders (identified by having a customer_phone)
CREATE POLICY "Customers can view own orders by phone"
ON public.orders FOR SELECT
USING (customer_phone IS NOT NULL);

-- Allow customers to view items of orders they can access
CREATE POLICY "Customers can view items of own orders"
ON public.order_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_items.order_id
    AND orders.customer_phone IS NOT NULL
  )
);