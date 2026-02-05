import type { HelpArticle } from '../../types';

export const suppliesArticle: HelpArticle = {
  slug: 'supplies',
  title: 'Managing Supplies',
  description: 'Track growing media, equipment, and other supplies',
  category: 'inventory',
  tags: ['supplies', 'equipment', 'media', 'inventory'],
  order: 3,
  content: `
# Managing Supplies

The Supplies page helps you track non-seed inventory — growing media, trays, packaging, equipment, and more.

## Accessing Supplies

Click **Supplies** in the sidebar to open the supply management page.

## Supply Categories

Supplies are organized into categories:
- **Growing Supplies** — General growing materials
- **Media** — Growing media (soil, mats, etc.)
- **Trays** — Physical tray inventory
- **Packaging** — Containers, bags, labels
- **Equipment** — Tools and machinery
- **Other** — Anything that doesn't fit the above

## Adding a Supply Item

1. Click **+ Add Supply**
2. Enter the supply name
3. Select a **category**
4. Enter current **stock** and **unit** (e.g., "50 bags")
5. Set a **low stock threshold** for warnings
6. Optionally assign a **vendor**
7. Save

You can also use **supply templates** with common presets to speed up data entry.

## Stock Tracking

### Adjusting Stock
1. Click on a supply item
2. Click **Adjust Stock**
3. Enter the change (positive to add, negative to subtract)
4. Add a reason for the adjustment
5. Save

### Stock Status
Supplies show color-coded status indicators:
- **Good** — Stock is above threshold
- **Low** — Stock is below threshold but not empty
- **Depleted** — No stock remaining

## Filtering and Browsing

- Filter supplies by **category** to focus on specific types
- Filter by **stock status** to quickly find items needing reorder
- View all supplies in a sortable table

## Tips

- Set low stock thresholds for supplies you can't afford to run out of
- Associate supplies with vendors for easy reordering
- Use categories consistently to keep your inventory organized
- Check supply levels weekly as part of your planning routine
`,
};
