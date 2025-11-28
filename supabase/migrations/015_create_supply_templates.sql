-- Create supply_templates table for managing preset supplies
-- This allows Sproutify team to add default templates and users to add their own
CREATE TABLE IF NOT EXISTS supply_templates (
    template_id SERIAL PRIMARY KEY,
    farm_uuid UUID REFERENCES farms(farm_uuid), -- NULL for global/Sproutify templates
    template_name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT DEFAULT 'pcs',
    color TEXT, -- Optional color for trays/packaging
    default_low_stock_threshold NUMERIC DEFAULT 10,
    description TEXT,
    is_global BOOLEAN DEFAULT FALSE, -- TRUE for Sproutify-managed templates
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES profile(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add vendor_id to supplies table (optional vendor relationship)
-- First add the column without the foreign key constraint
ALTER TABLE supplies ADD COLUMN IF NOT EXISTS vendor_id INTEGER;

-- Then add the foreign key constraint based on which column exists in vendors table
DO $$ 
BEGIN
    -- Try to add foreign key constraint with vendorid (if that's the actual column name)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vendors' AND column_name = 'vendorid'
    ) THEN
        -- Add foreign key constraint if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'supplies' 
            AND constraint_name = 'supplies_vendor_id_fkey'
        ) THEN
            ALTER TABLE supplies 
            ADD CONSTRAINT supplies_vendor_id_fkey 
            FOREIGN KEY (vendor_id) REFERENCES vendors(vendorid);
        END IF;
    -- Otherwise try with vendor_id
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vendors' AND column_name = 'vendor_id'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'supplies' 
            AND constraint_name = 'supplies_vendor_id_fkey'
        ) THEN
            ALTER TABLE supplies 
            ADD CONSTRAINT supplies_vendor_id_fkey 
            FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id);
        END IF;
    END IF;
END $$;

-- Create index for supply_templates
CREATE INDEX IF NOT EXISTS idx_supply_templates_farm_uuid ON supply_templates(farm_uuid);
CREATE INDEX IF NOT EXISTS idx_supply_templates_category ON supply_templates(category);
CREATE INDEX IF NOT EXISTS idx_supply_templates_is_global ON supply_templates(is_global);
CREATE INDEX IF NOT EXISTS idx_supply_templates_is_active ON supply_templates(is_active);

-- Create index for vendor relationship in supplies
CREATE INDEX IF NOT EXISTS idx_supplies_vendor_id ON supplies(vendor_id);

-- Enable Row Level Security
ALTER TABLE supply_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for supply_templates
-- Users can view global templates and their own farm templates
CREATE POLICY "Users can view supply templates" ON supply_templates
    FOR SELECT USING (
        is_global = TRUE OR 
        farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid())
    );

-- Users can manage their own farm templates, but not global ones
CREATE POLICY "Users can manage farm supply templates" ON supply_templates
    FOR ALL USING (
        farm_uuid IN (
            SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
        ) AND is_global = FALSE
    );

-- Only admins/Sproutify team can manage global templates (this would need to be set up separately)
-- For now, we'll allow Owners to create global templates, but in production you'd restrict this

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_supply_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_supply_templates_updated_at
    BEFORE UPDATE ON supply_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_supply_templates_updated_at();

-- Seed some default global templates (Sproutify-managed)
INSERT INTO supply_templates (template_name, category, unit, is_global, is_active) VALUES
-- Trays
('1020 Trays (No Holes)', 'Trays', 'pcs', TRUE, TRUE),
('1020 Trays (With Holes)', 'Trays', 'pcs', TRUE, TRUE),
('10x20 Trays (No Holes)', 'Trays', 'pcs', TRUE, TRUE),
('10x20 Trays (With Holes)', 'Trays', 'pcs', TRUE, TRUE),
('5x5 Trays (No Holes)', 'Trays', 'pcs', TRUE, TRUE),
('5x5 Trays (With Holes)', 'Trays', 'pcs', TRUE, TRUE),
('Dome Lids', 'Trays', 'pcs', TRUE, TRUE),
-- Growing Media
('Coco Coir Bricks', 'Growing Media', 'bricks', TRUE, TRUE),
('Coco Coir (Expanded)', 'Growing Media', 'cubic ft', TRUE, TRUE),
('Potting Soil', 'Growing Media', 'cubic ft', TRUE, TRUE),
('Seed Starting Mix', 'Growing Media', 'cubic ft', TRUE, TRUE),
('Perlite', 'Growing Media', 'cubic ft', TRUE, TRUE),
('Vermiculite', 'Growing Media', 'cubic ft', TRUE, TRUE),
-- Packaging
('2oz Containers', 'Packaging', 'pcs', TRUE, TRUE),
('4oz Containers', 'Packaging', 'pcs', TRUE, TRUE),
('8oz Containers', 'Packaging', 'pcs', TRUE, TRUE),
('16oz Containers', 'Packaging', 'pcs', TRUE, TRUE),
('2oz Lids', 'Packaging', 'pcs', TRUE, TRUE),
('4oz Lids', 'Packaging', 'pcs', TRUE, TRUE),
('Clamshell Containers (2oz)', 'Packaging', 'pcs', TRUE, TRUE),
('Clamshell Containers (4oz)', 'Packaging', 'pcs', TRUE, TRUE),
('Produce Bags', 'Packaging', 'pcs', TRUE, TRUE),
('Labels', 'Packaging', 'pcs', TRUE, TRUE)
ON CONFLICT DO NOTHING;

