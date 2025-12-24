import type { HelpArticle } from '../../types';

export const seedInventoryArticle: HelpArticle = {
  slug: 'seed-inventory',
  title: 'Managing Seed Inventory',
  description: 'Track your seed stock and usage',
  category: 'inventory',
  tags: ['seeds', 'inventory', 'stock', 'supplies'],
  order: 1,
  content: `
# Managing Seed Inventory

Keep track of your seed stock to ensure you always have what you need for production.

## Adding Seeds to Inventory

1. Go to **Supplies** in the sidebar
2. Click **+ Add Supply**
3. Select type: **Seeds**
4. Enter details:
   - Seed variety
   - Quantity (weight)
   - Vendor/source
   - Purchase date
   - Lot number (optional)
   - Cost

## Tracking Usage

Seed usage is tracked automatically when you:
- Record seed weight during seeding
- Log new trays with seed amounts

### Manual Adjustments
For adjustments (waste, gifts, corrections):
1. Select the seed item
2. Click **Adjust Quantity**
3. Enter the change
4. Add a reason

## Low Stock Alerts

Set up alerts to know when to reorder:
1. Edit a seed item
2. Set **Low Stock Threshold**
3. Get notified when stock falls below this level

## Seed Lot Tracking

Track seed lots for:
- Germination rate tracking
- Quality comparison
- Supplier evaluation
- Traceability

## Inventory Reports

View reports showing:
- Current stock levels
- Usage over time
- Cost analysis
- Reorder suggestions

## Best Practices

- Record all seed purchases immediately
- Note germination rates by lot
- Track usage consistently
- Review inventory weekly
- Keep safety stock of popular varieties
`,
};
