import type { HelpArticle } from '../../types';

export const batchHarvestingArticle: HelpArticle = {
  slug: 'batch-harvesting',
  title: 'Batch Harvesting',
  description: 'Efficiently harvest multiple trays at once',
  category: 'harvest-workflow',
  tags: ['harvest', 'batch', 'efficiency', 'workflow'],
  order: 2,
  content: `
# Batch Harvesting

When you have multiple trays to harvest, batch harvesting helps you work efficiently and keep accurate records.

## When to Use Batch Harvesting

Use batch harvesting when:
- Multiple trays of the same variety are ready
- You're fulfilling a large order
- You want to streamline your workflow

## How to Batch Harvest

### From Daily Flow

1. Open **Daily Flow**
2. Find the harvest tasks for today
3. Select multiple trays to harvest together
4. Click **Batch Harvest**
5. Enter the total yield
6. Confirm completion

### From Trays Page

1. Go to **Trays**
2. Filter by "Ready to Harvest"
3. Select the trays
4. Click **Harvest Selected**
5. Record yield data

## Recording Yield Data

When harvesting, you can record:
- **Total weight** - Combined yield from all trays
- **Per-tray average** - System calculates from total
- **Quality notes** - Any issues or observations
- **Destination** - Which order this fulfills

## Best Practices

### Before Harvesting
- Gather all containers and packaging
- Review which orders need this harvest
- Check quality of each tray

### During Harvesting
- Work systematically through trays
- Set aside any subpar product
- Keep similar varieties together

### After Harvesting
- Record yields immediately
- Clean and sanitize trays
- Update inventory counts

## Yield Tracking

The system tracks yield data to help you:
- Compare actual vs expected yield
- Identify high and low performing batches
- Optimize your growing processes
- Forecast production capacity

## Tips

- Harvest at the same time each day for consistency
- Record yields even for partial harvests
- Note any anomalies for future reference
`,
};
