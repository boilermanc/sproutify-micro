import type { HelpArticle } from '../../types';

export const dailyFlowArticle: HelpArticle = {
  slug: 'daily-flow',
  title: 'Using the Daily Flow',
  description: 'Master your daily workflow with the Daily Flow feature',
  category: 'daily-operations',
  tags: ['workflow', 'tasks', 'daily', 'productivity', 'harvest', 'seeding'],
  order: 1,
  content: `
# Using the Daily Flow

The Daily Flow is your command center for each day's work. It shows everything that needs attention and helps you work efficiently through your tasks.

## Accessing Daily Flow

Click **Daily Flow** in the sidebar, or access it from the dashboard quick actions.

## Task Types

Daily Flow organizes your work into color-coded task categories:

- **Water** — Trays that need watering today
- **Uncover** — Trays ready to come out of blackout
- **Blackout** — Trays that need to be covered
- **Seed** — Seeding requests scheduled for today
- **Soak** — Seeds that need to be soaked
- **Harvest** — Trays ready to harvest
- **Maintenance** — General maintenance tasks

Each task type has a distinct color so you can quickly scan what needs doing.

## Working Through Tasks

### Completing Tasks
1. Review the task details (variety, tray info, recipe)
2. Perform the physical work
3. Click **Complete** to mark it done
4. The task moves to the completed section

### Skipping Tasks
If you need to skip a task:
1. Click **Skip** on the task
2. A confirmation dialog appears
3. The task is marked as skipped

## Overdue Task Recovery

If you missed tasks from previous days, Daily Flow shows an **overdue** section at the top. You have several options:

- **Complete** — Mark the overdue task as done (it was completed late)
- **Skip** — Skip the individual overdue task
- **Skip All** — Skip all overdue tasks at once to start fresh

This prevents old tasks from blocking your current day's work.

## Tray Loss Tracking

If a tray is damaged or lost during the day:
1. Use the **Mark as Lost** action on the tray
2. Select a loss reason: fungal, mold, contamination, pest, operator error, or other
3. Add optional notes explaining what happened
4. The tray is removed from active inventory

## Order Gap Monitoring

Daily Flow shows an **order gap** status that helps you match supply to demand:
- See which customers have unassigned trays vs. open demand
- Quickly assign available trays to customer orders
- Identify shortfalls before they become missed deliveries

## Passive Tray Status

Trays in passive growth phases (not needing active attention today) are shown in a collapsible section, grouped by seed date. This keeps your active task list clean while still giving visibility into what's growing.

## Finalize Deliveries

At the end of the day, use the **Finalize Deliveries** action to:
- Record which deliveries were actually completed
- Log fulfillment actions for each delivery
- Close out the day's delivery tasks

## Seeding Workflow

For seeding tasks, Daily Flow handles the full workflow:
- Complete soaking tasks when seeds are done soaking
- Use leftover soaked seed or discard it
- Complete seeding tasks to activate tray records
- Cancel or reschedule seeding requests if plans change

## Tips for Success

- Start your day by reviewing the full task list
- Handle overdue tasks first to keep things current
- Check the order gap status to catch fulfillment issues early
- Mark tasks complete immediately after doing them
- Use the passive tray section to check on long-growing varieties
`,
};
