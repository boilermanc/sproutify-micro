-- Migration: Add seed quantity to recipes table
-- Description: Moves seed quantity from variety level to recipe level, allowing different recipes for the same variety to use different seed densities

-- ============================================
-- 1. Add seed quantity fields to recipes table
-- ============================================
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS seed_quantity NUMERIC(10,2);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS seed_quantity_unit TEXT DEFAULT 'grams';
-- Values: 'grams' or 'oz'

COMMENT ON COLUMN recipes.seed_quantity IS 'Seed quantity needed per tray for this recipe. Allows different recipes for the same variety to use different seed densities.';
COMMENT ON COLUMN recipes.seed_quantity_unit IS 'Unit for seed_quantity: grams or oz';

-- ============================================
-- 2. Copy existing seed quantities from varieties to recipes
-- ============================================
-- For existing recipes, copy the seed quantity from their associated variety (assumes grams)
UPDATE recipes r
SET seed_quantity = v.seed_quantity_grams,
    seed_quantity_unit = 'grams'
FROM varieties v
WHERE r.variety_id = v.varietyid
  AND r.seed_quantity IS NULL
  AND v.seed_quantity_grams IS NOT NULL;

-- For recipes linked by variety_name (legacy/global recipes)
UPDATE recipes r
SET seed_quantity = v.seed_quantity_grams,
    seed_quantity_unit = 'grams'
FROM varieties v
WHERE LOWER(TRIM(r.variety_name)) = LOWER(TRIM(v.name))
  AND r.seed_quantity IS NULL
  AND v.seed_quantity_grams IS NOT NULL
  AND r.variety_id IS NULL;

-- ============================================
-- 3. Add index for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_recipes_seed_quantity ON recipes(seed_quantity) WHERE seed_quantity IS NOT NULL;

