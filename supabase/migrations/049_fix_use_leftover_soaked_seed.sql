-- Migration: Fix use_leftover_soaked_seed RPC function
-- Description: Creates or replaces the use_leftover_soaked_seed function to properly
-- handle creating trays from available soaked seed.

-- ============================================
-- 1. Create or replace the use_leftover_soaked_seed function
-- ============================================
CREATE OR REPLACE FUNCTION use_leftover_soaked_seed(
  p_soaked_id INTEGER,
  p_quantity_trays INTEGER,
  p_request_id INTEGER DEFAULT NULL,
  p_recipe_id INTEGER DEFAULT NULL,
  p_scheduled_sow_date DATE DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS INTEGER -- Returns number of trays created
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_soaked_seed RECORD;
  v_recipe RECORD;
  v_seed_per_tray NUMERIC;
  v_seed_needed NUMERIC;
  v_trays_possible INTEGER;
  v_trays_to_create INTEGER;
  v_tray_unique_id TEXT;
  v_tray_id INTEGER;
  v_trays_created INTEGER := 0;
  v_sow_date TIMESTAMP WITH TIME ZONE;
  v_recipe_id INTEGER;
BEGIN
  -- Get soaked seed details
  SELECT
    ss.soaked_id,
    ss.farm_uuid,
    ss.recipe_id,
    ss.variety_id,
    ss.seedbatch_id,
    ss.quantity_remaining,
    ss.soak_date,
    ss.status
  INTO v_soaked_seed
  FROM soaked_seed ss
  WHERE ss.soaked_id = p_soaked_id
  FOR UPDATE; -- Lock the row

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Soaked seed ID % not found', p_soaked_id;
  END IF;

  IF v_soaked_seed.status != 'available' THEN
    RAISE EXCEPTION 'Soaked seed ID % is not available (status: %)', p_soaked_id, v_soaked_seed.status;
  END IF;

  IF v_soaked_seed.quantity_remaining <= 0 THEN
    RAISE EXCEPTION 'Soaked seed ID % has no remaining quantity', p_soaked_id;
  END IF;

  -- Determine which recipe_id to use (prefer passed parameter, fall back to soaked_seed's recipe)
  v_recipe_id := COALESCE(p_recipe_id, v_soaked_seed.recipe_id);

  -- Get recipe details for seed quantity per tray
  SELECT
    r.recipe_id,
    r.recipe_name,
    r.variety_id,
    r.variety_name,
    COALESCE(r.seed_quantity, v.seed_quantity_grams, 50) as seed_quantity_grams,
    r.seed_quantity_unit
  INTO v_recipe
  FROM recipes r
  LEFT JOIN varieties v ON v.varietyid = r.variety_id
  WHERE r.recipe_id = v_recipe_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipe ID % not found', v_recipe_id;
  END IF;

  -- Calculate seed needed per tray (convert if needed)
  v_seed_per_tray := v_recipe.seed_quantity_grams;
  IF v_recipe.seed_quantity_unit = 'oz' THEN
    v_seed_per_tray := v_seed_per_tray * 28.35; -- Convert oz to grams
  END IF;

  -- If no seed quantity defined, use a reasonable default
  IF v_seed_per_tray IS NULL OR v_seed_per_tray <= 0 THEN
    v_seed_per_tray := 50; -- Default 50g per tray
  END IF;

  -- Calculate how many trays we can make
  v_trays_possible := FLOOR(v_soaked_seed.quantity_remaining / v_seed_per_tray);

  IF v_trays_possible <= 0 THEN
    RAISE EXCEPTION 'Not enough soaked seed. Can make 0 trays, requested %. Available: %g, need %g per tray',
      p_quantity_trays, v_soaked_seed.quantity_remaining, v_seed_per_tray;
  END IF;

  -- Determine how many trays to actually create
  v_trays_to_create := LEAST(p_quantity_trays, v_trays_possible);
  v_seed_needed := v_trays_to_create * v_seed_per_tray;

  -- Calculate sow date: use scheduled date if provided (for overdue tasks), otherwise calculate
  IF p_scheduled_sow_date IS NOT NULL THEN
    -- Use the scheduled sow date (important for overdue seeding tasks to preserve original schedule)
    v_sow_date := p_scheduled_sow_date::TIMESTAMP AT TIME ZONE 'UTC';
  ELSE
    -- Default: today or the day after soak date if soaking just completed
    v_sow_date := GREATEST(NOW(), (v_soaked_seed.soak_date + INTERVAL '1 day')::TIMESTAMP);
  END IF;

  -- Create trays
  FOR i IN 1..v_trays_to_create LOOP
    -- Generate unique tray ID
    v_tray_unique_id := 'TRY-' ||
      EXTRACT(EPOCH FROM NOW())::BIGINT || '-' ||
      UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT || i::TEXT) FROM 1 FOR 9));

    -- Create the tray
    INSERT INTO trays (
      tray_unique_id,
      recipe_id,
      farm_uuid,
      sow_date,
      created_by,
      status
    )
    VALUES (
      v_tray_unique_id,
      v_recipe_id,
      v_soaked_seed.farm_uuid,
      v_sow_date,
      p_user_id,
      'active'
    )
    RETURNING tray_id INTO v_tray_id;

    -- Create tray_steps for the new tray
    INSERT INTO tray_steps (tray_id, step_id, scheduled_date, status, completed)
    SELECT
      v_tray_id,
      s.step_id,
      -- Calculate scheduled_date based on sow_date and step's position
      (v_sow_date::DATE + COALESCE(
        (SELECT SUM(COALESCE(duration, 1))
         FROM steps prev
         WHERE prev.recipe_id = s.recipe_id
         AND COALESCE(prev.step_order, prev.sequence_order, 0) < COALESCE(s.step_order, s.sequence_order, 0)),
        0
      )::INTEGER),
      'Pending',
      FALSE
    FROM steps s
    WHERE s.recipe_id = v_recipe_id
    ORDER BY COALESCE(s.step_order, s.sequence_order, 0);

    v_trays_created := v_trays_created + 1;
  END LOOP;

  -- Deduct used seed from soaked_seed
  UPDATE soaked_seed
  SET
    quantity_remaining = quantity_remaining - v_seed_needed,
    status = CASE
      WHEN quantity_remaining - v_seed_needed <= 0 THEN 'used'
      ELSE status
    END,
    updated_at = NOW()
  WHERE soaked_id = p_soaked_id;

  -- Record task completion for sowing
  INSERT INTO task_completions (
    farm_uuid,
    task_type,
    task_date,
    recipe_id,
    request_id,
    status,
    completed_at,
    completed_by,
    quantity
  )
  VALUES (
    v_soaked_seed.farm_uuid,
    'sowing',
    CURRENT_DATE,
    v_recipe_id,
    p_request_id,
    'completed',
    NOW(),
    p_user_id,
    v_trays_created
  )
  ON CONFLICT (farm_uuid, task_type, task_date, recipe_id, customer_name, product_name)
  DO UPDATE SET
    completed_at = NOW(),
    completed_by = p_user_id,
    quantity = COALESCE(task_completions.quantity, 0) + v_trays_created;

  RETURN v_trays_created;
END;
$$;

COMMENT ON FUNCTION use_leftover_soaked_seed IS
  'Creates trays from available soaked seed. Checks seed quantity available, creates trays, and deducts from soaked_seed.';

-- ============================================
-- 2. Grant execute permission
-- ============================================
GRANT EXECUTE ON FUNCTION use_leftover_soaked_seed TO authenticated;
