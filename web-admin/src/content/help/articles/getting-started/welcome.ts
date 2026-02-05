import type { HelpArticle } from '../../types';

export const welcomeArticle: HelpArticle = {
  slug: 'welcome',
  title: 'Welcome to Sproutify Micro',
  description: 'Get started with your microgreens farm management software',
  category: 'getting-started',
  tags: ['introduction', 'overview', 'basics'],
  order: 1,
  content: `
# Welcome to Sproutify Micro

Sproutify Micro is your all-in-one platform for managing your microgreens farm. Whether you're a hobby grower or running a commercial operation, we've built tools to help you stay organized, efficient, and profitable.

## What You Can Do

### Dashboard & Insights
Your dashboard gives you an at-a-glance view of your farm: active trays, pending orders, upcoming harvests, daily tasks, and catalog items. Sage, our AI assistant, provides a morning briefing with opportunities, risks, and inventory insights.

### Daily Operations
The **Daily Flow** guides you through each day's tasks — watering, harvesting, seeding, soaking, blackout removal, and more. The **Calendar** gives you a month-level view of task density so you can plan ahead.

### Track Your Trays
Monitor every tray from seeding to harvest. Know exactly what's growing, when it needs attention, and when it'll be ready. Track tray losses with detailed reason codes.

### Manage Orders & Deliveries
Handle standing orders (recurring) with automatic seeding schedule generation. Track delivery history with date range filtering, sorting, and customer grouping.

### Products & Recipes
Define your product catalog with variants and pricing. Create recipes with detailed grow steps and media requirements. Use the planting schedule to auto-calculate sow dates from standing orders.

### Inventory & Supplies
Manage seed batches with stock tracking and low-stock alerts. Track supplies, varieties, and vendors all in one place.

### Reports & Analytics
Generate harvest, delivery, sales, and seed usage reports with customizable date ranges.

### Team Management
Invite team members with role-based access. Farm Hands get a simplified mobile-friendly interface focused on daily task execution.

## Quick Start

1. **Set up your farm** — Configure your farm name and seeding days in Settings
2. **Add your varieties** — Browse the global catalog or create custom varieties
3. **Create recipes** — Define grow schedules with steps and durations
4. **Add customers** — Set up your customer base with delivery preferences
5. **Create standing orders** — Set up recurring orders for regular customers
6. **Start seeding** — Create seeding requests and track trays through their grow cycle

## Need Help?

Browse the categories on the left to find detailed guides on each feature. Use the search bar to quickly find what you're looking for.
`,
};
