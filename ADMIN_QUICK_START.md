# Admin Access - Quick Start Guide

## TL;DR

Admin access is now controlled by the `is_admin` column in the `profile` table instead of hardcoded email checks. Manage admins via SQL without deploying code.

---

## Setup (One-Time)

### 1. Run Migration

```sql
-- In Supabase SQL Editor
ALTER TABLE profile 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

UPDATE profile 
SET is_admin = true 
WHERE email = 'team@sproutify.app';

CREATE INDEX IF NOT EXISTS idx_profile_is_admin ON profile(is_admin) WHERE is_admin = true;
```

### 2. Deploy Code

Deploy the updated code from this repository. No configuration changes needed.

---

## Daily Operations

### Grant Admin Access

```sql
UPDATE profile SET is_admin = true WHERE email = 'newadmin@example.com';
```

### Revoke Admin Access

```sql
UPDATE profile SET is_admin = false WHERE email = 'formeradmin@example.com';
```

### List All Admins

```sql
SELECT email, name, is_admin FROM profile WHERE is_admin = true;
```

---

## How It Works

1. **Login at `/admin-portal/login`**
   - System checks `profile.is_admin` column
   - Only users with `is_admin = true` can access

2. **Session Refresh**
   - Admin status refreshed every 15 minutes
   - Also refreshes when user switches back to tab
   - Revoked admin access takes effect within 15 minutes

3. **Regular Users at `/login`**
   - If `is_admin = true`: Auto-redirected to admin portal
   - If `is_admin = false`: Access regular dashboard

---

## Files Reference

- **Migration**: `supabase/migrations/046_add_is_admin_column.sql`
- **Helper Queries**: `supabase/admin_management.sql`
- **Full Documentation**: `DYNAMIC_ADMIN_IMPLEMENTATION.md`

---

## Troubleshooting

### User can't access admin portal
```sql
-- Check their admin status
SELECT email, is_admin FROM profile WHERE email = 'user@example.com';

-- Grant access if needed
UPDATE profile SET is_admin = true WHERE email = 'user@example.com';
```

### User still has access after revoke
- Admin status refreshes every 15 minutes
- Have them log out and back in for immediate effect
- Or wait up to 15 minutes for automatic refresh

### Check session data
```javascript
// In browser console
JSON.parse(localStorage.getItem('sproutify_session'))
// Look for: { ..., "isAdmin": true/false }
```

---

## Security Notes

✅ Only users with database access can grant admin rights
✅ New users default to `is_admin = false`  
✅ Admin status persists in database, not just session  
✅ Changes logged in browser console for debugging

---

## Need Help?

See full documentation: `DYNAMIC_ADMIN_IMPLEMENTATION.md`
