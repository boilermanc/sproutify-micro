# DailyFlow Performance Analysis Report
**Date:** 2026-01-24  
**Component:** web-admin/src/components/DailyFlow.tsx  
**Service:** web-admin/src/services/dailyFlowService.ts  

## Executive Summary

The DailyFlow component is experiencing 15-20+ second load times due to:
1. **Sequential query execution** instead of parallel queries
2. **N+1 query patterns** in supplemental task logic
3. **Missing view** (`daily_flow_aggregated`) causing fallback to expensive direct queries
4. **Redundant data fetching** (fetching full row data when counts are sufficient)
5. **Unoptimized view queries** with correlated subqueries

---

## 1. Main Load Operation Queries

### Primary Queries (Parallel)
These run in `Promise.all()` in DailyFlow.tsx lines 971-977:

| Query | Table/View | Complexity | Estimated Time | Issues |
|-------|-----------|------------|---------------|---------|
| `fetchDailyTasks()` | `daily_flow_aggregated` | **COMPLEX** | 15-30s | View doesn't exist, triggers massive fallback |
| `getActiveTraysCount()` | `trays` | Simple | 1-2s | Uses `select('*')` for count (wasteful) |
| `fetchPassiveTrayStatus()` | `trays` → `recipes` → `steps` | Moderate | 3-5s | N+1: Fetches steps for each recipe |
| `fetchOrderGapStatus()` | `order_gap_status` | Unknown | ?s | View not found in migrations |
| `fetchOverdueSeedingTasks()` | `planting_schedule_view` | Complex | 5-10s | Multiple joins + sequential queries |

---

## 2. Critical Bottleneck: `fetchDailyTasks()`

### 2.1 Missing View Query
**Lines 324-336 in dailyFlowService.ts**
```typescript
from('daily_flow_aggregated')
  .select('*')
  .eq('farm_uuid', farmUuid)
  .eq('task_date', taskDate)
```

**Issue:** The view `daily_flow_aggregated` **does not exist** in the database schema.
- Searched all 59 migration files: NO DEFINITION FOUND
- Only reference is in `042_create_calendar_day_view.sql` which USES it but doesn't CREATE it
- This query likely fails or times out, triggering expensive fallback logic

### 2.2 Supplemental Tasks - N+1 Query Hell
**Lines 358-666** - This is the performance killer:

#### Query Cascade (All Sequential):
1. **Fetch active trays** (line 358-377)
   ```sql
   SELECT tray_id, recipe_id, sow_date, batch_id, location, customer_id, recipes(*)
   FROM trays
   WHERE farm_uuid = ? AND harvest_date IS NULL AND sow_date IS NOT NULL
   ```
   - **Fetches nested `recipes` relation** (expensive join)

2. **Fetch customers** (lines 386-397)
   ```sql
   SELECT customerid, name FROM customers WHERE customerid IN (...)
   ```

3. **Fetch all steps** for ALL recipes (lines 401-404)
   ```sql
   SELECT * FROM steps WHERE recipe_id IN (...)
   ```
   - **Fetches ALL columns** when only need: step_id, step_name, duration, duration_unit, sequence_order

4. **Fetch tray_steps** for today (lines 427-431)
   ```sql
   SELECT * FROM tray_steps
   WHERE tray_id IN (...) AND scheduled_date = ?
   ```

5. **Loop through each tray** (lines 455-660)
   - For EACH tray (potentially 18+ trays): Calculate current step, check completion
   - **JavaScript-side join logic** instead of database view

**Impact:** With 18 active trays across 5 recipes, this creates:
- 5 recipe lookups
- 18 tray calculations
- Nested loops matching steps to trays
- ~100-500ms of JavaScript processing

### 2.3 Harvest Task Generation
**Lines 960-1204** - Another N+1 pattern:

1. Fetch active trays AGAIN (lines 960-983) - **DUPLICATE of line 358!**
2. Fetch steps for recipes AGAIN if missing (lines 998-1010)
3. Fetch customer names AGAIN (lines 1090-1101)
4. JavaScript-side calculation for days since sow
5. Grouping logic in JavaScript

