-- Migration: Add status tracking for trays
-- Description: Allows marking trays as lost/failed before harvest with reason tracking

-- Add status column to trays (default 'active' for existing trays)
ALTER TABLE trays ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Add loss_reason column to track why a tray was lost
ALTER TABLE trays ADD COLUMN IF NOT EXISTS loss_reason VARCHAR(100);

-- Add lost_at timestamp
ALTER TABLE trays ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ;

-- Add notes for additional context
ALTER TABLE trays ADD COLUMN IF NOT EXISTS loss_notes TEXT;

-- Create an index for filtering by status
CREATE INDEX IF NOT EXISTS idx_trays_status ON trays(farm_uuid, status);

-- Add comments for documentation
COMMENT ON COLUMN trays.status IS 'Tray status: active, harvested, lost';
COMMENT ON COLUMN trays.loss_reason IS 'Reason for loss: disease, dried_out, bad_seed, contamination, pest, mold, other';
COMMENT ON COLUMN trays.lost_at IS 'Timestamp when tray was marked as lost';
COMMENT ON COLUMN trays.loss_notes IS 'Additional notes about the loss';

-- Update existing harvested trays to have status='harvested'
UPDATE trays SET status = 'harvested' WHERE harvest_date IS NOT NULL AND status = 'active';
