# fetchDailyTasks Query Parallelization - Phase 5
**Date:** 2026-01-24  
**Impact:** Reduces sequential waterfall delays  
**Estimated speedup:** 1-2 seconds  

---

## Current Query Flow Analysis

### Total Queries: 15-17 queries
**Current execution: Sequential (waterfall pattern)**  
**Time: ~3-5 seconds**

---

## Detailed Query Mapping

### Query 1: daily_flow_aggregated (Line 324-336)
```typescript
await getSupabaseClient()
  .from('daily_flow_aggregated')
  .select('*')
  .eq('farm_uuid', farmUuid)
  .eq('task_date', taskDate)
```
**Dependencies:** None (farmUuid from localStorage)  
**Used by:** Task building logic  
**Can parallelize:** ✅ Yes - Level 0

---

### Query 2: Active Trays (Line 366-387)
```typescript
await getSupabaseClient()
  .from('trays')
  .select('tray_id, recipe_id, sow_date, scheduled_sow_date, batch_id, location, customer_id, status, recipes(...)')
  .eq('farm_uuid', farmUuid)
  .is('harvest_date', null)
  .not('sow_date', 'is', null)
```
**Dependencies:** None  
**Used by:** cachedActiveTrays (reused 3x), supplemental tasks, harvest tasks, watering tasks  
**Provides:** recipe_ids[], customer_ids[], tray_ids[]  
**Can parallelize:** ✅ Yes - Level 0

---

### Query 3: Customers (Line 400-407)
```typescript
await getSupabaseClient()
  .from('customers')
  .select('customerid, name')
  .in('customerid', trayCustomerIds)
```
**Dependencies:** trayCustomerIds from Query 2  
**Used by:** Customer name mapping for tasks  
**Can parallelize:** ❌ No - Level 1 (depends on Query 2)

---

### Query 4: Steps (Line 415-418)
```typescript
await getSupabaseClient()
  .from('steps')
  .select('*')
  .in('recipe_id', recipeIds)
```
**Dependencies:** recipeIds from Query 2  
**Used by:** cachedSteps (reused 4x), supplemental tasks, seeding, harvest, watering  
**Can parallelize:** ❌ No - Level 1 (depends on Query 2)

---

### Query 5: Tray Steps (Line 443-449)
```typescript
await getSupabaseClient()
  .from('tray_steps')
  .select('tray_id, step_id, completed, skipped, scheduled_date')
  .in('tray_id', trayIds)
  .eq('scheduled_date', taskDate)
```
**Dependencies:** trayIds from Query 2  
**Used by:** Checking completion status  
**Can parallelize:** ❌ No - Level 1 (depends on Query 2)

---

### Query 6: Maintenance Tasks (Line 237-242 in fetchMaintenanceTasks)
```typescript
await getSupabaseClient()
  .from('maintenance_tasks')
  .select('*')
  .eq('farm_uuid', farmUuid)
  .eq('is_active', true)
```
**Dependencies:** None  
**Used by:** Maintenance task list  
**Can parallelize:** ✅ Yes - Level 0

---

### Query 7: Completed Maintenance (Line 250-256 in fetchMaintenanceTasks)
```typescript
await getSupabaseClient()
  .from('task_completions')
  .select('maintenance_task_id')
  .eq('farm_uuid', farmUuid)
  .eq('task_type', 'maintenance')
  .eq('task_date', dateStr)
```
**Dependencies:** None (date available)  
**Used by:** Filtering completed maintenance tasks  
**Can parallelize:** ✅ Yes - Level 0

---

### Query 8: Planting Schedule (Line 732-737)
```typescript
await getSupabaseClient()
  .from('planting_schedule_view')
  .select('sow_date, harvest_date, recipe_name, trays_needed, recipe_id, ...')
  .eq('farm_uuid', farmUuid)
  .gte('sow_date', startDateStr)
  .lte('sow_date', endDateStr)
```
**Dependencies:** None (dates calculated from targetDate)  
**Used by:** Seeding/soaking tasks, harvest tasks  
**Provides:** recipe_ids[] for seeding  
**Can parallelize:** ✅ Yes - Level 0

---

