-- Migration: Fix copy_global_recipe_to_farm to set variety_id
-- Description: Updates the copy function to lookup variety_id from varieties table

-- First, fix any existing recipes that were copied without variety_id
UPDATE recipes r
SET variety_id = (
    SELECT v.varietyid
    FROM varieties v
    WHERE LOWER(v.name) LIKE '%' || LOWER(r.variety_name) || '%'
       OR LOWER(r.variety_name) LIKE '%' || LOWER(v.name) || '%'
    LIMIT 1
)
WHERE r.variety_id IS NULL
  AND r.variety_name IS NOT NULL;

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
    _variety_id INTEGER;
BEGIN
    -- Get global recipe
    SELECT * INTO _global_recipe FROM global_recipes WHERE global_recipe_id = p_global_recipe_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Global recipe with ID % not found', p_global_recipe_id;
    END IF;

    -- Determine the recipe name - require a new name or append (Copy)
    IF p_new_recipe_name IS NOT NULL AND p_new_recipe_name <> '' THEN
        _final_recipe_name := p_new_recipe_name;
    ELSE
        _final_recipe_name := _global_recipe.recipe_name || ' (Copy)';
    END IF;

    -- Look up variety_id from varieties table by name (fuzzy case-insensitive match)
    -- Try exact match first, then partial matches
    SELECT varietyid INTO _variety_id
    FROM varieties
    WHERE LOWER(name) = LOWER(_global_recipe.variety_name)
    LIMIT 1;

    -- If no exact match, try partial match (variety name contains global recipe variety name)
    IF _variety_id IS NULL THEN
        SELECT varietyid INTO _variety_id
        FROM varieties
        WHERE LOWER(name) LIKE '%' || LOWER(_global_recipe.variety_name) || '%'
        LIMIT 1;
    END IF;

    -- If still no match, try reverse partial match (global recipe variety name contains variety name)
    IF _variety_id IS NULL THEN
        SELECT varietyid INTO _variety_id
        FROM varieties
        WHERE LOWER(_global_recipe.variety_name) LIKE '%' || LOWER(name) || '%'
        LIMIT 1;
    END IF;

    -- Create farm recipe copy with variety_id
    INSERT INTO recipes (recipe_name, variety_name, variety_id, description, notes, farm_uuid, created_by, is_active)
    VALUES (
        _final_recipe_name,
        _global_recipe.variety_name,
        _variety_id,
        _global_recipe.description,
        _global_recipe.notes,
        p_farm_uuid,
        p_created_by,
        true
    )
    RETURNING recipe_id INTO _new_recipe_id;

    -- Copy all steps
    INSERT INTO steps (recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color, farm_uuid, created_by)
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
        p_created_by::VARCHAR
    FROM global_steps
    WHERE global_recipe_id = p_global_recipe_id
    ORDER BY sequence_order;

    RETURN _new_recipe_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
