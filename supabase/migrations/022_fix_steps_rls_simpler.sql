-- Migration: Simpler fix for steps RLS policy
-- Description: Use a more direct approach that doesn't rely on complex subqueries

-- Drop all existing policies on steps
DROP POLICY IF EXISTS "Users can view farm steps" ON steps;
DROP POLICY IF EXISTS "Users can manage farm steps" ON steps;
DROP POLICY IF EXISTS "Allow select on steps" ON steps;
DROP POLICY IF EXISTS "Allow all on steps" ON steps;
DROP POLICY IF EXISTS "Enable read access for all users" ON steps;
DROP POLICY IF EXISTS "steps_select_policy" ON steps;

-- Temporarily disable RLS to test if that's the issue
-- ALTER TABLE steps DISABLE ROW LEVEL SECURITY;

-- Create a simple, permissive policy that allows authenticated users to read all steps
-- Steps are not sensitive data - they're just recipe instructions
CREATE POLICY "Authenticated users can view steps" ON steps
    FOR SELECT
    TO authenticated
    USING (true);

-- Create a policy for managing steps (insert/update/delete) - only for farm owners/editors
CREATE POLICY "Farm users can manage steps" ON steps
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM recipes r
            JOIN profile p ON r.farm_uuid = p.farm_uuid
            WHERE r.recipe_id = steps.recipe_id
              AND p.id = auth.uid()
              AND p.role IN ('Owner', 'Editor')
        )
    );

-- Make sure RLS is enabled
ALTER TABLE steps ENABLE ROW LEVEL SECURITY;

-- Also ensure tray_steps has proper policies
DROP POLICY IF EXISTS "Users can view their tray steps" ON tray_steps;
DROP POLICY IF EXISTS "Users can insert tray steps" ON tray_steps;
DROP POLICY IF EXISTS "Users can update tray steps" ON tray_steps;
DROP POLICY IF EXISTS "Users can delete tray steps" ON tray_steps;

-- Simple policy: authenticated users can view tray_steps for trays in their farm
CREATE POLICY "Authenticated users can view tray steps" ON tray_steps
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM trays t
            JOIN profile p ON t.farm_uuid = p.farm_uuid
            WHERE t.tray_id = tray_steps.tray_id
              AND p.id = auth.uid()
        )
    );

-- Allow insert/update/delete for farm users
CREATE POLICY "Farm users can manage tray steps" ON tray_steps
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM trays t
            JOIN profile p ON t.farm_uuid = p.farm_uuid
            WHERE t.tray_id = tray_steps.tray_id
              AND p.id = auth.uid()
              AND p.role IN ('Owner', 'Editor')
        )
    );

-- Ensure RLS is enabled on tray_steps
ALTER TABLE tray_steps ENABLE ROW LEVEL SECURITY;

-- Also add columns to tray_steps if missing
ALTER TABLE tray_steps ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;
ALTER TABLE tray_steps ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tray_steps ADD COLUMN IF NOT EXISTS skipped BOOLEAN DEFAULT FALSE;
ALTER TABLE tray_steps ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMPTZ;
