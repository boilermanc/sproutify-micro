import { getSupabaseClient } from '@/lib/supabaseClient';
import { localDateString } from '@/lib/dateUtils';
import type { DailyTask } from '@/services/dailyFlowService';
import type { SeedOptions, WorkInput } from '@/components/workspace/farmWorkActions';

export interface FarmWorkCapabilities { care: boolean; soak: boolean; seed: boolean }
export const noFarmWorkCapabilities: FarmWorkCapabilities = { care: false, soak: false, seed: false };

export async function getFarmWorkCapabilities(): Promise<FarmWorkCapabilities> {
  const { data, error } = await getSupabaseClient().rpc('farm_work_capabilities');
  if (error) {
    if (['PGRST202', '42883'].includes(error.code)) return { ...noFarmWorkCapabilities };
    throw new Error('The farm work update could not be checked. Refresh before recording work.');
  }
  if (!data || ['care', 'soak', 'seed'].some(key => typeof data[key] !== 'boolean')) {
    throw new Error('The farm work update returned an unrecognized version.');
  }
  return { care: data.care, soak: data.soak, seed: data.seed };
}

export class FarmWorkRetryError extends Error {
  readonly retrySafe = true;
  constructor(message = 'The save result was not confirmed. Retry with these same values; the operation key prevents a duplicate record.') {
    super(message);
    this.name = 'FarmWorkRetryError';
  }
}

export class FarmWorkRejectedError extends Error {
  readonly rejected = true;
  constructor() {
    super('No work was saved. Check the crop, remaining quantity and seed stock, then correct the entry.');
    this.name = 'FarmWorkRejectedError';
  }
}

export function farmWorkSession(): { farmUuid: string; userId: string; role: string } {
  const session = JSON.parse(localStorage.getItem('sproutify_session') || '{}');
  if (!session.farmUuid || !session.userId) throw new Error('Sign in again before recording farm work.');
  return session;
}

export interface FarmWorkContext { task: DailyTask; input: WorkInput; options: SeedOptions | null; date: string }
export interface PendingFarmWork {
  key: string; id: string; identity: string; fingerprint: string; rpc: string;
  payload: Record<string, unknown>; context?: FarmWorkContext;
}
const activeContexts = new Map<string, FarmWorkContext>();
const storagePrefix = (session: { farmUuid: string; userId: string }) => `farm-work-operation:${session.farmUuid}:${session.userId}:`;
// A receipt remains the same intent after midnight or a fresh progress snapshot.
const stableIdentity = (identity: string) => identity.replace(/:\d{4}-\d{2}-\d{2}:[^:]+$/, '').replace(/^(seed|soak):/, 'prepare:');
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const uniqueIds = (value: unknown): value is number[] => Array.isArray(value) && value.every(positiveId) && new Set(value).size === value.length;
function validPendingPayload(rpc: string, payload: Record<string, unknown>): boolean {
  if (rpc === 'record_crop_care') return Object.keys(payload).every(key=>['p_tray_ids','p_watered_tray_ids','p_care_date','p_notes'].includes(key))
    && uniqueIds(payload.p_tray_ids) && payload.p_tray_ids.length>0 && payload.p_tray_ids.length<=1000
    && uniqueIds(payload.p_watered_tray_ids) && payload.p_watered_tray_ids.every(id=>(payload.p_tray_ids as number[]).includes(id))
    && validDate(payload.p_care_date) && (payload.p_notes === null || (typeof payload.p_notes === 'string' && payload.p_notes.length<=2000));
  if (!['record_seed_work','record_soak_work'].includes(rpc)) return false;
  const keys = ['p_request_id','p_quantity','p_seedbatch_id','p_work_date',...(rpc === 'record_soak_work' ? ['p_seed_grams'] : [])];
  return Object.keys(payload).every(key=>keys.includes(key)) && positiveId(payload.p_request_id) && positiveId(payload.p_quantity)
    && positiveId(payload.p_seedbatch_id) && (payload.p_work_date === undefined || validDate(payload.p_work_date))
    && (rpc !== 'record_soak_work' || (nonnegative(payload.p_seed_grams) && payload.p_seed_grams>0));
}
function validContext(context: unknown, rpc: string, payload: Record<string, unknown>): context is FarmWorkContext {
  if (!recordObject(context) || !recordObject(context.task) || !recordObject(context.input) || !validDate(context.date)) return false;
  const { task,input,options } = context;
  if (typeof task.id !== 'string' || typeof task.action !== 'string' || !positiveId(task.recipeId) || !Array.isArray(task.trayIds) || !task.trayIds.every(positiveId)
    || !uniqueIds(input.trayIds) || !['quantity','batchId','weight'].every(key=>typeof input[key] === 'string')) return false;
  if (options !== null && (!recordObject(options) || !nonnegative(options.gramsPerTray) || options.gramsPerTray<=0 || !Array.isArray(options.batches)
    || options.batches.some(batch=>!recordObject(batch)||!positiveId(batch.id)||typeof batch.label!=='string'||!nonnegative(batch.availableGrams)))) return false;
  if (rpc === 'record_crop_care') {
    const same = (ids: number[], expected: unknown) => Array.isArray(expected) && new Set(ids).size === expected.length && expected.every(id=>ids.includes(id));
    return task.action.toLowerCase().includes('water') && same(task.trayIds,payload.p_tray_ids) && same(input.trayIds,payload.p_watered_tray_ids) && context.date===payload.p_care_date;
  }
  return task.action.toLowerCase() === (rpc === 'record_seed_work' ? 'seed' : 'soak') && task.requestId===payload.p_request_id
    && Number(input.quantity)===payload.p_quantity && Number(input.batchId)===payload.p_seedbatch_id
    && (payload.p_work_date === undefined || context.date===payload.p_work_date)
    && (rpc !== 'record_soak_work' || Number(input.weight)===payload.p_seed_grams);
}

