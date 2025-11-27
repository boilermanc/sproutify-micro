-- Create weekly_tasks table (generated weekly tasks)
CREATE TABLE IF NOT EXISTS weekly_tasks (
    task_id SERIAL PRIMARY KEY,
    farm_uuid UUID REFERENCES farms(farm_uuid),
    task_type TEXT NOT NULL CHECK (task_type IN ('soaking', 'sowing', 'uncovering', 'harvesting')),
    recipe_id INTEGER REFERENCES recipes(recipe_id),
    week_start_date DATE NOT NULL, -- Start of the week (Monday)
    week_number INTEGER, -- Week number in the year
    task_date DATE NOT NULL, -- Specific date for the task
    quantity INTEGER DEFAULT 1, -- Number of trays/tasks
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed', 'skipped')),
    notes TEXT,
    assigned_to UUID REFERENCES profile(id),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create task_templates table (task templates by recipe step type)
CREATE TABLE IF NOT EXISTS task_templates (
    template_id SERIAL PRIMARY KEY,
    farm_uuid UUID REFERENCES farms(farm_uuid),
    recipe_id INTEGER REFERENCES recipes(recipe_id),
    step_id INTEGER REFERENCES steps(step_id),
    task_type TEXT NOT NULL CHECK (task_type IN ('soaking', 'sowing', 'uncovering', 'harvesting')),
    step_description TEXT,
    days_from_sow INTEGER NOT NULL, -- Days from sowing date
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE weekly_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for weekly_tasks
CREATE POLICY "Users can view farm weekly tasks" ON weekly_tasks
    FOR SELECT USING (farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid()));

CREATE POLICY "Users can manage farm weekly tasks" ON weekly_tasks
    FOR ALL USING (farm_uuid IN (
        SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
    ));

-- RLS Policies for task_templates
CREATE POLICY "Users can view farm task templates" ON task_templates
    FOR SELECT USING (farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid()));

CREATE POLICY "Users can manage farm task templates" ON task_templates
    FOR ALL USING (farm_uuid IN (
        SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
    ));

-- Add indexes for performance
CREATE INDEX idx_weekly_tasks_farm_uuid ON weekly_tasks(farm_uuid);
CREATE INDEX idx_weekly_tasks_task_type ON weekly_tasks(task_type);
CREATE INDEX idx_weekly_tasks_recipe_id ON weekly_tasks(recipe_id);
CREATE INDEX idx_weekly_tasks_task_date ON weekly_tasks(task_date);
CREATE INDEX idx_weekly_tasks_week_start_date ON weekly_tasks(week_start_date);
CREATE INDEX idx_weekly_tasks_status ON weekly_tasks(status);
CREATE INDEX idx_task_templates_farm_uuid ON task_templates(farm_uuid);
CREATE INDEX idx_task_templates_recipe_id ON task_templates(recipe_id);
CREATE INDEX idx_task_templates_step_id ON task_templates(step_id);

