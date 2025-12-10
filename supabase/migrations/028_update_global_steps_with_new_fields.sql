-- Migration: Update global_steps with new fields and fix ordering
-- Description: Adds new step fields (water options, weight, etc.) and fixes sequence order (Germination before Blackout)

-- ============================================
-- 1. Add new columns to global_steps table
-- ============================================
ALTER TABLE global_steps ADD COLUMN IF NOT EXISTS requires_weight BOOLEAN DEFAULT FALSE;
ALTER TABLE global_steps ADD COLUMN IF NOT EXISTS weight_lbs NUMERIC(5,2);
ALTER TABLE global_steps ADD COLUMN IF NOT EXISTS misting_frequency TEXT DEFAULT 'none';
ALTER TABLE global_steps ADD COLUMN IF NOT EXISTS misting_start_day INTEGER DEFAULT 0;
ALTER TABLE global_steps ADD COLUMN IF NOT EXISTS do_not_disturb_days INTEGER DEFAULT 0;
ALTER TABLE global_steps ADD COLUMN IF NOT EXISTS water_type TEXT;
ALTER TABLE global_steps ADD COLUMN IF NOT EXISTS water_method TEXT;
ALTER TABLE global_steps ADD COLUMN IF NOT EXISTS water_frequency TEXT;

COMMENT ON COLUMN global_steps.requires_weight IS 'Whether this step requires a weighted dome';
COMMENT ON COLUMN global_steps.weight_lbs IS 'Weight in pounds for the weighted dome (e.g., 5.0)';
COMMENT ON COLUMN global_steps.misting_frequency IS 'Misting frequency: none, 1x daily, 2x daily, 3x daily, or custom';
COMMENT ON COLUMN global_steps.misting_start_day IS 'Day within step when misting starts (0 = immediately, 1 = day 2, etc.)';
COMMENT ON COLUMN global_steps.do_not_disturb_days IS 'Number of days at start of step where tray should not be disturbed';
COMMENT ON COLUMN global_steps.water_type IS 'Type of watering: water (plain water) or nutrients (nutrient solution)';
COMMENT ON COLUMN global_steps.water_method IS 'Watering method: top (water from top) or bottom (water from bottom)';
COMMENT ON COLUMN global_steps.water_frequency IS 'Watering frequency: 1x daily, 2x daily, 3x daily, or custom';

-- ============================================
-- 2. Fix sequence ordering: Germination before Blackout
-- ============================================
-- For recipes where Blackout comes before Germination, swap their sequence_order
-- This ensures Germination always comes before Blackout when both exist

DO $$
DECLARE
    recipe_record RECORD;
    blackout_seq INTEGER;
    germination_seq INTEGER;
    blackout_step_id INTEGER;
    germination_step_id INTEGER;
BEGIN
    -- Loop through each recipe that has both Blackout and Germination steps
    FOR recipe_record IN 
        SELECT global_recipe_id
        FROM global_steps
        WHERE description_name IN ('Blackout', 'Germination')
        GROUP BY global_recipe_id
        HAVING COUNT(DISTINCT description_name) = 2
    LOOP
        -- Get sequence orders and step IDs for Blackout and Germination
        SELECT global_step_id, sequence_order INTO blackout_step_id, blackout_seq
        FROM global_steps
        WHERE global_recipe_id = recipe_record.global_recipe_id
          AND description_name = 'Blackout'
        LIMIT 1;
        
        SELECT global_step_id, sequence_order INTO germination_step_id, germination_seq
        FROM global_steps
        WHERE global_recipe_id = recipe_record.global_recipe_id
          AND description_name = 'Germination'
        LIMIT 1;
        
        -- If both exist and Blackout comes before Germination, swap them
        IF blackout_seq IS NOT NULL AND germination_seq IS NOT NULL AND blackout_seq < germination_seq THEN
            -- Swap the sequence orders
            UPDATE global_steps
            SET sequence_order = germination_seq
            WHERE global_step_id = blackout_step_id;
            
            UPDATE global_steps
            SET sequence_order = blackout_seq
            WHERE global_step_id = germination_step_id;
            
            RAISE NOTICE 'Swapped Blackout (seq %) and Germination (seq %) for recipe_id %', 
                blackout_seq, germination_seq, recipe_record.global_recipe_id;
        END IF;
    END LOOP;
END $$;

-- ============================================
-- 3. Set default values for Blackout steps
-- ============================================
-- Most blackout steps should have "No Water" by default
-- But we'll leave water_type as NULL (which means "No Water" in the UI)
UPDATE global_steps
SET 
    requires_weight = FALSE,
    weight_lbs = NULL,
    misting_frequency = 'none',
    misting_start_day = 0,
    do_not_disturb_days = 0,
    water_type = NULL,
    water_method = NULL,
    water_frequency = NULL
