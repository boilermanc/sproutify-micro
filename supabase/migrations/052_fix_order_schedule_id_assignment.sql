-- Migration: Fix order_schedule_id assignment to use EARLIEST delivery instead of LATEST
-- Description: When creating trays from the seeding flow, if order_schedule_id is not provided,
-- the system should calculate ready_date = sow_date + totalgrowthdays and find the EARLIEST
-- matching order_schedule (not the latest).
--
-- This migration:
-- 1. Adds order_schedule_id column to trays table if not present
-- 2. Updates the trigger function to assign order_schedule_id using EARLIEST matching schedule

-- ============================================
-- 1. Add order_schedule_id column to trays table if not exist
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'trays'
        AND column_name = 'order_schedule_id'
    ) THEN
        ALTER TABLE trays ADD COLUMN order_schedule_id INTEGER REFERENCES order_schedules(schedule_id);
        COMMENT ON COLUMN trays.order_schedule_id IS 'The specific order schedule this tray fulfills. Assigned based on earliest matching scheduled_delivery_date >= ready_date.';
        RAISE NOTICE 'Added order_schedule_id column to trays';
    END IF;
END $$;

-- Add index for order_schedule_id queries
CREATE INDEX IF NOT EXISTS idx_trays_order_schedule_id ON trays(order_schedule_id);

-- ============================================
-- 2. Update the trigger function to assign order_schedule_id using EARLIEST matching schedule
-- ============================================
CREATE OR REPLACE FUNCTION handle_tray_creation_request()
RETURNS TRIGGER AS $$
DECLARE
    v_recipe_id INTEGER;
    v_actual_sow_date TIMESTAMP WITH TIME ZONE;
    v_scheduled_sow_date DATE;
    v_tray_unique_id TEXT;
    v_tray_id INTEGER;
    v_order_schedule_id INTEGER;
    v_ready_date DATE;
    v_total_growth_days INTEGER;
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

    -- Calculate total growth days for the recipe (sum of all step durations)
    SELECT COALESCE(SUM(
        CASE 
            WHEN duration_unit = 'Days' THEN duration
            WHEN duration_unit = 'Hours' THEN duration / 24.0
            ELSE COALESCE(duration, 0)
        END
    ), 0)::INTEGER INTO v_total_growth_days
    FROM steps
    WHERE recipe_id = v_recipe_id;

    -- Calculate ready_date = sow_date + total_growth_days
    -- Use actual sow_date (when seeding happens) for accurate ready_date calculation
    v_ready_date := v_actual_sow_date::DATE + v_total_growth_days;

    -- Determine order_schedule_id:
    -- 1. Use provided order_schedule_id if present
    -- 2. Otherwise, find EARLIEST matching order_schedule
    IF NEW.order_schedule_id IS NOT NULL THEN
        v_order_schedule_id := NEW.order_schedule_id;
    ELSIF NEW.standing_order_id IS NOT NULL THEN
        -- Find the EARLIEST order_schedule that matches:
        -- - standing_order_id matches
        -- - recipe_id matches (via standing_order_items -> products/variants -> recipes)
        --   Uses same logic as planting_schedule_view: COALESCE(pv.recipe_id, p.recipe_id)
        -- - scheduled_delivery_date >= ready_date
        -- - status != 'completed' AND status != 'skipped'
        SELECT os.schedule_id INTO v_order_schedule_id
        FROM order_schedules os
        JOIN standing_orders so ON so.standing_order_id = os.standing_order_id
        JOIN standing_order_items soi ON soi.standing_order_id = so.standing_order_id
        JOIN products p ON p.product_id = soi.product_id
        LEFT JOIN product_variants pv ON pv.variant_id = soi.variant_id
        WHERE os.standing_order_id = NEW.standing_order_id
          AND os.status NOT IN ('completed', 'skipped')
          AND os.scheduled_delivery_date >= v_ready_date
          AND COALESCE(pv.recipe_id, p.recipe_id) = v_recipe_id  -- Match recipe (variant recipe takes precedence)
        ORDER BY os.scheduled_delivery_date ASC  -- EARLIEST first (ASC)
        LIMIT 1;
    END IF;

    -- Generate unique tray ID
    v_tray_unique_id := 'TRY-' ||
        EXTRACT(EPOCH FROM NOW())::BIGINT || '-' ||
        UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 9));

    -- Create the tray with both dates, standing_order_id, and order_schedule_id:
    -- sow_date = actual seeding date (for harvest predictions)
    -- scheduled_sow_date = original scheduled date (for overdue tracking)
    -- standing_order_id = link to the standing order for fulfillment tracking
    -- order_schedule_id = specific order schedule this tray fulfills (EARLIEST matching)
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
        standing_order_id,
        order_schedule_id
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
        NEW.standing_order_id,  -- Link to standing order for fulfillment tracking
        v_order_schedule_id     -- Specific order schedule (EARLIEST matching)
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
    'Creates a tray from a tray_creation_request. Sets sow_date=NOW() for harvest calculations, scheduled_sow_date=seed_date for overdue tracking, standing_order_id for order fulfillment, and order_schedule_id using EARLIEST matching scheduled_delivery_date >= ready_date.';
