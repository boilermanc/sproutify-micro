-- Add is_admin column to profile table for dynamic admin access control
-- This allows admins to be managed via database instead of hardcoded email checks

-- Add is_admin column to profile
ALTER TABLE profile 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Grant admin access to existing admin email
UPDATE profile 
SET is_admin = true 
WHERE email = 'team@sproutify.app';

-- Create index for quick admin lookups (partial index only indexes true values)
CREATE INDEX IF NOT EXISTS idx_profile_is_admin ON profile(is_admin) WHERE is_admin = true;

-- Add comment for documentation
COMMENT ON COLUMN profile.is_admin IS 'Indicates if user has admin portal access. Managed via database instead of hardcoded checks.';
