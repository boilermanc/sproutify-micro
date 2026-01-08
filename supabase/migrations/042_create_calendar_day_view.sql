-- Create a pivoted calendar summary that the web admin calendar uses.
-- Aggregates the daily_flow_aggregated view so we can show counts per day.
CREATE OR REPLACE VIEW calendar_day_pivoted AS
SELECT
  farm_uuid,
  task_date,
  COUNT(*) FILTER (WHERE lower(coalesce(task_name, '')) LIKE '%harvest%') AS harvest_count,
  COUNT(*) FILTER (
    WHERE 
      task_source IN ('seed_request', 'soak_request') OR 
      lower(coalesce(task_name, '')) LIKE '%seed%'
  ) AS seed_count,
  COUNT(*) FILTER (
    WHERE 
      task_source IN ('planting_schedule', 'tray_step') OR
      lower(coalesce(step_type, '')) LIKE '%prep%'
  ) AS prep_count,
  COUNT(*) FILTER (
    WHERE 
      task_source = 'watering' OR
      lower(coalesce(task_name, '')) LIKE '%water%' OR
      lower(coalesce(step_type, '')) = 'passive'
  ) AS water_count,
  COUNT(*) FILTER (WHERE task_source = 'order_fulfillment') AS warning_count
FROM daily_flow_aggregated
WHERE task_date IS NOT NULL
GROUP BY farm_uuid, task_date;


