-- Migration: Auto-complete order schedules when all harvests are done
-- Description: When trays are harvested, automatically mark the related order_schedule
-- as 'completed' if all required items for that delivery are now fulfilled.
--
-- Problem: After harvesting, trays are removed from the "ready" count (status='harvested'),
-- but order_schedules.status stays 'pending'/'generated', causing phantom gaps to appear.
--
-- Solution: Create a trigger that fires after a tray is harvested to check if the
-- entire order_schedule is now fulfilled, and if so, mark it as completed.

-- ============================================
-- 1. Create function to check and complete order schedules
-- ============================================
CREATE OR REPLACE FUNCTION check_and_complete_order_schedule()
RETURNS TRIGGER AS $$
DECLARE
    v_schedule_id INTEGER;
    v_total_trays INTEGER;
    v_harvested_trays INTEGER;
BEGIN
    -- Only process if:
    -- 1. Status changed to 'harvested'
    -- 2. Tray has an order_schedule_id
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
        -- This is simpler and doesn't require the product/variant recipe join
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
    'Automatically marks an order_schedule as completed when all required items have been harvested.
     Triggered after a tray status changes to harvested.';

-- ============================================
-- 2. Create trigger on trays table
-- ============================================
DROP TRIGGER IF EXISTS trigger_check_order_schedule_completion ON trays;

CREATE TRIGGER trigger_check_order_schedule_completion
    AFTER UPDATE OF status ON trays
    FOR EACH ROW
    WHEN (NEW.status = 'harvested' AND (OLD.status IS DISTINCT FROM NEW.status))
    EXECUTE FUNCTION check_and_complete_order_schedule();

COMMENT ON TRIGGER trigger_check_order_schedule_completion ON trays IS
    'Fires when a tray is harvested to check if the related order_schedule should be marked complete.';

-- ============================================
-- 3. Create function to manually complete an order schedule
--    (useful for the "Cancel Delivery" action)
-- ============================================
CREATE OR REPLACE FUNCTION complete_order_schedule(p_schedule_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE order_schedules
    SET status = 'completed',
        generated_at = COALESCE(generated_at, NOW())
    WHERE schedule_id = p_schedule_id
      AND status NOT IN ('completed', 'skipped');

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION complete_order_schedule(INTEGER) IS
    'Manually marks an order_schedule as completed. Used for Cancel Delivery action.';

-- ============================================
-- 4. Create function to skip an order schedule
--    (useful for the "Skip this week" action)
-- ============================================
CREATE OR REPLACE FUNCTION skip_order_schedule(p_schedule_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE order_schedules
    SET status = 'skipped',
        generated_at = COALESCE(generated_at, NOW())
    WHERE schedule_id = p_schedule_id
      AND status NOT IN ('completed', 'skipped');

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION skip_order_schedule(INTEGER) IS
    'Marks an order_schedule as skipped. Used for Skip Delivery action.';

-- ============================================
-- 5. Create function to auto-skip past-due unfulfillable schedules
--    Called to clean up deliveries that couldn't be fulfilled
-- ============================================
CREATE OR REPLACE FUNCTION auto_skip_past_due_schedules(p_farm_uuid UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    v_skipped_count INTEGER := 0;
BEGIN
    -- Mark all past-due schedules as 'skipped'
    -- These are deliveries that have passed and weren't completed
    UPDATE order_schedules os
    SET status = 'skipped',
        notes = COALESCE(os.notes || ' | ', '') || 'Auto-skipped: delivery date passed'
    FROM standing_orders so
    WHERE os.standing_order_id = so.standing_order_id
      AND os.status IN ('pending', 'generated')
      AND os.scheduled_delivery_date < CURRENT_DATE
      AND (p_farm_uuid IS NULL OR so.farm_uuid = p_farm_uuid);

    GET DIAGNOSTICS v_skipped_count = ROW_COUNT;

    RETURN v_skipped_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_skip_past_due_schedules(UUID) IS
    'Marks all past-due order_schedules as skipped. Call with farm_uuid to limit scope, or NULL for all farms.';

-- ============================================
-- 6. Create function to finalize today's deliveries
--    Marks all of today's schedules as completed (for fulfilled) or skipped (for unfulfilled)
-- ============================================
CREATE OR REPLACE FUNCTION finalize_todays_deliveries(p_farm_uuid UUID)
RETURNS TABLE(completed_count INTEGER, skipped_count INTEGER) AS $$
DECLARE
    v_completed INTEGER := 0;
    v_skipped INTEGER := 0;
    v_schedule RECORD;
    v_total_trays INTEGER;
    v_harvested_trays INTEGER;
BEGIN
    -- Process each pending schedule for today
    FOR v_schedule IN
        SELECT os.schedule_id, os.standing_order_id, os.scheduled_delivery_date
        FROM order_schedules os
        JOIN standing_orders so ON so.standing_order_id = os.standing_order_id
        WHERE os.status IN ('pending', 'generated')
          AND os.scheduled_delivery_date = CURRENT_DATE
          AND so.farm_uuid = p_farm_uuid
    LOOP
        -- Count total trays vs harvested trays for this schedule
        -- This is simpler and doesn't require the product/variant recipe join
        SELECT
            COUNT(*),
            COUNT(*) FILTER (WHERE status = 'harvested')
        INTO v_total_trays, v_harvested_trays
        FROM trays
        WHERE order_schedule_id = v_schedule.schedule_id;

        -- Mark as completed if all trays harvested (or no trays created = skip)
        -- Mark as skipped if some trays remain unharvested
        IF v_total_trays > 0 AND v_harvested_trays >= v_total_trays THEN
            UPDATE order_schedules
            SET status = 'completed'
            WHERE schedule_id = v_schedule.schedule_id;
            v_completed := v_completed + 1;
        ELSE
            UPDATE order_schedules
            SET status = 'skipped',
                notes = COALESCE(notes || ' | ', '') || 'Auto-skipped: finalized at end of day'
            WHERE schedule_id = v_schedule.schedule_id;
            v_skipped := v_skipped + 1;
        END IF;
    END LOOP;

    completed_count := v_completed;
    skipped_count := v_skipped;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION finalize_todays_deliveries(UUID) IS
    'Finalizes all of today''s deliveries for a farm. Fulfilled orders are marked completed, unfulfilled are skipped.
     Call this at the end of the day to clear remaining gaps.';

-- ============================================
-- 7. Backfill: Mark past-due schedules as skipped
-- ============================================
DO $$
DECLARE
    v_skipped_count INTEGER;
BEGIN
    -- Skip all past-due schedules
    SELECT auto_skip_past_due_schedules(NULL) INTO v_skipped_count;
    RAISE NOTICE 'Backfill: % past-due order_schedules marked as skipped', v_skipped_count;
END $$;
