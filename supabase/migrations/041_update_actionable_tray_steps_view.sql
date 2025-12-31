-- Migration: Update actionable_tray_steps view to include step info
-- Description: Add step_name and step_description (from instructions) columns that Dashboard queries expect

CREATE OR REPLACE VIEW actionable_tray_steps AS
SELECT
    ts.tray_step_id,
    ts.tray_id,
    ts.step_id,
    ts.farm_uuid,
    ts.scheduled_date,
    ts.completed_date,
    ts.completed_by,
    ts.status,
    ts.notes,
    ts.date_created,
    ts.batch_id,
    ts.user_id,
    ts.skipped,
    ts.skipped_at,
    ts.completed,
    ts.completed_at,
    s.step_name,
    s.instructions AS step_description
FROM tray_steps ts
JOIN steps s ON ts.step_id = s.step_id
JOIN trays t ON ts.tray_id = t.tray_id
WHERE s.step_type = 'active'
  AND t.status = 'active';
