-- Migration: Add admin RLS policies
-- Description: Allow admin users (team@sproutify.app) to view all data across farms

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND email = 'team@sproutify.app'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin policies for farms
DROP POLICY IF EXISTS "Admin can view all farms" ON farms;
CREATE POLICY "Admin can view all farms" ON farms
  FOR SELECT
  USING (is_admin_user());

-- Admin policies for profile
DROP POLICY IF EXISTS "Admin can view all profiles" ON profile;
CREATE POLICY "Admin can view all profiles" ON profile
  FOR SELECT
  USING (is_admin_user());

-- Admin policies for varieties
DROP POLICY IF EXISTS "Admin can view all varieties" ON varieties;
CREATE POLICY "Admin can view all varieties" ON varieties
  FOR SELECT
  USING (is_admin_user());

-- Admin policies for recipes
DROP POLICY IF EXISTS "Admin can view all recipes" ON recipes;
CREATE POLICY "Admin can view all recipes" ON recipes
  FOR SELECT
  USING (is_admin_user());

-- Admin policies for trays
DROP POLICY IF EXISTS "Admin can view all trays" ON trays;
CREATE POLICY "Admin can view all trays" ON trays
  FOR SELECT
  USING (is_admin_user());

-- Admin policies for customers
DROP POLICY IF EXISTS "Admin can view all customers" ON customers;
CREATE POLICY "Admin can view all customers" ON customers
  FOR SELECT
  USING (is_admin_user());

-- Admin policies for vendors
DROP POLICY IF EXISTS "Admin can view all vendors" ON vendors;
CREATE POLICY "Admin can view all vendors" ON vendors
  FOR SELECT
  USING (is_admin_user());

-- Admin policies for seedbatches
DROP POLICY IF EXISTS "Admin can view all seedbatches" ON seedbatches;
CREATE POLICY "Admin can view all seedbatches" ON seedbatches
  FOR SELECT
  USING (is_admin_user());

-- Admin policies for orders (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orders') THEN
    -- Drop policy if it exists, then create it
    EXECUTE 'DROP POLICY IF EXISTS "Admin can view all orders" ON orders';
    EXECUTE 'CREATE POLICY "Admin can view all orders" ON orders FOR SELECT USING (is_admin_user())';
  END IF;
END $$;

-- Admin policies for products (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'products') THEN
    -- Drop policy if it exists, then create it
    EXECUTE 'DROP POLICY IF EXISTS "Admin can view all products" ON products';
    EXECUTE 'CREATE POLICY "Admin can view all products" ON products FOR SELECT USING (is_admin_user())';
  END IF;
END $$;

-- Admin policies for notifications (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
    -- Drop policies if they exist, then create them
    EXECUTE 'DROP POLICY IF EXISTS "Admin can view all notifications" ON notifications';
    EXECUTE 'DROP POLICY IF EXISTS "Admin can create notifications" ON notifications';
    EXECUTE 'CREATE POLICY "Admin can view all notifications" ON notifications FOR SELECT USING (is_admin_user())';
    EXECUTE 'CREATE POLICY "Admin can create notifications" ON notifications FOR INSERT WITH CHECK (is_admin_user())';
  END IF;
END $$;

-- Admin policies for email_events (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'email_events') THEN
    -- Drop policy if it exists, then create it
    EXECUTE 'DROP POLICY IF EXISTS "Admin can view all email events" ON email_events';
    EXECUTE 'CREATE POLICY "Admin can view all email events" ON email_events FOR SELECT USING (is_admin_user())';
  END IF;
END $$;

