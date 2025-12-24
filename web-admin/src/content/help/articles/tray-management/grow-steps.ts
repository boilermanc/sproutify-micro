import type { HelpArticle } from '../../types';

export const growStepsArticle: HelpArticle = {
  slug: 'grow-steps',
  title: 'Understanding Grow Steps',
  description: 'Learn about the grow stages and how to track them',
  category: 'tray-management',
  tags: ['growing', 'stages', 'blackout', 'light'],
  order: 2,
  content: `
# Understanding Grow Steps

Each tray goes through several grow steps from seeding to harvest. Understanding these steps helps you provide optimal care.

## Standard Grow Steps

### 1. Seeding
The starting point. Seeds are spread on growing medium.
- Duration: Day 0
- Action: Record seed date and weight

### 2. Germination
Seeds begin to sprout.
- Duration: 1-3 days typically
- Conditions: Moist, often covered

### 3. Blackout
Trays are kept in darkness to encourage root growth and stem elongation.
- Duration: 2-5 days (variety dependent)
- Conditions: Dark, weighted (optional)
- Task: Cover trays, maintain moisture

### 4. Light Exposure
Trays are moved to growing area with light.
- Duration: 3-7 days (variety dependent)
- Conditions: Adequate light, airflow
- Task: Uncover, position for light

### 5. Growing
Main growth phase under light.
- Duration: Variable by variety
- Tasks: Water, monitor, adjust position

### 6. Ready to Harvest
Microgreens have reached target size.
- Appearance: True leaves developed, target height reached
- Task: Harvest or schedule for order

## Recipe-Based Scheduling

Your recipes define:
- Duration of each step
- Expected total grow time
- Harvest window

The system automatically schedules tasks based on these settings.

## Tracking Progress

### Automatic Tracking
- Days since seeding
- Current grow step
- Expected transitions

### Manual Updates
- Move tray to next step manually
- Adjust schedule if needed
- Add notes about progress

## Visual Indicators

Trays show their current step with:
- Color coding (gray → green → ready)
- Step name label
- Days remaining display

## Completing Grow Steps

When it's time to transition:
1. Daily Flow shows the task
2. Click to complete the step
3. Tray moves to next phase
4. Next task is scheduled

## Troubleshooting

### Tray Not Progressing
- Check recipe settings
- Manually advance if needed
- Verify seed date accuracy

### Growing Slower Than Expected
- Note conditions in tray notes
- Adjust recipe timing for future
- Check environmental factors
`,
};
