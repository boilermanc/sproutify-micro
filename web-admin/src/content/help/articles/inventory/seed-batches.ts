import type { HelpArticle } from '../../types';

export const seedBatchesArticle: HelpArticle = {
  slug: 'seed-batches',
  title: 'Managing Seed Batches',
  description: 'Track your seed inventory with batch management',
  category: 'inventory',
  tags: ['seeds', 'batches', 'inventory', 'stock'],
  order: 1,
  content: `
# Managing Seed Batches

The Batches page is where you manage your seed inventory. Each batch represents a quantity of seed for a specific variety, tracked from purchase through usage.

## Accessing Batches

Click **Batches** in the sidebar to open the batch management page.

## Creating a New Batch

1. Click **+ New Batch**
2. Select the **variety**
3. Enter the **quantity** and unit (grams, ounces, or pounds)
4. Optionally assign a **vendor**
5. Save the batch

## Batch Information

Each batch displays:
- **Batch ID** — Unique identifier
- **Variety** — Which seed variety
- **Quantity** — Current stock with unit
- **Stock Status** — Visual indicator of inventory level

### Stock Status Indicators
- **In Stock** — Adequate seed supply
- **Low Stock** — Below the threshold you set
- **Can't Seed** — Not enough seed for a full tray
- **Out of Stock / Depleted** — No seed remaining

## Adjusting Batch Quantities

To record changes to your seed stock:
1. Click on a batch
2. Click **Adjust Quantity**
3. Enter the adjustment amount (positive to add, negative to subtract)
4. Select a reason:
   - **Physical count** — Reconciling actual vs. recorded
   - **Spillage** — Accidental loss
   - **Quality issue** — Seeds not meeting standards
   - **Testing** — Used for germination testing
   - **Received stock** — New seed delivery
   - **Data error** — Correcting a previous mistake
5. Save the adjustment

## Low Stock Thresholds

Set a low stock threshold for each batch to get warnings when inventory runs low:
1. Edit the batch
2. Set the **low stock threshold** value
3. When stock drops below this level, the batch shows a "Low Stock" warning

## Vendor Assignment

Associate batches with vendors to track where your seeds come from. This helps with:
- Reordering from the right supplier
- Comparing quality across vendors
- Tracking purchase history

## Tips

- Record new seed deliveries immediately as batches
- Set low stock thresholds to avoid running out mid-production
- Use adjustment reasons consistently for accurate records
- Review the Seed Usage report to understand consumption patterns
`,
};
