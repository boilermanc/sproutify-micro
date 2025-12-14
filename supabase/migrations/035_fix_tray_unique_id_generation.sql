-- Migration: Fix tray_unique_id generation
-- Description: Ensures tray_unique_id is always generated when trays are created, even if the creating trigger doesn't set it

-- Create or replace function to generate tray_unique_id if not provided
CREATE OR REPLACE FUNCTION generate_tray_unique_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If tray_unique_id is not provided, generate it
  IF NEW.tray_unique_id IS NULL OR NEW.tray_unique_id = '' THEN
    NEW.tray_unique_id := 'TRY-' || 
      EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || 
      UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 9));
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_generate_tray_unique_id ON trays;

-- Create trigger to generate tray_unique_id before insert
CREATE TRIGGER trg_generate_tray_unique_id
BEFORE INSERT ON trays
FOR EACH ROW
EXECUTE FUNCTION generate_tray_unique_id();

COMMENT ON FUNCTION generate_tray_unique_id() IS 'Generates a unique tray ID in format TRY-{timestamp}-{random} if not provided during insert';



