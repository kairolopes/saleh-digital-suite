BEGIN;

-- 1. Transactions/History
TRUNCATE public.order_items CASCADE;
TRUNCATE public.orders CASCADE;
TRUNCATE public.stock_movements CASCADE;
TRUNCATE public.purchase_history CASCADE;
TRUNCATE public.financial_entries CASCADE;
TRUNCATE public.pending_whatsapp_purchases CASCADE;
TRUNCATE public.audit_logs CASCADE;
TRUNCATE public.notifications CASCADE;

-- 2. Feedback/Customer Service
TRUNCATE public.complaints CASCADE;
TRUNCATE public.customer_questions CASCADE;
TRUNCATE public.ratings CASCADE;
TRUNCATE public.suggestions CASCADE;
TRUNCATE public.reservations CASCADE;

-- 3. Operational Data (Recipes/Menu)
TRUNCATE public.menu_items CASCADE;
TRUNCATE public.recipe_items CASCADE;
TRUNCATE public.recipes CASCADE;

-- 4. Core Catalog
TRUNCATE public.supplier_aliases CASCADE;
TRUNCATE public.products CASCADE;
TRUNCATE public.suppliers CASCADE;
TRUNCATE public.product_categories CASCADE;

COMMIT;