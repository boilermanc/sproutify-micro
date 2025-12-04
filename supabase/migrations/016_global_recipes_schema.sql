-- Migration: Global Recipes Feature
-- Description: Adds global recipes system, pre-sprouting step, mucilaginous seed tracking, and step instructions

-- ============================================
-- 1. Add 'instructions' column to 'steps' table
-- ============================================
ALTER TABLE steps ADD COLUMN IF NOT EXISTS instructions TEXT;

-- ============================================
-- 2. Add 'is_mucilaginous' column to 'varieties' table
-- ============================================
ALTER TABLE varieties ADD COLUMN IF NOT EXISTS is_mucilaginous BOOLEAN DEFAULT false;

-- Mark known mucilaginous varieties (column is 'name' not 'variety_name')
UPDATE varieties SET is_mucilaginous = true WHERE name ILIKE '%basil%';
UPDATE varieties SET is_mucilaginous = true WHERE name ILIKE '%chia%';
UPDATE varieties SET is_mucilaginous = true WHERE name ILIKE '%cress%';
UPDATE varieties SET is_mucilaginous = true WHERE name ILIKE '%flax%';

-- ============================================
-- 3. Insert new step_description (Pre-sprouting)
-- ============================================
-- Note: step_descriptions uses 'step_color' not 'color'
-- Only insert if Pre-sprouting doesn't already exist
INSERT INTO step_descriptions (description_name, description_details, step_color)
SELECT 'Pre-sprouting', 'After soaking, drain seeds and leave in colander, rinsing periodically until root tails emerge.', '#F5DEB3'
WHERE NOT EXISTS (
    SELECT 1 FROM step_descriptions WHERE description_name = 'Pre-sprouting'
);

-- ============================================
-- 4. Create 'global_recipes' table
-- ============================================
CREATE TABLE IF NOT EXISTS global_recipes (
    global_recipe_id SERIAL PRIMARY KEY,
    recipe_name VARCHAR(255) NOT NULL,
    variety_name VARCHAR(255),
    description TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_global_recipes_is_active ON global_recipes(is_active);
CREATE INDEX IF NOT EXISTS idx_global_recipes_variety_name ON global_recipes(variety_name);

-- ============================================
-- 5. Create 'global_steps' table
-- ============================================
CREATE TABLE IF NOT EXISTS global_steps (
    global_step_id SERIAL PRIMARY KEY,
    global_recipe_id INTEGER REFERENCES global_recipes(global_recipe_id) ON DELETE CASCADE,
    step_name VARCHAR(255) NOT NULL,
    description_id INTEGER REFERENCES step_descriptions(description_id),
    description_name VARCHAR(100),
    sequence_order INTEGER NOT NULL,
    duration NUMERIC(10,2),
    duration_unit VARCHAR(20) DEFAULT 'Days',
    instructions TEXT,
    step_color VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_global_steps_recipe_id ON global_steps(global_recipe_id);
CREATE INDEX IF NOT EXISTS idx_global_steps_sequence ON global_steps(global_recipe_id, sequence_order);

-- ============================================
-- 6. Create 'farm_global_recipes' junction table
-- ============================================
CREATE TABLE IF NOT EXISTS farm_global_recipes (
    id SERIAL PRIMARY KEY,
    farm_uuid UUID NOT NULL REFERENCES farms(farm_uuid) ON DELETE CASCADE,
    global_recipe_id INTEGER NOT NULL REFERENCES global_recipes(global_recipe_id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    activated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(farm_uuid, global_recipe_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_farm_global_recipes_farm ON farm_global_recipes(farm_uuid);
CREATE INDEX IF NOT EXISTS idx_farm_global_recipes_active ON farm_global_recipes(farm_uuid, is_active);

-- ============================================
-- 7. Create copy function with rename requirement
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

    -- Determine the recipe name - require a new name or append (Copy)
    IF p_new_recipe_name IS NOT NULL AND p_new_recipe_name <> '' THEN
        _final_recipe_name := p_new_recipe_name;
    ELSE
        _final_recipe_name := _global_recipe.recipe_name || ' (Copy)';
    END IF;

    -- Create farm recipe copy
    -- Note: recipes table has created_by as UUID type
    INSERT INTO recipes (recipe_name, variety_name, description, notes, farm_uuid, created_by, is_active)
    VALUES (
        _final_recipe_name,
        _global_recipe.variety_name,
        _global_recipe.description,
        _global_recipe.notes,
        p_farm_uuid,
        p_created_by,
        true
    )
    RETURNING recipe_id INTO _new_recipe_id;

    -- Copy all steps
    -- Note: steps table has farm_uuid (NOT NULL), created_by as VARCHAR (NOT NULL)
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

-- ============================================
-- 8. Enable Row Level Security
-- ============================================
ALTER TABLE global_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_global_recipes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 9. RLS Policies for global_recipes
-- ============================================
-- All authenticated users can view active global recipes
CREATE POLICY "Authenticated users can view active global recipes" ON global_recipes
    FOR SELECT
    TO authenticated
    USING (is_active = true);

-- ============================================
-- 10. RLS Policies for global_steps
-- ============================================
-- All authenticated users can view steps for active global recipes
CREATE POLICY "Authenticated users can view global steps" ON global_steps
    FOR SELECT
    TO authenticated
    USING (
        global_recipe_id IN (
            SELECT global_recipe_id FROM global_recipes WHERE is_active = true
        )
    );

-- ============================================
-- 11. RLS Policies for farm_global_recipes
-- ============================================
-- Users can view their farm's enabled global recipes
CREATE POLICY "Users can view their farm global recipes" ON farm_global_recipes
    FOR SELECT
    TO authenticated
    USING (
        farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid())
    );

-- Users can insert/update/delete their farm's global recipe preferences
CREATE POLICY "Users can manage their farm global recipes" ON farm_global_recipes
    FOR ALL
    TO authenticated
    USING (
        farm_uuid IN (
            SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
        )
    )
    WITH CHECK (
        farm_uuid IN (
            SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
        )
    );

-- ============================================
-- 12. Create updated_at trigger for global_recipes
-- ============================================
CREATE OR REPLACE FUNCTION update_global_recipes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_global_recipes_updated_at ON global_recipes;
CREATE TRIGGER trigger_update_global_recipes_updated_at
    BEFORE UPDATE ON global_recipes
    FOR EACH ROW
    EXECUTE FUNCTION update_global_recipes_updated_at();