### Query 9: Recipes (Line 744-748)
```typescript
await getSupabaseClient()
  .from('recipes')
  .select('recipe_id, variety_name')
  .in('recipe_id', recipeIds)
  .eq('farm_uuid', farmUuid)
```
**Dependencies:** recipeIds from Query 8  
**Used by:** Variety name mapping for seeding tasks  
**Can parallelize:** ❌ No - Level 1 (depends on Query 8)

---

### Query 10: Completed Seeding/Soaking (Line 830-836)
```typescript
await getSupabaseClient()
  .from('task_completions')
  .select('recipe_id, task_type, task_date')
  .eq('farm_uuid', farmUuid)
  .in('task_type', ['seeding', 'soaking'])
  .gte('task_date', startDateForCompletions)
  .lte('task_date', endDateForCompletions)
```
**Dependencies:** None (dates available)  
**Used by:** Filtering completed seeding/soaking tasks  
**Can parallelize:** ✅ Yes - Level 0

---

### Query 11: Tray Creation Requests (Line 849-855)
```typescript
await getSupabaseClient()
  .from('tray_creation_requests')
  .select('recipe_id, seed_date, requested_at, farm_uuid')
  .eq('farm_uuid', farmUuid)
  .gte('seed_date', startDateForRequests)
  .lte('seed_date', endDateForRequests)
```
**Dependencies:** None (dates available)  
**Used by:** Avoiding duplicate seed requests  
**Can parallelize:** ✅ Yes - Level 0

---

### Query 12: Order Fulfillment Status (Line 76-82)
```typescript
await getSupabaseClient()
  .from('order_fulfillment_status')
  .select('*')
  .eq('farm_uuid', farmUuid)
  .eq('delivery_date', targetDateStr)
```
**Dependencies:** None  
**Used by:** At-risk tasks, order context  
**Can parallelize:** ✅ Yes - Level 0

---

### Query 13: Completed Order Schedules (Line 105-110)
```typescript
await getSupabaseClient()
  .from('order_schedules')
  .select('standing_order_id, scheduled_delivery_date')
  .eq('farm_uuid', farmUuid)
  .eq('scheduled_delivery_date', targetDateStr)
  .eq('status', 'completed')
```
**Dependencies:** None  
**Used by:** Filtering completed orders  
**Can parallelize:** ✅ Yes - Level 0

---

### Query 14: Completed Watering Tasks (Line 1356-1362)
```typescript
await getSupabaseClient()
  .from('task_completions')
  .select('recipe_id')
  .eq('farm_uuid', farmUuid)
  .eq('task_type', 'watering')
  .eq('task_date', targetDateStr)
```
**Dependencies:** None (date available)  
**Used by:** Filtering completed watering tasks  
**Can parallelize:** ✅ Yes - Level 0

---

### Query 15-16: Tray Steps for Missing IDs (Line 1753-1769)
```typescript
// Query 15
await getSupabaseClient()
  .from('tray_steps')
  .select('tray_step_id, tray_id, step_id, scheduled_date, status, completed')
  .in('tray_id', farmTrayIds)
  .eq('scheduled_date', taskDate)

// Query 16 (depends on Query 15)
await getSupabaseClient()
  .from('steps')
  .select('step_id, step_name, description_name')
  .in('step_id', stepIds)  // from Query 15
```
**Dependencies:** Query 15 depends on tray_ids, Query 16 depends on Query 15  
**Used by:** Mapping step_ids to step names for view tasks  
**Can parallelize:** Query 15 at Level 1, Query 16 at Level 2

---

## Dependency Groups

### 🟢 Level 0: Independent Queries (Can run in parallel)
**9 queries - No dependencies**

1. daily_flow_aggregated view
2. Active trays
3. Maintenance tasks
4. Completed maintenance (task_completions)
5. Planting schedule
6. Completed seeding/soaking (task_completions)
7. Tray creation requests
8. Order fulfillment status
9. Completed order schedules
10. Completed watering (task_completions)

**Current time (sequential):** 9 × ~300ms = ~2700ms  
**Parallelized time:** 1 × ~300ms (slowest query) = **~300ms**  
**Savings: ~2400ms (2.4 seconds)**

---

### 🟡 Level 1: Depends on Level 0
**5 queries - Depend on Level 0 results**

