import { getSupabaseClient } from '@/lib/supabaseClient';
import { localDateString } from '@/lib/dateUtils';
import { completeSeedTask, completeTask, type DailyTask } from '@/services/dailyFlowService';
import { preparationTraysRemaining, seedBatchAvailableGrams } from '@/services/workerTasks';
import { isHarvestAction } from '@/lib/taskActions';
import { performFarmOperation, hasPendingFarmOperation, fetchPreparationStatus, noFarmWorkCapabilities, type FarmWorkCapabilities } from '@/services/farmWorkBackend';

export type WorkKind = 'seed' | 'soak' | 'harvest' | 'water' | 'step';
export const workKind = (task: DailyTask): WorkKind => {
  const action = task.action.trim().toLowerCase();
  if (action === 'seed') return 'seed';
  if (action === 'soak') return 'soak';
  if (isHarvestAction(task.action)) return 'harvest';
  if (action.includes('water')) return 'water';
  return 'step';
};

export interface WorkBatch { id: number; label: string; availableGrams: number }
export interface SeedOptions { batches: WorkBatch[]; gramsPerTray: number; requiresSoak?: boolean }

function farmSession() {
  const session = JSON.parse(localStorage.getItem('sproutify_session') || '{}');
  if (!session.farmUuid || !session.userId) throw new Error('Sign in again before recording farm work.');
  return session as { farmUuid: string; userId: string; role: string };
}

// Use the recipe's variety identity, not its display name. Inventory includes
// transactions and unit conversion, matching the existing worker inventory path.
export async function loadWorkSeedOptions(task: DailyTask, capabilities: FarmWorkCapabilities = noFarmWorkCapabilities): Promise<SeedOptions> {
  const { farmUuid } = farmSession();
  const client = getSupabaseClient();
  const { data: recipe, error: recipeError } = await client.from('recipes')
    .select('variety_id, seed_quantity, seed_quantity_unit, seed_quantity_grams')
    .eq('farm_uuid', farmUuid).eq('recipe_id', task.recipeId).single();
  if (recipeError || !recipe?.variety_id) throw new Error('The recipe variety could not be verified. Open the recipe before recording this work.');
  const { data: variety, error: varietyError } = await client.from('varieties')
    .select('name, seed_quantity_grams').eq('varietyid', recipe.variety_id).single();
  if (varietyError || !variety) throw new Error('The crop variety could not be verified.');
  let gramsPerTray = Number(recipe.seed_quantity_grams ?? 0);
  if (!(gramsPerTray > 0) && Number(recipe.seed_quantity) > 0) {
    gramsPerTray = seedBatchAvailableGrams(Number(recipe.seed_quantity), [], recipe.seed_quantity_unit || 'grams');
  }
  if (!(gramsPerTray > 0)) gramsPerTray = Number(variety.seed_quantity_grams ?? 0);
  const preparation = capabilities.seed || capabilities.soak ? (await fetchPreparationStatus()).find(row => row.request_id === task.requestId) : undefined;
  if (preparation?.blocked_soaked_stock) throw new Error('Prepared seed includes legacy units or incomplete tray quantities. Ask an owner to reconcile this stock before recording more seeding or soaking.');
  if (capabilities.seed || capabilities.soak) gramsPerTray = Number(preparation?.seed_grams_per_tray);
  if (!Number.isFinite(gramsPerTray) || gramsPerTray <= 0) throw new Error('Set a positive seed weight per tray in the recipe first.');
  const { data: batches, error: batchesError } = await client.from('seedbatches')
    .select('batchid, quantity, unit, lot_number, is_active, status').eq('farm_uuid', farmUuid)
    .eq('varietyid', recipe.variety_id).order('purchasedate', { ascending: true });
  if (batchesError) throw new Error('Seed batches could not be loaded. No work has been recorded.');
  const { data: transactions, error: transactionsError } = await client.from('seed_transactions')
    .select('batch_id, quantity_grams').eq('farm_uuid', farmUuid);
  if (transactionsError) throw new Error('Seed inventory could not be checked. No work has been recorded.');
  return {
    gramsPerTray, requiresSoak: preparation?.requires_soak,
    batches: (batches || []).filter(batch => preparation?.requires_soak && workKind(task) === 'seed'
      || !(capabilities.seed || capabilities.soak)
      || batch.is_active === true && !['inactive', 'depleted'].includes(batch.status)).map(batch => ({
      id: batch.batchid,
      label: `${variety.name} · ${batch.lot_number || `Batch ${batch.batchid}`}`,
      availableGrams: preparation?.requires_soak && workKind(task) === 'seed'
        ? (preparation.batches.find(held => held.batch_id === batch.batchid)?.available_soaked_grams ?? 0)
        : seedBatchAvailableGrams(Number(batch.quantity), (transactions || []).filter(tx => tx.batch_id === batch.batchid), batch.unit || 'lbs'),
    })).filter(batch => batch.availableGrams > 0),
  };
}

