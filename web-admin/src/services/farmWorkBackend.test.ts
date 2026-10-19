import { beforeEach, expect, it, vi } from 'vitest';
import { fetchCareChecks, fetchPreparationStatus, getFarmWorkCapabilities, listPendingFarmWork, performFarmOperation, retryPendingFarmWork, withFarmWorkContext, FarmWorkRetryError, FarmWorkRejectedError } from './farmWorkBackend';
import type { DailyTask } from './dailyFlowService';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabaseClient', () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
const carePayload = {p_tray_ids:[1],p_watered_tray_ids:[],p_care_date:'2026-10-18',p_notes:null};
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  localStorage.setItem('sproutify_session', JSON.stringify({farmUuid:'farm-a',userId:'hand-a',role:'Farm Hand'}));
});

it('keeps new writers disabled on the existing backend without the capability RPC', async () => {
  mocks.rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}});
  expect(await getFarmWorkCapabilities()).toEqual({care:false,soak:false,seed:false});
});
it('does not treat denied or malformed capability reads as an installed backend', async () => {
  mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'42501'}}).mockResolvedValueOnce({data:{care:true},error:null});
  await expect(getFarmWorkCapabilities()).rejects.toThrow('could not be checked');
  await expect(getFarmWorkCapabilities()).rejects.toThrow('unrecognized');
});
it('retains the same operation key for a safe retry after an interrupted response', async () => {
  mocks.rpc.mockRejectedValueOnce(new Error('Connection interrupted'));
  await expect(performFarmOperation('care:1','record_crop_care',carePayload,()=>true)).rejects.toBeInstanceOf(FarmWorkRetryError);
  const first = mocks.rpc.mock.calls[0][1].p_operation_id;
  mocks.rpc.mockImplementationOnce(async (_name, args) => ({data:{operation_id:args.p_operation_id},error:null}));
  await performFarmOperation('care:1','record_crop_care',carePayload,()=>true);
  expect(mocks.rpc.mock.calls[1][1].p_operation_id).toBe(first);
  expect(Object.keys(localStorage).filter(key=>key.startsWith('farm-work-operation:'))).toHaveLength(0);
});
it('never issues a different payload under an unresolved operation', async () => {
  mocks.rpc.mockRejectedValueOnce(new Error('Disconnected'));
  await expect(performFarmOperation('seed:1','record_seed_work',{p_request_id:1,p_quantity:2,p_seedbatch_id:34},()=>true)).rejects.toThrow();
  await expect(performFarmOperation('seed:1','record_seed_work',{p_request_id:1,p_quantity:1,p_seedbatch_id:34},()=>true)).rejects.toThrow('earlier save');
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it('allows correction after a definite database rollback', async () => {
  mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'23514'}});
  await expect(performFarmOperation('soak:1','record_soak_work',{p_request_id:1,p_quantity:2,p_seedbatch_id:34,p_seed_grams:40},()=>true)).rejects.toBeInstanceOf(FarmWorkRejectedError);
  expect(Object.keys(localStorage).filter(key=>key.startsWith('farm-work-operation:'))).toHaveLength(0);
});
it('retains the token when the response identity or receipt is unconfirmed', async () => {
  mocks.rpc.mockResolvedValueOnce({data:{operation_id:'wrong'},error:null});
  await expect(performFarmOperation('care:1','record_crop_care',carePayload,()=>true)).rejects.toBeInstanceOf(FarmWorkRetryError);
  expect(Object.keys(localStorage).filter(key=>key.startsWith('farm-work-operation:'))).toHaveLength(1);
});
it('does not send work if a durable retry key cannot be saved', async () => {
  const failure = vi.spyOn(Storage.prototype,'setItem').mockImplementationOnce(()=>{throw new Error('Storage unavailable');});
  await expect(performFarmOperation('care:1','record_crop_care',carePayload,()=>true)).rejects.toThrow('Storage unavailable');
  expect(mocks.rpc).not.toHaveBeenCalled(); failure.mockRestore();
});

