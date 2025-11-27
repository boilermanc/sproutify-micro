-- Add location field to trays table
ALTER TABLE trays 
ADD COLUMN IF NOT EXISTS location TEXT;

-- Add comment to explain the field
COMMENT ON COLUMN trays.location IS 'Physical location of the tray (e.g., "Rack A • Shelf 1")';

