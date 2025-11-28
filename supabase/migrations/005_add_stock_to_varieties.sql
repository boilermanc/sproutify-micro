-- Add stock tracking to varieties table
ALTER TABLE varieties 
ADD COLUMN IF NOT EXISTS stock NUMERIC DEFAULT 0;

-- Add index for stock queries
CREATE INDEX IF NOT EXISTS idx_varieties_stock ON varieties(stock);

-- Add comment for documentation
COMMENT ON COLUMN varieties.stock IS 'Current stock quantity for this variety';



