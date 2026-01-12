-- Create soaking system tables and functions
-- Fixes issue where soak task completion records wrong date

-- ============================================
-- 1. Create task_completions table (if not exists)
-- ============================================
CREATE TABLE IF NOT EXISTS task_completions (
  completion_id SERIAL PRIMARY KEY,
  farm_uuid UUID NOT NULL REFERENCES farms(farm_uuid),
  task_type TEXT NOT NULL CHECK (task_type IN ('soaking', 'sowing', 'watering', 'harvest', 'maintenance')),
  task_date DATE NOT NULL, -- The date the task appeared/was due (NOT when it was completed)
  recipe_id INTEGER REFERENCES recipes(recipe_id),
  tray_id INTEGER REFERENCES trays(tray_id),
  request_id INTEGER, -- Reference to tray_creation_requests if applicable
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'skipped', 'failed')),
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_by UUID REFERENCES profile(id),
  notes TEXT,
  customer_name TEXT,
  product_name TEXT,
  quantity NUMERIC, -- Quantity completed (trays, grams, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (farm_uuid, task_type, task_date, recipe_id, customer_name, product_name)
);

CREATE INDEX IF NOT EXISTS idx_task_completions_farm_date 
  ON task_completions(farm_uuid, task_date);
CREATE INDEX IF NOT EXISTS idx_task_completions_recipe 
  ON task_completions(recipe_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_type 
  ON task_completions(task_type);

COMMENT ON TABLE task_completions IS 
  'Records completed tasks for filtering in Daily Flow. task_date is when the task appeared, not when completed.';
COMMENT ON COLUMN task_completions.task_date IS 
  'The date the task appeared in Daily Flow (e.g., soak date for soak tasks, not seeding date)';

-- ============================================
-- 2. Create soaked_seed table
-- ============================================
CREATE TABLE IF NOT EXISTS soaked_seed (
  soaked_id SERIAL PRIMARY KEY,
  farm_uuid UUID NOT NULL REFERENCES farms(farm_uuid),
  recipe_id INTEGER NOT NULL REFERENCES recipes(recipe_id),
  variety_id INTEGER REFERENCES varieties(varietyid),
  seedbatch_id INTEGER NOT NULL REFERENCES seedbatches(batchid),
  request_id INTEGER, -- Reference to tray_creation_requests if applicable
  quantity_grams NUMERIC NOT NULL CHECK (quantity_grams > 0),
  quantity_remaining NUMERIC NOT NULL CHECK (quantity_remaining >= 0),
  unit TEXT DEFAULT 'g',
  soak_date DATE NOT NULL, -- When soaking started
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL, -- When soaked seed expires (typically 24-48 hours)
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'used', 'expired', 'discarded')),
  notes TEXT,
  created_by UUID REFERENCES profile(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_soaked_seed_farm_recipe 
  ON soaked_seed(farm_uuid, recipe_id);
CREATE INDEX IF NOT EXISTS idx_soaked_seed_status 
  ON soaked_seed(status);
CREATE INDEX IF NOT EXISTS idx_soaked_seed_soak_date 
  ON soaked_seed(soak_date);
CREATE INDEX IF NOT EXISTS idx_soaked_seed_request 
  ON soaked_seed(request_id);

COMMENT ON TABLE soaked_seed IS 
  'Tracks soaked seeds that are ready for seeding';
COMMENT ON COLUMN soaked_seed.soak_date IS 
  'The date soaking started (matches task_completions.task_date for soak tasks)';

-- ============================================
-- 3. Create available_soaked_seed view
-- ============================================
CREATE OR REPLACE VIEW available_soaked_seed AS
SELECT 
  ss.soaked_id,
  ss.farm_uuid,
  ss.recipe_id,
  ss.variety_id,
  ss.seedbatch_id,
  ss.request_id,
  ss.quantity_grams,
  ss.quantity_remaining,
  ss.unit,
  ss.soak_date,
  ss.expires_at,
  ss.status,
  r.recipe_name,
  r.variety_name,
  v.varietyname AS variety_name_alt,
  -- Calculate urgency based on expiration
  CASE 
    WHEN ss.expires_at < NOW() THEN 'expired'
    WHEN ss.expires_at < NOW() + INTERVAL '12 hours' THEN 'urgent'
    WHEN ss.expires_at < NOW() + INTERVAL '24 hours' THEN 'soon'
    ELSE 'available'
  END AS urgency
FROM soaked_seed ss
LEFT JOIN recipes r ON r.recipe_id = ss.recipe_id
LEFT JOIN varieties v ON v.varietyid = ss.variety_id
WHERE 
  ss.status = 'available'
  AND ss.quantity_remaining > 0
  AND ss.expires_at > NOW() - INTERVAL '24 hours' -- Include recently expired for reference
ORDER BY ss.expires_at ASC;

COMMENT ON VIEW available_soaked_seed IS 
  'Shows available soaked seeds with urgency calculated from expiration time';

-- ============================================
-- 4. Create complete_soak_task RPC function
-- ============================================
CREATE OR REPLACE FUNCTION complete_soak_task(
  p_request_id INTEGER,
  p_seedbatch_id INTEGER,
  p_quantity_grams NUMERIC,
  p_task_date DATE, -- ✅ The soak date (when task appears), not seeding date
  p_user_id UUID DEFAULT NULL
)
RETURNS INTEGER -- Returns soaked_seed_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_farm_uuid UUID;
  v_recipe_id INTEGER;
  v_variety_id INTEGER;
  v_soaked_id INTEGER;
  v_soak_hours INTEGER DEFAULT 12; -- Default soak duration
  v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get request details
  SELECT farm_uuid, recipe_id
  INTO v_farm_uuid, v_recipe_id
  FROM tray_creation_requests
  WHERE request_id = p_request_id;

  IF v_farm_uuid IS NULL THEN
    RAISE EXCEPTION 'Request ID % not found', p_request_id;
  END IF;

  -- Get variety_id from recipe
  SELECT variety_id
  INTO v_variety_id
  FROM recipes
  WHERE recipe_id = v_recipe_id;

  -- Calculate expiration (soaked seed typically lasts 24-48 hours)
  -- Use the task_date as the soak start date
  v_expires_at := (p_task_date::TIMESTAMP) + INTERVAL '48 hours';

  -- Create soaked_seed entry
  INSERT INTO soaked_seed (
    farm_uuid,
    recipe_id,
    variety_id,
    seedbatch_id,
    request_id,
    quantity_grams,
    quantity_remaining,
    unit,
    soak_date,
    expires_at,
    status,
    created_by
  )
  VALUES (
    v_farm_uuid,
    v_recipe_id,
    v_variety_id,
    p_seedbatch_id,
    p_request_id,
    p_quantity_grams,
    p_quantity_grams, -- Initially, all quantity is remaining
    'g',
    p_task_date, -- ✅ Use the provided task_date (soak date)
    v_expires_at,
    'available',
    p_user_id
  )
  RETURNING soaked_id INTO v_soaked_id;

  -- Record task completion
  -- ✅ Use p_task_date (soak date), NOT seed_date from request
  INSERT INTO task_completions (
    farm_uuid,
    task_type,
    task_date, -- ✅ Soak date (Jan 11), not seeding date (Jan 12)
    recipe_id,
    request_id,
    status,
    completed_at,
    completed_by,
    quantity
  )
  VALUES (
    v_farm_uuid,
    'soaking',
    p_task_date, -- ✅ Use the provided task_date
    v_recipe_id,
    p_request_id,
    'completed',
    NOW(),
    p_user_id,
    p_quantity_grams
  )
  ON CONFLICT (farm_uuid, task_type, task_date, recipe_id, customer_name, product_name) 
  DO UPDATE SET
    completed_at = NOW(),
    completed_by = p_user_id,
    quantity = COALESCE(task_completions.quantity, 0) + p_quantity_grams;

  -- Optionally: deduct seed inventory from seedbatch
  -- This depends on whether you want to deduct at soak time or seed time
  -- For now, we'll deduct at soak time since seed is committed
  UPDATE seedbatches
  SET quantityinstock = GREATEST(0, quantityinstock - p_quantity_grams)
  WHERE batchid = p_seedbatch_id;

  RETURN v_soaked_id;
END;
$$;

COMMENT ON FUNCTION complete_soak_task IS 
  'Completes a soak task by creating soaked_seed entry and recording completion. 
   p_task_date should be the soak date (when task appears), not seeding date.';

-- ============================================
-- 5. Enable RLS on new tables
-- ============================================
ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE soaked_seed ENABLE ROW LEVEL SECURITY;

-- RLS for task_completions
CREATE POLICY IF NOT EXISTS "Users can view farm task completions" 
  ON task_completions FOR SELECT 
  USING (farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid()));

CREATE POLICY IF NOT EXISTS "Users can manage farm task completions" 
  ON task_completions FOR ALL 
  USING (farm_uuid IN (
    SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
  ));

-- RLS for soaked_seed
CREATE POLICY IF NOT EXISTS "Users can view farm soaked seed" 
  ON soaked_seed FOR SELECT 
  USING (farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid()));

CREATE POLICY IF NOT EXISTS "Users can manage farm soaked seed" 
  ON soaked_seed FOR ALL 
  USING (farm_uuid IN (
    SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
  ));
