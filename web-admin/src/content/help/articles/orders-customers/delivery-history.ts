import type { HelpArticle } from '../../types';

export const deliveryHistoryArticle: HelpArticle = {
  slug: 'delivery-history',
  title: 'Delivery History',
  description: 'View and analyze past deliveries',
  category: 'orders-customers',
  tags: ['deliveries', 'history', 'orders', 'tracking'],
  order: 3,
  content: `
# Delivery History

The Delivery History tab on the Orders page gives you a complete record of all past deliveries, with powerful filtering and sorting options.

## Accessing Delivery History

1. Go to **Orders** in the sidebar
2. Click the **Delivery History** tab

## Viewing Deliveries

Each delivery record shows:
- **Date** — When the delivery was made
- **Customer** — Who received it
- **Recipe/Product** — What was delivered
- **Trays** — Number of trays included
- **Yield** — Total weight delivered
- **Unit Price** — Price per unit
- **Total** — Total value of the delivery

## Filtering by Date Range

Use the date range presets to quickly filter deliveries:
- **Last 7 days**
- **Last 30 days**
- **Last 90 days**
- **This month**
- **This year**
- **Custom range** — Set your own start and end dates

## Sorting Deliveries

Click any column header to sort by that field:
- Date (newest/oldest)
- Customer (alphabetical)
- Trays (most/fewest)
- Yield (highest/lowest)
- Amount (highest/lowest)

## Customer Grouping

Deliveries can be viewed in collapsible groups by customer and date, making it easy to see all deliveries for a specific customer or a specific delivery run.

## Tips

- Use the date range filters to review delivery patterns over time
- Sort by amount to identify your highest-value deliveries
- Check delivery history when discussing order quantities with customers
- Export delivery data for accounting via the Reports page
`,
};
