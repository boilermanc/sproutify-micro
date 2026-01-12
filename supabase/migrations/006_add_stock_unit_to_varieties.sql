-- Add stock unit tracking to varieties table
ALTER TABLE varieties 
ADD COLUMN IF NOT EXISTS stock_unit TEXT DEFAULT 'g';

-- Add comment for documentation
COMMENT ON COLUMN varieties.stock_unit IS 'Unit of measure for stock quantity (g, kg, oz, lbs, etc.)';




























