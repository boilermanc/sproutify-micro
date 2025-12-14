-- Migration: Add maintenance_task_id to task_completions
-- Description: Properly link maintenance task completions to their source maintenance_tasks record

-- Add maintenance_task_id column to task_completions
ALTER TABLE task_completions 
ADD COLUMN IF NOT EXISTS maintenance_task_id INTEGER REFERENCES maintenance_tasks(maintenance_task_id) ON DELETE CASCADE;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_task_completions_maintenance_task_id 
ON task_completions(maintenance_task_id) 
WHERE maintenance_task_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN task_completions.maintenance_task_id IS 'Links maintenance task completions to their source maintenance_tasks record';
