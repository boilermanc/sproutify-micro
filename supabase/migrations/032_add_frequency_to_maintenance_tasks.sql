-- Migration: Add frequency column to maintenance_tasks
-- Description: Supports different recurrence frequencies (daily, weekly, bi-weekly, monthly, yearly)

ALTER TABLE maintenance_tasks 
ADD COLUMN IF NOT EXISTS frequency TEXT DEFAULT 'weekly' 
CHECK (frequency IN ('daily', 'weekly', 'bi-weekly', 'monthly', 'yearly', 'one-time'));

-- Add day_of_month column for monthly tasks
ALTER TABLE maintenance_tasks 
ADD COLUMN IF NOT EXISTS day_of_month INTEGER CHECK (day_of_month >= 1 AND day_of_month <= 31);

-- Update existing records to have frequency
UPDATE maintenance_tasks 
SET frequency = CASE 
  WHEN task_date IS NOT NULL THEN 'one-time'
  ELSE 'weekly'
END
WHERE frequency IS NULL;

-- Add comments
COMMENT ON COLUMN maintenance_tasks.frequency IS 'Recurrence frequency: daily, weekly, bi-weekly, monthly, yearly, or one-time';
COMMENT ON COLUMN maintenance_tasks.day_of_month IS 'Day of month (1-31) for monthly recurring tasks';

