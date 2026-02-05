import type { HelpArticle } from '../../types';

export const teamManagementArticle: HelpArticle = {
  slug: 'team-management',
  title: 'Team Management',
  description: 'Add team members and manage roles',
  category: 'settings-team',
  tags: ['team', 'users', 'roles', 'permissions'],
  order: 2,
  content: `
# Team Management

The Users page lets you invite team members and control what they can access based on their role.

## Accessing Team Management

Click **Users** in the sidebar.

## User Roles

### Farm Manager
Full access to all features:
- Dashboard, Daily Flow, Calendar
- Orders, customers, products
- Inventory, recipes, reports
- Settings and user management
- Sage AI assistant

### Farm Hand
Simplified, task-focused access:
- Daily tasks (water, seed, harvest)
- Seeding workflow
- Harvest operations
- Recipe/variety catalog (read-only)
- Customer list (read-only)
- Label printing

Farm Hands see a simplified mobile-friendly interface designed for efficient task execution.

### Viewer
Read-only access to farm data. Can view but not modify anything.

## Adding a Team Member

1. Click **+ Add User**
2. Enter their **email** and **password**
3. Select their **role** (Farm Manager, Farm Hand, or Viewer)
4. Click **Save**

The new user can immediately log in with the credentials you set.

## Managing Users

### Edit a User
Click the edit button to change a user's role or update their information.

### Deactivate a User
If someone leaves the team, deactivate their account instead of deleting it. This preserves their activity history while preventing login.

### Monitor Activity
The user list shows **last active** timestamps so you can see who's been using the system.

## Tips

- Use the Farm Hand role for workers who only need to execute daily tasks
- Keep the number of Farm Managers small for security
- Deactivate accounts when people leave rather than deleting them
- Check last active dates to identify accounts that may no longer be needed
`,
};
