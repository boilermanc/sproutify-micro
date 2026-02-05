import type { HelpArticle } from '../../types';

export const productsArticle: HelpArticle = {
  slug: 'products',
  title: 'Managing Products',
  description: 'Create and manage your product catalog with variants',
  category: 'products-recipes',
  tags: ['products', 'variants', 'catalog', 'pricing'],
  order: 1,
  content: `
# Managing Products

Products represent what you sell to customers. Each product can have multiple variants (sizes and price points) and be linked to recipes for fulfillment.

## Accessing Products

Click **Products** in the sidebar to open the product catalog.

## Product Types

Sproutify supports two product types:
- **Live** — Living microgreens sold in trays or containers
- **Packaged** — Harvested and packaged microgreens (bags, clamshells, etc.)

## Creating a Product

1. Click **+ New Product**
2. Enter the **product name**
3. Add a **description**
4. Select the **product type** (Live or Packaged)
5. Save the product

## Managing Variants

Each product can have multiple variants representing different sizes or packaging:

1. Open a product
2. Go to the **Variants** section
3. Click **Add Variant**
4. Enter:
   - **Variant name** (e.g., "Small", "Large", "Restaurant Pack")
   - **Size** (e.g., "4oz", "8oz", "1lb")
   - **Price** per unit
   - **Unit** of measurement
5. Save the variant

Variants can be toggled active/inactive without deleting them.

## Product Mix Editor

For products that combine multiple varieties (like a mixed salad blend):
1. Open the product
2. Use the **Mix Editor**
3. Add varieties and set their proportions
4. Save the mix recipe

## Recipe Mapping

Link products to recipes so the system knows what to grow for each order:
- When a standing order includes a product, the system uses the linked recipe to calculate seeding schedules
- This connection is what drives the automatic planting schedule

## Active/Inactive Products

Toggle products active or inactive to:
- Hide seasonal products when not available
- Keep historical product data without cluttering the active catalog

## Tips

- Set up variants for each size you sell to accurately track revenue
- Link products to recipes early so the planting schedule works correctly
- Use the mix editor for products that combine multiple varieties
- Deactivate seasonal products instead of deleting them
`,
};
