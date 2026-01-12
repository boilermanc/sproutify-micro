-- Fix pea soak duration to 12 hours (from 9 hours)
-- This ensures soaking tasks are generated the day before seeding
-- User requirement: "peas require 12 hours soaking"

-- Update Pea (Basic/Field) soak step
UPDATE global_steps
SET 
  duration = 12,
  instructions = 'Soak pea seeds for 12 hours; they are very absorbent.'
WHERE 
  global_recipe_id = (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Pea (Basic/Field)')
  AND description_id = 2  -- Soaking step
  AND step_name = 'Soak Seeds';

-- Update Pea (Tendril) soak step
UPDATE global_steps
SET 
  duration = 12,
  instructions = 'Soak pea seeds for 12 hours; they are very absorbent.'
WHERE 
  global_recipe_id = (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Pea (Tendril)')
  AND description_id = 2  -- Soaking step
  AND step_name = 'Soak Seeds';

-- Also update any farm-specific recipes copied from global peas
-- This updates the steps table for recipes that were copied from global recipes
UPDATE steps s
SET 
  duration = 12,
  instructions = 'Soak pea seeds for 12 hours; they are very absorbent.'
FROM recipes r
WHERE 
  s.recipe_id = r.recipe_id
  AND (r.recipe_name ILIKE '%pea%' OR r.variety_name ILIKE '%pea%')
  AND s.description_id = 2  -- Soaking step
  AND s.step_name ILIKE '%soak%'
  AND s.duration_unit = 'Hours'
  AND s.duration < 12;  -- Only update if it's currently less than 12 hours
