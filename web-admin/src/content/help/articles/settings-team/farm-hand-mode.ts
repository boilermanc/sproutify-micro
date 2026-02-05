import type { HelpArticle } from '../../types';

export const farmHandModeArticle: HelpArticle = {
  slug: 'farm-hand-mode',
  title: 'Farm Hand Mode',
  description: 'Simplified interface for daily task execution',
  category: 'settings-team',
  tags: ['farm hand', 'mobile', 'tasks', 'simplified'],
  order: 3,
  content: `
# Farm Hand Mode

Farm Hand Mode is a simplified interface designed for team members who focus on daily task execution. It's optimized for mobile devices and strips away management features to keep things focused.

## Who Sees Farm Hand Mode?

Farm Hand Mode appears for:
- Users with the **Farm Hand** role (on any device)
- Any user accessing the app on a **mobile device** (automatically detected)

Farm Managers and owners on desktop see the full interface.

## Available Features

### Tasks
View and complete today's non-harvest daily tasks:
- Watering
- Uncovering (removing blackout)
- Blackout coverage
- Soaking
- Maintenance

Tasks are color-coded by type and show clear complete/skip buttons.

### Seed
The seeding workflow for creating and completing seeding tasks:
- View pending seeding requests
- Select batch and recipe
- Record seeding completion

### Harvest
The harvest workflow:
- See which trays are ready to harvest
- Record harvest date and yield
- Mark trays as harvested

### Catalog
Read-only view of recipes and varieties:
- Browse available recipes
- Check variety details
- Reference grow schedules

### Customers
Read-only customer list:
- View customer contact information
- Check delivery instructions
- See preferred delivery days

### Labels
Print labels for trays and tasks:
- Generate labels with tray IDs and variety info
- Print for physical tray identification

## Navigation

Farm Hand Mode uses a streamlined navigation:
- **Bottom tab bar** on mobile devices
- **Horizontal bar** on wider screens
- **Header** with farm name and dropdown for secondary options
- **Logout** button always accessible

## Tips

- Farm Hands should refresh their task list at the start of each day
- Complete tasks immediately after performing the physical work
- Use the catalog as a reference if unsure about a recipe's requirements
- Check customer delivery instructions before making deliveries
`,
};
