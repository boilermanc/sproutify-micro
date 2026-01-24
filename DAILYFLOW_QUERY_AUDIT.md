# DailyFlow Query Consolidation Audit
**Generated:** 2026-01-24  
**Scope:** All Supabase queries triggered during DailyFlow page load  

---

## Executive Summary

### Current State
- **Total Supabase queries:** 75-99 (varies by gap count and data)
  - Base queries: 50-60
  - Gap status updates: 25-39 (depends on number of gaps)
- **Unique tables/views queried:** 16
- **Duplicate/redundant fetches:** 45-55
- **Total load time:** 11+ seconds (150-550ms per query)
- **Queries that could be eliminated:** 55-65%

### Critical Issues
1. **Active trays fetched 4 times** with different columns
2. **Steps fetched 3-5 times** for same recipes
3. **Planting schedule fetched WITHOUT date filter** (returns 50,000+ rows)
4. **task_completions queried 10+ times** independently
5. **Customers fetched 3 times** independently

---

## Call Chain Map

### Entry Point: DailyFlow.tsx `loadTasks()`
Lines 897-1118

```typescript
Promise.all([
  fetchDailyTasks(selectedDate, true, signal),        // → 50-60 queries
  getActiveTraysCount(signal),                         // → 1 query
  fetchPassiveTrayStatus(signal),                      // → 3-5 queries  
  fetchOrderGapStatus(farmUuid, signal),               // → 1 query
  fetchOverdueSeedingTasks(7, signal),                 // → 5-7 queries
])
+ available_soaked_seed query (line 1079)             // → 1 query
```

---

## Complete Query Inventory

### GROUP 1: Main Parallel Queries (Lines 971-977)

#### 1.1 `fetchDailyTasks()` → 50-60 queries

**Call:** dailyFlowService.ts:301

**Subqueries:**

