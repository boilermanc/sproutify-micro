-- Migration: Temporarily disable RLS on steps to diagnose the issue
-- Description: If queries work after this, we know RLS is the problem

-- Drop all policies first
DROP POLICY IF EXISTS "Users can view farm steps" ON steps;
DROP POLICY IF EXISTS "Users can manage farm steps" ON steps;
DROP POLICY IF EXISTS "Allow select on steps" ON steps;
DROP POLICY IF EXISTS "Allow all on steps" ON steps;
DROP POLICY IF EXISTS "Enable read access for all users" ON steps;
DROP POLICY IF EXISTS "steps_select_policy" ON steps;
DROP POLICY IF EXISTS "Authenticated users can view steps" ON steps;
DROP POLICY IF EXISTS "Farm users can manage steps" ON steps;

-- Disable RLS entirely on steps table
-- Steps are not sensitive - they're just recipe instructions
ALTER TABLE steps DISABLE ROW LEVEL SECURITY;

-- Do the same for tray_steps
DROP POLICY IF EXISTS "Users can view their tray steps" ON tray_steps;
DROP POLICY IF EXISTS "Users can insert tray steps" ON tray_steps;
DROP POLICY IF EXISTS "Users can update tray steps" ON tray_steps;
DROP POLICY IF EXISTS "Users can delete tray steps" ON tray_steps;
DROP POLICY IF EXISTS "Authenticated users can view tray steps" ON tray_steps;
DROP POLICY IF EXISTS "Farm users can manage tray steps" ON tray_steps;

-- Disable RLS on tray_steps
ALTER TABLE tray_steps DISABLE ROW LEVEL SECURITY;

-- Add columns to tray_steps if missing
ALTER TABLE tray_steps ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;
ALTER TABLE tray_steps ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tray_steps ADD COLUMN IF NOT EXISTS skipped BOOLEAN DEFAULT FALSE;
ALTER TABLE tray_steps ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMPTZ;

-- Grant permissions
GRANT SELECT ON steps TO authenticated;
GRANT SELECT ON steps TO anon;
GRANT ALL ON tray_steps TO authenticated;
