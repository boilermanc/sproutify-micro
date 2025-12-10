interface ProductMix {
  product_id: number;
  product_name: string;
  mappings: MixMapping[];
}

interface MixMapping {
  recipe_id: number;
  variety_id: number;
  ratio: number;
  recipe_name: string;
  variety_name: string;
}

interface Recipe {
  recipe_id: number | string; // Can be number for farm recipes or string like "global_123" for global recipes
  recipe_name: string;
  variety_name: string;
  total_days: number; // Total growing days
  average_yield: number; // Average yield per tray (oz)
  is_global?: boolean;
  global_recipe_id?: number;
  expected_yield_oz?: number; // For global recipes, this comes from global_recipes.expected_yield_oz
}

interface CalculationResult {
  variety_id: number;
  variety_name: string;
  recipe_id: number;
  recipe_name: string;
  trays_needed: number;
  total_yield: number; // Required yield in oz (order quantity × ratio)
  expected_yield_per_tray: number; // Expected yield per tray in oz (from recipe.average_yield)
  sow_date: Date; // Calculated sow date based on delivery date
  ratio: number;
}

interface MixCalculationInput {
  product_id: number;
  order_quantity: number; // Total quantity ordered
  delivery_date: Date;
  unit: string; // Unit of order quantity (oz, lbs, etc.)
}

/**
 * Calculate required crop amounts for a product mix order
 */
export const calculateMixRequirements = async (
  input: MixCalculationInput,
  productMix: ProductMix,
  recipes: Recipe[]
): Promise<CalculationResult[]> => {
  const results: CalculationResult[] = [];

  // Calculate total ratio sum for normalization
  const totalRatio = productMix.mappings.reduce((sum, m) => sum + m.ratio, 0);

  // For each crop in the mix
  for (const mapping of productMix.mappings) {
    // Match recipe by recipe_id (handle both numeric farm recipes and string global recipes)
    const recipe = recipes.find(r => {
      if (typeof r.recipe_id === 'string' && typeof mapping.recipe_id === 'string') {
        return r.recipe_id === mapping.recipe_id;
      } else if (typeof r.recipe_id === 'number' && typeof mapping.recipe_id === 'number') {
        return r.recipe_id === mapping.recipe_id;
      }
      return r.recipe_id.toString() === mapping.recipe_id.toString();
    });
    if (!recipe) {
      console.warn(`Recipe not found for mapping:`, mapping);
      continue;
    }

    // Calculate normalized ratio
    const normalizedRatio = mapping.ratio / totalRatio;

    // Calculate required yield for this crop
    const requiredYield = input.order_quantity * normalizedRatio;

    // Calculate trays needed based on average yield per tray
    const traysNeeded = Math.ceil(requiredYield / recipe.average_yield);

    // Calculate sow date (delivery date - total growing days)
    const sowDate = new Date(input.delivery_date);
    sowDate.setDate(sowDate.getDate() - recipe.total_days);

    results.push({
      variety_id: mapping.variety_id,
      variety_name: mapping.variety_name,
      recipe_id: mapping.recipe_id,
      recipe_name: mapping.recipe_name,
      trays_needed: traysNeeded,
      total_yield: requiredYield,
      expected_yield_per_tray: recipe.average_yield,
      sow_date: sowDate,
      ratio: normalizedRatio,
    });
  }

  return results;
};

/**
 * Get recipe total days and average yield
 */
export const getRecipeDetails = async (recipeId: number | string): Promise<{ total_days: number; average_yield: number }> => {
  // This would typically fetch from database
  // For now, return defaults - should be enhanced to fetch actual data
  // recipeId parameter is kept for future use
  void recipeId; // Suppress unused parameter warning
  return {
    total_days: 10, // Default, should fetch from steps table
    average_yield: 4.0, // Default oz per tray, should be configurable
  };
};

/**
 * Format calculation results for display
 */
export const formatCalculationResults = (results: CalculationResult[]): string => {
  let output = 'Mix Calculation Results:\n\n';
  
  results.forEach((result, index) => {
    output += `${index + 1}. ${result.variety_name} (${result.recipe_name})\n`;
    output += `   Trays Needed: ${result.trays_needed}\n`;
    output += `   Required Yield: ${result.total_yield.toFixed(2)} oz\n`;
    output += `   Expected Yield per Tray: ${result.expected_yield_per_tray.toFixed(1)} oz\n`;
    output += `   Sow Date: ${result.sow_date.toLocaleDateString()}\n`;
    output += `   Ratio: ${(result.ratio * 100).toFixed(1)}%\n\n`;
  });

  const totalTrays = results.reduce((sum, r) => sum + r.trays_needed, 0);
  output += `Total Trays Required: ${totalTrays}\n`;

  return output;
};