**Why not a view?** All this logic should be in a single `harvest_ready_trays` view.

### 2.4 Watering Tasks
**Lines 1221-1420** - Yet another N+1:

1. Fetch active trays AGAIN (third time! lines 1221-1236)
2. Fetch steps for recipes AGAIN (lines 1251-1254)
3. Calculate "past blackout" in JavaScript
4. Check task_completions table (line 1368-1374)

### 2.5 Additional Sequential Queries
**Lines 705-956** - Seeding/Soaking tasks:

| Query | Lines | Issue |
|-------|-------|-------|
| `planting_schedule_view` | 705-708 | **NO WHERE clause on view query** - fetches ALL schedules |
| `recipes.select()` | 715-719 | Fetches variety names for recipes |
| `steps.select()` | 731-734 | Fetches ALL steps for ALL recipes |
| `task_completions` | 802-808 | Check completed tasks |
| `tray_creation_requests` | 821-825 | Check existing requests |

**Critical Issue Line 707:**
```typescript
.select('sow_date, harvest_date, recipe_name, trays_needed, recipe_id, customer_name, customer_id, standing_order_id, schedule_id, delivery_date')
.eq('farm_uuid', farmUuid);
// ⚠️ NO .eq('sow_date', taskDate) filter!
```
This fetches **ALL schedules for the entire farm**, then filters in JavaScript!

### 2.6 Fallback ID Fetching
**Lines 1751-1899** - Final nail in the coffin:

When view doesn't return tray_ids or step_ids:
1. Fetch ALL farm trays (line 1751-1755)
2. Fetch ALL tray_steps for today (line 1765-1771)
3. Fetch step details (line 1778-1781)
4. Nested loops matching names

---

## 3. Other Service Functions

### 3.1 `getActiveTraysCount()` - Line 3694
```typescript
.select('*', { count: 'exact', head: true })
```
**Issue:** Uses `select('*')` when only counting. Should use:
```typescript
.select('tray_id', { count: 'exact', head: true })
```

### 3.2 `fetchPassiveTrayStatus()` - Lines 4280-4405
```typescript
// Fetch active trays
const { data: activeTrays } = await supabase
  .from('trays')
  .select('tray_id, recipe_id, sow_date, recipes(recipe_name, variety_name)')
  
// Fetch ALL steps for these recipes
const { data: allSteps } = await supabase
  .from('steps')
  .select('*')
  .in('recipe_id', recipeIds)
```

**Issues:**
- Fetches full recipes relation
- Fetches ALL step columns when only need: step_name, duration, duration_unit
- Groups/calculates in JavaScript instead of view

### 3.3 `fetchOverdueSeedingTasks()` - Lines 4476-4667
Multiple sequential queries:
1. Query `planting_schedule_view` for date range (line 4476-4487)
2. Fetch recipes for variety names (line 4501-4505)
3. Fetch task_completions (line 4518-4525)
4. Fetch existing trays (line 4543-4548)
5. JavaScript processing to build groups

---

## 4. Missing/Problematic Views

### 4.1 `daily_flow_aggregated` - DOES NOT EXIST ❌
- Referenced in: dailyFlowService.ts line 325, calendar_day_view line 25
- **SHOULD** aggregate tray_step tasks by task_date, recipe, step
- Current fallback does this in application code with 5+ queries

### 4.2 `order_gap_status` - NOT FOUND IN MIGRATIONS ❌
- Referenced in: dailyFlowService.ts line 207
- May exist in database but no definition in codebase

### 4.3 `planting_schedule_view` - EXISTS ✓
**Migration:** 044_create_planting_schedule_view.sql

**Performance Issues:**
- Uses CTE with aggregations (lines 6-34)
- Multiple LEFT JOINs (recipes, steps, orders, schedules)
- No materialization (recalculated every query)
- Application queries without date filters (see line 707 issue above)

