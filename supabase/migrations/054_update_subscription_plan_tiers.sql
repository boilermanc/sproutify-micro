-- Migration 054: Update subscription plan tiers
-- Changes from (Starter, Professional, Enterprise) to (starter, growth, pro)

-- First, update existing data to new tier names
UPDATE farms SET subscription_plan = 'starter' WHERE subscription_plan = 'Starter';
UPDATE farms SET subscription_plan = 'growth' WHERE subscription_plan = 'Professional';
UPDATE farms SET subscription_plan = 'pro' WHERE subscription_plan = 'Enterprise';

-- Drop the existing check constraint (auto-generated name from inline CHECK)
-- We need to find and drop it dynamically since the name is auto-generated
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find the check constraint on subscription_plan column
    SELECT con.conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attnum = ANY(con.conkey) AND att.attrelid = con.conrelid
    WHERE con.conrelid = 'farms'::regclass
      AND att.attname = 'subscription_plan'
      AND con.contype = 'c';

    -- Drop the constraint if found
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE farms DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

-- Add new constraint with lowercase tier names
ALTER TABLE farms
ADD CONSTRAINT farms_subscription_plan_check
CHECK (subscription_plan IS NULL OR subscription_plan IN ('starter', 'growth', 'pro'));

-- Update comment for documentation
COMMENT ON COLUMN farms.subscription_plan IS 'Subscription tier: starter ($12.99/mo, 50 trays), growth ($24.99/mo, 150 trays), pro ($39.99/mo, unlimited)';
