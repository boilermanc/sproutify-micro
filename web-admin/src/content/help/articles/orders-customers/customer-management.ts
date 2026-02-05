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

Keep all your customer information organized in one place. Track contact details, addresses, and delivery preferences.

## Adding a New Customer

1. Go to **Customers** in the sidebar
2. Click **+ Add Customer**
3. Fill in the customer details:
   - **Name** — Business or individual name (required)
   - **Email** — For communication
   - **Phone** — For delivery coordination
   - **Billing Address** — Street, city, state, and postal code
   - **Delivery Address** — Separate from billing if needed
4. Set **Preferred Delivery Days** — Select which days of the week work best
5. Add **Delivery Instructions** — Loading dock details, entrance info, etc.
6. Add **Payment Instructions** — Payment terms or special arrangements
7. Add any additional **Notes**
8. Click **Save**

## Editing Customer Information

1. Find the customer using the search bar or by scrolling the list
2. Click the edit icon on the customer card
3. Update any fields
4. Save changes

## Viewing Customer Details

Click on a customer name to open a detail view showing all their information at a glance — contact info, addresses, delivery preferences, and notes.

## Delivery Preferences

Store important delivery information for each customer:
- **Preferred Delivery Days** — Which days they accept deliveries
- **Delivery Instructions** — Loading dock details, entrance info, contact person
- **Payment Instructions** — How and when they pay

This information is available to anyone making deliveries, including Farm Hands.

## Tips

- Keep contact information current — incorrect info causes delivery delays
- Use delivery instructions for anything a driver needs to know
- Set preferred delivery days to align with your standing order schedule
- Search by name to quickly find customers in a long list
`,
};
