-- Migration: Add delivery and maintenance task types
-- Description: Extends weekly_tasks to support delivery and maintenance tasks

-- Drop the existing check constraint
ALTER TABLE weekly_tasks DROP CONSTRAINT IF EXISTS weekly_tasks_task_type_check;

-- Add new check constraint with additional task types
ALTER TABLE weekly_tasks ADD CONSTRAINT weekly_tasks_task_type_check 
  CHECK (task_type IN ('soaking', 'sowing', 'uncovering', 'harvesting', 'delivery', 'maintenance'));

-- Make recipe_id nullable for custom tasks (like maintenance tasks)
ALTER TABLE weekly_tasks ALTER COLUMN recipe_id DROP NOT NULL;

-- Add task_description column for custom tasks
ALTER TABLE weekly_tasks ADD COLUMN IF NOT EXISTS task_description TEXT;

-- Add index for task_description
CREATE INDEX IF NOT EXISTS idx_weekly_tasks_task_description ON weekly_tasks(task_description);

-- Add comment
COMMENT ON COLUMN weekly_tasks.task_description IS 'Description for custom tasks like "Clean Trays"';
COMMENT ON COLUMN weekly_tasks.recipe_id IS 'Recipe ID, NULL for custom tasks like maintenance';





