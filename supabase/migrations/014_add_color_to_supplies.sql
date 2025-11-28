-- Add color field to supplies table for trays and other colored items
ALTER TABLE supplies ADD COLUMN IF NOT EXISTS color TEXT;

-- Create index for color filtering
CREATE INDEX IF NOT EXISTS idx_supplies_color ON supplies(color);

-- Add comment
COMMENT ON COLUMN supplies.color IS 'Color of the supply item (e.g., Black, White, Green for trays)';