export interface WorkInput { quantity: string; batchId: string; weight: string; trayIds: number[] }

export function workValidation(task: DailyTask, input: WorkInput, options: SeedOptions | null, capabilities: FarmWorkCapabilities = noFarmWorkCapabilities): string | null {
  const kind = workKind(task);
  // The legacy soak writer mutates purchased quantity and adds a negative
  // transaction, while this inventory path sums both. It also swallows errors.
  // Keep the new entry point closed until that write contract is repaired.
  if (kind === 'soak' && !capabilities.soak) return 'Soaking cannot be saved here until its seed inventory and completion write is made reliable. Inventory reconciliation is needed; do not retry through another screen.';
  if (kind === 'seed' || kind === 'soak') {
    if (!task.requestId) return 'This task has no seeding request. Use the detailed planting workflow to reconcile it first.';
    const count = Number(input.quantity);
    if (!Number.isInteger(count) || count <= 0 || count > preparationTraysRemaining(task)) return 'Enter a whole number of trays between 1 and the remaining quantity.';
    const batch = options?.batches.find(item => item.id === Number(input.batchId));
    if (!batch || !options) return 'Choose an available seed batch for this crop.';
    const needed = kind === 'soak' ? Number(input.weight) : count * options.gramsPerTray;
    if (!Number.isFinite(needed) || needed <= 0) return 'Enter a positive, finite seed weight in grams.';
    if (kind === 'soak' && capabilities.soak && Math.abs(needed - count * options.gramsPerTray) > 1e-8) return 'The actual grams must match the recipe weight for these whole trays. Correct the tray count or review the recipe before saving.';
    if (needed > batch.availableGrams) return 'This batch does not have enough seed. Reduce the quantity or choose another batch.';
  } else {
    const ids = new Set(input.trayIds);
    if (ids.size !== input.trayIds.length || input.trayIds.some(id => !task.trayIds.includes(id))) return 'The selected trays are no longer part of this task. Refresh before continuing.';
    if (!ids.size && !(kind === 'water' && capabilities.care)) return kind === 'water' ? 'Check-only visits cannot be saved yet. Close without recording watering.' : 'Select at least one whole tray.';
    if (kind === 'water' && !capabilities.care && (ids.size !== new Set(task.trayIds).size || ids.size !== task.trays)) return 'Partial watering cannot be saved safely yet: the current backend records the entire crop group. Close without recording it.';
    if (kind === 'harvest' && input.weight.trim() && (!Number.isFinite(Number(input.weight)) || Number(input.weight) <= 0)) return 'Enter a positive, finite total harvest weight, or leave it blank.';
    if (kind === 'step' && !task.stepId) return 'This task has no verified recipe step. Use the detailed workflow before recording completion.';
  }
  return null;
}