const pendingTask: DailyTask = { id:'seed-99', action:'Seed', crop:'Pea', batchId:'34', location:'Shelf A', dayCurrent:0, dayTotal:10, trays:2, trayIds:[], recipeId:42, requestId:99, quantity:5, quantityCompleted:0, status:'pending' };
const context = {task:pendingTask,input:{quantity:'2',batchId:'34',weight:'',trayIds:[]},options:{gramsPerTray:20,batches:[{id:34,label:'Pea',availableGrams:40}]},date:'2026-10-18'};
const seedPayload = {p_request_id:99,p_quantity:2,p_seedbatch_id:34};

it('persists original task, inputs and options before sending and restores them after a module reload', async () => {
  mocks.rpc.mockImplementationOnce(async () => {
    expect(listPendingFarmWork()[0].context).toEqual(context);
    throw new Error('Response interrupted');
  });
  await expect(withFarmWorkContext(context,()=>performFarmOperation('seed:99:2026-10-18:0','record_seed_work',seedPayload,()=>true))).rejects.toBeInstanceOf(FarmWorkRetryError);
  const original = listPendingFarmWork()[0];
  vi.resetModules();
  const reloaded = await import('./farmWorkBackend');
  expect(reloaded.listPendingFarmWork()[0].context).toEqual(context);
  mocks.rpc.mockImplementationOnce(async (_name,args)=>({data:{operation_id:args.p_operation_id,request_id:99,quantity:2,tray_ids:[101,102],quantity_completed:2,status:'in_progress'},error:null}));
  await reloaded.retryPendingFarmWork(original.key);
  expect(mocks.rpc.mock.calls[1][1].p_operation_id).toBe(original.id);
  expect(reloaded.listPendingFarmWork()).toEqual([]);
});

it('blocks a changed quantity after date and progress advance instead of issuing a fresh operation', async () => {
  mocks.rpc.mockRejectedValueOnce(new Error('Uncertain result'));
  await expect(performFarmOperation('seed:99:2026-10-18:0','record_seed_work',seedPayload,()=>true)).rejects.toThrow();
  await expect(performFarmOperation('seed:99:2026-10-19:2','record_seed_work',{...seedPayload,p_quantity:1},()=>true)).rejects.toThrow('earlier save');
  await expect(performFarmOperation('soak:99:2026-10-19:2','record_soak_work',{...seedPayload,p_seed_grams:40},()=>true)).rejects.toThrow('earlier save');
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it('reuses an unresolved token after date and progress change when payload is identical', async () => {
  mocks.rpc.mockRejectedValueOnce(new Error('Disconnected'));
  await expect(performFarmOperation('seed:99:2026-10-18:0','record_seed_work',seedPayload,()=>true)).rejects.toThrow();
  const id = listPendingFarmWork()[0].id;
  mocks.rpc.mockImplementationOnce(async (_name,args)=>({data:{operation_id:args.p_operation_id},error:null}));
  await performFarmOperation('seed:99:2026-10-19:2','record_seed_work',seedPayload,()=>true);
  expect(mocks.rpc.mock.calls[1][1].p_operation_id).toBe(id);
});

it('blocks overlapping care groups and replays the original local date after reload', async () => {
  const payload = {p_tray_ids:[1,2],p_watered_tray_ids:[2],p_care_date:'2026-10-18',p_notes:null};
  mocks.rpc.mockRejectedValueOnce(new Error('Disconnected'));
  await expect(performFarmOperation('water:42:1,2:2026-10-18:0','record_crop_care',payload,()=>true)).rejects.toThrow();
  const pending = listPendingFarmWork()[0];
  await expect(performFarmOperation('water:42:2,3:2026-10-19:0','record_crop_care',{...payload,p_tray_ids:[2,3],p_care_date:'2026-10-19'},()=>true)).rejects.toThrow('earlier save');
  mocks.rpc.mockImplementationOnce(async (_name,args)=>({data:{operation_id:args.p_operation_id,checked_tray_ids:[1,2],watered_tray_ids:[2],care_date:args.p_care_date},error:null}));
  await retryPendingFarmWork(pending.key);
  expect(mocks.rpc.mock.calls[1][1]).toMatchObject({p_operation_id:pending.id,p_care_date:'2026-10-18',p_tray_ids:[1,2]});
});

it('does not discard an uncertain original receipt merely because a later retry is denied', async () => {
  mocks.rpc.mockRejectedValueOnce(new Error('Disconnected'));
  await expect(performFarmOperation('seed:99','record_seed_work',seedPayload,()=>true)).rejects.toThrow();
  const original = listPendingFarmWork()[0];
  mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'42501'}});
  await expect(performFarmOperation('seed:99','record_seed_work',seedPayload,()=>true)).rejects.toBeInstanceOf(FarmWorkRetryError);
  expect(listPendingFarmWork()[0].id).toBe(original.id);
});

