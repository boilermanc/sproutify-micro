-- Migration: Update existing recipe names from "(Copy)" to "(Global)"
-- Description: Renames existing farm recipes that were copied from global recipes to use "(Global)" suffix instead of "(Copy)"

-- ============================================
-- Update existing recipe names
-- ============================================
UPDATE recipes
SET recipe_name = REPLACE(recipe_name, ' (Copy)', ' (Global)')
WHERE recipe_name LIKE '% (Copy)';

-- Log how many recipes were updated
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % recipe names from "(Copy)" to "(Global)"', updated_count;
END $$;