1. Customers (depends on tray customer_ids)
2. Steps (depends on tray recipe_ids)
3. Tray steps (depends on tray_ids)
4. Recipes (depends on planting_schedule recipe_ids)
5. Tray steps for missing IDs (depends on tray_ids from view)

**Current time (sequential):** 5 × ~200ms = ~1000ms  
**Parallelized time:** 1 × ~200ms = **~200ms**  
**Savings: ~800ms**

---

### 🔴 Level 2: Depends on Level 1
**1 query - Depends on Level 1 results**

1. Steps for step_id mapping (depends on tray_steps step_ids)

**No change:** ~200ms

---

## Current vs Proposed Execution

### Current (Sequential Waterfall)
```
Time 0ms:    Query 1 (daily_flow_aggregated)       → 300ms
Time 300ms:  Query 2 (trays)                       → 300ms
Time 600ms:  Query 3 (customers)                   → 200ms
Time 800ms:  Query 4 (steps)                       → 200ms
Time 1000ms: Query 5 (tray_steps)                  → 200ms
Time 1200ms: Query 6 (maintenance_tasks)           → 200ms
Time 1400ms: Query 7 (completed_maintenance)       → 150ms
Time 1550ms: Query 8 (planting_schedule)           → 400ms
Time 1950ms: Query 9 (recipes)                     → 150ms
Time 2100ms: Query 10 (completed_seeding)          → 150ms
Time 2250ms: Query 11 (tray_creation_requests)     → 150ms
Time 2400ms: Query 12 (order_fulfillment)          → 300ms
Time 2700ms: Query 13 (completed_orders)           → 150ms
Time 2850ms: Query 14 (completed_watering)         → 150ms
Time 3000ms: Query 15 (tray_steps_missing)         → 200ms
Time 3200ms: Query 16 (steps_for_ids)              → 200ms

Total: ~3400ms (3.4 seconds)
```

### Proposed (Parallelized)
```
Time 0ms:    Level 0 - ALL 10 queries in parallel  → 400ms (slowest)
Time 400ms:  Level 1 - ALL 5 queries in parallel   → 200ms (slowest)
Time 600ms:  Level 2 - 1 query                     → 200ms

Total: ~800ms (0.8 seconds)
Savings: 2600ms (2.6 seconds) = 76% faster
```

---

## Proposed Implementation

### Structure Overview
```typescript
export const fetchDailyTasks = async (...) => {
  // Calculate all needed parameters upfront
  const farmUuid = ...;
  const taskDate = ...;
  const startDate = ...;
  const endDate = ...;
  
  // LEVEL 0: Fetch all independent queries in parallel
  const [
    tasksData,
    activeTrays,
    maintenanceTasks,
    completedMaintenance,
    allSchedules,
    completedSeeding,
    trayCreationRequests,
    orderFulfillmentData,
    completedOrders,
    completedWatering
  ] = await Promise.all([...]);
  
  // Extract IDs for Level 1 queries
  const recipeIds = [...];
  const trayIds = [...];
  const customerIds = [...];
  
  // LEVEL 1: Fetch dependent queries in parallel
  const [
    customersData,
    allSteps,
    trayStepsData,
    recipesData,
    trayStepsForMissing
  ] = await Promise.all([...]);
  
  // LEVEL 2: Final dependent queries
  const stepIds = [...];
  const stepsData = await fetchStepsForIds(stepIds);
  
  // Process and build tasks
  // ... rest of logic
};
```

---

## Key Benefits

### 1. Massive Time Reduction
- **Current:** ~3.4 seconds
- **Proposed:** ~0.8 seconds
- **Savings:** 2.6 seconds (76% faster)

### 2. Better Resource Utilization
- Database can process 10 queries concurrently
- Network connections reused efficiently
- Client doesn't wait idly between queries

### 3. Maintains Correctness
- Dependency order strictly preserved
- Error handling maintained for each query
- Cache variables populated before use

### 4. Easier to Understand
- Clear dependency levels
- Parallel execution makes dependencies explicit
- Easier to identify bottlenecks

---

## Implementation Challenges

