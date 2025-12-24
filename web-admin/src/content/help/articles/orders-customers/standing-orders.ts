import type { HelpArticle } from '../../types';

export const standingOrdersArticle: HelpArticle = {
  slug: 'standing-orders',
  title: 'Managing Standing Orders',
  description: 'Set up recurring orders for your regular customers',
  category: 'orders-customers',
  tags: ['orders', 'recurring', 'subscriptions', 'customers'],
  order: 1,
  content: `
# Managing Standing Orders

Standing orders are recurring orders that automatically repeat on a schedule. They're perfect for restaurants, grocery stores, or any customer with regular needs.

## What Are Standing Orders?

A standing order is a recurring delivery commitment. For example:
- "10 trays of Pea Shoots every Monday"
- "5 trays of Sunflower and 5 trays of Radish every Wednesday and Friday"

## Creating a Standing Order

1. Navigate to **Standing Orders** in the sidebar
2. Click **+ New Standing Order**
3. Select the **customer**
4. Add the **products** and quantities
5. Set the **delivery schedule**:
   - Select days of the week
   - Choose start date
   - Optionally set an end date
6. Click **Save**

## Delivery Schedule Options

- **Weekly** - Same day(s) every week
- **Bi-weekly** - Every other week
- **Monthly** - Same day each month

## Managing Existing Orders

### Pause an Order
If a customer needs to temporarily stop deliveries:
1. Find the order in the list
2. Click the **Pause** button
3. Select a resume date (optional)

### Modify Quantities
To change quantities for future deliveries:
1. Click on the standing order
2. Edit the product quantities
3. Changes apply to all future deliveries

### Cancel an Order
To permanently stop a standing order:
1. Click the order
2. Select **Cancel Order**
3. Confirm cancellation

## How Standing Orders Appear in Daily Flow

Standing orders automatically generate tasks in your Daily Flow:
- **Harvest tasks** are created for the appropriate date
- **Delivery tasks** appear on the delivery day
- You'll see what needs to be packed and where it's going

## Tips

- Set up standing orders early in your planning
- Review standings orders monthly with customers
- Use notes to track special handling instructions
`,
};
