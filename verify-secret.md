# Verify RESEND_API_KEY Secret

## Steps to Verify:

1. **Go to Supabase Dashboard:**
   - https://supabase.com/dashboard/project/rmjyfdmwnmaerthcoosq

2. **Navigate to Edge Functions → Settings → Secrets**

3. **Check if `RESEND_API_KEY` exists:**
   - Name must be exactly: `RESEND_API_KEY` (all caps, underscore, no spaces)
   - Value should start with: `re_`

4. **If it doesn't exist or name is wrong:**
   - Add/Edit the secret
   - Name: `RESEND_API_KEY`
   - Value: Your Resend API key

5. **After adding/editing, redeploy the function:**
   - Go to Edge Functions → `send-broadcast-email`
   - Click "Redeploy" or edit and save

6. **Test again**

## Alternative: Check Function Logs

After trying to send an email, check the function logs:
- Edge Functions → `send-broadcast-email` → Logs
- Look for the debug output showing available environment variables

