---
title: Data Reset Plan
description: Wipe all business data (stock, purchases, suppliers, recipes, menu, finance, orders) for a fresh system start.
---

# Data Reset Plan

The user wants to completely reset the system data ("zere o estoque, compras, fornecedores, ficha técnica, cardápio, financeiro, tudo") to start fresh.

## Proposed Changes

### Database Reset
I will create a single migration to truncate all business-related tables. This will be performed in a specific order to respect foreign key constraints.

**Tables to be cleared:**
1.  `order_items` (linked to `orders` and `menu_items`)
2.  `orders` (linked to `stock_movements`, `financial_entries`)
3.  `stock_movements` (linked to `products`)
4.  `purchase_history` (linked to `products`, `suppliers`)
5.  `financial_entries` (linked to `orders`, etc.)
6.  `recipe_items` (linked to `recipes`, `products`)
7.  `menu_items` (linked to `recipes`)
8.  `recipes`
9.  `pending_whatsapp_purchases`
10. `products`
11. `suppliers`
12. `product_categories`
13. `audit_logs`
14. `complaints`
15. `customer_questions`
16. `notifications`
17. `ratings`
18. `reservations`
19. `suggestions`

**Tables to preserve:**
- `profiles` and `user_roles` (to maintain user access)
- `restaurant_settings` (to keep the business name, logo, etc., unless the user wants a full factory reset including branding)

### Frontend Cleanup
- I will remove the placeholder text from the element the user selected in the preview.

## Technical Details

### SQL Execution Order
```sql
-- Disable triggers/FKs temporarily if needed, or truncate in reverse dependency order
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
TRUNCATE public.products CASCADE;
TRUNCATE public.suppliers CASCADE;
TRUNCATE public.product_categories CASCADE;

COMMIT;
```

## User Review Required
> [!IMPORTANT]
> This action is irreversible. All history, stock levels, recipes, and financial records will be deleted. Are you sure you want to proceed with the total wipe?
