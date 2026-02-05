import type { HelpArticle } from '../../types';

export const seedingTraysArticle: HelpArticle = {
  slug: 'seeding-trays',
  title: 'Seeding Trays',
  description: 'How to create seeding requests and track newly seeded trays',
  category: 'tray-management',
  tags: ['seeding', 'trays', 'tracking', 'requests'],
  order: 1,
  content: `
# Seeding Trays

Every tray starts with a seeding request. Recording your seeding accurately sets up the entire grow cycle for success.

## Creating a Seeding Request

1. Go to the **Trays** page
2. Click **Add Tray**
3. Select the **recipe** — choose from your farm recipes or global recipes
4. Enter the **quantity** — how many trays you want to seed
5. Select the **seed date** (today's date by default)
6. Optionally enter a **location** (e.g., "Rack A - Shelf 1")
7. Click **Create Seeding Request**

The system creates a pending seeding request. Once you physically seed the trays, complete the seeding task in Daily Flow to activate them.

## Seeding from Daily Flow

When it's time to seed (based on your planting schedule):
1. Open **Daily Flow**
2. Find the seeding tasks for today
3. Click **Complete** after physically seeding
4. The tray record becomes active and enters the grow cycle

## Managing Trays

### Filtering and Sorting
- **Status filters**: All, Active, Harvested, Lost
- **Sort by**: Tray ID, Batch, Variety, Seeding Date, Customer, Harvest Date
- **Pagination**: Browse through large tray lists 20 at a time

### Assigning Trays to Customers
Unassigned trays can be assigned to customers to fulfill orders. Use the filter to find unassigned trays and match them to open orders.

### Tray Loss Tracking
If a tray is lost or damaged:
1. Select the tray
2. Click **Mark as Lost**
3. Choose a loss reason (fungal, mold, contamination, pest, operator error, or other)
4. Add optional notes
5. The tray is removed from active inventory

## Tray Identification

Each tray gets an auto-generated unique tray ID. Trays are also associated with:
- **Batch** — Which seed batch was used
- **Variety** — What's growing
- **Recipe** — The grow schedule being followed

## Subscription Limits

Your subscription plan determines how many active trays you can have at once. If you reach your limit, you'll need to harvest or close existing trays before creating new ones.

## Tips

- Create seeding requests ahead of time based on your planting schedule
- Use the location field to quickly find trays in your grow space
- Check the "Unassigned" filter to find trays that need customer assignment
- Record tray losses promptly for accurate inventory tracking
`,
};
