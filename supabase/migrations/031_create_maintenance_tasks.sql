-- Migration: Create maintenance_tasks table
-- Description: Allows farms to define custom maintenance tasks that repeat weekly

CREATE TABLE IF NOT EXISTS maintenance_tasks (
    maintenance_task_id SERIAL PRIMARY KEY,
    farm_uuid UUID REFERENCES farms(farm_uuid) ON DELETE CASCADE,
    task_name TEXT NOT NULL,
    description TEXT,
    task_type TEXT NOT NULL DEFAULT 'maintenance' CHECK (task_type = 'maintenance'),
    day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 1=Monday, etc. NULL = use default
    task_date DATE, -- Specific date if not recurring weekly
    quantity INTEGER DEFAULT 1,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE maintenance_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view farm maintenance tasks" ON maintenance_tasks
    FOR SELECT USING (farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid()));

CREATE POLICY "Users can manage farm maintenance tasks" ON maintenance_tasks
    FOR ALL USING (farm_uuid IN (
        SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
    ));

-- Add indexes
CREATE INDEX idx_maintenance_tasks_farm_uuid ON maintenance_tasks(farm_uuid);
CREATE INDEX idx_maintenance_tasks_is_active ON maintenance_tasks(is_active);
CREATE INDEX idx_maintenance_tasks_day_of_week ON maintenance_tasks(day_of_week);

-- Add comments
COMMENT ON TABLE maintenance_tasks IS 'Custom maintenance tasks that repeat weekly (e.g., Clean Trays, Equipment Check)';
COMMENT ON COLUMN maintenance_tasks.day_of_week IS 'Day of week (0=Sunday, 1=Monday, etc.). NULL = default to Monday';
COMMENT ON COLUMN maintenance_tasks.task_date IS 'Specific date for one-time tasks. NULL = recurring weekly';










