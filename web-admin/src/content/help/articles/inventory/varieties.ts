import type { HelpArticle } from '../../types';

export const varietiesArticle: HelpArticle = {
  slug: 'varieties',
  title: 'Managing Varieties',
  description: 'Browse and manage your microgreen variety catalog',
  category: 'inventory',
  tags: ['varieties', 'catalog', 'microgreens', 'seeds'],
  order: 2,
  content: `
# Managing Varieties

The Varieties page is your catalog of microgreen types. Browse the global catalog to discover new varieties, or create custom ones specific to your farm.

## Accessing Varieties

Click **Varieties** in the sidebar to open the variety catalog.

## Browsing Your Varieties

Your variety list shows all varieties you've added to your farm. You can:
- **Search** by name to quickly find a variety
- **Sort** by name, description, status, or stock level
- **View details** including associated batches

## Adding Varieties from the Global Catalog

1. Click **Browse Global Catalog**
2. Browse or search the community variety library
3. Click **Add to Farm** on any variety you want to use
4. The variety is now available for your recipes and batches

## Creating Custom Varieties

If the global catalog doesn't have what you need:
1. Click **+ New Variety**
2. Enter the variety name and description
3. Save — it's now available for your farm only

## Variety and Batch Connection

Each variety can have multiple seed batches associated with it. When you view a variety, you can see:
- Current stock across all batches
- Which batches are active, low, or depleted

## Tips

- Start by browsing the global catalog before creating custom varieties
- Keep variety names consistent for clean reporting
- Check stock levels per variety to plan seed purchases
`,
};