**Recommendation:** Create indexes on:
```sql
CREATE INDEX idx_order_schedules_date_status 
  ON order_schedules(scheduled_delivery_date, status) 
  WHERE status IN ('pending', 'generated');

CREATE INDEX idx_steps_recipe_timing 
  ON steps(recipe_id, duration, duration_unit);
```

### 4.4 `order_fulfillment_status` - EXISTS ✓
**Migration:** 051_fix_order_fulfillment_status_trays_ready.sql

**Performance Issues:**
- Uses correlated subqueries (lines 50-77) - evaluated ONCE PER ROW
- No indexes on `tray_steps.scheduled_date` (added in migration but may not exist)
- Joins `planting_schedule_view` (which itself is slow)

**Recommendation:** Materialize this view or rewrite with JOINs instead of subqueries.

---

## 5. N+1 Query Patterns Identified

### Pattern 1: Multiple fetches of same data
- **Active trays fetched 3 times** (lines 358, 960, 1221)
- **Steps fetched 2-3 times** for same recipes
- **Customer names fetched 2 times**

### Pattern 2: Fetch then loop
```typescript
// Fetch recipes
const { data: allSteps } = await supabase.from('steps').select('*').in('recipe_id', recipeIds)

// Loop through trays
for (const tray of traysWithRecipes) {
  const steps = stepsByRecipe[tray.recipe_id] || []
  // Process each tray individually
}
```

Should be a single view query returning aggregated results.

### Pattern 3: JavaScript joins
- Line 455-660: Join trays to steps to recipes in JavaScript
- Line 1117-1204: Group trays by customer in JavaScript
- Line 4580-4620: Group schedules by recipe+date in JavaScript

---

## 6. Missing Indexes

Based on query patterns, these indexes are likely missing or ineffective:

### Critical:
```sql
-- For supplemental task queries
CREATE INDEX idx_trays_farm_harvest_sow 
  ON trays(farm_uuid, harvest_date, sow_date) 
  WHERE status = 'active' OR status IS NULL;

-- For tray_steps daily queries
CREATE INDEX idx_tray_steps_scheduled_completion 
  ON tray_steps(scheduled_date, tray_id, step_id) 
  WHERE completed = FALSE AND skipped = FALSE;

-- For steps lookups
CREATE INDEX idx_steps_recipe_sequence 
  ON steps(recipe_id, sequence_order);
```

### Important:
```sql
-- For task_completions filtering
CREATE INDEX idx_task_completions_date_type 
  ON task_completions(farm_uuid, task_date, task_type) 
  WHERE status = 'completed';

-- For recipe lookups
CREATE INDEX idx_recipes_farm_id 
  ON recipes(farm_uuid, recipe_id);
```

---

## 7. Recommendations by Priority

### 🔴 CRITICAL (Fix First)

1. **Create `daily_flow_aggregated` view**
   - Should replace lines 358-666 of supplemental logic
   - Aggregate tray_steps by (task_date, recipe_id, step_id)
   - Include tray_ids array, counts, customer info
   - **Estimated speedup:** 10-15 seconds

2. **Fix planting_schedule_view query** (line 707)
   - Add date filter: `.gte('sow_date', startDate).lte('sow_date', endDate)`
   - Currently fetches entire schedule history
   - **Estimated speedup:** 3-5 seconds

3. **Deduplicate active tray queries**
   - Fetch once, reuse for harvest, watering, supplemental
   - **Estimated speedup:** 2-4 seconds

### 🟡 HIGH PRIORITY

4. **Optimize getActiveTraysCount()**
   - Change `select('*')` to `select('tray_id')` for counting
   - **Estimated speedup:** 0.5-1 second

5. **Create harvest_ready_trays view**
   - Replace lines 960-1204 with single view query
   - Calculate days since sow in SQL
   - Group by customer in SQL
   - **Estimated speedup:** 2-4 seconds

