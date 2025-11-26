-- Add trial and subscription fields to farms table
ALTER TABLE farms 
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'expired', 'cancelled')),
ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS subscription_plan TEXT CHECK (subscription_plan IN ('Starter', 'Professional', 'Enterprise')),
ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP WITH TIME ZONE;

-- Create function to automatically set trial dates when subscription_status is 'trial'
CREATE OR REPLACE FUNCTION set_trial_dates()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.subscription_status = 'trial' AND NEW.trial_start_date IS NULL THEN
    NEW.trial_start_date := NOW();
    NEW.trial_end_date := NOW() + INTERVAL '7 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set trial dates
DROP TRIGGER IF EXISTS trigger_set_trial_dates ON farms;
CREATE TRIGGER trigger_set_trial_dates
  BEFORE INSERT OR UPDATE ON farms
  FOR EACH ROW
  WHEN (NEW.subscription_status = 'trial')
  EXECUTE FUNCTION set_trial_dates();

-- Create index for subscription queries
CREATE INDEX IF NOT EXISTS idx_farms_subscription_status ON farms(subscription_status);
CREATE INDEX IF NOT EXISTS idx_farms_trial_end_date ON farms(trial_end_date);

