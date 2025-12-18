-- Migration: Add farm_uuid and created_by to steps table
-- Description: Adds required farm_uuid and created_by columns to the steps table for proper data isolation and tracking

-- ============================================
-- 1. Add farm_uuid column to steps table
-- ============================================
ALTER TABLE steps ADD COLUMN IF NOT EXISTS farm_uuid UUID REFERENCES farms(farm_uuid);
COMMENT ON COLUMN steps.farm_uuid IS 'Foreign key to farms table for data isolation. Required for multi-tenant support.';

-- ============================================
-- 2. Add created_by column to steps table
-- ============================================
ALTER TABLE steps ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
COMMENT ON COLUMN steps.created_by IS 'User ID who created this step. Stored as VARCHAR to match existing schema patterns.';

-- ============================================
-- 3. Make farm_uuid NOT NULL (after adding column)
-- ============================================
-- Note: We can't make it NOT NULL immediately if there are existing rows with NULL values
-- If there are existing steps, you may need to backfill the data first
-- For now, we'll leave it nullable but the application should always provide it

-- ============================================
-- 4. Add index for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_steps_farm_uuid ON steps(farm_uuid);









