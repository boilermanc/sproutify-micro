-- Admin Management Helper Queries
-- Run these in Supabase SQL Editor to manage admin access

-- =====================================================
-- GRANT ADMIN ACCESS
-- =====================================================

-- Grant admin to a specific email
-- UPDATE profile SET is_admin = true WHERE email = 'newadmin@example.com';

-- Grant admin to a specific user ID
-- UPDATE profile SET is_admin = true WHERE id = '123e4567-e89b-12d3-a456-426614174000';


-- =====================================================
-- REVOKE ADMIN ACCESS
-- =====================================================

-- Revoke admin from a specific email
-- UPDATE profile SET is_admin = false WHERE email = 'formeradmin@example.com';

-- Revoke admin from a specific user ID
-- UPDATE profile SET is_admin = false WHERE id = '123e4567-e89b-12d3-a456-426614174000';


-- =====================================================
-- LIST ADMINS
-- =====================================================

-- Show all current admins
SELECT 
  email, 
  name, 
  is_admin,
  role,
  created_at,
  last_active,
  is_active
FROM profile 
WHERE is_admin = true
ORDER BY email;


-- =====================================================
-- CHECK SPECIFIC USER
-- =====================================================

-- Check if a specific email has admin access
-- SELECT email, is_admin FROM profile WHERE email = 'user@example.com';

-- Check if a specific user ID has admin access
-- SELECT email, is_admin FROM profile WHERE id = '123e4567-e89b-12d3-a456-426614174000';


-- =====================================================
-- BULK OPERATIONS
-- =====================================================

-- Grant admin to multiple users by email (uncomment to use)
-- UPDATE profile SET is_admin = true 
-- WHERE email IN (
--   'admin1@example.com',
--   'admin2@example.com',
--   'admin3@example.com'
-- );

-- Revoke admin from all users except specific ones (EMERGENCY USE ONLY)
-- UPDATE profile SET is_admin = false 
-- WHERE email NOT IN ('team@sproutify.app');


-- =====================================================
-- STATISTICS
-- =====================================================

-- Count admins vs regular users
SELECT 
  is_admin,
  COUNT(*) as user_count
FROM profile
GROUP BY is_admin;


-- =====================================================
-- AUDIT (Optional Enhancement)
-- =====================================================

-- Create audit log table (run once)
/*
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id SERIAL PRIMARY KEY,
  user_id UUID,
  email TEXT,
  action TEXT, -- 'granted' or 'revoked'
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT now()
);

-- Create audit trigger
CREATE OR REPLACE FUNCTION log_admin_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_admin != NEW.is_admin THEN
    INSERT INTO admin_audit_log (user_id, email, action, changed_by)
    VALUES (
      NEW.id, 
      NEW.email,
      CASE WHEN NEW.is_admin THEN 'granted' ELSE 'revoked' END,
      current_user
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_admin_changes
  AFTER UPDATE ON profile
  FOR EACH ROW
  EXECUTE FUNCTION log_admin_changes();
*/

-- View audit log (if created)
-- SELECT * FROM admin_audit_log ORDER BY changed_at DESC LIMIT 20;
