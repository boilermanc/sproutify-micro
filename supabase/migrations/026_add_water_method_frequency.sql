-- Migration: Add water method and frequency fields to steps table
-- Description: Adds fields to support top/bottom watering and frequency for blackout and growing steps

-- ============================================
-- 1. Add water method field
-- ============================================
ALTER TABLE steps ADD COLUMN IF NOT EXISTS water_method TEXT;
-- Values: 'top', 'bottom', or NULL (default/not specified)

COMMENT ON COLUMN steps.water_method IS 'Watering method: top (water from top) or bottom (water from bottom). Used for blackout and growing steps when water_type is set.';

-- ============================================
-- 2. Add water frequency field
-- ============================================
ALTER TABLE steps ADD COLUMN IF NOT EXISTS water_frequency TEXT;
-- Values: '1x daily', '2x daily', '3x daily', 'custom', or NULL (default/not specified)

COMMENT ON COLUMN steps.water_frequency IS 'Watering frequency: 1x daily, 2x daily, 3x daily, or custom. Used for blackout and growing steps when water_type is set.';