export function listPendingFarmWork(): PendingFarmWork[] {
  let session: ReturnType<typeof farmWorkSession>;
  try { session = farmWorkSession(); } catch { return []; }
  const prefix = storagePrefix(session);
  const pending: PendingFarmWork[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try {
      const record = JSON.parse(localStorage.getItem(key)!);
      const [rpc, payload] = JSON.parse(record.fingerprint);
      if (typeof record.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.id)
        || typeof rpc !== 'string' || !recordObject(payload) || !validPendingPayload(rpc,payload)) throw new Error();
      const context = record.context;
      if (context && !validContext(context,rpc,payload)) throw new Error();
      pending.push({ key, id: record.id, identity: record.identity || key.slice(prefix.length), fingerprint: record.fingerprint, rpc, payload, ...(context ? { context } : {}) });
    } catch { throw new Error('A retained farm save could not be read. Reconcile this device’s pending record before recording more work.'); }
  }
  return pending;
}

export function hasPendingFarmOperation(identity: string): boolean {
  return listPendingFarmWork().some(record => stableIdentity(record.identity) === stableIdentity(identity));
}

export async function withFarmWorkContext<T>(context: FarmWorkContext, action: () => Promise<T>): Promise<T> {
  const session = farmWorkSession();
  const scope = storagePrefix(session);
  activeContexts.set(scope, JSON.parse(JSON.stringify(context)) as FarmWorkContext);
  try { return await action(); } finally { activeContexts.delete(scope); }
}

function overlappingOperation(record: PendingFarmWork, identity: string, rpc: string, payload: Record<string, unknown>): boolean {
  if (stableIdentity(record.identity) === stableIdentity(identity)) return true;
  if (['record_seed_work','record_soak_work'].includes(rpc) && ['record_seed_work','record_soak_work'].includes(record.rpc)
    && payload.p_request_id !== undefined && payload.p_request_id === record.payload.p_request_id) return true;
  return rpc === 'record_crop_care' && record.rpc === rpc && Array.isArray(payload.p_tray_ids)
    && Array.isArray(record.payload.p_tray_ids) && payload.p_tray_ids.some(id => (record.payload.p_tray_ids as unknown[]).includes(id));
}

export async function retryPendingFarmWork(key: string): Promise<void> {
  const pending = listPendingFarmWork().find(record => record.key === key);
  if (!pending) throw new Error('The retained record is no longer available. Refresh before recording work.');
  const { payload, rpc, context } = pending;
  const equalIds = (value: unknown, expected: unknown) => Array.isArray(value) && Array.isArray(expected)
    && value.length === expected.length && [...value].sort((a,b)=>Number(a)-Number(b)).every((id,index)=>id === [...expected].sort((a,b)=>Number(a)-Number(b))[index]);
  await performFarmOperation(pending.identity,rpc,payload,data => {
    if (rpc === 'record_crop_care') return equalIds(data.checked_tray_ids,payload.p_tray_ids) && equalIds(data.watered_tray_ids,payload.p_watered_tray_ids) && data.care_date === payload.p_care_date;
    if (data.request_id !== payload.p_request_id || data.quantity !== payload.p_quantity) return false;
    if (payload.p_work_date !== undefined && data.work_date !== payload.p_work_date) return false;
    if (rpc === 'record_soak_work') return Number.isInteger(data.soaked_id) && Number(data.soaked_id)>0 && Number(data.seed_grams) === payload.p_seed_grams;
    if (rpc !== 'record_seed_work' || !Array.isArray(data.tray_ids) || data.tray_ids.length !== payload.p_quantity
      || new Set(data.tray_ids).size !== data.tray_ids.length || !data.tray_ids.every(id=>Number.isInteger(id)&&id>0)) return false;
    const expectedCompleted = context ? (context.task.quantityCompleted ?? 0) + Number(payload.p_quantity) : null;
    return Number.isInteger(data.quantity_completed) && (expectedCompleted === null || data.quantity_completed === expectedCompleted)
      && (context?.task.quantity !== undefined ? data.status === (data.quantity_completed === context.task.quantity ? 'completed' : 'in_progress') : ['completed','in_progress'].includes(String(data.status)));
  });
}

