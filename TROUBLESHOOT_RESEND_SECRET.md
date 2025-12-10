# Troubleshooting RESEND_API_KEY Secret

## The Problem
The function fails with "RESEND_API_KEY not configured" before it even tries to call Resend API.

## Step-by-Step Fix

### 1. Verify Secret Location
Go to: **Supabase Dashboard → Project `rmjyfdmwnmaerthcoosq` → Edge Functions → Settings → Secrets**

### 2. Check if Secret Exists
Look for a secret named exactly: `RESEND_API_KEY`
- ✅ Must be exactly `RESEND_API_KEY` (all caps, underscore, no spaces)
- ✅ Value should start with `re_`

### 3. If Secret Doesn't Exist or Name is Wrong

**Option A: Add via Dashboard**
1. Click "Add new secret"
2. Name: `RESEND_API_KEY` (exact, case-sensitive)
3. Value: Your Resend API key (e.g., `re_xxxxxxxxxxxxx`)
4. Click "Save"

**Option B: Add via CLI**
```bash
supabase secrets set RESEND_API_KEY=your_resend_api_key_here --project-ref rmjyfdmwnmaerthcoosq
```

### 4. CRITICAL: Redeploy Function After Adding Secret
Secrets are only available to functions AFTER redeployment.

**Via Dashboard:**
- Go to Edge Functions → `send-broadcast-email`
- Click "Redeploy" button (or edit and save)

**Via CLI:**
```bash
supabase functions deploy send-broadcast-email --project-ref rmjyfdmwnmaerthcoosq
```

### 5. Verify It Works
1. Send a test email from admin portal
2. Check function logs for debug output
3. Should see `RESEND_API_KEY value: ***SET***` in logs

## Common Mistakes
- ❌ Secret name has spaces: `RESEND API KEY`
- ❌ Wrong case: `resend_api_key` or `Resend_Api_Key`
- ❌ Forgot to redeploy after adding secret
- ❌ Added secret to wrong project
- ❌ Secret value is empty or has extra spaces

## Still Not Working?
Check function logs after sending email:
- Edge Functions → `send-broadcast-email` → Logs
- Look for "=== DEBUG: All environment variables ==="
- This will show what secrets are actually available


