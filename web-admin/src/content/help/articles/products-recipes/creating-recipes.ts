import type { HelpArticle } from '../../types';

export const creatingRecipesArticle: HelpArticle = {
  slug: 'creating-recipes',
  title: 'Creating Recipes',
  description: 'Build custom grow recipes for your varieties',
  category: 'products-recipes',
  tags: ['recipes', 'grow schedules', 'varieties'],
  order: 2,
  content: `
# Creating Recipes

Recipes define how you grow each variety — from seed to harvest. A good recipe ensures consistent results and drives the automatic scheduling system.

## What's in a Recipe?

Each recipe includes:
- **Variety** — Which microgreen
- **Recipe type** — Standard or Custom
- **Grow steps** — Phases with durations and actions
- **Seed quantity** — Amount of seed per tray (grams or ounces)
- **Media/supply requirements** — What growing media and quantities are needed

## Creating a New Recipe

1. Go to **Recipes** in the sidebar
2. Click **+ New Recipe**
3. Select the variety
4. Set up grow steps:
   - Add each phase (Blackout, Germination, Growing, Harvesting)
   - Set duration for each step
   - Specify seed quantity
   - Add media and supply requirements with quantities

## Recipe Builder

The Recipe Builder provides a visual way to compose recipes:
1. Navigate to the Recipe Builder
2. Add grow phases in sequence
3. Configure step durations
4. Set media requirements for each step
5. Preview the full grow timeline
6. Save when complete

## Grow Steps

### Common Steps

**Soak** (optional)
- Duration: 4-12 hours
- For larger seeds that benefit from pre-soaking

**Blackout**
- Duration: 2-5 days
- Dark, weighted coverage to encourage root growth

**Germination**
- Duration: 1-3 days
- Keep moist and warm

**Growing**
- Duration: 3-8 days
- Expose to grow lights or sunlight

**Harvesting**
- The final step — tray is ready to cut

## Using Global Recipes

Access recipes shared by other farms:
1. Go to **Global Recipes** (or browse from the recipe list)
2. Browse or search the library
3. Click **Copy to Farm** to add it as a custom recipe
4. Customize durations and quantities for your conditions

## Deleting Recipes

When you delete a recipe, the system warns you about any active trays using that recipe. Make sure no critical trays depend on a recipe before removing it.

## Tips

- Start with global recipes, then customize for your environment
- Keep seed quantities consistent for reliable yield tracking
- Add media requirements so you can track supply usage accurately
- Test recipe changes on a small batch before updating all production
`,
};
