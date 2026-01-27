-- Migration: Fix tray_steps scheduled_date calculation for soak varieties
-- Description: Steps before the seeding step (e.g. Soak Seeds) should be
-- scheduled backwards from scheduled_sow_date, not forwards from NOW().
-- This uses scheduled_sow_date as the anchor and calculates pre-sow steps
-- backwards and post-sow steps forwards.

CREATE OR REPLACE FUNCTION handle_tray_creation_request()
RETURNS TRIGGER AS $$
DECLARE
    v_recipe_id INTEGER;
    v_actual_sow_date TIMESTAMP WITH TIME ZONE;
    v_scheduled_sow_date DATE;
    v_tray_unique_id TEXT;
    v_tray_id INTEGER;
    v_standing_order_id INTEGER;
    v_order_schedule_id INTEGER;
    v_sow_step_sequence INTEGER;
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
    v_actual_sow_date := NOW();

    -- Determine the scheduled_sow_date (the original planned date from the schedule)
    IF NEW.seed_date IS NOT NULL THEN
        v_scheduled_sow_date := NEW.seed_date;
    ELSIF NEW.requested_at IS NOT NULL THEN
        v_scheduled_sow_date := NEW.requested_at::DATE;
    ELSE
        v_scheduled_sow_date := CURRENT_DATE;
    END IF;

    -- Get standing_order_id and order_schedule_id from the request
    v_standing_order_id := NEW.standing_order_id;
    v_order_schedule_id := NEW.order_schedule_id;

    -- Generate unique tray ID
    v_tray_unique_id := 'TRY-' ||
        EXTRACT(EPOCH FROM NOW())::BIGINT || '-' ||
        UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 9));

    -- Create the tray
    INSERT INTO trays (
        tray_unique_id,
        recipe_id,
        customer_id,
        farm_uuid,
        batch_id,
        sow_date,
        scheduled_sow_date,
        standing_order_id,
        order_schedule_id,
        created_by,
        status
    )
    VALUES (
        v_tray_unique_id,
        v_recipe_id,
        NEW.customer_id,
        NEW.farm_uuid,
        NEW.batch_id,
        v_actual_sow_date,
        v_scheduled_sow_date,
        v_standing_order_id,
        v_order_schedule_id,
        NEW.user_id,
        'active'
    )
    RETURNING tray_id INTO v_tray_id;

    -- Find the seeding step sequence_order for this recipe
    SELECT sequence_order INTO v_sow_step_sequence
    FROM steps
    WHERE recipe_id = v_recipe_id
      AND (step_name ILIKE 'seed%' OR step_name ILIKE 'sow%' OR step_name = 'Seeding')
    ORDER BY sequence_order
    LIMIT 1;

    -- Default to sequence_order 2 if no explicit seed step found
    IF v_sow_step_sequence IS NULL THEN
        v_sow_step_sequence := 2;
    END IF;

    -- Create tray_steps with dates anchored to scheduled_sow_date
    -- Pre-sow steps (e.g. Soak): scheduled backwards from sow date
    -- Sow step: exactly on scheduled_sow_date
    -- Post-sow steps (e.g. Germination): scheduled forwards from sow date
    INSERT INTO tray_steps (tray_id, step_id, scheduled_date, status, completed)
    SELECT
        v_tray_id,
        s.step_id,
        CASE
            -- Pre-sow steps: calculate backwards from scheduled_sow_date
            WHEN s.sequence_order < v_sow_step_sequence THEN
                v_scheduled_sow_date - (
                    SELECT COALESCE(SUM(COALESCE(prev.duration, 1)), 0)
                    FROM steps prev
                    WHERE prev.recipe_id = s.recipe_id
                      AND prev.sequence_order >= s.sequence_order
                      AND prev.sequence_order < v_sow_step_sequence
                )::INTEGER
            -- Sow step: exactly on scheduled_sow_date
            WHEN s.sequence_order = v_sow_step_sequence THEN
                v_scheduled_sow_date
            -- Post-sow steps: calculate forwards from scheduled_sow_date
            ELSE
                v_scheduled_sow_date + (
                    SELECT COALESCE(SUM(COALESCE(prev.duration, 1)), 0)
                    FROM steps prev
                    WHERE prev.recipe_id = s.recipe_id
                      AND prev.sequence_order > v_sow_step_sequence
                      AND prev.sequence_order < s.sequence_order
                )::INTEGER
        END,
        'Pending',
        FALSE
    FROM steps s
    WHERE s.recipe_id = v_recipe_id
    ORDER BY s.sequence_order;

    -- Update the request status
    NEW.status := 'completed';
    NEW.processed_at := NOW();
    NEW.tray_id := v_tray_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION handle_tray_creation_request() IS
    'Creates a tray from a tray_creation_request. Calculates step dates relative to scheduled_sow_date, with pre-sow steps (like soaking) scheduled backwards.';
