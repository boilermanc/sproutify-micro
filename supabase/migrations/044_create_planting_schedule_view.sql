-- Create planting_schedule_view
-- This view provides a schedule of what needs to be planted and when
-- Used by dailyFlowService.ts to generate soaking and seeding tasks

CREATE OR REPLACE VIEW planting_schedule_view AS
WITH recipe_timings AS (
  -- Calculate total days and soak duration for each recipe
  SELECT 
    r.recipe_id,
    r.farm_uuid,
    r.recipe_name,
    r.variety_name,
    -- Total days from seeding to harvest (sum of all step durations)
    COALESCE(SUM(
      CASE 
        WHEN s.duration_unit = 'Days' THEN s.duration
        WHEN s.duration_unit = 'Hours' THEN s.duration / 24.0
        ELSE 0
      END
    ), 0) AS total_days,
    -- Soak duration in days (for calculating sow_date from delivery_date)
    COALESCE(MAX(
      CASE 
        WHEN (s.step_name ILIKE '%soak%' OR s.action ILIKE '%soak%') AND s.duration_unit = 'Hours' AND s.duration >= 6
          THEN 1  -- Any soak >= 6 hours needs to be done the day before
        WHEN (s.step_name ILIKE '%soak%' OR s.action ILIKE '%soak%') AND s.duration_unit = 'Days'
          THEN s.duration
        ELSE 0
      END
    ), 0) AS soak_days
  FROM recipes r
  LEFT JOIN steps s ON s.recipe_id = r.recipe_id
  GROUP BY r.recipe_id, r.farm_uuid, r.recipe_name, r.variety_name
),
schedule_items AS (
  -- Get all scheduled deliveries with their products and recipes
  SELECT 
    sch.schedule_id,
    sch.standing_order_id,
    sch.scheduled_delivery_date AS delivery_date,
    sch.status AS schedule_status,
    so.farm_uuid,
    so.customer_id,
    c.customername AS customer_name,
    soi.product_id,
    p.product_name,
    soi.variant_id,
    pv.variant_name,
    COALESCE(pv.recipe_id, p.recipe_id) AS recipe_id,  -- Variant recipe takes precedence
    soi.quantity,
    -- Calculate trays needed (assuming quantity is in oz and typical tray is 5 oz)
    CASE 
      WHEN soi.quantity > 0 THEN CEILING(soi.quantity / 5.0)
      ELSE 1
    END AS trays_needed
  FROM order_schedules sch
  JOIN standing_orders so ON so.standing_order_id = sch.standing_order_id
  JOIN customers c ON c.customerid = so.customer_id
  JOIN standing_order_items soi ON soi.standing_order_id = so.standing_order_id
  JOIN products p ON p.product_id = soi.product_id
  LEFT JOIN product_variants pv ON pv.variant_id = soi.variant_id
  WHERE 
    sch.status IN ('pending', 'generated')  -- Only include active schedules
    AND so.is_active = true
    AND sch.scheduled_delivery_date >= CURRENT_DATE - INTERVAL '30 days'  -- Include recent past for reference
)
SELECT 
  si.schedule_id,
  si.standing_order_id,
  si.farm_uuid,
  si.customer_id,
  si.customer_name,
  si.delivery_date,
  si.recipe_id,
  rt.recipe_name,
  rt.variety_name,
  si.trays_needed,
  -- Calculate sow_date (delivery_date - total_days)
  (si.delivery_date - CAST(CEILING(rt.total_days) AS INTEGER))::DATE AS sow_date,
  -- Calculate harvest_date (same as delivery_date for most cases)
  si.delivery_date AS harvest_date,
  -- Include soak_days for reference (used by dailyFlowService)
  rt.soak_days
FROM schedule_items si
JOIN recipe_timings rt ON rt.recipe_id = si.recipe_id AND rt.farm_uuid = si.farm_uuid
WHERE si.recipe_id IS NOT NULL;  -- Only include items with assigned recipes

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_planting_schedule_farm_uuid 
  ON order_schedules(standing_order_id);

CREATE INDEX IF NOT EXISTS idx_planting_schedule_delivery_date 
  ON order_schedules(scheduled_delivery_date);

COMMENT ON VIEW planting_schedule_view IS 
  'Provides a schedule of what needs to be planted and when, based on standing orders and order schedules. 
   Used by dailyFlowService to generate soaking and seeding tasks.';
