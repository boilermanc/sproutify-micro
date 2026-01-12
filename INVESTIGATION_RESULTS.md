# Soaking Task Investigation - Complete Results

## Executive Summary

Soaking tasks are not being generated due to **THREE separate issues**:

1. 🔴 **CRITICAL**: Missing `planting_schedule_view` - WITHOUT THIS, NO TASKS GENERATE
2. 🟡 Pea soak duration is 9 hours (database has 9, user needs 12)
3. 🟡 Code threshold requires >= 12 hours for day-before tasks (excludes 9-hour soaks)

All three issues have been fixed.

---

## Investigation Details

### Question 1: Does daily_flow_aggregated handle soaking tasks?

**Answer**: The `daily_flow_aggregated` VIEW DOES NOT EXIST in the database.

- Code references it at `dailyFlowService.ts:242`
- Comments indicate it should contain tray_step, soak_request, seed_request, and expiring_seed tasks
- Code handles missing view by supplementing with direct queries
- **This is not the immediate cause of missing soaking tasks**

### Question 2: Is there soaking task generation from planting_schedule_view?

**Answer**: YES, but the VIEW DOES NOT EXIST. ⚠️ THIS IS THE CRITICAL ISSUE!

**How it works** (`dailyFlowService.ts:532-751`):
1. Query `planting_schedule_view` for all schedules
2. For each schedule:
   - Get recipe steps to find soak step duration
   - Calculate `soakDate = sowDate - soakDuration`
   - If `soakDate === today && soakDuration > 0`, create "Soak" task
3. Check `task_completions` table to skip already-completed tasks

**Required columns**:
- `sow_date` - When to seed
- `recipe_id` - Which recipe
- `recipe_name` - Display name
- `trays_needed` - Quantity
- `customer_name`, `customer_id` - Who it's for
- `standing_order_id`, `schedule_id` - Order tracking
- `delivery_date` - Final delivery
- `harvest_date` - When to harvest

**Without this view**: Zero soaking tasks (and zero seeding tasks from schedule)

### Question 3: Search for "soak" in codebase

**Found**:
- ✅ Soak task generation logic (dailyFlowService.ts:722-751)
- ✅ Soak task completion handler (dailyFlowService.ts:2073-2126)
- ✅ Soak dialog in UI (DailyFlow.tsx:4288-4586)
- ✅ Soaked seed tracking (`available_soaked_seed` view references)
- ✅ Recipe has soak check (`recipe_has_soak` RPC function)
- ✅ Soak step definitions in global recipes (migration 017)

**Soak duration calculation issue** (dailyFlowService.ts:577-586):
```typescript
if (step.step_name?.toLowerCase().includes('soak') || step.action?.toLowerCase().includes('soak')) {
  const duration = step.duration || 0;
  const unit = (step.duration_unit || 'Days').toUpperCase();
  let days = duration;
  if (unit === 'HOURS') {
    days = duration >= 12 ? 1 : 0;  // ❌ 9 hours returns 0 (no day-before task)
  }
  soakDurationByRecipe[step.recipe_id] = days;
}
```

**Database values**:
- Pea (Basic/Field): 9 hours soak (line 268 of migration 017)
- Pea (Tendril): 9 hours soak (line 293 of migration 017)
- Other varieties: 3-8 hours (also below threshold)

---

## Example: Peas with Monday-Only Seeding

**Scenario**: Jan 28 delivery, peas with 12-hour soak

**Current behavior** (BROKEN):
- Delivery: Jan 28
- Recipe total days: 16 days (estimated)
- Sow date: Jan 12 (Monday)
- Soak duration in DB: 9 hours
- Soak duration calculated: 0 days (9 < 12)
- Soak date: Jan 12 (same day as seeding)
- **Result**: NO soak task appears on Jan 11 ❌

**Expected behavior** (AFTER FIX):
- Delivery: Jan 28
- Sow date: Jan 12 (Monday)
- Soak duration in DB: 12 hours
- Soak duration calculated: 1 day (12 >= 6)
- Soak date: Jan 11 (Saturday)
- **Result**: "Start Soaking" task appears on Jan 11 ✅

---

## Fixes Applied

### 1. Create `planting_schedule_view` (CRITICAL)
**File**: `supabase/migrations/044_create_planting_schedule_view.sql`

**What it does**:
- Joins `order_schedules` + `standing_orders` + `standing_order_items` + `products` + `recipes`
- Calculates `sow_date` = delivery_date - recipe_total_days
- Calculates `trays_needed` from product quantities
- Filters to active orders with scheduled deliveries

**View structure**:
```sql
SELECT 
  schedule_id,
  standing_order_id,
  farm_uuid,
  customer_id,
  customer_name,
  delivery_date,
  recipe_id,
  recipe_name,
  variety_name,
  trays_needed,
  sow_date,           -- Calculated: delivery_date - total_days
  harvest_date,       -- Same as delivery_date
  soak_days           -- Duration of soak step in days
FROM ...
```

### 2. Update Pea Soak Duration
**File**: `supabase/migrations/043_fix_pea_soak_duration.sql`

**Changes**:
- Pea (Basic/Field): 9 hours → 12 hours
- Pea (Tendril): 9 hours → 12 hours
- Updates global recipes AND farm-specific copies

