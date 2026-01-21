-- Migration: Fix standing_order_id not being set on trays
-- Description: When trays are created from the planting schedule (originating from standing orders),
-- the standing_order_id was not being passed through to the trays table. This prevented the system
-- from finding the related order_schedule to mark as fulfilled when harvest completes.
--
-- This migration:
-- 1. Adds standing_order_id column to trays table
-- 2. Adds standing_order_id and order_schedule_id to tray_creation_requests if not present
-- 3. Updates the trigger function to pass standing_order_id through when creating trays

-- ============================================
-- 1. Add standing_order_id column to trays table
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'trays'
        AND column_name = 'standing_order_id'
    ) THEN
        ALTER TABLE trays ADD COLUMN standing_order_id INTEGER REFERENCES standing_orders(standing_order_id);
        COMMENT ON COLUMN trays.standing_order_id IS 'The standing order this tray was created for. Used to link harvests back to order_schedules.';
        RAISE NOTICE 'Added standing_order_id column to trays';
    END IF;
END $$;

-- Add index for standing_order_id queries
CREATE INDEX IF NOT EXISTS idx_trays_standing_order_id ON trays(standing_order_id);

-- ============================================
-- 2. Add standing_order_id and order_schedule_id to tray_creation_requests if not exist
-- ============================================
DO $$
BEGIN
    -- Add standing_order_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'tray_creation_requests'
        AND column_name = 'standing_order_id'
    ) THEN
        ALTER TABLE tray_creation_requests ADD COLUMN standing_order_id INTEGER REFERENCES standing_orders(standing_order_id);
        COMMENT ON COLUMN tray_creation_requests.standing_order_id IS 'The standing order this request is for';
        RAISE NOTICE 'Added standing_order_id column to tray_creation_requests';
    END IF;

    -- Add order_schedule_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'tray_creation_requests'
        AND column_name = 'order_schedule_id'
    ) THEN
        ALTER TABLE tray_creation_requests ADD COLUMN order_schedule_id INTEGER REFERENCES order_schedules(schedule_id);
        COMMENT ON COLUMN tray_creation_requests.order_schedule_id IS 'The specific order schedule this request is for';
        RAISE NOTICE 'Added order_schedule_id column to tray_creation_requests';
    END IF;
END $$;

-- ============================================
-- 3. Update the trigger function to pass standing_order_id when creating trays
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

    -- Create the tray with both dates and standing_order_id:
    -- sow_date = actual seeding date (for harvest predictions)
    -- scheduled_sow_date = original scheduled date (for overdue tracking)
    -- standing_order_id = link to the standing order for fulfillment tracking
    INSERT INTO trays (
        tray_unique_id,
        recipe_id,
        customer_id,
        farm_uuid,
        batch_id,
        sow_date,
        scheduled_sow_date,
        created_by,
        status,
        standing_order_id
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
        'active',
        NEW.standing_order_id   -- Link to standing order for fulfillment tracking
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
    'Creates a tray from a tray_creation_request. Sets sow_date=NOW() for harvest calculations, scheduled_sow_date=seed_date for overdue tracking, and standing_order_id for order fulfillment.';
