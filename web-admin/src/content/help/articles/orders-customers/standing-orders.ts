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
3. Enter an **order name** for easy reference
4. Select the **customer**
5. Choose the **frequency**: Weekly or Bi-weekly
6. Select **delivery days** (Monday through Sunday)
7. Set a **start date**
8. Optionally set an **end date**
9. Add **order items** — select products with specific variants and quantities
10. Add any **notes** for special instructions
11. Click **Save**

## Delivery Schedule Options

- **Weekly** — Delivers on the selected day(s) every week
- **Bi-weekly** — Delivers on the selected day(s) every other week

## Managing Existing Orders

### Search and Browse
Use the search bar to find orders by name or customer. Active orders show a green "Active" badge; inactive orders show a gray "Inactive" badge.

### Edit an Order
Click the edit button on any standing order to modify:
- Order name, customer, frequency, delivery days
- Start/end dates and notes
- Add or remove product items and adjust quantities

### Deactivate an Order
To stop a standing order, delete it from the list. This sets the order to inactive — it won't generate future tasks.

## How Standing Orders Drive Scheduling

Standing orders are the foundation of your planting schedule. The system automatically:
- Calculates when to seed based on delivery dates and recipe grow times
- Generates seeding tasks in your Daily Flow
- Creates harvest and delivery tasks on the appropriate dates

## Tips

- Set up standing orders early so the planting schedule can plan ahead
- Review orders regularly with customers to keep quantities accurate
- Use notes to track special handling or packaging instructions
- Search by customer name to quickly find all their orders
`,
};
