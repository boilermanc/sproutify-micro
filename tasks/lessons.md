# Lessons Learned

## Template
- **Failure**: What went wrong
- **Signal**: How it was detected
- **Prevention**: Rule to avoid it

---

## Lessons

### 2026-02-04: Trigger-Code Column Mismatch (harvest_date NULL bug)

- **Failure**: Batch harvest set `harvest_date` on trays, but the database trigger `update_harvest_date` on `tray_steps` overwrote it to NULL. Tray 197 ended up with `status='harvested'` but `harvest_date=NULL`.

- **Signal**: User reported inconsistency: 3 of 4 trays had `harvest_date` set, one had NULL despite same batch harvest operation.

- **Root Cause**:
  - The trigger reads `NEW.completed_date` from `tray_steps`
  - The batch harvest code only set `completed_at`, NOT `completed_date`
  - Trigger fired and set `harvest_date = NULL` (from the unset `completed_date`)

- **Prevention Rules**:
  1. When updating `tray_steps` to `status='Completed'`, ALWAYS set BOTH `completed_at` AND `completed_date`
  2. Before modifying tables with triggers, verify which columns the trigger reads
  3. Check for dual timestamp columns (`completed_date` vs `completed_at`) that may have been added over time

- **Fix**: DailyFlow.tsx batch harvest now sets both `completed_date` and `completed_at` with the same timestamp
