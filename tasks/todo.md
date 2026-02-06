# Bug Fix: Harvest workflow must mark order schedules as completed

## Goal
When trays are harvested, automatically find and link the matching `order_schedule`, set `trays.order_schedule_id`, and mark the schedule as `completed`. Then show "Completed Delivery" cards on Daily Flow for today's completed schedules.

## Acceptance Criteria
- Harvesting a tray with `standing_order_id` but no `order_schedule_id` finds the matching schedule for today and links it
- The matched `order_schedule` gets `status = 'completed'`
- If no matching schedule exists, harvesting still works (skip silently)
- Daily Flow shows "Completed Delivery" cards for today's completed schedules
- Existing harvest flow (trays with `order_schedule_id` already set) still works

## Plan

### Part 1: Database Migration (063)
Modify `check_and_complete_order_schedule()` trigger function to handle the case where `order_schedule_id IS NULL`:
1. When tray status changes to 'harvested' and `order_schedule_id IS NULL`:
   - Look up tray's `recipe_id` and `standing_order_id`
   - Find matching `order_schedule` by: `standing_order_id`, `recipe_id`, `farm_uuid`, `scheduled_delivery_date = CURRENT_DATE`, `status IN ('pending', 'generated')`
   - If found: UPDATE tray to set `order_schedule_id`, then check/complete the schedule
   - If not found: skip silently (RETURN NEW)
2. Existing logic (when `order_schedule_id IS NOT NULL`) stays unchanged

Key schema facts (verified against live DB):
- `order_schedules` HAS `farm_uuid` and `recipe_id` columns
- Status constraint: `pending, generated, completed, skipped, partial, substituted`
- Trigger fires: `AFTER UPDATE OF status ON trays WHEN (NEW.status = 'harvested')`
- Updating `order_schedule_id` inside AFTER trigger won't re-fire (trigger only watches `status`)

### Part 2: Frontend — Completed Delivery cards on Daily Flow
1. Add `fetchCompletedDeliveries()` in `dailyFlowService.ts`:
   - Query: `order_schedules` JOIN `standing_orders` JOIN `customers` JOIN `recipes` LEFT JOIN `trays`
   - Filter: `scheduled_delivery_date = today`, `status = 'completed'`, `farm_uuid = ?`
   - Return: customer_name, recipe_name, delivery_date, harvested tray details
2. Add `CompletedDelivery` interface to `dailyFlowService.ts`
3. In `DailyFlow.tsx`:
   - Add state for `completedDeliveries`
   - Fetch alongside existing data in `loadTasks`
   - Render "Completed Deliveries" section near the Order Gaps section
   - Green card with checkmark, customer name, product name, delivery date, tray IDs

### Files to modify:
- `supabase/migrations/063_harvest_complete_order_schedules.sql` (NEW)
- `web-admin/src/services/dailyFlowService.ts`
- `web-admin/src/components/DailyFlow.tsx`

## Tasks
- [ ] Create migration 063 to enhance trigger function
- [ ] Run migration against live DB
- [ ] Add fetchCompletedDeliveries to dailyFlowService.ts
- [ ] Add CompletedDelivery interface
- [ ] Add completed deliveries state + fetch to DailyFlow.tsx
- [ ] Add Completed Delivery card UI section
- [ ] Verify build passes
- [ ] Push to main

## Results
(fill in when complete)
