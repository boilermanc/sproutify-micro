-- Create a parameterized function to get order gap status for a specific date
-- This replaces the order_gap_status view's use of CURRENT_DATE which causes
-- timezone issues (database uses UTC, so after 5pm MST orders disappear)

CREATE OR REPLACE FUNCTION get_order_gap_status(target_date date, p_farm_uuid uuid)
RETURNS TABLE (
    farm_uuid uuid,
    standing_order_id integer,
    customer_id integer,
    customer_name text,
    product_id integer,
    product_name text,
    is_mix boolean,
    trays_needed integer,
    varieties_in_product integer,
    varieties_missing integer,
    trays_ready integer,
    gap numeric,
    delivery_date date,
    missing_varieties text,
    near_ready_assigned bigint,
    soonest_ready_date timestamp,
    unassigned_ready bigint,
    unassigned_near_ready bigint
)
LANGUAGE sql
STABLE
AS $$
WITH today_dow AS (
    SELECT TRIM(BOTH FROM to_char(target_date::timestamp with time zone, 'Day'::text)) AS day_name
), order_products AS (
    SELECT DISTINCT so.farm_uuid,
        so.standing_order_id,
        c.customerid AS customer_id,
        c.name AS customer_name,
        p.product_id,
        p.product_name,
        soi.quantity::integer AS trays_needed,
        so.delivery_days
    FROM standing_orders so
    JOIN customers c ON so.customer_id = c.customerid
    JOIN standing_order_items soi ON so.standing_order_id = soi.standing_order_id
    JOIN products p ON soi.product_id = p.product_id
    CROSS JOIN today_dow td
    WHERE so.is_active = true
        AND so.farm_uuid = p_farm_uuid
        AND (td.day_name = ANY (so.delivery_days))
        AND NOT (EXISTS (
            SELECT 1
            FROM order_schedules os
            WHERE os.standing_order_id = so.standing_order_id
                AND os.scheduled_delivery_date = target_date
                AND (os.status = ANY (ARRAY['completed'::text, 'skipped'::text]))
        ))
), product_recipes AS (
    SELECT product_recipe_mapping.product_id,
        product_recipe_mapping.recipe_id,
        product_recipe_mapping.ratio
    FROM product_recipe_mapping
), product_type AS (
    SELECT product_recipes.product_id,
        bool_or(product_recipes.ratio < 1::numeric) AS is_mix
    FROM product_recipes
    GROUP BY product_recipes.product_id
), tray_status AS (
    SELECT t.farm_uuid,
        t.tray_id,
        t.customer_id,
        t.recipe_id,
        t.sow_date,
        target_date - t.sow_date AS days_grown,
        rtd.total_days::integer AS total_days,
        CASE
            WHEN (target_date - t.sow_date) >= rtd.total_days THEN 'ready'::text
            WHEN (target_date - t.sow_date) >= (rtd.total_days - 2) THEN 'near_ready'::text
            ELSE 'growing'::text
        END AS status,
        rtd.total_days::integer - (target_date - t.sow_date) AS days_until_ready
    FROM trays t
    JOIN recipe_total_days rtd ON t.recipe_id = rtd.recipe_id
    WHERE t.status::text = 'active'::text
        AND t.harvest_date IS NULL
        AND t.farm_uuid = p_farm_uuid
), ready_per_recipe AS (
    SELECT op_1.farm_uuid,
        op_1.customer_id,
        op_1.product_id,
        pr_1.recipe_id,
        count(ts.tray_id) AS ready_count
    FROM order_products op_1
    JOIN product_recipes pr_1 ON op_1.product_id = pr_1.product_id
    LEFT JOIN tray_status ts ON ts.recipe_id = pr_1.recipe_id
        AND ts.customer_id = op_1.customer_id
        AND ts.farm_uuid = op_1.farm_uuid
        AND ts.status = 'ready'::text
    GROUP BY op_1.farm_uuid, op_1.customer_id, op_1.product_id, pr_1.recipe_id
), product_ready AS (
    SELECT rpr.farm_uuid,
        rpr.customer_id,
        rpr.product_id,
        CASE
            WHEN pt_1.is_mix THEN min(rpr.ready_count)::numeric
            ELSE sum(rpr.ready_count)
        END AS trays_ready,
        count(*) AS varieties_in_product,
        sum(
            CASE
                WHEN rpr.ready_count = 0 THEN 1
                ELSE 0
            END) AS varieties_missing
    FROM ready_per_recipe rpr
    JOIN product_type pt_1 ON rpr.product_id = pt_1.product_id
    GROUP BY rpr.farm_uuid, rpr.customer_id, rpr.product_id, pt_1.is_mix
)
SELECT op.farm_uuid,
    op.standing_order_id,
    op.customer_id,
    op.customer_name,
    op.product_id,
    op.product_name,
    pt.is_mix,
    op.trays_needed,
    pr.varieties_in_product::integer AS varieties_in_product,
    pr.varieties_missing::integer AS varieties_missing,
    COALESCE(pr.trays_ready, 0::numeric)::integer AS trays_ready,
    op.trays_needed::numeric - COALESCE(pr.trays_ready, 0::numeric) AS gap,
    target_date AS delivery_date,
    ( SELECT string_agg(r.recipe_name::text, ', '::text) AS string_agg
        FROM product_recipe_mapping prm
        JOIN recipes r ON prm.recipe_id = r.recipe_id
        LEFT JOIN tray_status ts ON ts.recipe_id = prm.recipe_id
            AND ts.customer_id = op.customer_id
            AND ts.farm_uuid = op.farm_uuid
            AND ts.status = 'ready'::text
        WHERE prm.product_id = op.product_id AND ts.tray_id IS NULL) AS missing_varieties,
    ( SELECT count(*) AS count
        FROM tray_status ts
        JOIN product_recipes prm ON ts.recipe_id = prm.recipe_id
        WHERE prm.product_id = op.product_id
            AND ts.customer_id = op.customer_id
            AND ts.farm_uuid = op.farm_uuid
            AND ts.status = 'near_ready'::text) AS near_ready_assigned,
    ( SELECT min(ts.sow_date + ((ts.total_days || ' days'::text)::interval)) AS min
        FROM tray_status ts
        JOIN product_recipes prm ON ts.recipe_id = prm.recipe_id
        WHERE prm.product_id = op.product_id
            AND ts.customer_id = op.customer_id
            AND ts.farm_uuid = op.farm_uuid
            AND ts.status = 'near_ready'::text) AS soonest_ready_date,
    ( SELECT count(*) AS count
        FROM tray_status ts
        JOIN product_recipes prm ON ts.recipe_id = prm.recipe_id
        WHERE prm.product_id = op.product_id
            AND ts.customer_id IS NULL
            AND ts.farm_uuid = op.farm_uuid
            AND ts.status = 'ready'::text) AS unassigned_ready,
    ( SELECT count(*) AS count
        FROM tray_status ts
        JOIN product_recipes prm ON ts.recipe_id = prm.recipe_id
        WHERE prm.product_id = op.product_id
            AND ts.customer_id IS NULL
            AND ts.farm_uuid = op.farm_uuid
            AND ts.status = 'near_ready'::text) AS unassigned_near_ready
FROM order_products op
LEFT JOIN product_ready pr ON op.farm_uuid = pr.farm_uuid
    AND op.customer_id = pr.customer_id
    AND op.product_id = pr.product_id
LEFT JOIN product_type pt ON op.product_id = pt.product_id;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_order_gap_status(date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_order_gap_status(date, uuid) TO anon;
