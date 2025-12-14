-- Migration: Add batch_id column to tray_creation_requests table
-- Description: Adds batch_id column to support seed batch selection for tray creation

-- Add batch_id column if it doesn't exist
DO $$ 
BEGIN
    -- Check if column already exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'tray_creation_requests' 
        AND column_name = 'batch_id'
    ) THEN
        -- Add the column
        ALTER TABLE tray_creation_requests 
        ADD COLUMN batch_id INTEGER;
        
        -- Add foreign key constraint - check which column name exists in seedbatches
        -- Try batchid first (most likely based on error message)
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'seedbatches' AND column_name = 'batchid'
        ) THEN
            ALTER TABLE tray_creation_requests 
            ADD CONSTRAINT tray_creation_requests_batch_id_fkey 
            FOREIGN KEY (batch_id) REFERENCES seedbatches(batchid);
        ELSIF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'seedbatches' AND column_name = 'batch_id'
        ) THEN
            ALTER TABLE tray_creation_requests 
            ADD CONSTRAINT tray_creation_requests_batch_id_fkey 
            FOREIGN KEY (batch_id) REFERENCES seedbatches(batch_id);
        END IF;
        
        -- Add comment for documentation
        COMMENT ON COLUMN tray_creation_requests.batch_id IS 'References seedbatches - required for seeding tasks';
    END IF;
END $$;

