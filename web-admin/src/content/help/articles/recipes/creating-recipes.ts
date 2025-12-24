import type { HelpArticle } from '../../types';

export const creatingRecipesArticle: HelpArticle = {
  slug: 'creating-recipes',
  title: 'Creating Recipes',
  description: 'Build custom grow recipes for your varieties',
  category: 'recipes',
  tags: ['recipes', 'grow schedules', 'varieties'],
  order: 1,
  content: `
# Creating Recipes

Recipes define how you grow each variety—from seed to harvest. A good recipe ensures consistent results.

## What's in a Recipe?

Each recipe includes:
- **Variety** - Which microgreen
- **Total grow days** - Seed to harvest time
- **Grow steps** - Phases with durations
- **Seed rate** - Suggested seed amount per tray
- **Notes** - Growing tips

## Creating a New Recipe

1. Go to **Recipes** in the sidebar
2. Click **+ New Recipe**
3. Select the variety
4. Set up grow steps:
   - Add each phase (germination, blackout, light, etc.)
   - Set duration for each
   - Add step-specific notes

## Recipe Builder

Use the Recipe Builder for more control:
1. Navigate to **Recipes > Recipe Builder**
2. Drag and drop grow phases
3. Adjust durations visually
4. Preview the timeline
5. Save when complete

## Grow Steps Configuration

### Common Steps

**Soak** (optional)
- Duration: 4-12 hours
- For larger seeds

**Germination**
- Duration: 1-3 days
- Keep moist and warm

**Blackout**
- Duration: 2-5 days
- Dark, weighted coverage

**Light**
- Duration: 3-8 days
- Expose to grow lights or sunlight

### Adding Custom Steps
Create custom steps for your workflow:
- Name the step
- Set duration
- Add notes

## Using Global Recipes

Access community recipes:
1. Go to **Global Recipes**
2. Browse or search
3. Click **Use Recipe**
4. Customize for your conditions

## Tips

- Start with proven recipes, then adjust
- Test changes on small batches
- Document what works
- Share successful recipes with the community
`,
};
