-- Migration: Create test_accounts table for managing subscription bypass
-- This allows admins to add email addresses that bypass subscription blocks

CREATE TABLE IF NOT EXISTS test_accounts (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Create index for fast email lookups
CREATE INDEX IF NOT EXISTS idx_test_accounts_email ON test_accounts(email);

-- RLS: Only allow access to users with @sproutify.app emails
ALTER TABLE test_accounts ENABLE ROW LEVEL SECURITY;

-- Policy: Allow read access to authenticated users (to check if they're a test account)
CREATE POLICY "Allow authenticated users to read test_accounts"
ON test_accounts
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow insert/update/delete only to sproutify.app admins
CREATE POLICY "Allow sproutify admins to manage test_accounts"
ON test_accounts
FOR ALL
TO authenticated
USING (
    (SELECT email FROM auth.users WHERE id = auth.uid()) LIKE '%@sproutify.app'
)
WITH CHECK (
    (SELECT email FROM auth.users WHERE id = auth.uid()) LIKE '%@sproutify.app'
);

-- Insert default test accounts
INSERT INTO test_accounts (email, notes) VALUES
    ('clint@sproutify.app', 'Primary admin account'),
    ('test@sproutify.app', 'General test account'),
    ('demo@sproutify.app', 'Demo account')
ON CONFLICT (email) DO NOTHING;

-- Create a function to check if an email is a test account
CREATE OR REPLACE FUNCTION is_test_account(check_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check exact email match
    IF EXISTS (SELECT 1 FROM test_accounts WHERE LOWER(email) = LOWER(check_email)) THEN
        RETURN TRUE;
    END IF;

    -- Check if email is from sproutify.app domain (always a test account)
    IF LOWER(check_email) LIKE '%@sproutify.app' THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;
