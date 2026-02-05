import type { HelpArticle } from '../../types';

export const vendorsArticle: HelpArticle = {
  slug: 'vendors',
  title: 'Managing Vendors',
  description: 'Keep track of your suppliers and their contact information',
  category: 'inventory',
  tags: ['vendors', 'suppliers', 'contacts'],
  order: 4,
  content: `
# Managing Vendors

The Vendors page stores all your supplier information in one place, making reordering and communication easy.

## Accessing Vendors

Click **Vendors** in the sidebar to open the vendor management page.

## Adding a Vendor

1. Click **+ Add Vendor**
2. Enter the vendor details:
   - **Name** — Company or supplier name
   - **Email** — For ordering and communication
   - **Phone** — For quick contact
   - **Address** — Street, city, state, postal code
   - **Website** — Vendor's website URL
   - **Notes** — Payment terms, account numbers, special instructions
3. Click **Save**

## Editing Vendor Information

1. Find the vendor using the search bar
2. Click the edit icon
3. Update any fields
4. Save changes

## Vendor Connections

Vendors can be linked to:
- **Seed batches** — Track which vendor supplied each batch
- **Supplies** — Know where each supply item comes from

This makes reordering straightforward — you always know who to contact for what.

## Tips

- Keep vendor contact information current
- Add website URLs for easy access to ordering portals
- Use notes to record account numbers and payment terms
- Link vendors to batches and supplies for quick reference when reordering
`,
};
