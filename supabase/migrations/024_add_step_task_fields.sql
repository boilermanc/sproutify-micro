-- Migration: Add structured task fields to steps table
-- Description: Adds fields to support recurring tasks (misting), weighted domes, and do-not-disturb periods

-- ============================================
-- 1. Add weighted dome fields
-- ============================================
ALTER TABLE steps ADD COLUMN IF NOT EXISTS requires_weight BOOLEAN DEFAULT FALSE;
ALTER TABLE steps ADD COLUMN IF NOT EXISTS weight_lbs NUMERIC(5,2);

COMMENT ON COLUMN steps.requires_weight IS 'Whether this step requires a weighted dome';
COMMENT ON COLUMN steps.weight_lbs IS 'Weight in pounds for the weighted dome (e.g., 5.0)';

-- ============================================
-- 2. Add misting schedule fields
-- ============================================
ALTER TABLE steps ADD COLUMN IF NOT EXISTS misting_frequency TEXT;
-- Values: 'none', '1x daily', '2x daily', '3x daily', 'custom'
ALTER TABLE steps ADD COLUMN IF NOT EXISTS misting_start_day INTEGER DEFAULT 0;
-- Day within the step when misting starts (0 = start immediately, 1 = start on day 2 of step, etc.)

COMMENT ON COLUMN steps.misting_frequency IS 'Misting frequency: none, 1x daily, 2x daily, 3x daily, or custom';
COMMENT ON COLUMN steps.misting_start_day IS 'Day within step when misting starts (0 = immediately, 1 = day 2, etc.)';

-- ============================================
-- 3. Add do-not-disturb period field
-- ============================================
ALTER TABLE steps ADD COLUMN IF NOT EXISTS do_not_disturb_days INTEGER DEFAULT 0;
-- Number of days at start of step where tray should not be disturbed

COMMENT ON COLUMN steps.do_not_disturb_days IS 'Number of days at start of step where tray should not be disturbed (e.g., 3 days under weight before misting)';

-- ============================================
-- 4. Add water type field for watering tasks
-- ============================================
ALTER TABLE steps ADD COLUMN IF NOT EXISTS water_type TEXT;
-- Values: 'water', 'nutrients', or NULL (default/not specified)
-- Used when step generates a watering task to specify if it's plain water or nutrient solution

COMMENT ON COLUMN steps.water_type IS 'Type of watering for this step: water (plain water) or nutrients (nutrient solution). Used when step generates watering tasks.';

-- ============================================
-- 5. Add indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_steps_requires_weight ON steps(requires_weight) WHERE requires_weight = TRUE;
CREATE INDEX IF NOT EXISTS idx_steps_misting_frequency ON steps(misting_frequency) WHERE misting_frequency IS NOT NULL AND misting_frequency != 'none';

