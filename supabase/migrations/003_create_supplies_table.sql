-- Create supplies table for inventory management
CREATE TABLE IF NOT EXISTS supplies (
    supply_id SERIAL PRIMARY KEY,
    farm_uuid UUID REFERENCES farms(farm_uuid),
    supply_name TEXT NOT NULL,
    category TEXT,
    stock NUMERIC DEFAULT 0,
    unit TEXT DEFAULT 'pcs',
    low_stock_threshold NUMERIC DEFAULT 10,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_by UUID REFERENCES profile(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE supplies ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Users can view farm supplies" ON supplies
    FOR SELECT USING (farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid()));

CREATE POLICY "Users can manage farm supplies" ON supplies
    FOR ALL USING (farm_uuid IN (
        SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
    ));

-- Create index for performance
CREATE INDEX idx_supplies_farm_uuid ON supplies(farm_uuid);
CREATE INDEX idx_supplies_category ON supplies(category);
CREATE INDEX idx_supplies_is_active ON supplies(is_active);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_supplies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_supplies_updated_at
    BEFORE UPDATE ON supplies
    FOR EACH ROW
    EXECUTE FUNCTION update_supplies_updated_at();



























