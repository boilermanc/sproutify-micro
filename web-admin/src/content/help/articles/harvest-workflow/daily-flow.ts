import type { HelpArticle } from '../../types';

export const dailyFlowArticle: HelpArticle = {
  slug: 'daily-flow',
  title: 'Using the Daily Flow',
  description: 'Master your daily workflow with the Daily Flow feature',
  category: 'harvest-workflow',
  tags: ['workflow', 'tasks', 'daily', 'productivity'],
  order: 1,
  content: `
# Using the Daily Flow

The Daily Flow is your command center for each day's work. It shows everything that needs attention and helps you work efficiently through your tasks.

## Accessing Daily Flow

Click **Daily Flow** in the sidebar, or access it from the dashboard quick actions.

## Understanding the Interface

### Today's Tasks

The main view shows all tasks scheduled for today:

- **Harvest** - Trays ready to harvest
- **Seed** - Planned seeding based on upcoming orders
- **Water** - Trays needing water
- **Move** - Trays to move (blackout to light, etc.)
- **Deliver** - Orders going out today

### Task Cards

Each task shows:
- What needs to be done
- Which tray or order it relates to
- Priority level
- Quick action buttons

## Working Through Tasks

### Completing Tasks

1. Review the task details
2. Perform the physical work
3. Click **Complete** to mark it done
4. The task moves to your completed list

### Skipping Tasks

If you need to skip a task:
1. Click **Skip** on the task
2. Add a reason (optional)
3. The task will be rescheduled or marked as skipped

### Batch Actions

For efficiency, you can complete multiple similar tasks at once:
1. Select multiple tasks
2. Click **Complete Selected**

## Task Priorities

Tasks are color-coded by priority:
- **Red** - Urgent, needs immediate attention
- **Orange** - High priority
- **Blue** - Normal priority
- **Gray** - Low priority

## Filtering Tasks

Use the filter buttons to show:
- All tasks
- Only harvesting
- Only seeding
- Only deliveries

## Tips for Success

- Start your day by reviewing the full task list
- Complete urgent tasks first
- Batch similar tasks together
- Mark tasks complete immediately after doing them
- Review tomorrow's tasks before ending your day
`,
};
