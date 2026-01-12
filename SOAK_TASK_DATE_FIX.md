# Soak Task Date Bug Fix

## Problem

When completing a soak task on Jan 11, the system records `task_date = Jan 12` (seeding date) instead of Jan 11 (soak date). This prevents the task from being marked as complete when viewing Jan 11 Daily Flow.

### Example Scenario
- Jan 28: Delivery date (peas)
- Jan 12: Sow date (Monday)
- Jan 11: Soak date (Saturday)
- **Bug**: Completing soak task on Jan 11 records task_date = Jan 12
- **Result**: Soak task still shows on Jan 11 after completion ❌

## Root Cause

1. **Missing date parameter**: `completeSoakTask()` doesn't accept a `taskDate` parameter
2. **No RPC function**: The `complete_soak_task` RPC function doesn't exist in the database
3. **Missing tables**: `soaked_seed` and `task_completions` tables don't exist

## Solution Applied

### ✅ 1. Updated TypeScript Function (dailyFlowService.ts)
Added `taskDate` parameter to `completeSoakTask()`:
```typescript
export const completeSoakTask = async (
  requestId: number,
  seedbatchId: number,
  quantityGrams: number,
  taskDate: string, // ✅ NEW: The soak date
  userId?: string
): Promise<number>
```

### ✅ 2. Updated UI Call (DailyFlow.tsx)
Pass the `selectedDate` (the date user is viewing):
```typescript
const taskDateStr = selectedDate.toISOString().split('T')[0];
const soakedSeedId = await completeSoakTask(
  soakTask.requestId,
  selectedBatchId,
  quantityGrams,
  taskDateStr // ✅ Pass Jan 11, not Jan 12
);
```

### ✅ 3. Created Database Migration (045_create_soaking_system.sql)
- **task_completions table**: Records completed tasks
  - `task_date` = when task appeared (soak date for soak tasks)
- **soaked_seed table**: Tracks soaked seeds ready for use
  - `soak_date` = when soaking started
  - `expires_at` = expiration time (48 hours default)
- **available_soaked_seed view**: Shows available soaked seeds with urgency
- **complete_soak_task() function**: RPC that:
  - Creates soaked_seed entry
  - Records completion with **correct task_date** ✅
  - Deducts seed inventory

## How to Apply Fix

### 1. Code Changes (Already Applied ✅)
- `web-admin/src/services/dailyFlowService.ts` - Updated
- `web-admin/src/components/DailyFlow.tsx` - Updated

### 2. Database Migration (REQUIRED)
Run the migration:

**Option A: Supabase Dashboard**
1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `supabase/migrations/045_create_soaking_system.sql`
3. Run the SQL

**Option B: Supabase CLI**
```bash
cd c:\Users\clint\Documents\Github\sproutify_micro
npx supabase db push
```

### 3. Restart Web App
```bash
cd web-admin
npm run dev
```

## Verification

### Test the Fix
1. Navigate to Daily Flow for a soak date (e.g., Jan 11)
2. Complete a soak task:
   - Select seed batch
   - Enter quantity in grams
   - Click "Complete Soak"
3. Verify in database:
   ```sql
   SELECT task_type, task_date, recipe_id, status
   FROM task_completions
   WHERE task_type = 'soaking'
   ORDER BY completed_at DESC
   LIMIT 5;
   ```
   Should show `task_date = Jan 11` (soak date) ✅

4. Refresh Daily Flow page:
   - Soak task should disappear (marked as complete)
   - Check `available_soaked_seed` view for new soaked seed entry

### Check Soaked Seeds
```sql
SELECT 
  recipe_name,
  quantity_remaining,
  soak_date,
  expires_at,
  urgency,
  status
FROM available_soaked_seed
WHERE status = 'available'
ORDER BY expires_at;
```

## What Changed

### Before (❌ Bug)
```
User views: Jan 11
User completes soak task
Database records: task_date = Jan 12 (seeding date)
Result: Task still shows on Jan 11
```

### After (✅ Fixed)
```
User views: Jan 11
User completes soak task
Database records: task_date = Jan 11 (soak date)
Result: Task disappears from Jan 11
```

## Related Files

**Code Changes**:
- ✅ `web-admin/src/services/dailyFlowService.ts` (line 3549)
- ✅ `web-admin/src/components/DailyFlow.tsx` (line 2073)

**Database Migration**:
- 📄 `supabase/migrations/045_create_soaking_system.sql`

**Related Fixes**:
- `043_fix_pea_soak_duration.sql` - Updates pea soak from 9 → 12 hours
- `044_create_planting_schedule_view.sql` - Creates view for task generation

## Notes

- **task_date semantic**: Always the date the task **appears** in Daily Flow, not when it's completed
- **Soaked seed expiration**: Default 48 hours from soak_date
- **Inventory deduction**: Seeds are deducted from seedbatch at soak time
- **Available soaked seed**: Shows in Daily Flow sidebar for use during seeding