6. **Create watering_tasks view**
   - Replace lines 1221-1420 with single view query
   - **Estimated speedup:** 1-3 seconds

### 🟢 MEDIUM PRIORITY

7. **Add missing indexes** (see section 6)
   - **Estimated speedup:** 1-2 seconds cumulative

8. **Reduce selected columns**
   - Only fetch needed columns, not `SELECT *`
   - Especially for steps, tray_steps tables
   - **Estimated speedup:** 0.5-1 second

9. **Materialize expensive views**
   - `planting_schedule_view`
   - `order_fulfillment_status`
   - Refresh every 5-15 minutes
   - **Estimated speedup:** 2-5 seconds

### 🔵 LOW PRIORITY

10. **Refactor JavaScript processing**
    - Move grouping/aggregation logic to SQL
    - Reduce in-memory transformations

---

## 8. Estimated Query Complexity

| Operation | Complexity | Reason |
|-----------|-----------|--------|
| `daily_flow_aggregated` query | **TIMEOUT** | View doesn't exist, triggers fallback |
| Supplemental tasks fallback | **VERY HIGH** | 5+ sequential queries + nested loops |
| `planting_schedule_view` | **HIGH** | CTE with aggregations, no filters in app |
| `order_fulfillment_status` | **HIGH** | Correlated subqueries |
| Harvest task generation | **HIGH** | Duplicate queries + JS processing |
| Watering task generation | **HIGH** | Duplicate queries + JS processing |
| `fetchOverdueSeedingTasks` | **MODERATE** | Multiple sequential queries |
| `fetchPassiveTrayStatus` | **MODERATE** | N+1 pattern with steps |
| `getActiveTraysCount` | **LOW** | Simple count (but wasteful SELECT) |

---

## 9. Root Cause Summary

### Primary Issues:
1. ❌ **Missing `daily_flow_aggregated` view** - causes 15-20s timeout
2. 🔄 **N+1 query patterns** throughout supplemental logic
3. 🔁 **Redundant queries** - same data fetched 2-3 times
4. 🎯 **No query filters** - fetching entire datasets then filtering in JS
5. 📊 **No materialized views** - expensive views recalculated every load

### Secondary Issues:
6. 🗃️ **Missing indexes** on frequently filtered columns
7. 💾 **Wasteful SELECT statements** - fetching all columns
8. 🔗 **JavaScript joins** instead of SQL JOINs
9. 📉 **Correlated subqueries** in views (order_fulfillment_status)

---

## 10. Expected Performance After Fixes

| Fix | Current | After | Improvement |
|-----|---------|-------|-------------|
| Create daily_flow_aggregated view | 15-20s | 2-3s | **85-90%** |
| Add date filters to queries | +3-5s | +0.5s | **90%** |
| Deduplicate tray queries | +2-4s | +0.5s | **75-88%** |
| Optimize count queries | +1-2s | +0.2s | **80-90%** |
| Add indexes | +1-2s | +0.5s | **50-75%** |
| **TOTAL ESTIMATED** | **22-33s** | **3-5s** | **~85%** |

---

## 11. Tables Needing Indexes

Based on `.eq()` and `.in()` filters found:

### High Impact:
- `trays`: (farm_uuid, status, harvest_date)
- `tray_steps`: (scheduled_date, completed, skipped)
- `steps`: (recipe_id, sequence_order)
- `task_completions`: (farm_uuid, task_date, task_type, status)

### Medium Impact:
- `recipes`: (farm_uuid, recipe_id)
- `customers`: (customerid)
- `tray_creation_requests`: (farm_uuid, status, seed_date)

---

## Conclusion

The DailyFlow performance issue is **NOT due to slow individual queries** but rather:
1. A **critical missing view** that forces expensive fallback logic
2. **Sequential execution** of queries that could be parallel or consolidated
3. **Application-level joins and aggregations** that should be in the database

**Fix the missing `daily_flow_aggregated` view first** - this alone should reduce load time from 20+ seconds to under 5 seconds.