### 3. Lower Soak Threshold in Code
**File**: `web-admin/src/services/dailyFlowService.ts:583`

**Change**:
```typescript
// OLD:
days = duration >= 12 ? 1 : 0;

// NEW:
days = duration >= 6 ? 1 : 0;  // Any soak >= 6 hours needs day-before task
```

**Rationale**: 6+ hours allows evening soak → morning seeding workflow

---

## How to Apply Fixes

### REQUIRED: Apply Both Migrations

**Option 1: Supabase CLI**
```bash
cd c:\Users\clint\Documents\Github\sproutify_micro
npx supabase db push
```

**Option 2: Supabase Dashboard (RECOMMENDED)**
1. Go to Supabase Dashboard → SQL Editor
2. Run `044_create_planting_schedule_view.sql` FIRST
3. Then run `043_fix_pea_soak_duration.sql`

**Option 3: Direct psql**
```bash
psql "your-connection-string" -f supabase/migrations/044_create_planting_schedule_view.sql
psql "your-connection-string" -f supabase/migrations/043_fix_pea_soak_duration.sql
```

### Code Changes
✅ Already applied to `web-admin/src/services/dailyFlowService.ts`

---

## Verification Steps

### 1. Check View Exists
```sql
SELECT COUNT(*) FROM planting_schedule_view;
```
Should return a count (not an error).

### 2. Check View Data
```sql
SELECT 
  recipe_name, 
  sow_date, 
  delivery_date, 
  trays_needed, 
  customer_name,
  soak_days
FROM planting_schedule_view
WHERE sow_date >= CURRENT_DATE
ORDER BY sow_date
LIMIT 10;
```

### 3. Check Pea Soak Duration
```sql
SELECT 
  gr.recipe_name,
  gs.step_name,
  gs.duration,
  gs.duration_unit,
  gs.instructions
FROM global_steps gs
JOIN global_recipes gr ON gs.global_recipe_id = gr.global_recipe_id
WHERE gr.recipe_name ILIKE '%pea%' 
  AND gs.description_id = 2;  -- Soaking step
```
Should show: `duration = 12`, `duration_unit = 'Hours'`

### 4. Test in UI
1. Navigate to Daily Flow
2. Find a date with pea seeding scheduled (check planting_schedule_view for sow_date)
3. Go to the DAY BEFORE that sow_date
4. Should see "Soak" task in Prep section
5. Click "Begin Soak" to test completion flow

### 5. Check Console Logs
Open browser DevTools → Console:
```
[fetchDailyTasks] Recipe IDs from planting_schedule_view: [...]
[DEBUG] soakDurationByRecipe: { 5: 1, ... }  // Should show 1 for pea recipes
```

---

## Additional Notes

### Task Completion Tracking
Completed soaking tasks are tracked in `task_completions` table:
- `task_type` = 'soaking'
- `recipe_id` = the recipe
- `task_date` = the soaking date
- `status` = 'completed'

### Soaked Seed Tracking
After completing a soak task:
1. Entry created in `soaked_seed` table
2. Tracks quantity, batch_id, soak_date, expires_at
3. Shows in "Available Soaked Seed" panel on Daily Flow
4. Can be used for seeding or discarded

### Calendar Integration
The calendar view (`calendar_day_pivoted`) references:
- `task_source = 'soak_request'` for soak tasks
- Currently shows tasks from `daily_flow_aggregated` (which doesn't exist)
- May need updating if implementing proper daily_flow_aggregated view

---

## Related Files

**Migrations Created**:
- ✅ `supabase/migrations/044_create_planting_schedule_view.sql`
- ✅ `supabase/migrations/043_fix_pea_soak_duration.sql`

**Code Modified**:
- ✅ `web-admin/src/services/dailyFlowService.ts` (line 583)

**Documentation Created**:
- ✅ `SOAKING_TASK_FIX.md` (detailed explanation)
- ✅ `SOAKING_TASK_FIX_SUMMARY.md` (quick reference)
- ✅ `INVESTIGATION_RESULTS.md` (this file - complete analysis)

**References**:
- Global recipes: `supabase/migrations/017_global_recipes_seed_data.sql`
- Orders system: `supabase/migrations/008_create_orders_system.sql`
- Calendar view: `supabase/migrations/042_create_calendar_day_view.sql`
- Daily Flow UI: `web-admin/src/components/DailyFlow.tsx`
- Daily Flow service: `web-admin/src/services/dailyFlowService.ts`

---

## Future Improvements

### Create `daily_flow_aggregated` View
The code expects but doesn't have a `daily_flow_aggregated` view that should aggregate:
- Tray step tasks (from `tray_steps` + `steps`)
- Soak request tasks (from `tray_creation_requests` with soak flag?)
- Seed request tasks (from `tray_creation_requests`)
- Expiring seed tasks (from seed inventory)

This would centralize task generation and improve performance.

### Consider Alternative Soak Scheduling
Current logic: soak duration >= 6 hours → do it 1 day before

Could enhance to:
- Calculate actual time windows (e.g., "Start soak by 8pm on Jan 11")
- Support multi-day soaks for some varieties
- Allow scheduling flexibility (e.g., "soak anytime Jan 10-11")
