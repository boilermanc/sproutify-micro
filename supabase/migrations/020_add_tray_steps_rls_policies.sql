-- Migration: Add RLS policies for tray_steps table
-- Description: The tray_steps table has RLS enabled but no policies defined,
-- causing all queries to fail with 400 errors

-- Drop existing policies if any (to make this idempotent)
DROP POLICY IF EXISTS "Users can view their tray steps" ON tray_steps;
DROP POLICY IF EXISTS "Users can manage their tray steps" ON tray_steps;
DROP POLICY IF EXISTS "Users can insert tray steps" ON tray_steps;
DROP POLICY IF EXISTS "Users can update tray steps" ON tray_steps;
DROP POLICY IF EXISTS "Users can delete tray steps" ON tray_steps;

-- Create SELECT policy - users can view tray_steps for trays in their farm
CREATE POLICY "Users can view their tray steps" ON tray_steps
    FOR SELECT USING (
        tray_id IN (
            SELECT tray_id FROM trays
            WHERE farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid())
        )
    );

-- Create INSERT policy - users can insert tray_steps for trays in their farm
CREATE POLICY "Users can insert tray steps" ON tray_steps
    FOR INSERT WITH CHECK (
        tray_id IN (
            SELECT tray_id FROM trays
            WHERE farm_uuid IN (
                SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
            )
        )
    );

-- Create UPDATE policy - users can update tray_steps for trays in their farm
CREATE POLICY "Users can update tray steps" ON tray_steps
    FOR UPDATE USING (
        tray_id IN (
            SELECT tray_id FROM trays
            WHERE farm_uuid IN (
                SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
            )
        )
    );

-- Create DELETE policy - users can delete tray_steps for trays in their farm
CREATE POLICY "Users can delete tray steps" ON tray_steps
    FOR DELETE USING (
        tray_id IN (
            SELECT tray_id FROM trays
            WHERE farm_uuid IN (
                SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
            )
        )
    );

-- Also add missing RLS policies for steps table if not present
DROP POLICY IF EXISTS "Users can view farm steps" ON steps;
DROP POLICY IF EXISTS "Users can manage farm steps" ON steps;

CREATE POLICY "Users can view farm steps" ON steps
    FOR SELECT USING (
        recipe_id IN (
            SELECT recipe_id FROM recipes
            WHERE farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid())
        )
        OR
        recipe_id IN (SELECT recipe_id FROM recipes WHERE farm_uuid IS NULL)
    );

CREATE POLICY "Users can manage farm steps" ON steps
    FOR ALL USING (
        recipe_id IN (
            SELECT recipe_id FROM recipes
            WHERE farm_uuid IN (
                SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
            )
        )
    );

-- Add index for tray_steps performance
CREATE INDEX IF NOT EXISTS idx_tray_steps_tray_id ON tray_steps(tray_id);
CREATE INDEX IF NOT EXISTS idx_tray_steps_step_id ON tray_steps(step_id);

-- Add RLS policies for tray_creation_requests if the table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'tray_creation_requests') THEN
        -- Enable RLS if not already enabled
        ALTER TABLE tray_creation_requests ENABLE ROW LEVEL SECURITY;

        -- Drop existing policies
        DROP POLICY IF EXISTS "Users can view their tray creation requests" ON tray_creation_requests;
        DROP POLICY IF EXISTS "Users can insert tray creation requests" ON tray_creation_requests;
        DROP POLICY IF EXISTS "Users can update tray creation requests" ON tray_creation_requests;
        DROP POLICY IF EXISTS "Users can delete tray creation requests" ON tray_creation_requests;

        -- Create policies
        EXECUTE 'CREATE POLICY "Users can view their tray creation requests" ON tray_creation_requests
            FOR SELECT USING (
                farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid())
            )';

        EXECUTE 'CREATE POLICY "Users can insert tray creation requests" ON tray_creation_requests
            FOR INSERT WITH CHECK (
                farm_uuid IN (
                    SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN (''Owner'', ''Editor'')
                )
            )';

        EXECUTE 'CREATE POLICY "Users can update tray creation requests" ON tray_creation_requests
            FOR UPDATE USING (
                farm_uuid IN (
                    SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN (''Owner'', ''Editor'')
                )
            )';

        EXECUTE 'CREATE POLICY "Users can delete tray creation requests" ON tray_creation_requests
            FOR DELETE USING (
                farm_uuid IN (
                    SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN (''Owner'', ''Editor'')
                )
            )';
    END IF;
END $$;
