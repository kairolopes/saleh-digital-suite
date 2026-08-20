---
title: Multi-brand Price History Chart
description: Update the price history chart to show multiple lines, one for each brand of the selected product, to allow price comparison.
---

# Plan: Multi-brand Price History Chart

The user wants the price history chart to show separate lines for each brand of a selected product. This allows them to compare prices between different brands over time.

## Proposed Changes

### Frontend
- **`src/pages/HistoricoPrecos.tsx`**:
    - Update the `priceHistory` query to fetch the `brand` column from `purchase_history`.
    - Group the price history data by brand and purchase date.
    - Transform the chart data so that it contains prices for each brand at each date point.
    - Update the `ResponsiveContainer` and `AreaChart` (or switch to `LineChart`) to render multiple lines/areas, one for each brand.
    - Assign distinctive colors to each brand's line.
    - Update the `Tooltip` to show prices for all brands present on a specific date.
    - Add a legend to the chart to identify the brands.
    - Update the "Detalhes das Compras" table to include the `brand` column.

## Technical Details

### Data Transformation
The current `chartData` is a flat array of purchases. I need to:
1. Identify all unique brands present in the `priceHistory`.
2. Map the data so that each entry represents a date and has keys for each brand's price (e.g., `{ date: '01/01', brandA: 10, brandB: 12 }`).
3. Handle cases where a brand doesn't have a purchase on a specific date (null/undefined).

### UI Implementation
- Use a predefined list of colors for the different lines.
- Switch from `AreaChart` to `LineChart` if there are many brands to avoid overlap confusion, or keep `AreaChart` with low opacity.
- Add `<Legend />` component from Recharts.
- Dynamically generate `<Line />` components based on the unique brands found.

## User Review Required
> [!NOTE]
> The chart will now show one line per brand. If a product has many brands, the chart might become crowded.
