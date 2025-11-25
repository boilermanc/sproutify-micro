-- Create farms table
CREATE TABLE IF NOT EXISTS farms (
    farm_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Create profile table
CREATE TABLE IF NOT EXISTS profile (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    farm_uuid UUID REFERENCES farms(farm_uuid),
    role TEXT NOT NULL CHECK (role IN ('Owner', 'Editor', 'Viewer')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create varieties table
CREATE TABLE IF NOT EXISTS varieties (
    variety_id SERIAL PRIMARY KEY,
    variety_name TEXT NOT NULL,
    description TEXT,
    farm_uuid UUID REFERENCES farms(farm_uuid),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create recipes table
CREATE TABLE IF NOT EXISTS recipes (
    recipe_id SERIAL PRIMARY KEY,
    recipe_name TEXT NOT NULL,
    description TEXT,
    type TEXT,
    variety_name TEXT,
    farm_uuid UUID REFERENCES farms(farm_uuid),
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_by UUID REFERENCES profile(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create steps table
CREATE TABLE IF NOT EXISTS steps (
    step_id SERIAL PRIMARY KEY,
    recipe_id INTEGER REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    step_description TEXT NOT NULL,
    duration_days INTEGER DEFAULT 0
);

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
    customer_id SERIAL PRIMARY KEY,
    farm_uuid UUID REFERENCES farms(farm_uuid),
    customer_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create vendors table
CREATE TABLE IF NOT EXISTS vendors (
    vendor_id SERIAL PRIMARY KEY,
    farm_uuid UUID REFERENCES farms(farm_uuid),
    vendor_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create seedbatches table
CREATE TABLE IF NOT EXISTS seedbatches (
    batch_id SERIAL PRIMARY KEY,
    farm_uuid UUID REFERENCES farms(farm_uuid),
    variety_name TEXT NOT NULL,
    purchase_date DATE,
    quantity NUMERIC,
    vendor_id INTEGER REFERENCES vendors(vendor_id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trays table
CREATE TABLE IF NOT EXISTS trays (
    tray_id SERIAL PRIMARY KEY,
    farm_uuid UUID REFERENCES farms(farm_uuid),
    tray_unique_id TEXT UNIQUE NOT NULL,
    recipe_id INTEGER REFERENCES recipes(recipe_id),
    customer_id INTEGER REFERENCES customers(customer_id),
    sow_date TIMESTAMP WITH TIME ZONE,
    harvest_date TIMESTAMP WITH TIME ZONE,
    yield NUMERIC,
    batch_id INTEGER,
    created_by UUID REFERENCES profile(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create tray_steps table
CREATE TABLE IF NOT EXISTS tray_steps (
    id SERIAL PRIMARY KEY,
    tray_id INTEGER REFERENCES trays(tray_id) ON DELETE CASCADE,
    step_id INTEGER REFERENCES steps(step_id),
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create daily_tasks_view as a view
CREATE OR REPLACE VIEW daily_tasks_view AS
SELECT
    ts.id as task_id,
    t.farm_uuid,
    t.sow_date::DATE + s.duration_days AS task_date,
    s.step_description as task_description,
    ts.completed as is_completed,
    t.tray_id
FROM tray_steps ts
JOIN trays t ON ts.tray_id = t.tray_id
JOIN steps s ON ts.step_id = s.step_id
WHERE NOT ts.completed;

-- Create profile_with_farm view
CREATE OR REPLACE VIEW profile_with_farm AS
SELECT
    p.id,
    p.email,
    p.name,
    p.farm_uuid,
    f.farm_name,
    p.role
FROM profile p
LEFT JOIN farms f ON p.farm_uuid = f.farm_uuid;

-- Create recipes_with_creator_name view
CREATE OR REPLACE VIEW recipes_with_creator_name AS
SELECT
    r.recipe_id,
    r.recipe_name,
    r.variety_name,
    r.description,
    r.type,
    r.notes,
    p.name as creator_name,
    r.created_at
FROM recipes r
LEFT JOIN profile p ON r.created_by = p.id;

-- Enable Row Level Security
ALTER TABLE farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE varieties ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE seedbatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE trays ENABLE ROW LEVEL SECURITY;
ALTER TABLE tray_steps ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (allow authenticated users to access their farm's data)
CREATE POLICY "Users can view their farm" ON farms
    FOR SELECT USING (auth.uid() IN (SELECT id FROM profile WHERE farm_uuid = farms.farm_uuid));

CREATE POLICY "Users can view their profile" ON profile
    FOR ALL USING (auth.uid() = id OR auth.uid() IN (
        SELECT id FROM profile WHERE farm_uuid = (SELECT farm_uuid FROM profile WHERE id = auth.uid()) AND role = 'Owner'
    ));

CREATE POLICY "Users can view farm varieties" ON varieties
    FOR SELECT USING (farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid()));

CREATE POLICY "Users can manage farm varieties" ON varieties
    FOR ALL USING (farm_uuid IN (
        SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
    ));

CREATE POLICY "Users can view farm recipes" ON recipes
    FOR SELECT USING (farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid()));

CREATE POLICY "Users can manage farm recipes" ON recipes
    FOR ALL USING (farm_uuid IN (
        SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
    ));

-- Add indexes for performance
CREATE INDEX idx_trays_farm_uuid ON trays(farm_uuid);
CREATE INDEX idx_trays_tray_unique_id ON trays(tray_unique_id);
CREATE INDEX idx_recipes_farm_uuid ON recipes(farm_uuid);
CREATE INDEX idx_varieties_farm_uuid ON varieties(farm_uuid);
CREATE INDEX idx_profile_farm_uuid ON profile(farm_uuid);
CREATE INDEX idx_customers_farm_uuid ON customers(farm_uuid);
CREATE INDEX idx_vendors_farm_uuid ON vendors(farm_uuid);