WHERE description_name = 'Blackout';

-- ============================================
-- 4. Set default values for Germination steps
-- ============================================
-- Germination steps default to "No Water"
UPDATE global_steps
SET 
    requires_weight = FALSE,
    weight_lbs = NULL,
    misting_frequency = 'none',
    misting_start_day = 0,
    do_not_disturb_days = 0,
    water_type = NULL,
    water_method = NULL,
    water_frequency = NULL
WHERE description_name = 'Germination';

-- ============================================
-- 5. Set default values for Growing steps
-- ============================================
-- Growing steps default to "No Water" (user can configure)
UPDATE global_steps
SET 
    requires_weight = FALSE,
    weight_lbs = NULL,
    misting_frequency = 'none',
    misting_start_day = 0,
    do_not_disturb_days = 0,
    water_type = NULL,
    water_method = NULL,
    water_frequency = NULL
WHERE description_name = 'Growing';

-- ============================================
-- 6. Set default values for other step types
-- ============================================
UPDATE global_steps
SET 
    requires_weight = FALSE,
    weight_lbs = NULL,
    misting_frequency = 'none',
    misting_start_day = 0,
    do_not_disturb_days = 0,
    water_type = NULL,
    water_method = NULL,
    water_frequency = NULL
WHERE description_name NOT IN ('Blackout', 'Germination', 'Growing');

-- ============================================
-- 7. Add specific configurations for recipes that need them
-- ============================================
-- Note: Users can customize these when copying to their farm, but we set sensible defaults

-- Basil (Genovese) - mucilaginous, needs misting during blackout
UPDATE global_steps
SET 
    misting_frequency = '2x daily',
    misting_start_day = 0
WHERE global_recipe_id = (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Basil (Genovese)')
  AND description_name = 'Blackout';

-- Sunflower - typically uses weighted dome
UPDATE global_steps
SET 
    requires_weight = TRUE,
    weight_lbs = 5.0,
    do_not_disturb_days = 2
WHERE global_recipe_id = (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Sunflower')
  AND description_name = 'Blackout';

-- ============================================
-- 8. Update copy_global_recipe_to_farm function to include new fields
-- ============================================
CREATE OR REPLACE FUNCTION copy_global_recipe_to_farm(
    p_global_recipe_id INTEGER,
    p_farm_uuid UUID,
    p_created_by UUID,
    p_new_recipe_name VARCHAR(255) DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    _new_recipe_id INTEGER;
    _global_recipe RECORD;
    _final_recipe_name VARCHAR(255);
BEGIN
    -- Get global recipe
    SELECT * INTO _global_recipe FROM global_recipes WHERE global_recipe_id = p_global_recipe_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Global recipe with ID % not found', p_global_recipe_id;
    END IF;

    -- Determine the recipe name - require a new name or append (Global)
    IF p_new_recipe_name IS NOT NULL AND p_new_recipe_name <> '' THEN
        _final_recipe_name := p_new_recipe_name;
    ELSE
        _final_recipe_name := _global_recipe.recipe_name || ' (Global)';
    END IF;

    -- Create farm recipe copy
    INSERT INTO recipes (recipe_name, variety_name, description, notes, farm_uuid, created_by, is_active, seed_quantity, seed_quantity_unit)
    VALUES (
        _final_recipe_name,
        _global_recipe.variety_name,
        _global_recipe.description,
        _global_recipe.notes,
        p_farm_uuid,
        p_created_by,
        true,
        NULL, -- seed_quantity can be set by user
        'grams' -- default unit
    )
    RETURNING recipe_id INTO _new_recipe_id;

    -- Copy all steps with new fields
    INSERT INTO steps (
        recipe_id, step_name, description_id, description_name, sequence_order, 
        duration, duration_unit, instructions, step_color, 
        farm_uuid, created_by,
        requires_weight, weight_lbs, misting_frequency, misting_start_day, 
        do_not_disturb_days, water_type, water_method, water_frequency
    )
    SELECT
        _new_recipe_id,
        step_name,
        description_id,
        description_name,
        sequence_order,
        duration,
        duration_unit,
        instructions,
        step_color,
        p_farm_uuid,
        p_created_by::VARCHAR,
        COALESCE(requires_weight, FALSE),
        weight_lbs,
        COALESCE(misting_frequency, 'none'),
        COALESCE(misting_start_day, 0),
        COALESCE(do_not_disturb_days, 0),
        water_type,
        water_method,
        water_frequency
    FROM global_steps
    WHERE global_recipe_id = p_global_recipe_id
    ORDER BY sequence_order;

    RETURN _new_recipe_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