export async function recordFarmWork(task: DailyTask, input: WorkInput, options: SeedOptions | null, capabilities: FarmWorkCapabilities = noFarmWorkCapabilities): Promise<void> {
  const session = farmSession();
  const kind = workKind(task);
  const today = localDateString();
  const client = getSupabaseClient();
  const identity = `${kind}:${task.requestId ?? `${task.recipeId}:${[...task.trayIds].sort((a,b)=>a-b).join(',')}`}:${today}:${task.quantityCompleted ?? 0}`;
  const validation = workValidation(task, input, options, capabilities);
  if (validation && !hasPendingFarmOperation(identity)) throw new Error(validation);
  const equalIds = (value: unknown, expected: number[]) => Array.isArray(value) && value.length === expected.length && [...value].sort((a,b)=>Number(a)-Number(b)).every((id,index)=>id === [...expected].sort((a,b)=>a-b)[index]);
  if (kind === 'water' && capabilities.care) {
    if (!task.trayIds.length) throw new Error('No checked trays are available. Refresh Growing.');
    await performFarmOperation(identity, 'record_crop_care', {
      p_tray_ids: [...new Set(task.trayIds)].sort((a,b)=>a-b),
      p_watered_tray_ids: [...input.trayIds].sort((a,b)=>a-b), p_care_date: today, p_notes: null,
    }, data => equalIds(data.checked_tray_ids, [...new Set(task.trayIds)]) && equalIds(data.watered_tray_ids, input.trayIds) && data.care_date === today);
    return;
  }
  if ((kind === 'seed' && capabilities.seed) || (kind === 'soak' && capabilities.soak)) {
    const quantity = Number(input.quantity);
    const payload: Record<string, unknown> = {p_request_id: task.requestId, p_quantity: quantity, p_seedbatch_id: Number(input.batchId), p_work_date: today};
    if (kind === 'soak') payload.p_seed_grams = Number(input.weight);
    await performFarmOperation(identity, kind === 'seed' ? 'record_seed_work' : 'record_soak_work', payload, data => {
      if (data.request_id !== task.requestId || data.quantity !== quantity || data.work_date !== today) return false;
      if (kind === 'soak') return Number.isInteger(data.soaked_id) && Number(data.soaked_id) > 0 && Number(data.seed_grams) === Number(input.weight);
      return Array.isArray(data.tray_ids) && new Set(data.tray_ids).size === quantity && data.tray_ids.every(id=>Number.isInteger(id) && id > 0)
        && data.quantity_completed === (task.quantityCompleted ?? 0) + quantity
        && data.status === (data.quantity_completed === task.quantity ? 'completed' : 'in_progress');
    });
    return;
  }
  if (kind === 'seed' || kind === 'soak') {
    if (!['Owner', 'Editor'].includes(session.role)) throw new Error('Ask an owner to record seeding and soaking until the backend permission fix is released.');
    const freshOptions = await loadWorkSeedOptions(task);
    const inventoryError = workValidation(task, input, freshOptions);
    if (inventoryError) throw new Error(inventoryError);
    const result = await completeSeedTask(task.requestId!, Number(input.quantity), Number(input.batchId), undefined, task.recipeId, today);
    if (result !== Number(input.quantity)) throw new Error('Seeding needs reconciliation before another attempt.');
    return;
  }
  const selectedTask: DailyTask = { ...task, action: kind === 'water' ? 'Water' : task.action, trayIds: input.trayIds, trays: input.trayIds.length };
  if (kind === 'water') {
    // Completion is recipe-wide, even if a caller displays only one sowing group.
    const { data: active, error } = await client.from('trays').select('tray_id')
      .eq('farm_uuid', session.farmUuid).eq('recipe_id', task.recipeId).is('harvest_date', null).neq('status', 'lost');
    if (error || !active || active.length !== input.trayIds.length || active.some(tray => !input.trayIds.includes(tray.tray_id))) throw new Error('Watering is recorded for every active tray of this recipe. This selection does not cover that whole crop. Close without recording watering.');
  }
  if (kind === 'harvest') {
    const { data: before, error } = await client.from('trays').select('tray_id, status, harvest_date')
      .eq('farm_uuid', session.farmUuid).in('tray_id', input.trayIds);
    if (error || before?.length !== input.trayIds.length || before.some(tray => tray.harvest_date || ['harvested', 'lost'].includes(tray.status))) throw new Error('Refresh the tray group: one or more trays cannot be harvested.');
  }
  const result = await completeTask(selectedTask, kind === 'harvest' && input.weight.trim() ? Number(input.weight) : undefined, undefined, today);
  if (!result) throw new Error('Completion was not confirmed. Reconcile this task before trying again.');
  if (kind === 'harvest') {
    const { data: after, error } = await client.from('trays').select('tray_id, status, harvest_date, yield')
      .eq('farm_uuid', session.farmUuid).in('tray_id', input.trayIds);
    const expected = input.weight.trim() ? Number(input.weight) / input.trayIds.length : null;
    if (error || after?.length !== input.trayIds.length || after.some(tray => !tray.harvest_date || tray.status !== 'harvested' || (expected !== null && (!Number.isFinite(Number(tray.yield)) || Math.abs(Number(tray.yield) - expected) > 0.01)))) throw new Error('The harvest could not be reconciled. Check the selected trays before trying again.');
  }
  if (kind === 'step' || (kind === 'harvest' && task.stepId)) {
    const { data: after, error } = await client.from('tray_steps').select('tray_id, completed, status')
      .in('tray_id', input.trayIds).eq('step_id', task.stepId!).eq('scheduled_date', today);
    if (error || !after || input.trayIds.some(id => !after.some(row => row.tray_id === id && row.completed && row.status === 'Completed'))) throw new Error('Recipe step completion could not be reconciled. Check the trays before trying again.');
  } else if (kind === 'water') {
    const { data: after, error } = await client.from('task_completions').select('status')
      .eq('farm_uuid', session.farmUuid).eq('recipe_id', task.recipeId).eq('task_type', 'watering').eq('task_date', today);
    if (error || !after?.some(row => row.status === 'completed')) throw new Error('Watering completion could not be reconciled. Check this crop group before trying again.');
  }
}
