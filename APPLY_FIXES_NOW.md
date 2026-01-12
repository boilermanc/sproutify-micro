# ⚠️ APPLY THESE FIXES NOW TO ENABLE SOAKING TASKS

## Problem
Soaking tasks are NOT showing up in Daily Flow because **critical database view is missing**.

## Quick Fix (5 minutes)

### Step 1: Apply Database Migrations
Go to **Supabase Dashboard** → **SQL Editor**

#### Migration 1: Create View (REQUIRED!)
Copy and run the entire contents of:
```
supabase/migrations/044_create_planting_schedule_view.sql
```

#### Migration 2: Update Pea Timing
Copy and run the entire contents of:
```
supabase/migrations/043_fix_pea_soak_duration.sql
```

### Step 2: Restart Web App
The code changes are already committed. Just restart your dev server:
```bash
cd web-admin
npm run dev
```

### Step 3: Verify
1. Go to Daily Flow
2. Check for "Soak" tasks in Prep section
3. Should appear day BEFORE seeding dates

## Files Changed
- ✅ `web-admin/src/services/dailyFlowService.ts` (code fix - already done)
- 📄 `supabase/migrations/044_create_planting_schedule_view.sql` (NEW - you must apply)
- 📄 `supabase/migrations/043_fix_pea_soak_duration.sql` (NEW - you must apply)

## What Was Wrong

### Critical Issue
`planting_schedule_view` didn't exist. Code was querying it, getting nothing back.

### Secondary Issues
- Peas had 9-hour soak, but code required >= 12 hours
- Fixed by: updating database to 12 hours + lowering code threshold to 6 hours

## Detailed Docs
- `SOAKING_TASK_FIX_SUMMARY.md` - Quick overview
- `SOAKING_TASK_FIX.md` - Step-by-step guide
- `INVESTIGATION_RESULTS.md` - Complete analysis

---

**TL;DR**: Apply the 2 SQL migrations above, restart app, soaking tasks will work.
