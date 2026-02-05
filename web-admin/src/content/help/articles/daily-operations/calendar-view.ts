import type { HelpArticle } from '../../types';

export const calendarViewArticle: HelpArticle = {
  slug: 'calendar-view',
  title: 'Calendar View',
  description: 'See your monthly task overview at a glance',
  category: 'daily-operations',
  tags: ['calendar', 'planning', 'schedule', 'monthly'],
  order: 2,
  content: `
# Calendar View

The Calendar gives you a month-level overview of your farm's activity, helping you plan ahead and spot busy periods.

## Accessing the Calendar

Click **Calendar** in the sidebar to open the monthly view.

## Understanding the Calendar

Each day on the calendar shows colored task pills indicating what's happening:

- **Harvest pills** — Show how many trays are ready to harvest that day
- **Seeding pills** — Show seeding tasks with counts by status (pending, completed)
- **Warning pills** — Highlight overdue items that need attention
- **Prep/Maintenance pills** — Show preparation and maintenance tasks
- **Water pills** — Indicate watering tasks

The pill counts help you quickly assess task density — days with many pills will be busier.

## Navigating the Calendar

- Use the **arrow buttons** to move between months
- Click on any **day** to see the full task details for that date
- The current day is highlighted for easy reference

## Using the Calendar for Planning

The Calendar is especially useful for:

- **Spotting busy periods** — See which days have heavy task loads
- **Planning harvests** — Identify when large harvests are coming up
- **Coordinating deliveries** — Know which days have the most delivery activity
- **Tracking overdue work** — Warning pills show days with missed tasks

## Tips

- Check the Calendar at the start of each week to plan your workload
- Look ahead for harvest clusters to prepare packaging and delivery logistics
- Use it alongside the Planting Schedule to verify seeding timing
`,
};