// Keep the token BEFORE sending. An interrupted response must reuse the exact
// operation/payload across both entry points, closing the dialog and page reload.
export async function performFarmOperation(
  identity: string, rpc: string, payload: Record<string, unknown>,
  verify: (data: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  const session = farmWorkSession();
  const prefix = storagePrefix(session);
  const fingerprint = JSON.stringify([rpc, payload]);
  if (!validPendingPayload(rpc,payload)) throw new Error('The farm save payload is invalid. Refresh before recording work.');
  const retained = listPendingFarmWork().find(record => overlappingOperation(record,identity,rpc,payload));
  const key = retained?.key || `${prefix}${stableIdentity(identity)}`;
  let operation: { id: string; fingerprint: string; identity: string; context?: FarmWorkContext };
  if (retained) {
    operation = retained;
    if (operation.fingerprint !== fingerprint) throw new Error('An earlier save needs checking before changing these values. Retry the original values or reconcile the recorded work first.');
  } else {
    const savedContext = activeContexts.get(prefix);
    const context = savedContext && rpc === 'record_crop_care' ? {...savedContext,date:payload.p_care_date as string} : savedContext;
    if (context && !validContext(context,rpc,payload)) throw new Error('The farm save context could not be verified. Refresh before recording work.');
    operation = { id: crypto.randomUUID(), fingerprint, identity, ...(context ? { context } : {}) };
    localStorage.setItem(key, JSON.stringify(operation));
  }
  try {
    const { data, error } = await getSupabaseClient().rpc(rpc, { ...payload, p_operation_id: operation.id });
    if (error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) && !error.code.startsWith('PGRST')) {
      // A later denial cannot prove an earlier ambiguous request did not commit.
      if (retained) throw new FarmWorkRetryError('The original save is still unconfirmed. Access or crop conditions changed; reconcile or retry this retained record without changing its values.');
      localStorage.removeItem(key);
      throw new FarmWorkRejectedError();
    }
    if (error || !data || data.operation_id !== operation.id || !verify(data)) throw new FarmWorkRetryError();
    localStorage.removeItem(key);
    return data;
  } catch (error) {
    if (error instanceof FarmWorkRejectedError) throw error;
    throw error instanceof FarmWorkRetryError ? error : new FarmWorkRetryError();
  }
}

export interface PreparationStatus {
  request_id: number; recipe_id: number; requires_soak: boolean;
  seed_date: string; soak_date: string | null;
  blocked_soaked_stock?: boolean;
  quantity: number; quantity_completed: number; available_soaked_trays: number;
  available_soaked_grams: number; batches: Array<{batch_id: number; available_soaked_grams: number}>;
  seed_grams_per_tray: number | null;
}
const recordObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const wholeCount = (value: unknown): value is number => nonnegative(value) && Number.isInteger(value);
export async function fetchPreparationStatus(): Promise<PreparationStatus[]> {
  const { data, error } = await getSupabaseClient().rpc('farm_preparation_status', {p_work_date:localDateString()});
  if (error || !Array.isArray(data) || data.some((row: unknown) => !recordObject(row)
    || !positiveId(row.request_id) || !positiveId(row.recipe_id) || typeof row.requires_soak !== 'boolean'
    || !validDate(row.seed_date) || !(row.soak_date === null || validDate(row.soak_date)) || (row.requires_soak && !validDate(row.soak_date))
    || (row.blocked_soaked_stock !== undefined && typeof row.blocked_soaked_stock !== 'boolean')
    || !wholeCount(row.quantity) || !wholeCount(row.quantity_completed) || row.quantity_completed > row.quantity
    || !wholeCount(row.available_soaked_trays) || !nonnegative(row.available_soaked_grams)
    || !(row.seed_grams_per_tray === null || (nonnegative(row.seed_grams_per_tray) && row.seed_grams_per_tray > 0))
    || !Array.isArray(row.batches) || row.batches.some(batch => !recordObject(batch) || !positiveId(batch.batch_id) || !nonnegative(batch.available_soaked_grams)))) {
    throw new Error('Prepared seed could not be checked. Refresh before recording seeding or soaking.');
  }
  return data;
}

export async function fetchCareChecks(date = new Date()): Promise<Array<{tray_id: number; watered: boolean}>> {
  const { farmUuid } = farmWorkSession();
  const checks: Array<{tray_id: number; watered: boolean}> = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await getSupabaseClient().from('farm_care_checks')
      .select('tray_id,watered').eq('farm_uuid', farmUuid).eq('care_date', localDateString(date))
      .order('checked_at').order('operation_id').order('tray_id').range(offset, offset + 499);
    if (error || !Array.isArray(data) || data.some((row: unknown) => !recordObject(row) || !positiveId(row.tray_id) || typeof row.watered !== 'boolean')) throw new Error('Crop checks could not be loaded. Refresh before recording care.');
    checks.push(...(data ?? []));
    if (!data || data.length < 500) return checks;
  }
}
