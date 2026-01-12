# Soaking Task Fix - Quick Summary

## Problem
Soaking tasks are not being generated for peas (or any variety) in the Daily Flow.

## Root Causes Found

### 🔴 CRITICAL: Missing `planting_schedule_view`
The database view that the code relies on **doesn't exist**. Without it, NO soaking or seeding tasks can be generated.

**File**: `supabase/migrations/044_create_planting_schedule_view.sql`

### 🟡 Pea Soak Duration Too Short
Peas currently have 9-hour soak time, but code requires >= 12 hours to generate day-before tasks.

**Files**: 
- `supabase/migrations/043_fix_pea_soak_duration.sql` (database fix)
- `web-admin/src/services/dailyFlowService.ts` line 583 (code fix)

## Quick Fix

### 1. Apply Database Migrations (REQUIRED)
```bash
# Option A: Using Supabase CLI
npx supabase db push

# Option B: Manual in Supabase Dashboard
# Run these SQL files in order:
# 1. migrations/044_create_planting_schedule_view.sql
# 2. migrations/043_fix_pea_soak_duration.sql
```

### 2. Code Changes (ALREADY APPLIED)
✅ Updated `dailyFlowService.ts` to use 6-hour threshold (was 12 hours)

## What Changed

### Database
- **Created**: `planting_schedule_view` - aggregates order schedules with recipe timing
- **Updated**: Pea soak duration from 9 hours → 12 hours

### Code  
- **Updated**: Soak threshold from `>= 12 hours` → `>= 6 hours`

## Test
After applying migrations:

```sql
-- Check view exists and has data
SELECT recipe_name, sow_date, delivery_date, customer_name
FROM planting_schedule_view
WHERE sow_date >= CURRENT_DATE
ORDER BY sow_date
LIMIT 5;
```

Then in the web app:
1. Navigate to Daily Flow
2. Check the day BEFORE a scheduled seeding date
3. Should see "Soak" task in Prep section

## Files Changed
- ✅ `web-admin/src/services/dailyFlowService.ts` (code fix applied)
- 📄 `supabase/migrations/043_fix_pea_soak_duration.sql` (new migration)
- 📄 `supabase/migrations/044_create_planting_schedule_view.sql` (new migration - CRITICAL)

## Next Steps
1. **Apply migrations** (critical - nothing works without the view!)
2. Restart web app (to pick up code changes)
3. Test with a pea order scheduled for Monday (check Saturday for soak task)

---

See `SOAKING_TASK_FIX.md` for detailed explanation and troubleshooting.
