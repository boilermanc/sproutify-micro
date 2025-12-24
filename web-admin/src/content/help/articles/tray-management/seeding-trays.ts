import type { HelpArticle } from '../../types';

export const seedingTraysArticle: HelpArticle = {
  slug: 'seeding-trays',
  title: 'Seeding Trays',
  description: 'How to record and track newly seeded trays',
  category: 'tray-management',
  tags: ['seeding', 'trays', 'tracking'],
  order: 1,
  content: `
# Seeding Trays

Every tray starts with seeding. Recording your seeding accurately sets up the entire grow cycle for success.

## Creating a New Tray Record

### Quick Seeding

1. Go to **Trays** page
2. Click **+ New Tray**
3. Select variety and recipe
4. Confirm seed date
5. Save

### Detailed Seeding

For more detailed tracking:
1. Click **+ New Tray**
2. Fill in all fields:
   - **Variety** - What you're growing
   - **Recipe** - Which grow schedule to use
   - **Seed Date** - When you planted
   - **Seed Weight** - Amount of seed used
   - **Tray Location** - Where it's placed
   - **Notes** - Any relevant details

## Seeding from Daily Flow

When Daily Flow suggests seeding:
1. See the suggested seeding tasks
2. Click **Seed Now**
3. Confirm the details
4. Tray is automatically created

## Batch Seeding

Seeding multiple trays at once:
1. Go to **Trays**
2. Click **Batch Seed**
3. Select variety and recipe
4. Enter number of trays
5. System creates individual tray records

## Seed Weight Tracking

Recording seed weight helps you:
- Track seed usage over time
- Calculate germination rates
- Manage seed inventory
- Estimate yields

## Tray Identification

Each tray gets a unique identifier:
- Auto-generated tray ID
- Optional custom label
- QR code for scanning (if enabled)

## Tips

- Record immediately after seeding
- Be consistent with measurements
- Use notes for anything unusual
- Set tray location accurately for easy finding
`,
};
