import type { HelpArticle } from '../../types';

export const reportsOverviewArticle: HelpArticle = {
  slug: 'reports-overview',
  title: 'Reports Overview',
  description: 'Generate harvest, delivery, sales, and seed usage reports',
  category: 'reports',
  tags: ['reports', 'analytics', 'harvest', 'sales', 'delivery'],
  order: 1,
  content: `
# Reports Overview

The Reports page lets you generate detailed reports to analyze your farm's performance across harvests, deliveries, sales, and seed usage.

## Accessing Reports

Click **Reports** in the sidebar.

## Report Types

### Harvest Report
Shows harvest data organized by product and size:
- What was harvested and when
- Quantities and yields
- Useful for tracking production output over time

### Delivery Report
Shows deliveries organized by customer, product, and size:
- Delivery dates and quantities
- Pricing information
- Helps verify that customers received what was planned

### Sales Report
Shows revenue organized by customer and product:
- Total sales by customer
- Revenue by product and size
- Useful for understanding which products and customers drive the most revenue

### Seed Usage Report
Shows seed consumption organized by variety:
- How much seed was used over the selected period
- Helps with purchasing decisions and budget planning
- Tracks usage trends over time

## Generating a Report

1. Select the **report type** from the dropdown
2. Set the **date range** using the start and end date pickers
3. Click **Generate Report**
4. View the results inline or export/download

## Date Range Selection

Choose a start date and end date to define the reporting period. Common ranges:
- Last week or last month for operational reviews
- Last quarter for business planning
- Year-to-date for annual summaries

## Tips

- Run the Delivery Report monthly to reconcile with customer invoices
- Use the Seed Usage Report to plan bulk seed purchases
- Compare Harvest Reports across months to spot yield trends
- Export reports for your bookkeeper or accountant
`,
};
