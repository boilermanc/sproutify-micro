-- Migration: Add Case 3 to harvest trigger — match by customer_id when standing_order_id is null
-- Problem: Trays created manually or via older workflows have customer_id but no standing_order_id.
-- The trigger skips these, leaving order_schedules pending and causing false order gaps.
--
-- Fix: When a tray is harvested with customer_id but no standing_order_id or order_schedule_id,
-- look up the customer's active standing order, find today's matching schedule, and link it.

CREATE OR REPLACE FUNCTION check_and_complete_order_schedule()
RETURNS TRIGGER AS $$
DECLARE
    v_schedule_id INTEGER;
    v_total_trays INTEGER;
    v_harvested_trays INTEGER;
    v_recipe_id INTEGER;
    v_standing_order_id INTEGER;
    v_farm_uuid UUID;
BEGIN
    -- Case 1: Tray already has order_schedule_id (existing logic)
    IF NEW.status = 'harvested' AND NEW.order_schedule_id IS NOT NULL THEN
        v_schedule_id := NEW.order_schedule_id;

        -- Check if the order_schedule is still pending/generated
        IF NOT EXISTS (
            SELECT 1 FROM order_schedules
            WHERE schedule_id = v_schedule_id
              AND status NOT IN ('completed', 'skipped')
        ) THEN
            RETURN NEW;
        END IF;

        -- Count total trays created for this schedule vs harvested trays
        SELECT
            COUNT(*),
            COUNT(*) FILTER (WHERE status = 'harvested')
        INTO v_total_trays, v_harvested_trays
        FROM trays
        WHERE order_schedule_id = v_schedule_id;

        -- If all trays for this schedule are harvested, mark as completed
        IF v_total_trays > 0 AND v_harvested_trays >= v_total_trays THEN
            UPDATE order_schedules
            SET status = 'completed',
                generated_at = COALESCE(generated_at, NOW())
            WHERE schedule_id = v_schedule_id
              AND status NOT IN ('completed', 'skipped');

            RAISE NOTICE 'Order schedule % marked as completed (% of % trays harvested)',
                v_schedule_id, v_harvested_trays, v_total_trays;
        END IF;

        RETURN NEW;
    END IF;

    -- Case 2: Tray has standing_order_id but NO order_schedule_id
    -- Find matching schedule for today and link it
    IF NEW.status = 'harvested' AND NEW.order_schedule_id IS NULL AND NEW.standing_order_id IS NOT NULL THEN
        v_standing_order_id := NEW.standing_order_id;
        v_recipe_id := NEW.recipe_id;
        v_farm_uuid := NEW.farm_uuid;

        -- Find the matching order_schedule for today
        SELECT os.schedule_id INTO v_schedule_id
        FROM order_schedules os
        WHERE os.farm_uuid = v_farm_uuid
          AND os.recipe_id = v_recipe_id
          AND os.scheduled_delivery_date = CURRENT_DATE
          AND os.status IN ('pending', 'generated')
          AND os.standing_order_id = v_standing_order_id
        LIMIT 1;

        -- If no matching schedule found, skip silently
        IF v_schedule_id IS NULL THEN
            RETURN NEW;
        END IF;

        -- Link the tray to the found schedule
        UPDATE trays
        SET order_schedule_id = v_schedule_id
        WHERE tray_id = NEW.tray_id;

        RAISE NOTICE 'Linked tray % to order schedule % (standing_order_id=%, recipe_id=%)',
            NEW.tray_id, v_schedule_id, v_standing_order_id, v_recipe_id;

        -- Now check if all trays for this schedule are harvested
        SELECT
            COUNT(*),
            COUNT(*) FILTER (WHERE status = 'harvested')
        INTO v_total_trays, v_harvested_trays
        FROM trays
        WHERE order_schedule_id = v_schedule_id;

        -- If all trays for this schedule are harvested, mark as completed
        IF v_total_trays > 0 AND v_harvested_trays >= v_total_trays THEN
            UPDATE order_schedules
            SET status = 'completed',
                generated_at = COALESCE(generated_at, NOW())
            WHERE schedule_id = v_schedule_id
              AND status NOT IN ('completed', 'skipped');

            RAISE NOTICE 'Order schedule % marked as completed (% of % trays harvested)',
                v_schedule_id, v_harvested_trays, v_total_trays;
        END IF;

        RETURN NEW;
    END IF;

    -- Case 3: Tray has customer_id but NO standing_order_id or order_schedule_id
    -- Look up the customer's active standing order, then find today's matching schedule
    IF NEW.status = 'harvested' AND NEW.order_schedule_id IS NULL AND NEW.standing_order_id IS NULL AND NEW.customer_id IS NOT NULL THEN
        v_recipe_id := NEW.recipe_id;
        v_farm_uuid := NEW.farm_uuid;

        -- Find the customer's active standing order
        SELECT so.standing_order_id INTO v_standing_order_id
        FROM standing_orders so
        WHERE so.customer_id = NEW.customer_id
          AND so.farm_uuid = v_farm_uuid
          AND so.is_active = true
        LIMIT 1;

        -- If no active standing order, skip silently
        IF v_standing_order_id IS NULL THEN
            RETURN NEW;
        END IF;

        -- Find the matching order_schedule for today
        SELECT os.schedule_id INTO v_schedule_id
        FROM order_schedules os
        WHERE os.farm_uuid = v_farm_uuid
          AND os.recipe_id = v_recipe_id
          AND os.scheduled_delivery_date = CURRENT_DATE
          AND os.status IN ('pending', 'generated')
          AND os.standing_order_id = v_standing_order_id
        LIMIT 1;

        -- If no matching schedule found, skip silently
        IF v_schedule_id IS NULL THEN
            RETURN NEW;
        END IF;

        -- Link the tray to the found schedule AND set the standing_order_id
        UPDATE trays
        SET order_schedule_id = v_schedule_id,
            standing_order_id = v_standing_order_id
        WHERE tray_id = NEW.tray_id;

        RAISE NOTICE 'Case 3: Linked tray % to order schedule % via customer_id=% (standing_order_id=%, recipe_id=%)',
            NEW.tray_id, v_schedule_id, NEW.customer_id, v_standing_order_id, v_recipe_id;

        -- Check if all trays for this schedule are harvested
        SELECT
            COUNT(*),
            COUNT(*) FILTER (WHERE status = 'harvested')
        INTO v_total_trays, v_harvested_trays
        FROM trays
        WHERE order_schedule_id = v_schedule_id;

        -- If all trays for this schedule are harvested, mark as completed
        IF v_total_trays > 0 AND v_harvested_trays >= v_total_trays THEN
            UPDATE order_schedules
            SET status = 'completed',
                generated_at = COALESCE(generated_at, NOW())
            WHERE schedule_id = v_schedule_id
              AND status NOT IN ('completed', 'skipped');

            RAISE NOTICE 'Order schedule % marked as completed (% of % trays harvested)',
                v_schedule_id, v_harvested_trays, v_total_trays;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_and_complete_order_schedule() IS
    'Harvest trigger: links trays to matching order_schedules and marks them completed. '
    'Case 1: tray has order_schedule_id. '
    'Case 2: tray has standing_order_id (finds schedule by standing_order + recipe + today). '
    'Case 3: tray has only customer_id (looks up active standing_order, then finds schedule).';
