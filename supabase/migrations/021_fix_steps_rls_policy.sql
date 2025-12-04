-- Migration: Fix steps RLS policy to allow querying by recipe_id
-- Description: The existing policy may be too restrictive for fetching step data

-- First, check if RLS is enabled and drop/recreate the policy
-- Drop existing policies to recreate them correctly
DROP POLICY IF EXISTS "Users can view farm steps" ON steps;
DROP POLICY IF EXISTS "Users can manage farm steps" ON steps;
DROP POLICY IF EXISTS "Allow select on steps" ON steps;
DROP POLICY IF EXISTS "Allow all on steps" ON steps;

-- Check if RLS is enabled on steps table
DO $$
BEGIN
    -- Enable RLS if not already enabled
    ALTER TABLE steps ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN
        -- Already enabled, that's fine
        NULL;
END $$;

-- Create a permissive SELECT policy for steps
-- Steps should be viewable if:
-- 1. The recipe belongs to the user's farm
-- 2. OR the recipe is a global recipe (farm_uuid IS NULL)
-- 3. OR the recipe was created for the user's farm (via copy)
CREATE POLICY "Users can view farm steps" ON steps
    FOR SELECT USING (
        -- User's farm recipes
        recipe_id IN (
            SELECT recipe_id FROM recipes
            WHERE farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid())
        )
        OR
        -- Global recipes (no farm_uuid)
        recipe_id IN (SELECT recipe_id FROM recipes WHERE farm_uuid IS NULL)
        OR
        -- Direct check - if no auth context, allow reading all (for service role)
        auth.uid() IS NULL
    );

-- Create a policy for managing steps (insert/update/delete)
CREATE POLICY "Users can manage farm steps" ON steps
    FOR ALL USING (
        recipe_id IN (
            SELECT recipe_id FROM recipes
            WHERE farm_uuid IN (
                SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
            )
        )
    );

-- Also ensure tray_steps columns exist
ALTER TABLE tray_steps ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;
ALTER TABLE tray_steps ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tray_steps ADD COLUMN IF NOT EXISTS skipped BOOLEAN DEFAULT FALSE;
ALTER TABLE tray_steps ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMPTZ;

-- Create indexes for tray_steps if they don't exist
CREATE INDEX IF NOT EXISTS idx_tray_steps_tray_id ON tray_steps(tray_id);
CREATE INDEX IF NOT EXISTS idx_tray_steps_step_id ON tray_steps(step_id);
