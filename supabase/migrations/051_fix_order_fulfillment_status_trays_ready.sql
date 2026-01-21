-- Migration: Fix order_fulfillment_status view trays_ready count
-- Description: The view was only counting trays where scheduled_date exactly matched harvest_date.
-- Trays that are PAST their harvest date (already ready) should also count.
--
-- Fix: Change ts.scheduled_date = ps.harvest_date to ts.scheduled_date <= ps.harvest_date
-- in all 3 places where this condition appears.

-- ============================================
-- Create or replace order_fulfillment_status view
-- ============================================
CREATE OR REPLACE VIEW order_fulfillment_status AS
WITH harvest_steps AS (
  -- Get the harvest step for each recipe
  SELECT DISTINCT ON (recipe_id)
    recipe_id,
    step_id
  FROM steps
  WHERE action ILIKE '%harvest%'
     OR step_name ILIKE '%harvest%'
  ORDER BY recipe_id, COALESCE(step_order, sequence_order, 999) DESC
),
ready_trays AS (
  -- Count trays that are ready to harvest for each recipe/farm
  -- A tray is ready if its harvest step scheduled_date has passed or is today
  SELECT
    t.recipe_id,
    t.farm_uuid,
    t.customer_id,
    ts.scheduled_date AS harvest_scheduled_date,
    t.tray_id,
    t.standing_order_id AS tray_standing_order_id
  FROM trays t
  JOIN tray_steps ts ON ts.tray_id = t.tray_id
  JOIN harvest_steps hs ON hs.step_id = ts.step_id AND hs.recipe_id = t.recipe_id
  WHERE t.status = 'active'
    AND ts.completed = FALSE
)
SELECT
  ps.delivery_date,
  ps.harvest_date,
  ps.sow_date,
  ps.customer_name,
  ps.recipe_name,
  ps.variety_name,
  ps.recipe_id,
  ps.trays_needed,
  ps.farm_uuid,
  ps.standing_order_id,
  -- Count trays ready: scheduled_date <= harvest_date (includes past-due trays)
  COALESCE((
    SELECT COUNT(DISTINCT rt.tray_id)
    FROM ready_trays rt
    WHERE rt.recipe_id = ps.recipe_id
      AND rt.farm_uuid = ps.farm_uuid
      AND rt.harvest_scheduled_date <= ps.harvest_date  -- FIX: was = now <=
      AND (rt.customer_id IS NULL OR rt.customer_id = ps.customer_id)
  ), 0)::INTEGER AS trays_ready,
  -- Fulfillment status
  CASE
    WHEN COALESCE((
      SELECT COUNT(DISTINCT rt.tray_id)
      FROM ready_trays rt
      WHERE rt.recipe_id = ps.recipe_id
        AND rt.farm_uuid = ps.farm_uuid
        AND rt.harvest_scheduled_date <= ps.harvest_date  -- FIX: was = now <=
        AND (rt.customer_id IS NULL OR rt.customer_id = ps.customer_id)
    ), 0) >= ps.trays_needed THEN 'fulfilled'
    WHEN COALESCE((
      SELECT COUNT(DISTINCT rt.tray_id)
      FROM ready_trays rt
      WHERE rt.recipe_id = ps.recipe_id
        AND rt.farm_uuid = ps.farm_uuid
        AND rt.harvest_scheduled_date <= ps.harvest_date  -- FIX: was = now <=
        AND (rt.customer_id IS NULL OR rt.customer_id = ps.customer_id)
    ), 0) > 0 THEN 'partial'
    ELSE 'no_trays'
  END AS fulfillment_status
FROM planting_schedule_view ps;

-- Add index for performance on tray_steps scheduled_date
CREATE INDEX IF NOT EXISTS idx_tray_steps_scheduled_date ON tray_steps(scheduled_date);

COMMENT ON VIEW order_fulfillment_status IS
  'Shows fulfillment status for each scheduled order item.
   trays_ready counts active trays whose harvest date is on or before the delivery date.
   fulfillment_status: fulfilled (enough trays), partial (some trays), no_trays (none ready).';

-- ============================================
-- Create or replace order_fulfillment_summary view
-- Aggregates order_fulfillment_status by delivery_date and customer
-- ============================================
CREATE OR REPLACE VIEW order_fulfillment_summary AS
SELECT
  delivery_date,
  farm_uuid,
  customer_name,
  COUNT(*) AS total_items,
  SUM(trays_needed)::INTEGER AS total_trays_needed,
  SUM(trays_ready)::INTEGER AS total_trays_ready,
  COUNT(*) FILTER (WHERE fulfillment_status = 'fulfilled') AS items_fulfilled,
  COUNT(*) FILTER (WHERE fulfillment_status = 'partial') AS items_partial,
  COUNT(*) FILTER (WHERE fulfillment_status = 'no_trays') AS items_no_trays,
  -- At risk: sow_date has passed but not enough trays ready
  COUNT(*) FILTER (
    WHERE fulfillment_status != 'fulfilled'
    AND sow_date < CURRENT_DATE
  ) AS items_at_risk,
  -- Plantable: sow_date is today or in the future and not fulfilled
  COUNT(*) FILTER (
    WHERE fulfillment_status != 'fulfilled'
    AND sow_date >= CURRENT_DATE
  ) AS items_plantable,
  -- Overall order status
  CASE
    WHEN COUNT(*) = COUNT(*) FILTER (WHERE fulfillment_status = 'fulfilled') THEN 'ready'
    WHEN COUNT(*) FILTER (
      WHERE fulfillment_status != 'fulfilled' AND sow_date < CURRENT_DATE
    ) > 0 THEN 'at_risk'
    ELSE 'plantable'
  END AS order_status
FROM order_fulfillment_status
GROUP BY delivery_date, farm_uuid, customer_name;

COMMENT ON VIEW order_fulfillment_summary IS
  'Aggregates order fulfillment status by delivery date and customer.
   order_status: ready (all fulfilled), at_risk (past sow date, not fulfilled), plantable (can still plant).';
