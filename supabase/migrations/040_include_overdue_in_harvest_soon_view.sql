-- Migration: Include overdue trays in harvest_soon_view
-- Description: Overdue harvest steps are now part of the "Harvest Soon" count.

CREATE OR REPLACE VIEW harvest_soon_view AS
SELECT
    ts.tray_step_id,
    ts.tray_id,
    t.farm_uuid,
    s.step_name,
    ts.scheduled_date,
    ts.status
FROM tray_steps ts
JOIN trays t ON ts.tray_id = t.tray_id
JOIN steps s ON ts.step_id = s.step_id
WHERE t.status = 'active'
  AND s.step_name ILIKE '%harvest%'
  AND ts.scheduled_date <= (CURRENT_DATE + 7)
  AND ts.status = 'Pending';