### Challenge 1: Error Handling
**Issue:** If one query in Promise.all() fails, all fail  
**Solution:** Wrap each query in try/catch or use Promise.allSettled()

```typescript
const [result1, result2, ...] = await Promise.allSettled([
  query1(),
  query2(),
  ...
]);

// Check each result
if (result1.status === 'fulfilled') {
  const data = result1.value;
} else {
  console.error(result1.reason);
  // Handle error, use fallback
}
```

### Challenge 2: fetchMaintenanceTasks is a separate function
**Issue:** Maintenance tasks function makes 2 sequential queries internally  
**Solution:** Two options:
1. Inline the queries into fetchDailyTasks
2. Refactor fetchMaintenanceTasks to accept pre-fetched completions

**Recommendation:** Option 2 - cleaner separation of concerns

### Challenge 3: Caching variables
**Issue:** cachedActiveTrays and cachedSteps must be set before use  
**Solution:** Set them immediately after Level 0 completes, before Level 1

```typescript
// Level 0
const [activeTrays, ...] = await Promise.all([...]);

// Set caches BEFORE Level 1
cachedActiveTrays = activeTrays;

// Level 1 can now use cached data
const allSteps = await fetchSteps(recipeIds);
cachedSteps = allSteps;
```

### Challenge 4: Conditional queries
**Issue:** Some queries only run if certain conditions are met  
**Solution:** Use conditional promises with null fallbacks

```typescript
const [
  result1,
  result2,
  result3
] = await Promise.all([
  query1(),
  condition ? query2() : Promise.resolve(null),
  query3()
]);
```

---

## Risk Assessment

### Low Risk
✅ **Logic preservation** - No business logic changes  
✅ **Data consistency** - Dependencies respected  
✅ **Error handling** - Can be maintained with Promise.allSettled  
✅ **Cache timing** - Controlled by explicit Level boundaries  

### Medium Risk
⚠️ **Complexity** - More code upfront, but clearer dependencies  
⚠️ **Testing** - Need to verify all combinations work  
⚠️ **Database load** - 10 concurrent queries instead of 1 at a time  

### Mitigation
- Use Promise.allSettled for robust error handling
- Test thoroughly with various data scenarios
- Monitor database connection pool usage
- Keep clear comments about dependency levels

---

## Testing Plan

### 1. Functional Testing
- [ ] All tasks display correctly
- [ ] Supplemental tasks include all trays
- [ ] Seeding/soaking tasks calculated correctly
- [ ] Harvest tasks show correct readiness
- [ ] Watering tasks created properly
- [ ] Maintenance tasks filtered correctly
- [ ] Completed tasks filtered out

### 2. Performance Testing
- [ ] Measure before/after load times
- [ ] Verify ~2.6 second improvement
- [ ] Check database query logs
- [ ] Monitor connection pool usage
- [ ] Test with varying data sizes

### 3. Edge Cases
- [ ] Empty result sets from Level 0
- [ ] Query failures in Level 0
- [ ] Query failures in Level 1
- [ ] Missing dependencies (empty arrays)
- [ ] Large result sets (100+ trays)

### 4. Error Scenarios
- [ ] Database timeout
- [ ] Network interruption
- [ ] Partial failure (some queries succeed)
- [ ] AbortSignal triggered mid-execution

---

## Next Steps

1. **Refactor fetchMaintenanceTasks** to accept optional pre-fetched completions
2. **Create Level 0 parallel structure** with all independent queries
3. **Extract IDs** from Level 0 results for Level 1
4. **Create Level 1 parallel structure** with dependent queries
5. **Add Level 2** for final dependent query
6. **Update error handling** to use Promise.allSettled
7. **Test thoroughly** with various scenarios
8. **Monitor performance** in production

---

## Conclusion

Parallelizing fetchDailyTasks queries offers massive performance gains:
- **76% faster** (3.4s → 0.8s)
- **Better database utilization** (concurrent queries)
- **Clearer dependencies** (explicit Level grouping)
- **Maintained correctness** (dependencies respected)

The implementation is straightforward with Promise.all() and has low risk when dependencies are properly managed.

**Estimated Impact:** This is a **CRITICAL high-impact optimization** that eliminates the sequential waterfall delay and dramatically improves page load time.
