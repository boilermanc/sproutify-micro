-- Migration: Create RPC function for fetching completed deliveries
-- The Supabase nested relation query was silently failing. This RPC
-- returns flat rows that the frontend can reliably consume.

CREATE OR REPLACE FUNCTION get_completed_deliveries(target_date date, p_farm_uuid uuid)
RETURNS TABLE (
    standing_order_id integer,
    schedule_id integer,
    recipe_id integer,
    recipe_name text,
    customer_id integer,
    customer_name text,
    delivery_date date,
    tray_id integer,
    tray_unique_id varchar,
    harvest_date date
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        os.standing_order_id,
        os.schedule_id,
        os.recipe_id,
        r.recipe_name,
        so.customer_id,
        c.name AS customer_name,
        os.scheduled_delivery_date AS delivery_date,
        t.tray_id,
        t.tray_unique_id,
        t.harvest_date
    FROM order_schedules os
    JOIN standing_orders so ON os.standing_order_id = so.standing_order_id
    JOIN customers c ON so.customer_id = c.customerid
    JOIN recipes r ON os.recipe_id = r.recipe_id
    LEFT JOIN trays t ON t.order_schedule_id = os.schedule_id
    WHERE os.scheduled_delivery_date = target_date
      AND os.status = 'completed'
      AND os.farm_uuid = p_farm_uuid;
$$;

COMMENT ON FUNCTION get_completed_deliveries(date, uuid) IS
    'Returns completed deliveries for a given date and farm. Each row is one tray; '
    'the frontend groups by standing_order_id + recipe_id.';
