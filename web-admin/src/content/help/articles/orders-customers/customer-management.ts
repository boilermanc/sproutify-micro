import type { HelpArticle } from '../../types';

export const customerManagementArticle: HelpArticle = {
  slug: 'customer-management',
  title: 'Customer Management',
  description: 'Add, edit, and organize your customer information',
  category: 'orders-customers',
  tags: ['customers', 'contacts', 'organization'],
  order: 2,
  content: `
# Customer Management

Keep all your customer information organized in one place. Track contact details, delivery preferences, and order history.

## Adding a New Customer

1. Go to **Customers** in the sidebar
2. Click **+ Add Customer**
3. Fill in the customer details:
   - **Name** - Business or individual name
   - **Contact** - Primary contact person
   - **Email** - For invoices and communication
   - **Phone** - For delivery coordination
   - **Address** - Delivery location
4. Add any notes (delivery instructions, preferences)
5. Click **Save**

## Customer Types

Organize customers by type:
- **Restaurant** - Chefs and food service
- **Retail** - Grocery stores and markets
- **Wholesale** - Distributors
- **Direct** - Individual consumers
- **Farmers Market** - Market booth sales

## Editing Customer Information

1. Click on the customer name in the list
2. Update any fields
3. Save changes

All historical orders remain linked to the customer.

## Customer Order History

View a complete history of orders for any customer:
1. Click on the customer
2. Scroll to **Order History**
3. See past orders, deliveries, and totals

## Delivery Preferences

Store important delivery information:
- Preferred delivery times
- Loading dock or entrance instructions
- Contact person for deliveries
- Special handling requirements

## Tips

- Keep contact information current
- Add notes for anything the delivery driver needs to know
- Review inactive customers periodically
`,
};
