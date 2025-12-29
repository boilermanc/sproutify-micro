-- Migration: Fix batch_id column in tray_creation_requests
-- Description: Directly adds batch_id column if it doesn't exist, with proper error handling

-- First, verify the table exists
DO $$ 
BEGIN
    -- Check if table exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'tray_creation_requests'
    ) THEN
        RAISE EXCEPTION 'Table tray_creation_requests does not exist';
    END IF;

    -- Add batch_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public'
        AND table_name = 'tray_creation_requests' 
        AND column_name = 'batch_id'
    ) THEN
        -- Add the column without NOT NULL constraint first
        ALTER TABLE tray_creation_requests 
        ADD COLUMN batch_id INTEGER;
        
        RAISE NOTICE 'Added batch_id column to tray_creation_requests';
    ELSE
        RAISE NOTICE 'Column batch_id already exists in tray_creation_requests';
    END IF;
END $$;

-- Add foreign key constraint separately (if column was just added or constraint doesn't exist)
DO $$
BEGIN
    -- Check if foreign key constraint already exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu 
            ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_schema = 'public'
        AND tc.table_name = 'tray_creation_requests'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.column_name = 'batch_id'
    ) THEN
        -- Check which column name exists in seedbatches
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public'
            AND table_name = 'seedbatches' 
            AND column_name = 'batchid'
        ) THEN
            ALTER TABLE tray_creation_requests 
            ADD CONSTRAINT tray_creation_requests_batch_id_fkey 
            FOREIGN KEY (batch_id) REFERENCES seedbatches(batchid);
            RAISE NOTICE 'Added foreign key constraint referencing seedbatches(batchid)';
        ELSIF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public'
            AND table_name = 'seedbatches' 
            AND column_name = 'batch_id'
        ) THEN
            ALTER TABLE tray_creation_requests 
            ADD CONSTRAINT tray_creation_requests_batch_id_fkey 
            FOREIGN KEY (batch_id) REFERENCES seedbatches(batch_id);
            RAISE NOTICE 'Added foreign key constraint referencing seedbatches(batch_id)';
        ELSE
            RAISE WARNING 'Could not find batchid or batch_id column in seedbatches table';
        END IF;
    ELSE
        RAISE NOTICE 'Foreign key constraint already exists';
    END IF;
END $$;