it('isolates durable pending context by farm and actor and supports no-session reads', async () => {
  mocks.rpc.mockRejectedValueOnce(new Error('Disconnected'));
  await expect(performFarmOperation('seed:99','record_seed_work',seedPayload,()=>true)).rejects.toThrow();
  localStorage.setItem('sproutify_session',JSON.stringify({farmUuid:'farm-a',userId:'other-person',role:'Owner'}));
  expect(listPendingFarmWork()).toEqual([]);
  localStorage.removeItem('sproutify_session'); expect(listPendingFarmWork()).toEqual([]);
});

it('blocks all new writes if this actor has an unreadable retained record', async () => {
  localStorage.setItem('farm-work-operation:farm-a:hand-a:prepare:99','not json');
  await expect(performFarmOperation('seed:100','record_seed_work',{...seedPayload,p_request_id:100},()=>true)).rejects.toThrow('could not be read');
  expect(mocks.rpc).not.toHaveBeenCalled();
});

const validPreparation = {request_id:99,recipe_id:42,requires_soak:true,seed_date:'2026-10-18',soak_date:'2026-10-17',quantity:5,quantity_completed:1,available_soaked_trays:2,available_soaked_grams:40,seed_grams_per_tray:20,batches:[{batch_id:34,available_soaked_grams:40}],recipe_name:'Pea',source_type:'market'};
it('validates preparation rows and preserves recipe, source and batch metadata', async () => {
  mocks.rpc.mockResolvedValueOnce({data:[validPreparation],error:null});
  expect(await fetchPreparationStatus()).toEqual([validPreparation]);
});

it.each([
  {request_id:0},{recipe_id:1.5},{requires_soak:'true'},{quantity:-1},{quantity_completed:6},
  {available_soaked_trays:NaN},{available_soaked_grams:Infinity},{seed_grams_per_tray:0},
  {batches:[{batch_id:-1,available_soaked_grams:40}]},{batches:[{batch_id:34,available_soaked_grams:-1}]},
  {seed_date:'invalid'},{soak_date:null},{soak_date:'2026-02-30'},
])('rejects malformed preparation data rather than hiding or inventing work: %j', async invalid => {
  mocks.rpc.mockResolvedValueOnce({data:[{...validPreparation,...invalid}],error:null});
  await expect(fetchPreparationStatus()).rejects.toThrow('could not be checked');
});

function careResult(data: unknown) {
  const query = {select:vi.fn(),eq:vi.fn(),order:vi.fn(),range:vi.fn().mockResolvedValue({data,error:null})};
  query.select.mockReturnValue(query);query.eq.mockReturnValue(query);query.order.mockReturnValue(query);mocks.from.mockReturnValue(query);
}
it('accepts typed care read rows including explicit no-watering observations', async () => {
  careResult([{tray_id:1,watered:false},{tray_id:2,watered:true}]);
  expect(await fetchCareChecks()).toEqual([{tray_id:1,watered:false},{tray_id:2,watered:true}]);
});
it.each([{data:[{tray_id:0,watered:true}]},{data:[{tray_id:1,watered:'false'}]},{data:null}])('rejects malformed care read data: %j', async row => {
  careResult(row.data); await expect(fetchCareChecks()).rejects.toThrow('could not be loaded');
});