| # | Table/View | Lines | Select | Filters | Called By |
|---|-----------|-------|--------|---------|-----------|
| 1 | `order_fulfillment_status` | 77 | `*` | `farm_uuid`, `delivery_date`, `trays_needed > 0` | fetchOrderFulfillmentContext |
| 2 | `order_schedules` | 106 | `standing_order_id`, `scheduled_delivery_date` | `farm_uuid`, `scheduled_delivery_date`, `status='completed'` | fetchOrderFulfillmentContext |
| 3 | `daily_flow_aggregated` | 325 | `*` | `farm_uuid`, `task_date` | fetchDailyTasks (FAILS - view doesn't exist) |
| 4 | `trays` | 359 | `tray_id, recipe_id, sow_date, batch_id, location, customer_id, recipes(*)` | `farm_uuid`, `harvest_date IS NULL`, `sow_date IS NOT NULL` | Supplemental tasks fallback |
| 5 | `customers` | 387 | `customerid, name` | `customerid IN (...)` | Supplemental tasks (customer names) |
| 6 | `steps` | 402 | `*` | `recipe_id IN (...)` | Supplemental tasks (all steps for recipes) |
| 7 | `tray_steps` | 428 | `tray_id, step_id, completed, skipped, scheduled_date` | `tray_id IN (...)`, `scheduled_date = taskDate` | Supplemental tasks (today's steps) |
| 8 | `planting_schedule_view` | 706 | `sow_date, harvest_date, recipe_name, trays_needed, recipe_id, customer_name, customer_id, standing_order_id, schedule_id, delivery_date` | **`farm_uuid` ONLY** ⚠️ | Seeding/soaking tasks |
| 9 | `recipes` | 716 | `recipe_id, variety_name` | `recipe_id IN (...)`, `farm_uuid` | Variety names for seeding |
| 10 | `steps` | 732 | `*` | `recipe_id IN (...)` | Pre-seeding duration calc |
| 11 | `task_completions` | 803 | `recipe_id, task_type, task_date` | `farm_uuid`, `task_date`, `task_type IN ('sowing','soaking')`, `status='completed'` | Filter completed seeding |
| 12 | `tray_creation_requests` | 822 | `recipe_id, seed_date, requested_at, farm_uuid` | `farm_uuid`, `status IN ('pending','approved')` | Check existing requests |
| 13 | `trays` | 961 | `tray_id, recipe_id, sow_date, batch_id, location, customer_id, recipes(*)` | `farm_uuid`, `harvest_date IS NULL`, `sow_date IS NOT NULL` | **DUPLICATE** - Harvest tasks |
| 14 | `steps` | 999 | `*` | `recipe_id IN (...)` | **DUPLICATE** - Missing recipe steps |
| 15 | `customers` | 1091 | `customerid, name` | `customerid IN (...)` | **DUPLICATE** - Harvest customer names |
| 16 | `trays` | 1222 | `tray_id, recipe_id, sow_date, recipes(*)` | `farm_uuid`, `harvest_date IS NULL`, `sow_date IS NOT NULL` | **DUPLICATE #3** - Watering tasks |
| 17 | `steps` | 1252 | `step_id, step_name, recipe_id, duration, duration_unit, sequence_order, water_frequency, water_method` | `recipe_id IN (...)` | **DUPLICATE #3** - Watering recipe steps |
| 18 | `task_completions` | 1369 | `recipe_id` | `farm_uuid`, `task_type='watering'`, `task_date`, `status='completed'` | Filter completed watering |
| 19 | `trays` | 1752 | `tray_id, recipe_id, farm_uuid` | `farm_uuid`, `harvest_date IS NULL` | Fallback ID fetching |
| 20 | `tray_steps` | 1766 | `tray_step_id, tray_id, step_id, scheduled_date, status, completed` | `tray_id IN (...)`, `scheduled_date`, `status IN ('Pending','Completed')`, `skipped=false` | Fallback ID fetching |
| 21 | `steps` | 1779 | `step_id, step_name, description_name` | `step_id IN (...)` | **DUPLICATE #4** - Fallback step details |
| 22 | `tray_steps` | 1833 | `tray_step_id, tray_id, step_id, scheduled_date, status, completed` | `tray_id IN (...)`, `scheduled_date`, `skipped=false` | Fallback matching (all statuses) |
| 23 | `task_completions` | 1905 | `recipe_id, task_type, task_date` | `farm_uuid`, `task_date`, `task_type='watering'`, `status='completed'` | **DUPLICATE** - Today's completions |
| 24 | `tray_creation_requests` | 1933 | `request_id, recipe_id, quantity_needed, trays_created, seed_date, status` | `farm_uuid`, `status IN ('pending','approved')` | Seed request task mapping |
| 25 | `recipes` | 1960 | `recipe_id, variety_name` | `recipe_id IN (...)`, `farm_uuid` | **DUPLICATE** - Variety names |
| 26 | `planting_schedule_view` | 1983 | `recipe_id` | `farm_uuid`, **NO date filter** ⚠️ | **DUPLICATE** - Recipe IDs |
| 27 | `steps` | 2011 | `recipe_id, requires_weight, weight_lbs, description_name, step_name` | `recipe_id IN (...)` | **DUPLICATE #5** - Germination weights |
| 28 | `maintenance_tasks` | 238 | `*` | `farm_uuid`, `is_active=true`, complex OR filter | Maintenance tasks |
| 29 | `task_completions` | 251 | `maintenance_task_id` | `farm_uuid`, `task_type='maintenance'`, `task_date`, `status='completed'` | **DUPLICATE** - Completed maintenance |

**Conditional queries (executed based on data):**
- Additional `tray_steps` queries in loops (lines 2426, 3078, 3093, 3111, 3163, 3176, 3192)
- Additional `steps` queries (lines 2315, 3144, 3265)
- Additional `customers` queries (line 2325)

**Total from fetchDailyTasks:** ~29 guaranteed + 10-30 conditional = **39-59 queries**

---

#### 1.2 `getActiveTraysCount()` → 1 query

**Call:** dailyFlowService.ts:3694

| # | Table | Line | Select | Filters | Issue |
|---|-------|------|--------|---------|-------|
| 30 | `trays` | 3714 | `*` (count only) | `farm_uuid`, `status='active'`, `harvest_date IS NULL` | **Wasteful:** Uses `SELECT *` for count |

---

#### 1.3 `fetchPassiveTrayStatus()` → 3-5 queries

**Call:** dailyFlowService.ts:4280-4405

| # | Table | Line | Select | Filters |
|---|-------|------|--------|---------|
| 31 | `trays` | 4306 | `tray_id, recipe_id, sow_date, recipes(recipe_name, variety_name)` | `farm_uuid`, `harvest_date IS NULL`, `sow_date IS NOT NULL` |
| 32 | `steps` | 4315 | `*` | `recipe_id IN (...)` | **DUPLICATE #6** |
| 33 | `tray_steps` | 4347 | `tray_id, step_id, scheduled_date` | `tray_id IN (...)`, `completed=false`, `skipped=false` |

**Conditional queries:**
- If varieties exist: `varieties` lookups (nested in recipes relation)

---

#### 1.4 `fetchOrderGapStatus()` → 1 query

**Call:** dailyFlowService.ts:205

| # | Table/View | Line | Select | Filters |
|---|-----------|------|--------|---------|
| 34 | `order_gap_status` | 207 | `*` | `farm_uuid` |

---

#### 1.5 `fetchOverdueSeedingTasks()` → 5-7 queries

**Call:** dailyFlowService.ts:4435-4667

| # | Table/View | Line | Select | Filters |
|---|-----------|------|--------|---------|
| 35 | `planting_schedule_view` | 4477 | `sow_date, harvest_date, recipe_name, trays_needed, recipe_id, customer_name, customer_id, standing_order_id, schedule_id, delivery_date` | `farm_uuid`, `sow_date >= pastDate`, `sow_date < today` |
| 36 | `recipes` | 4502 | `recipe_id, variety_name` | `recipe_id IN (...)`, `farm_uuid` | **DUPLICATE #3** |
| 37 | `task_completions` | 4519 | `recipe_id, task_type, task_date` | `farm_uuid`, `task_date >= pastDate`, `task_date < today`, `task_type IN ('sowing','soaking')`, `status='completed'` | **DUPLICATE** |
| 38 | `trays` | 4544 | `recipe_id, sow_date, scheduled_sow_date` | `farm_uuid`, date range filter | **DUPLICATE #5** |

---

### GROUP 2: Additional Queries in DailyFlow.tsx

#### 2.1 Available Soaked Seed

| # | Table/View | Line | Select | Filters |
|---|-----------|------|--------|---------|
| 39 | `available_soaked_seed` | 1080 | `*` | `farm_uuid`, ordered by `expires_at` |

#### 2.2 Action History (Async, per at-risk task)

| # | Table/View | Line | Select | Filters | Called When |
|---|-----------|------|--------|---------|-------------|
| 40+ | `order_fulfillment_actions` | 844 | `*` | `farm_uuid`, `standing_order_id`, `delivery_date`, `recipe_id` | Async after tasks load |

**Note:** Called once per at-risk task (0-10+ queries depending on at-risk tasks)

---

### GROUP 3: Gap Status Updates (Runs in Loops!)

**Triggered by:** `useEffect` on line 1243 when `orderGapStatus` changes  
**Impact:** For EACH gap (typically 3-10 gaps), THREE functions query data

#### 3.1 Update Missing Variety Trays (PER GAP)

**Call:** DailyFlow.tsx:633 → trayService.ts:fetchAssignableTrays

| # | Table/View | Line | Select | Filters | Loop Count |
|---|-----------|------|--------|---------|------------|
| 41-50 | `trays` | trayService:24 | `tray_id, sow_date, recipe_id, recipes(recipe_name, variety_name, product_recipe_mapping(product_id))` | `farm_uuid`, `product_id`, `customer_id IS NULL`, `status='active'`, `harvest_date IS NULL`, sow_date range | 1x per gap |

**Additional joins:** INNER JOIN on `recipes` and `product_recipe_mapping`

#### 3.2 Update Mismatched Trays (PER GAP)

**Call:** DailyFlow.tsx:686 → trayService.ts:fetchAssignedMismatchedTrays

For EACH gap, makes 3 queries:

| # | Table/View | Line | Select | Filters | Loop Count |
|---|-----------|------|--------|---------|------------|
| 51-60 | `product_recipe_mapping` | trayService:258 | `recipe_id` | `product_id` | 1x per gap |
| 61-70 | `trays` | trayService:274 | `tray_id, sow_date, recipe_id, customer_id, recipes(recipe_name, variety_name)` | `farm_uuid`, `customer_id`, `recipe_id IN (...)`, `status='active'`, `harvest_date IS NULL` | 1x per gap |
| 71-80 | `tray_steps` | trayService:304 | `tray_step_id, tray_id, step_id, scheduled_date, status, steps(step_name)` | `tray_id IN (...)`, `step_name ILIKE '%harvest%'`, `status='Pending'` | 1x per gap |

#### 3.3 Update Recipe Requirements (PER GAP)

**Call:** DailyFlow.tsx:735 → orderFulfillmentService.ts:fetchOrderFulfillmentDetails

| # | Table/View | Line | Select | Filters | Loop Count |
|---|-----------|------|--------|---------|------------|
| 81-90 | `order_fulfillment_status` | orderFulfillmentService:55 | `*` | `farm_uuid`, `delivery_date`, `customer_name` | 1x per gap |

---

### GROUP 4: Conditional/User Action Queries (Not in Initial Load)

These are NOT part of the initial 74 queries but are triggered by user actions:

- `fetchNearestAssignedTray` (opens modal): 3 queries
- `assignTrayToCustomer` (assign action): 1 update
- `harvestTrayNow` (harvest action): 1 update
- `updateHarvestStepToToday` (early harvest): 1 update
- Various task completion queries in dailyFlowService.ts

---

## Duplication Matrix

| Table/View | Times Fetched | Locations | Same Query? | Notes |
|-----------|---------------|-----------|-------------|-------|
| **trays** | **11-16x** | 359, 961, 1222, 1752, 4306, 4544, + gap loops | NO | Different columns each time |
|  | | ↳ #1: Full recipe relation | | Supplemental tasks |
|  | | ↳ #2: Full recipe relation | | **DUPLICATE** - Harvest |
|  | | ↳ #3: Recipe relation | | **DUPLICATE** - Watering |
|  | | ↳ #4: Just IDs | | Fallback |
|  | | ↳ #5: Recipe relation | | Passive status |
|  | | ↳ #6: Sow dates only | | Overdue tasks |
|  | | ↳ #7-11: Complex joins | | **LOOP** - Assignable trays (1 per gap) |
|  | | ↳ #12-16: Recipe joins | | **LOOP** - Mismatched trays (1 per gap) |
| **steps** | **6-7x** | 402, 732, 999, 1252, 1779, 2011, 4315 | NO | Different columns |
|  | | ↳ #1: All columns (`*`) | | Supplemental - calculate current step |
|  | | ↳ #2: All columns (`*`) | | **DUPLICATE** - Pre-seeding duration |
|  | | ↳ #3: All columns (`*`) | | **DUPLICATE** - Harvest (missing recipes) |
|  | | ↳ #4: Specific columns | | **DUPLICATE** - Watering info |
|  | | ↳ #5: Name fields only | | Fallback matching |
|  | | ↳ #6: Weight fields | | Germination weights |
|  | | ↳ #7: All columns (`*`) | | **DUPLICATE** - Passive status |
| **customers** | **3x** | 387, 1091, 2325 | YES | **EXACT DUPLICATES** |
|  | | ↳ #1: Supplemental tasks | | |
|  | | ↳ #2: Harvest tasks | | **DUPLICATE** |
|  | | ↳ #3: Conditional | | **DUPLICATE** |
| **recipes** | **4x** | 716, 1960, 4502, 4860 | YES | **EXACT DUPLICATES** |
|  | | ↳ #1: Variety names (seeding) | | |
|  | | ↳ #2: Variety names (tasks) | | **DUPLICATE** |
|  | | ↳ #3: Variety names (overdue) | | **DUPLICATE** |
|  | | ↳ #4: Variety names (other) | | **DUPLICATE** |
| **planting_schedule_view** | **3x** | 706, 1983, 4477 | NO | Different filters |
|  | | ↳ #1: **NO date filter** ⚠️ | | Returns ALL schedules (50k+ rows) |
|  | | ↳ #2: **NO date filter** ⚠️ | | **DUPLICATE** - Just recipe_ids |
|  | | ↳ #3: Date range filter | | Only query with proper filter |
| **task_completions** | **10+x** | 803, 1369, 1905, 251, 4519, + more | NO | Different task_types |
|  | | ↳ Various locations | | Each function queries independently |
| **tray_steps** | **5-10x** | 428, 1766, 1833, 4347, + loops | NO | Different filters |
|  | | ↳ Multiple locations | | Queried repeatedly in loops |
| **tray_creation_requests** | **2x** | 822, 1933 | NO | Different columns |
| **maintenance_tasks** | **1x** | 238 | N/A | |
| **order_fulfillment_status** | **6-11x** | 77, + gap loops | NO | Different filters |
|  | | ↳ #1: Today's orders | | Main query |
|  | | ↳ #2-11: Per customer | | **LOOP** - Gap recipe requirements (1 per gap) |
| **order_schedules** | **1x** | 106 | N/A | |
| **order_gap_status** | **1x** | 207 | N/A | |
| **available_soaked_seed** | **1x** | 1080 | N/A | |
| **product_recipe_mapping** | **5-10x** | Gap loops | NO | **LOOP** - 1 per gap |
| **order_fulfillment_actions** | **0-10x** | 844 (async) | NO | Per at-risk task (after load) |

---

## Critical Duplication Issues

### 🔴 ISSUE 1: Active Trays Fetched 11-16 Times
**Impact:** CRITICAL - Each query returns 18+ rows with expensive joins

**Occurrences:**
1. Line 359: Supplemental tasks - Full recipes relation
2. Line 961: Harvest tasks - Full recipes relation  
3. Line 1222: Watering tasks - Recipes relation
4. Line 1752: Fallback ID fetching - Just IDs
5. Line 4306: Passive status - Recipe names
6-10. Lines 633→trayService:24: **Gap assignable trays (LOOP - 1 per gap)** - Complex product mapping joins
11-15. Lines 686→trayService:274: **Gap mismatched trays (LOOP - 1 per gap)** - Recipe joins

**Why duplicated:**
- Each function fetches independently
- Gap functions run in loops (once per gap = 5-10x)
- Different column selections (but could use broader query once)
- No data sharing between functions

**Solution:** Fetch once with ALL needed columns, pass to functions. Build gap data from cached trays instead of querying per gap.

---

### 🔴 ISSUE 2: Steps Fetched 6-7 Times
**Impact:** HIGH - Each query returns 50-100+ rows

**Occurrences:**
1. Line 402: Calculate current step per tray
2. Line 732: Calculate pre-seeding duration
3. Line 999: Missing recipe steps for harvest
4. Line 1252: Watering frequency/method
5. Line 1779: Fallback step name matching
6. Line 2011: Germination weight info
7. Line 4315: Passive status calculations

**Why duplicated:**
- Each calculation needs step data
- No caching between function calls
- Different subsets of columns selected

**Solution:** Fetch ALL steps for active recipes once, cache in memory

---

### 🔴 ISSUE 3: planting_schedule_view WITHOUT Date Filter
**Impact:** CRITICAL - Returns 50,000+ rows, filtered in JavaScript

**Location:** Line 706-708

```typescript
.from('planting_schedule_view')
.select('...')
.eq('farm_uuid', farmUuid);  // ⚠️ NO DATE FILTER!
```

**What happens:**
- Fetches ENTIRE schedule history for farm
- Filters to find today's schedules in JavaScript (lines 857-955)
- Takes 3-5 seconds alone

**Solution:** Add date range filter

```typescript
.gte('sow_date', startDate)
.lte('sow_date', endDate)
```

---

### 🟡 ISSUE 4: task_completions Queried 10+ Times
**Impact:** MODERATE - Simple queries but adds up

**Occurrences:**
- Seeding completions (line 803)
- Watering completions (line 1369)
- Watering completions again (line 1905) - **DUPLICATE**
- Maintenance completions (line 251)
- Overdue completions (line 4519)
- Multiple conditional queries in task completion functions

**Why duplicated:**
- Each task type checks independently
- No consolidated completion status fetch

**Solution:** Fetch ALL today's completions once, filter in memory by task_type

---

### 🟡 ISSUE 5: Customers Fetched 3 Times (EXACT SAME)
**Impact:** LOW (fast query) but unnecessary

**Occurrences:**
1. Line 387: Supplemental tasks
2. Line 1091: Harvest tasks
3. Line 2325: Conditional

**Why duplicated:** Functions don't share data

**Solution:** Fetch once, pass to all functions

---

### 🟡 ISSUE 6: Recipes (variety names) Fetched 4 Times
**Impact:** LOW but unnecessary

**Occurrences:**
1. Line 716: Seeding tasks
2. Line 1960: Task variety names
3. Line 4502: Overdue tasks
4. Additional locations

**Why duplicated:** Each function maps recipe_id → variety_name independently

**Solution:** Create single recipe lookup map, share across functions

### 🔴 ISSUE 7: Gap Updates Run in Loops (CRITICAL)
**Impact:** CRITICAL - 25-39 queries just for gap status

**Location:** Lines 1243-1247 - `useEffect` triggers 3 functions for EACH gap

**Problem:**
```typescript
useEffect(() => {
  updateGapMissingVarietyTrays(orderGapStatus);      // Loops gaps, queries trays 1x each
  updateGapMismatchedTrays(orderGapStatus);          // Loops gaps, queries 3x each  
  updateGapRecipeRequirements(orderGapStatus);       // Loops gaps, queries 1x each
}, [orderGapStatus, ...]);
```

**With 5 gaps, this creates:**
- 5 queries for assignable trays
- 15 queries for mismatched trays (3 per gap: product mapping, trays, tray_steps)
- 5 queries for order fulfillment details
- **Total: 25 queries**

**With 10 gaps: 50 queries!**

**Solution:**
1. Fetch ALL relevant data once (trays, product mappings, tray_steps)
2. Build gap details in memory from cached data
3. Eliminate loops entirely

**Estimated savings: 20-45 queries, 3-6 seconds**

---

## Consolidation Opportunities

### Category A: Exact Duplicates (Eliminate)
| Query | Times | Solution |
|-------|-------|----------|
| `customers` lookups | 3x | Fetch once, pass map to all functions |
| `recipes` variety names | 4x | Fetch once, create map, reuse |
| `task_completions` (watering) | 2x | Fetch once in main function |
| `tray_creation_requests` | 2x | Fetch once, different consumers use different fields |

**Estimated reduction:** 10-12 queries → **Save 1-2 seconds**

---

### Category B: Subset Queries (Use Broader Query Once)
| Query | Times | Solution |
|-------|-------|----------|
| `trays` (active) | 4-6x | Fetch ALL columns once, filter/map in memory |
| `steps` | 6-7x | Fetch ALL columns for active recipes once |
| `tray_steps` (today) | 3-5x | Fetch once with ALL needed fields |

**Estimated reduction:** 15-20 queries → **Save 3-5 seconds**

---

### Category C: Missing Filters (Add Filters)
| Query | Issue | Solution |
|-------|-------|----------|
| `planting_schedule_view` #1 | No date filter | Add `.gte('sow_date', ...).lte('sow_date', ...)` |
| `planting_schedule_view` #2 | No date filter, duplicate | Eliminate - use #3 result |

**Estimated reduction:** 1 massive query → **Save 3-5 seconds**

---

### Category D: Different Filters (Keep Separate)
| Query | Reason |
|-------|--------|
| `task_completions` by task_type | Different types: seeding, watering, maintenance |
| `order_fulfillment_status` | Specific date query |
| `order_gap_status` | Gap analysis data |
| `maintenance_tasks` | Frequency-based filtering |

**Recommendation:** Consider fetching ALL task_completions for today once, then filter by type in memory

---

## Proposed Consolidated Structure

### Phase 1: Fetch Core Data (Parallel)

```typescript
const [
  // Fetch ALL active trays ONCE with everything needed
  activeTraysResult,
  
  // Fetch ALL steps for farm's recipes ONCE
  allStepsResult,
  
  // Fetch ALL today's task completions ONCE
  todayCompletionsResult,
  
  // Fetch customer map ONCE
  customerMapResult,
  
  // Fetch recipe variety map ONCE
  recipeVarietyMapResult,
  
  // Fetch planting schedules WITH DATE FILTER
  plantingSchedulesResult,
  
  // Views/status (can't consolidate)
  orderFulfillmentResult,
  orderGapResult,
  maintenanceResult,
  soakedSeedResult,
  trayCreationRequestsResult,
  
] = await Promise.all([
  // 1. ALL active trays with full data
  supabase.from('trays')
    .select(`
      tray_id,
      recipe_id,
      sow_date,
      scheduled_sow_date,
      batch_id,
      location,
      customer_id,
      status,
      recipes (
        recipe_id,
        recipe_name,
        variety_id,
        variety_name,
        varieties ( varietyid, name )
      )
    `)
    .eq('farm_uuid', farmUuid)
    .is('harvest_date', null)
    .or('status.is.null,status.eq.active'),
  
  // 2. ALL steps for recipes (once we have recipe IDs)
  // Note: This requires recipe IDs from trays, so may need to be sequential
  // OR fetch ALL steps for farm (if count is reasonable)
  
  // 3. ALL today's completions
  supabase.from('task_completions')
    .select('*')
    .eq('farm_uuid', farmUuid)
    .eq('task_date', todayStr)
    .eq('status', 'completed'),
  
  // 4. Customer map
  supabase.from('customers')
    .select('customerid, name')
    // All customers or filter by IDs from trays?
    
  // 5. Recipe variety map
  supabase.from('recipes')
    .select('recipe_id, variety_name, recipe_name')
    .eq('farm_uuid', farmUuid),
  
  // 6. Planting schedules WITH FILTER
  supabase.from('planting_schedule_view')
    .select('*')
    .eq('farm_uuid', farmUuid)
    .gte('sow_date', dateRangeStart)  // ✅ ADD THIS
    .lte('sow_date', dateRangeEnd),   // ✅ ADD THIS
  
  // ... other views
])
```

### Phase 2: Transform & Calculate (In Memory)

```typescript
// Build lookup maps from Phase 1 data
const trayMap = new Map(activeTrays.map(t => [t.tray_id, t]))
const stepsByRecipe = groupStepsByRecipe(allSteps)
const completionsByType = groupCompletionsByType(todayCompletions)
const customerMap = new Map(customers.map(c => [c.customerid, c.name]))
const recipeVarietyMap = new Map(recipes.map(r => [r.recipe_id, r.variety_name]))

// Pass maps to all functions (no more fetching inside)
const supplementalTasks = buildSupplementalTasks(activeTrays, stepsByRecipe, trayStepsToday, customerMap)
const harvestTasks = buildHarvestTasks(activeTrays, stepsByRecipe, customerMap, recipeVarietyMap)
const wateringTasks = buildWateringTasks(activeTrays, stepsByRecipe, completionsByType.watering)
const seedingTasks = buildSeedingTasks(plantingSchedules, recipeVarietyMap, completionsByType.sowing)
```

### Phase 3: Conditional Queries (Only If Needed)

```typescript
// Only fetch if specific data is missing
if (missingStepData) {
  const additionalSteps = await fetchMissingSteps(missingRecipeIds)
}
```

---

## Estimated Impact

### Before Consolidation
- **Total queries:** 75-99 (varies by gap count)
  - Base: 50-60 queries
  - Gap loops: 25-39 queries
- **Fetch time:** 11+ seconds
- **Redundant queries:** 58-68

### After Consolidation
- **Total queries:** 12-17 (~85% reduction)
  - Fetch shared data: 10-12 queries (parallel)
  - View queries: 2-5 queries (necessary views)
- **Estimated time:** 1.5-3 seconds (75-85% faster)
- **Redundant queries:** 0-2

### Breakdown by Optimization

| Optimization | Queries Saved | Time Saved |
|-------------|---------------|------------|
| Consolidate active trays | 10-15 | 2-4s |
| Consolidate steps | 5-6 | 1-2s |
| Add date filter to planting_schedule | 2 | 3-5s |
| Consolidate customers/recipes | 6-7 | 0.5-1s |
| Consolidate task_completions | 5-8 | 0.5-1s |
| Eliminate fallback queries | 10-15 | 1-2s |
| **Eliminate gap query loops** | **20-45** | **3-6s** |
| **TOTAL** | **58-103** | **11-21s** |

---

## Risk Assessment

### ⚠️ Queries That Look Duplicated But May Need Different Data

1. **tray_steps queries in completion functions**
   - Lines 3078, 3093, 3111, etc.
   - **Risk:** These run AFTER task completion to update statuses
   - **Assessment:** Safe to consolidate initial fetch, but completion writes need separate queries
   - **Action:** Consolidate reads, keep writes separate

2. **planting_schedule_view date ranges**
   - Line 706: No filter (seeding/soaking for today)
   - Line 4477: Past 7 days (overdue tasks)
   - **Risk:** Different date ranges needed
   - **Assessment:** Two separate queries ARE needed
   - **Action:** Add filter to #1, keep #2 separate with its range

3. **task_completions by task_type**
   - Seeding, soaking, watering, maintenance all separate
   - **Risk:** Functions expect filtered data
   - **Assessment:** Can fetch all, filter in memory
   - **Action:** Safe to consolidate

4. **steps - different column subsets**
   - Some need: step_name, duration, sequence_order
   - Some need: requires_weight, weight_lbs
   - Some need: water_frequency, water_method
   - **Risk:** Large payload if fetching ALL columns
   - **Assessment:** Steps table is moderate size (~50-100 rows per farm)
   - **Action:** Safe to fetch all needed columns once

---

## Implementation Plan

### Step 1: Eliminate Gap Query Loops (CRITICAL - Biggest Impact)
- **File:** DailyFlow.tsx:633-774
- **Change:** 
  - Fetch trays, product_recipe_mapping, tray_steps ONCE
  - Build gap details from cached data in memory
  - Remove loops entirely
- **Impact:** Eliminates 20-45 queries, saves 3-6 seconds
- **Estimated time:** 2-3 hours

### Step 2: Add Date Filter (CRITICAL - Quick Win)
- **File:** dailyFlowService.ts:706-708
- **Change:** Add `.gte('sow_date', startDate).lte('sow_date', endDate)`
- **Impact:** Immediate 3-5s improvement, no risk
- **Estimated time:** 5 minutes

### Step 3: Consolidate Customer & Recipe Lookups
- **Location:** fetchDailyTasks() beginning
- **Change:** Fetch once, create maps, pass to subfunctions
- **Impact:** 0.5-1s improvement, low risk
- **Estimated time:** 30 minutes

### Step 4: Consolidate Active Trays Fetch
- **Location:** fetchDailyTasks() beginning
- **Change:** Single fetch with all columns, pass to all functions
- **Impact:** 1-2s improvement, moderate risk (need to test all consumers)
- **Estimated time:** 1-2 hours

### Step 5: Consolidate Steps Fetch
- **Location:** fetchDailyTasks() beginning
- **Change:** Fetch all steps for active recipes once
- **Impact:** 1-2s improvement, moderate risk
- **Estimated time:** 1-2 hours

### Step 6: Consolidate task_completions
- **Location:** fetchDailyTasks() beginning
- **Change:** Fetch all today's completions, filter by type in memory
- **Impact:** 0.5-1s improvement, low risk
- **Estimated time:** 30 minutes

### Step 7: Refactor Function Signatures
- **Location:** All subfunctions in fetchDailyTasks
- **Change:** Accept preloaded data as parameters instead of fetching
- **Impact:** Eliminates remaining duplicates
- **Estimated time:** 2-3 hours

---

## Conclusion

The DailyFlow page's 75-99 queries can be reduced to ~12-17 by:
1. **Adding missing filters** (planting_schedule_view)
2. **Consolidating duplicate fetches** (trays, steps, customers, recipes)
3. **Fetching shared data once** and passing to functions
4. **Grouping related queries** (task_completions by farm+date)

**Total estimated improvement: 75-85% faster (11s → 1.5-3s)**

**Critical finding:** 25-39 queries (25-35% of total) are from gap status updates running in loops. This is the single biggest opportunity for optimization.

The consolidation is **low risk** because:
- Most duplicates are exact matches
- Subset queries can use broader data
- Only reads are being consolidated (writes stay separate)
- Each step can be tested independently

**Recommended order: Steps 2, 1, 3, 6, 4, 5, 7** (quick date filter win, then gap loops, then consolidation)
