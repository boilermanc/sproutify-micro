-- Migration: Add missing columns to tray_steps
-- Description: Ensures tray_steps has all required columns for tracking step completion and skipping

-- First, add the completed column if it doesn't exist
ALTER TABLE tray_steps ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;
ALTER TABLE tray_steps ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Add skipped column for tracking missed steps
ALTER TABLE tray_steps ADD COLUMN IF NOT EXISTS skipped BOOLEAN DEFAULT FALSE;
ALTER TABLE tray_steps ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMPTZ;

-- Add index for performance when filtering completed/skipped steps
CREATE INDEX IF NOT EXISTS idx_tray_steps_completed ON tray_steps(tray_id, completed) WHERE completed = true;
CREATE INDEX IF NOT EXISTS idx_tray_steps_skipped ON tray_steps(tray_id, skipped) WHERE skipped = true;

-- Comment for documentation
COMMENT ON COLUMN tray_steps.completed IS 'Whether this step has been completed';
COMMENT ON COLUMN tray_steps.completed_at IS 'Timestamp when the step was completed';
COMMENT ON COLUMN tray_steps.skipped IS 'Whether this step was skipped (user missed the day)';
COMMENT ON COLUMN tray_steps.skipped_at IS 'Timestamp when the step was marked as skipped';