it.each([
  ['arbitrary_rpc',{p_request_id:99,p_quantity:2,p_seedbatch_id:34}],
  ['record_seed_work',{p_request_id:0,p_quantity:2,p_seedbatch_id:34}],
  ['record_seed_work',{p_request_id:99,p_quantity:1.5,p_seedbatch_id:34}],
  ['record_soak_work',{p_request_id:99,p_quantity:2,p_seedbatch_id:34,p_seed_grams:NaN}],
  ['record_crop_care',{...carePayload,p_tray_ids:[1,1]}],
  ['record_crop_care',{...carePayload,p_watered_tray_ids:[2]}],
  ['record_crop_care',{...carePayload,p_care_date:'2026-02-30'}],
])('rejects corrupt or unsupported pending payloads before any RPC: %s', async (rpc,payload) => {
  localStorage.setItem('farm-work-operation:farm-a:hand-a:invalid',JSON.stringify({id:crypto.randomUUID(),fingerprint:JSON.stringify([rpc,payload])}));
  await expect(retryPendingFarmWork('farm-work-operation:farm-a:hand-a:invalid')).rejects.toThrow('could not be read');
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('rejects a corrupt operation UUID and mismatched frozen context', async () => {
  const key='farm-work-operation:farm-a:hand-a:invalid';
  localStorage.setItem(key,JSON.stringify({id:'not-a-uuid',fingerprint:JSON.stringify(['record_seed_work',seedPayload])}));
  expect(()=>listPendingFarmWork()).toThrow('could not be read');
  localStorage.setItem(key,JSON.stringify({id:crypto.randomUUID(),fingerprint:JSON.stringify(['record_seed_work',seedPayload]),context:{...context,input:{...context.input,quantity:'4'}}}));
  expect(()=>listPendingFarmWork()).toThrow('could not be read');
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('retains the original grower-local seed work date across UTC midnight and verifies its receipt', async () => {
  const datedPayload={...seedPayload,p_work_date:'2026-10-18'};
  mocks.rpc.mockRejectedValueOnce(new Error('Disconnected at UTC midnight'));
  await expect(withFarmWorkContext(context,()=>performFarmOperation('seed:99:2026-10-18:0','record_seed_work',datedPayload,()=>true))).rejects.toBeInstanceOf(FarmWorkRetryError);
  const pending=listPendingFarmWork()[0];
  mocks.rpc.mockImplementationOnce(async (_name,args)=>({data:{operation_id:args.p_operation_id,request_id:99,quantity:2,tray_ids:[101,102],quantity_completed:2,status:'in_progress',work_date:'2026-10-19'},error:null}));
  await expect(retryPendingFarmWork(pending.key)).rejects.toBeInstanceOf(FarmWorkRetryError);
  expect(listPendingFarmWork()[0].id).toBe(pending.id);
  mocks.rpc.mockImplementationOnce(async (_name,args)=>({data:{operation_id:args.p_operation_id,request_id:99,quantity:2,tray_ids:[101,102],quantity_completed:2,status:'in_progress',work_date:args.p_work_date},error:null}));
  await retryPendingFarmWork(pending.key);
  expect(mocks.rpc.mock.calls[2][1]).toMatchObject({p_operation_id:pending.id,p_work_date:'2026-10-18'});
  expect(listPendingFarmWork()).toEqual([]);
});

it('rejects malformed or mismatched preparation work dates before sending', async () => {
  await expect(performFarmOperation('seed:99','record_seed_work',{...seedPayload,p_work_date:'2026-02-30'},()=>true)).rejects.toThrow('payload is invalid');
  await expect(withFarmWorkContext(context,()=>performFarmOperation('seed:99','record_seed_work',{...seedPayload,p_work_date:'2026-10-19'},()=>true))).rejects.toThrow('context could not be verified');
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('reads preparation availability for the grower-local day while UTC is already tomorrow', async () => {
  vi.stubEnv('TZ','America/New_York');
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-10-19T02:30:00Z'));
    mocks.rpc.mockResolvedValueOnce({data:[validPreparation],error:null});
    await fetchPreparationStatus();
    expect(mocks.rpc).toHaveBeenCalledWith('farm_preparation_status',{p_work_date:'2026-10-18'});
  } finally { vi.useRealTimers(); vi.unstubAllEnvs(); }
});
