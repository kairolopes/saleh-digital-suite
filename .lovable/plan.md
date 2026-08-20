---
title: Add Brand Support to Purchase Flow
description: Implement brand tracking in purchases both in the dashboard and WhatsApp integration.
---

# Plan: Add Brand Support to Purchase Flow

The user wants to be able to specify and track the brand of products during the purchase process, since this is already available in the product registration but missing in the purchase registration.

## Proposed Changes

### Database
- Already added `brand` column to `public.purchase_history` via migration.

### Frontend (Dashboard)
- **`src/pages/Compras.tsx`**:
    - Add a "Marca" field to the "Nova Compra" dialog.
    - Update the validation schema to include brand.
    - Display the brand in the "Histórico de Compras" table.
    - Automatically populate the brand field when a product is selected if that product has a default brand.

### WhatsApp Integration (Edge Function)
- **`supabase/functions/webhook-zapi-purchase/index.ts`**:
    - Update `ParsedItem` and `ResolvedItem` types to include `brand`.
    - Modify the AI prompt for both text and media parsing to extract the brand/make of the product (e.g., "Mussarela Cenaggio" -> product: Mussarela, brand: Cenaggio).
    - Update the batch preview message to display the brand.
    - Ensure the `brand` is saved to `purchase_history` when the purchase is confirmed.

## Technical Details

### Dashboard Edits
- Add a new input field for `brand` in the `formData`.
- Update the `createMutation` to include the `brand` field in the `insert` call.
- Modify the `Table` to add a "Marca" column.

### WhatsApp Webhook Edits
- Update `register_purchase_batch` tool definition to include `marca` in `itens`.
- Update `resolveItems` to potentially extract brand from product names if they follow the "Name BRAND" pattern established in previous tasks.
- Modify `buildBatchPreview` to show the brand next to the product name.
- Update the final insertion logic in the confirmation step to include the `brand` column.

## User Review Required

> [!NOTE]
> When the AI detects a brand in a WhatsApp message (like "20kg mussarela cenaggio"), it will now try to separate "Mussarela" as the product and "Cenaggio" as the brand.
