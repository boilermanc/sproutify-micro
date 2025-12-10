-- Fix seed batch units: handle cases where quantity doesn't match unit
-- This happens when deductions convert to grams but unit field still says 'lbs'

-- First, fix batches where unit is 'grams' but quantity is 1 (likely 1 lb mislabeled)
UPDATE seedbatches 
SET unit = 'lbs' 
WHERE unit = 'grams' 
  AND quantity = 1; -- 1 gram is too small, more likely 1 lb

-- Fix batches where unit is NULL or 'grams' but quantity suggests lbs (0.5+)
UPDATE seedbatches 
SET unit = 'lbs' 
WHERE (unit IS NULL OR unit = 'grams') 
  AND quantity >= 0.5; -- 0.5+ lbs is reasonable, less than that is probably grams

-- Fix batches where unit is 'lbs' but quantity is suspiciously small (< 1)
-- These are likely correctly converted, so leave them as-is (they'll display correctly)

-- Fix batches where unit is 'lbs' but quantity is a whole number 1-500
-- These are likely grams mislabeled as lbs (e.g., 160 grams showing as 160 lbs)
-- 500+ lbs would be 227+ kg, which is very large but possible, so we'll be conservative
-- Convert the unit to 'grams' for these cases
UPDATE seedbatches
SET unit = 'grams'
WHERE unit = 'lbs' 
  AND quantity >= 1 
  AND quantity < 500  -- Conservative: only fix quantities that are clearly grams
  AND quantity = FLOOR(quantity); -- Whole numbers only

-- Change the default unit to 'lbs' for future batches
ALTER TABLE seedbatches ALTER COLUMN unit SET DEFAULT 'lbs';

COMMENT ON COLUMN seedbatches.unit IS 'Unit for quantity: lbs, oz, kg, or g. Default is lbs. Quantities are stored in the original unit, but deductions convert to grams internally.';

