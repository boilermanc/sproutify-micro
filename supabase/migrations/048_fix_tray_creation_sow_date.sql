-- Migration: Fix tray creation sow_date from tray_creation_requests
-- Description: Adds scheduled_sow_date to trays table to track the original scheduled date
-- separately from the actual sow_date (when seeding actually occurred).
-- This fixes overdue seeding tasks by allowing:
--   sow_date = actual seeding date (for accurate harvest predictions)
--   scheduled_sow_date = original scheduled date (for overdue tracking)

-- ============================================
-- 1. Add scheduled_sow_date column to trays table
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'trays'
        AND column_name = 'scheduled_sow_date'
    ) THEN
        ALTER TABLE trays ADD COLUMN scheduled_sow_date DATE;
        COMMENT ON COLUMN trays.scheduled_sow_date IS 'The original scheduled sow date from the planting schedule. Used for overdue task tracking while sow_date reflects actual seeding date.';
        RAISE NOTICE 'Added scheduled_sow_date column to trays';
    END IF;
END $$;

-- Add index for scheduled_sow_date queries
CREATE INDEX IF NOT EXISTS idx_trays_scheduled_sow_date ON trays(scheduled_sow_date);

-- ============================================
-- 2. Add seed_date and recipe_id columns to tray_creation_requests if not exist
-- ============================================
DO $$
BEGIN
    -- Add seed_date column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'tray_creation_requests'
        AND column_name = 'seed_date'
    ) THEN
        ALTER TABLE tray_creation_requests ADD COLUMN seed_date DATE;
        COMMENT ON COLUMN tray_creation_requests.seed_date IS 'The intended scheduled sow_date for the tray (for overdue tasks, this is the original scheduled date)';
        RAISE NOTICE 'Added seed_date column to tray_creation_requests';
    END IF;

    -- Add recipe_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'tray_creation_requests'
        AND column_name = 'recipe_id'
    ) THEN
        ALTER TABLE tray_creation_requests ADD COLUMN recipe_id INTEGER REFERENCES recipes(recipe_id);
        COMMENT ON COLUMN tray_creation_requests.recipe_id IS 'The recipe to use for creating the tray';
        RAISE NOTICE 'Added recipe_id column to tray_creation_requests';
    END IF;
END $$;

-- ============================================
-- 3. Create or replace the trigger function for tray creation
-- ============================================
CREATE OR REPLACE FUNCTION handle_tray_creation_request()
RETURNS TRIGGER AS $$
DECLARE
    v_recipe_id INTEGER;
    v_actual_sow_date TIMESTAMP WITH TIME ZONE;
    v_scheduled_sow_date DATE;
    v_tray_unique_id TEXT;
    v_tray_id INTEGER;
BEGIN
    -- Get recipe_id from the request or look it up by recipe_name
    v_recipe_id := NEW.recipe_id;

    IF v_recipe_id IS NULL AND NEW.recipe_name IS NOT NULL THEN
        SELECT recipe_id INTO v_recipe_id
        FROM recipes
        WHERE recipe_name = NEW.recipe_name
        AND (farm_uuid = NEW.farm_uuid OR farm_uuid IS NULL)
        LIMIT 1;
    END IF;

    IF v_recipe_id IS NULL THEN
        RAISE WARNING 'Could not determine recipe_id for tray creation request %', NEW.request_id;
        RETURN NEW;
    END IF;

    -- Determine the actual sow_date (when seeding actually happens = NOW)
    -- This is used for harvest date calculations
    v_actual_sow_date := NOW();

    -- Determine the scheduled_sow_date (the original planned date from the schedule)
    -- This is used for tracking which schedule entry was fulfilled
    IF NEW.seed_date IS NOT NULL THEN
        v_scheduled_sow_date := NEW.seed_date;
    ELSIF NEW.requested_at IS NOT NULL THEN
        v_scheduled_sow_date := NEW.requested_at::DATE;
    ELSE
        v_scheduled_sow_date := CURRENT_DATE;
    END IF;

    -- Generate unique tray ID
    v_tray_unique_id := 'TRY-' ||
        EXTRACT(EPOCH FROM NOW())::BIGINT || '-' ||
        UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 9));

    -- Create the tray with both dates:
    -- sow_date = actual seeding date (for harvest predictions)
    -- scheduled_sow_date = original scheduled date (for overdue tracking)
    INSERT INTO trays (
        tray_unique_id,
        recipe_id,
        customer_id,
        farm_uuid,
        batch_id,
        sow_date,
        scheduled_sow_date,
        created_by,
        status
    )
    VALUES (
        v_tray_unique_id,
        v_recipe_id,
        NEW.customer_id,
        NEW.farm_uuid,
        NEW.batch_id,
        v_actual_sow_date,      -- Actual seeding date (NOW)
        v_scheduled_sow_date,   -- Original scheduled date (from seed_date)
        NEW.user_id,
        'active'
    )
    RETURNING tray_id INTO v_tray_id;

    -- Create tray_steps for the new tray
    -- Use actual sow_date for scheduling so harvest dates are accurate
    INSERT INTO tray_steps (tray_id, step_id, scheduled_date, status, completed)
    SELECT
        v_tray_id,
        s.step_id,
        -- Calculate scheduled_date based on actual sow_date and step's position in the recipe
        (v_actual_sow_date::DATE + COALESCE(
            (SELECT SUM(COALESCE(duration, 1))
             FROM steps prev
             WHERE prev.recipe_id = s.recipe_id
             AND COALESCE(prev.step_order, prev.sequence_order, 0) < COALESCE(s.step_order, s.sequence_order, 0)),
            0
        )::INTEGER),
        'Pending',
        FALSE
    FROM steps s
    WHERE s.recipe_id = v_recipe_id
    ORDER BY COALESCE(s.step_order, s.sequence_order, 0);

    -- Update the request status
    NEW.status := 'completed';
    NEW.processed_at := NOW();
    NEW.tray_id := v_tray_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION handle_tray_creation_request() IS
    'Creates a tray from a tray_creation_request. Sets sow_date=NOW() for harvest calculations, scheduled_sow_date=seed_date for overdue tracking.';

-- ============================================
-- 4. Add processed_at and tray_id columns if not exist
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'tray_creation_requests'
        AND column_name = 'processed_at'
    ) THEN
        ALTER TABLE tray_creation_requests ADD COLUMN processed_at TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'tray_creation_requests'
        AND column_name = 'tray_id'
    ) THEN
        ALTER TABLE tray_creation_requests ADD COLUMN tray_id INTEGER REFERENCES trays(tray_id);
    END IF;
END $$;

-- ============================================
-- 5. Create trigger on tray_creation_requests
-- ============================================
DROP TRIGGER IF EXISTS trg_handle_tray_creation_request ON tray_creation_requests;

CREATE TRIGGER trg_handle_tray_creation_request
BEFORE INSERT ON tray_creation_requests
FOR EACH ROW
WHEN (NEW.status IS NULL OR NEW.status = 'pending')
EXECUTE FUNCTION handle_tray_creation_request();

COMMENT ON TRIGGER trg_handle_tray_creation_request ON tray_creation_requests IS
    'Automatically creates a tray when a new tray_creation_request is inserted';

-- ============================================
-- 6. Add index for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tray_creation_requests_seed_date
    ON tray_creation_requests(seed_date);
CREATE INDEX IF NOT EXISTS idx_tray_creation_requests_recipe_id
    ON tray_creation_requests(recipe_id);
