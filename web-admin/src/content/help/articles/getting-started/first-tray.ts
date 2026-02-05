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

Click on **Trays** in the sidebar to open the Tray Management page.

## Step 2: Create a Seeding Request

1. Click the **Add Tray** button
2. Select the **recipe** for what you're growing
3. Enter the **quantity** (number of trays)
4. Set the **seed date** (today's date by default)
5. Optionally enter a **location** (where the tray will be placed)
6. Click **Create Seeding Request**

## Step 3: Complete the Seeding Task

Your seeding request appears as a task in Daily Flow:
1. Go to **Daily Flow**
2. Find your seeding task
3. Physically seed the tray
4. Click **Complete** to activate the tray record

## Step 4: Track Progress

Once activated, the system automatically:
- Calculates the expected harvest date based on your recipe
- Schedules grow step tasks (blackout, uncover, water)
- Shows the tray in your Daily Flow each day it needs attention

## Step 5: Complete Grow Steps

As your tray progresses, you'll see tasks in Daily Flow:
- **Blackout** — Cover the tray for initial growth
- **Uncover** — Remove blackout and expose to light
- **Water** — Daily or as scheduled by the recipe
- **Harvest** — When the tray reaches the end of its grow cycle

Mark each step complete to keep your records accurate and the schedule on track.

## Tips for Success

- **Be consistent** with completing tasks for accurate grow tracking
- **Use the location field** to easily find trays in your grow space
- **Check Daily Flow** at the start of each day for what needs attention
`,
};
