# Seeding Step Debug Investigation

## Problem Statement

5 trays have `sow_date` set but their "Seed Trays" or "Seeding" tray_step is still "Pending":

| Tray | Recipe | Sow Date | Seed Step Status |
|------|--------|----------|------------------|
| 75 | Arugula | Dec 10 | Pending ❌ |
| 176 | Purple Basil | Jan 5 | Pending ❌ |
| 184 | Purple Basil | Jan 5 | Pending ❌ |
| 185 | Purple Basil | Jan 5 | Pending ❌ |
| 191 | Pea | Jan 12 | Pending ❌ |

## Root Cause Analysis

### Critical Finding: Missing RPC Function

**The `complete_seed_task` RPC function does not exist in the database!**

```typescript
// web-admin/src/services/dailyFlowService.ts:3848
const { data, error } = await getSupabaseClient().rpc('complete_seed_task', {
  p_request_id: requestId,
  p_quantity_completed: quantityCompleted,
  p_seedbatch_id: seedbatchId,
  p_user_id: userToUse || null,
});
```

**Evidence**:
- Searched all migration files for `CREATE FUNCTION complete_seed_task` - NOT FOUND
- Only found `complete_soak_task` in `045_create_soaking_system.sql`
- Code expects this function to create trays and return the number created

### Where markSeedingTrayStepsCompleted is Called

The function is called in **3 places**:

#### 1. After completing a seeding task (completeTask)
```typescript
// Line 2917-2928
if (task.action === 'Seed') {
  try {
    await markSeedingTrayStepsCompleted({
      farmUuid,
      recipeId: task.recipeId,
      taskDateStr,
      trayIds: task.trayIds,  // ✅ Task should have trayIds
      completedAt: now,
    });
  } catch (seedingError) {
    console.error('[DailyFlow] Error marking seeding tray_steps complete:', seedingError);
  }
}
```

#### 2. After completeSeedTask (from seed_request workflow)
```typescript
// Line 3861-3867
await markSeedingTrayStepsCompleted({
  farmUuid,
  recipeId,
  taskDateStr,
  trayIds,  // ⚠️ May be undefined or empty
  completedAt: new Date().toISOString(),
});
```

#### 3. In useLeftoverSoakedSeed
```typescript
// Line ~3950 (not shown but referenced in grep results)
```

### Step Name Variations Found

From query 2, the seeding steps have **different names**:

- **"Seed Trays"**: Arugula (step_id 48), Pea (step_id 80)
- **"Seeding"**: Purple Basil (step_id 42)

✅ **Good news**: The code handles this correctly:
```typescript
// Line 3158
} else if (stepNameLower.includes('seed')) {
  seedSteps.push(step.step_id);
}
```

Both "seed trays" and "seeding" contain "seed", so they should be detected.

## What the Debug Logging Will Show

The enhanced `markSeedingTrayStepsCompleted` function now logs:

1. **Input parameters** - What farmUuid, recipeId, trayIds it receives
2. **Steps found** - Which seed/soak step_ids were found for the recipe
3. **Farm trays** - All active trays for this farm/recipe
4. **Effective tray IDs** - After filtering with provided trayIds (if any)
5. **Tray steps query** - What it's searching for
6. **Tray steps found** - The actual tray_steps records to update
7. **Update results** - Success or failure for each type (seeding/soaking)

### Most Likely Scenarios

The debug logs will reveal one of these issues:

#### Scenario A: tray_steps don't exist
```
⚠️ [markSeedingTrayStepsCompleted] No tray_steps found to update!
  - Either tray_steps records don't exist for these trays
```

**Why**: These trays were created without the `tray_steps` records being initialized.

**Solution**: Run a migration or script to create missing `tray_steps` for existing trays.

#### Scenario B: Wrong trayIds parameter
```
⚠️ [markSeedingTrayStepsCompleted] No matching trays after filtering
providedTrayIds: undefined or []
```

**Why**: `completeSeedTask` is called without knowing which trays were created.

**Solution**: The missing `complete_seed_task` RPC function should return the tray IDs created.

#### Scenario C: Date filter mismatch
```
📊 [markSeedingTrayStepsCompleted] Found tray_steps to update: 0
```

**Why**: The `scheduled_date` filter might be excluding the tray_steps.

**Solution**: Check what `scheduled_date` values the tray_steps have.

## Required Database Query

To confirm Scenario A, run:

```sql
-- Check if tray_steps exist for these 5 trays
SELECT 
  t.tray_id,
  t.tray_unique_id,
  r.recipe_name,
  t.sow_date,
  COUNT(ts.tray_id) as tray_steps_count
FROM trays t
LEFT JOIN tray_steps ts ON t.tray_id = ts.tray_id
LEFT JOIN recipes r ON t.recipe_id = r.recipe_id
WHERE t.tray_id IN (75, 176, 184, 185, 191)
GROUP BY t.tray_id, t.tray_unique_id, r.recipe_name, t.sow_date;
```

**Expected result if Scenario A**:
```
tray_id | tray_steps_count
--------|------------------
75      | 0
176     | 0
184     | 0
185     | 0
191     | 0
```

## Next Steps

### 1. Test with New Seeding
Create a new tray and watch the browser console for logs starting with:
```
🔍 [markSeedingTrayStepsCompleted] CALLED
```

### 2. Check Database
Run the query above to confirm if tray_steps exist.

### 3. Create Missing RPC Function
Need to create `complete_seed_task` function that:
- Takes a `tray_creation_request` ID
- Creates the actual tray(s)
- Creates `tray_steps` for each tray
- Returns array of tray IDs created

Example skeleton:
```sql
CREATE OR REPLACE FUNCTION complete_seed_task(
  p_request_id INTEGER,
  p_quantity_completed INTEGER,
  p_seedbatch_id INTEGER,
  p_user_id UUID
)
RETURNS INTEGER -- Number of trays created
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tray_id INTEGER;
  v_trays_created INTEGER := 0;
BEGIN
  -- Get request details
  -- Create trays
  -- Create tray_steps for each tray
  -- Return count
  RETURN v_trays_created;
END;
$$;
```

### 4. Fix Historical Data
If tray_steps are missing for existing trays, create a migration:

```sql
-- Create missing tray_steps for existing trays
INSERT INTO tray_steps (tray_id, step_id, completed, scheduled_date)
SELECT 
  t.tray_id,
  s.step_id,
  CASE 
    WHEN s.sequence_order = 1 THEN true  -- First step (seeding) is complete
    ELSE false
  END as completed,
  CASE
    WHEN s.sequence_order = 1 AND t.sow_date IS NOT NULL 
    THEN t.sow_date::date  -- Set seeding step date to sow_date
    ELSE NULL
  END as scheduled_date
FROM trays t
JOIN steps s ON s.recipe_id = t.recipe_id
WHERE NOT EXISTS (
  SELECT 1 FROM tray_steps ts 
  WHERE ts.tray_id = t.tray_id AND ts.step_id = s.step_id
)
AND t.harvest_date IS NULL;  -- Only active trays
```

## Files Modified

- ✅ `web-admin/src/services/dailyFlowService.ts` - Added debug logging to `markSeedingTrayStepsCompleted`

## Files That Need Creation

- ⚠️ `supabase/migrations/046_create_complete_seed_task_function.sql` - Create the missing RPC
- ⚠️ `supabase/migrations/047_create_missing_tray_steps.sql` - Fix historical data
