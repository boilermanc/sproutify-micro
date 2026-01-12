# Soaking Task Generation Fix

## Problem Summary

Soaking tasks were not being generated for peas (or any variety with < 12 hour soak time) in the Daily Flow.

## Root Cause

Three issues were found:

### 1. **CRITICAL**: Missing Database View
- **Current**: `planting_schedule_view` doesn't exist in the database
- **Problem**: Code queries this view to get scheduled deliveries and calculate sow/soak dates
- **Impact**: NO soaking or seeding tasks are generated at all without this view
- **Location**: Code references it at `web-admin/src/services/dailyFlowService.ts` line 535

### 2. Database: Pea Soak Duration Too Short
- **Current**: Peas have 9-hour soak duration in `global_steps` table
- **Required**: User needs 12 hours for proper overnight soaking
- **Location**: `supabase/migrations/017_global_recipes_seed_data.sql` lines 268, 293

### 3. Code: Threshold Too High
- **Current**: `dailyFlowService.ts` only generates day-before soak tasks if duration >= 12 hours
- **Problem**: 9 hours < 12 hours, so `soakDurationByRecipe[recipe_id] = 0` (no day-before task)
- **Location**: `web-admin/src/services/dailyFlowService.ts` line 583

```typescript
// OLD CODE (line 583):
if (unit === 'HOURS') {
  days = duration >= 12 ? 1 : 0;  // ❌ 9 hours returns 0 days
}
```

## How Soaking Tasks Work

The soaking task generation logic in `dailyFlowService.ts` (lines 722-751):

1. Fetches schedules from `planting_schedule_view`
2. For each schedule with a `sow_date`:
   - Calculates `soakDuration` from recipe steps (in days)
   - Calculates `soakDate = sow_date - soakDuration`
   - If `soakDate === today && soakDuration > 0`, creates a "Soak" task
3. Checks if task was already completed via `task_completions` table

## Example: Peas with Monday-Only Seeding

For Jan 28 delivery:
- **Sow date**: Jan 12 (Monday)
- **Soak duration**: 1 day (12 hours)
- **Soak date**: Jan 11 (Saturday)
- **Expected**: "Start Soaking" task appears on Jan 11

With the OLD code:
- Soak duration 9 hours → 0 days → soakDate = Jan 12
- NO task appears on Jan 11 ❌

With the NEW code:
- Soak duration 12 hours → 1 day → soakDate = Jan 11
- Task appears on Jan 11 ✅

## Fixes Applied

### Fix 1: Create Missing View (Migration) ⚠️ CRITICAL
Created `044_create_planting_schedule_view.sql`:
- Creates the `planting_schedule_view` that aggregates:
  - `order_schedules` (scheduled deliveries)
  - `standing_orders` (customer info)
  - `standing_order_items` (products/quantities)
  - `recipes` + `steps` (recipe timing and soak duration)
- Calculates:
  - `sow_date` = delivery_date - total_days
  - `harvest_date` = delivery_date
  - `trays_needed` = quantity / 5 oz
- This view is **essential** for all seeding/soaking task generation

### Fix 2: Update Database (Migration)
Created `043_fix_pea_soak_duration.sql`:
- Updates both `Pea (Basic/Field)` and `Pea (Tendril)` from 9 hours → 12 hours
- Also updates any farm-specific pea recipes copied from global recipes

### Fix 3: Lower Threshold (Code)
Updated `dailyFlowService.ts` line 583:
```typescript
// NEW CODE:
if (unit === 'HOURS') {
  // Any soak >= 6 hours should be done the day before to allow for evening soak and morning seeding
  // This covers typical overnight soaks (6-12+ hours)
  days = duration >= 6 ? 1 : 0;
}
```

**Why >= 6 hours?**
- Allows for evening start (6pm) → morning seeding (6am)
- Covers typical overnight soaking schedules
- More practical than requiring exactly >= 12 hours

## How to Apply Fixes

### ⚠️ IMPORTANT: Apply migrations in order!
You must apply **BOTH** migrations for soaking tasks to work:
1. First: `044_create_planting_schedule_view.sql` (creates the view)
2. Then: `043_fix_pea_soak_duration.sql` (updates pea timings)

### Option 1: Local Supabase (Requires Docker)
```bash
cd c:\Users\clint\Documents\Github\sproutify_micro
npx supabase start
npx supabase db push --local
```

### Option 2: Remote Supabase
```bash
cd c:\Users\clint\Documents\Github\sproutify_micro
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

### Option 3: Manual SQL (Supabase Dashboard) - RECOMMENDED
1. Go to Supabase Dashboard → SQL Editor
2. Run `supabase/migrations/044_create_planting_schedule_view.sql` first
3. Then run `supabase/migrations/043_fix_pea_soak_duration.sql`

### Option 4: Direct Database Connection
If you have PostgreSQL connection string:
```bash
psql "postgresql://..." -f supabase/migrations/044_create_planting_schedule_view.sql
psql "postgresql://..." -f supabase/migrations/043_fix_pea_soak_duration.sql
```

## Verification

After applying all three fixes:

1. **Check View Exists**:
   ```sql
   SELECT COUNT(*) FROM planting_schedule_view;
   ```
   Should return a count of scheduled deliveries (not an error)

2. **Check View Data**:
   ```sql
   SELECT recipe_name, sow_date, delivery_date, trays_needed, customer_name
   FROM planting_schedule_view
   WHERE sow_date >= CURRENT_DATE
   ORDER BY sow_date
   LIMIT 10;
   ```
   Should show upcoming planting schedules

3. **Check Pea Duration**:
   ```sql
   SELECT gs.step_name, gs.duration, gs.duration_unit, gr.recipe_name
   FROM global_steps gs
   JOIN global_recipes gr ON gs.global_recipe_id = gr.global_recipe_id
   WHERE gr.recipe_name ILIKE '%pea%' AND gs.description_id = 2;
   ```
   Should show: duration = 12, duration_unit = 'Hours'

2. **Check Daily Flow**:
   - Navigate to a date that should have pea seeding (e.g., Jan 12 for Jan 28 delivery)
   - Go to the day BEFORE (Jan 11)
   - Should see "Soak" task for peas in the Prep section

3. **Console Logs**:
   Open browser console and check for:
   ```
   [fetchDailyTasks] soakDurationByRecipe: { <recipe_id>: 1, ... }
   ```
   The value should be 1 (not 0) for pea recipes.

## Related Code

- **Soak duration calculation**: `dailyFlowService.ts` lines 577-586
- **Soak task generation**: `dailyFlowService.ts` lines 722-751
- **Soak task completion**: `dailyFlowService.ts` lines 2073-2126
- **Calendar view**: `042_create_calendar_day_view.sql` line 10 (references `soak_request`)

## Notes

- The code checks for completed tasks via `task_completions` table (task_type = 'soaking')
- Soak tasks show in Daily Flow "Prep Tasks" section alongside "Seed" tasks
- Soaking requires batch selection (to track which seed batch is being soaked)
- After soaking, seeds are tracked in `soaked_seed` table with expiration dates
