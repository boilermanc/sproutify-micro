import type { HelpArticle } from '../../types';

export const firstTrayArticle: HelpArticle = {
  slug: 'first-tray',
  title: 'Starting Your First Tray',
  description: 'Learn how to create and track your first microgreens tray',
  category: 'getting-started',
  tags: ['trays', 'seeding', 'beginner'],
  order: 2,
  content: `
# Starting Your First Tray

This guide walks you through creating your first tray in Sproutify Micro.

## Before You Begin

Make sure you have:
- At least one **variety** set up (e.g., Sunflower, Pea Shoots, Radish)
- A **recipe** created for that variety
- Your tray physically ready to seed

## Step 1: Navigate to Trays

Click on **Trays** in the sidebar navigation to open the Tray Management page.

## Step 2: Create a New Tray

1. Click the **+ New Tray** button
2. Select the **variety** you're seeding
3. Choose the **recipe** to use for grow scheduling
4. Enter the **seed date** (today's date by default)
5. Optionally add notes about this specific tray

## Step 3: Track Progress

Once created, your tray will appear in the tray list. The system automatically:

- Calculates expected harvest date based on your recipe
- Schedules grow steps (blackout, light, water reminders)
- Shows the tray in your Daily Flow

## Step 4: Complete Grow Steps

As your tray progresses, you'll see tasks in your Daily Flow:

- **Blackout removal** - When it's time to expose to light
- **Watering** - Daily or as scheduled
- **Harvest** - When the tray is ready

Mark each step complete to keep your records accurate.

## Tips for Success

- **Be consistent** with recording data for better insights
- **Take photos** to track growth patterns over time
- **Use notes** to record anything unusual about a batch
`,
};
