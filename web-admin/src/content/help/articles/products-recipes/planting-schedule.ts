import type { HelpArticle } from '../../types';

export const plantingScheduleArticle: HelpArticle = {
  slug: 'planting-schedule',
  title: 'Planting Schedule',
  description: 'Auto-generated seeding plan based on your standing orders',
  category: 'products-recipes',
  tags: ['planting', 'schedule', 'seeding', 'planning'],
  order: 3,
  content: `
# Planting Schedule

The Planting Schedule automatically calculates when to seed based on your standing orders and recipe grow times. It takes the guesswork out of production planning.

## Accessing the Planting Schedule

Click **Planting Schedule** in the sidebar.

## How It Works

The planting schedule works backwards from delivery dates:

1. **Standing orders** define what customers need and when
2. **Recipes** define how long each variety takes to grow
3. **The schedule** calculates the sow date by subtracting grow time from delivery date

For example: If a customer needs Pea Shoots delivered on Friday and your Pea Shoot recipe takes 10 days, the schedule shows a seeding date 10 days before Friday.

## Viewing the Schedule

The planting schedule shows:
- **Sow date** — When to seed
- **Variety/Recipe** — What to grow
- **Customer** — Who it's for
- **Delivery date** — When it's due
- **Quantity** — How many trays to seed

## Printing the Seeding Plan

Click the **Print** button to generate a printable version of your seeding plan. This is useful for posting in your grow room as a physical reference.

## Standing Order Connection

The planting schedule only generates entries for active standing orders. To see seeding tasks:
1. Make sure you have active standing orders with products and delivery days
2. Ensure those products are linked to recipes
3. The schedule automatically populates

## Tips

- Review the planting schedule weekly to stay ahead of seeding
- If a seeding date falls on a non-seeding day, adjust your farm's seeding days in Settings
- Use the print feature to post the schedule in your grow room
- Check that all products in standing orders are linked to recipes for accurate scheduling
`,
};
