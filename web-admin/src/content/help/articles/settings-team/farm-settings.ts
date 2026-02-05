import type { HelpArticle } from '../../types';

export const farmSettingsArticle: HelpArticle = {
  slug: 'farm-settings',
  title: 'Farm Settings',
  description: 'Configure your farm, profile, and subscription',
  category: 'settings-team',
  tags: ['settings', 'farm', 'profile', 'subscription'],
  order: 1,
  content: `
# Farm Settings

The Settings page is where you configure your farm, manage your profile, and handle your subscription.

## Accessing Settings

Click **Settings** in the sidebar (gear icon).

## Farm Configuration

### Farm Name
Set your farm's display name. This appears throughout the app and in communications.

### Seeding Days
Select which days of the week your farm does seeding work. The planting schedule uses this to only schedule seeding tasks on your active days.

- Check the days you seed (e.g., Monday, Wednesday, Friday)
- Uncheck days when no seeding happens
- The system adjusts seeding dates to land on your active days

## User Profile

Manage your personal information:
- **Name** — Your display name
- **Phone** — Contact number
- **Address** — Your location
- **Bio** — Optional description

## Subscription Management

View and manage your Sproutify subscription:

### Current Plan
See your active subscription tier and what's included.

### Usage & Quotas
Monitor your usage against plan limits:
- **Active trays** — How many you're using vs. your plan limit
- Other feature usage metrics

### Managing Your Subscription
- Click **Manage Subscription** to open the Stripe billing portal
- Upgrade or downgrade your plan
- Update payment information
- View billing history

### Trial Period
If you're on a trial, you'll see a countdown showing how many days remain. Make sure to select a plan before your trial expires to maintain access.

## Tips

- Set your seeding days early — the planting schedule depends on them
- Keep your profile information current for team communication
- Monitor your tray usage to stay within plan limits
- Set up billing before your trial ends to avoid interruption
`,
};
