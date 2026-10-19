import { beforeEach, expect, it, vi } from 'vitest';
import { recordFarmWork, workValidation, type SeedOptions, type WorkInput } from './farmWorkActions';
import type { DailyTask } from '@/services/dailyFlowService';

const mocks = vi.hoisted(() => ({rpc:vi.fn(),legacy:vi.fn()}));
vi.mock('@/lib/supabaseClient', () => ({getSupabaseClient:()=>({rpc:mocks.rpc})}));
vi.mock('@/services/dailyFlowService', () => ({completeTask:mocks.legacy,completeSeedTask:mocks.legacy}));
const caps = {care:true,soak:true,seed:true};
const base: DailyTask = {id:'a',action:'Water',crop:'Radish',batchId:'',location:'Rack A',dayCurrent:2,dayTotal:10,trays:2,trayIds:[1,2],recipeId:7,status:'pending'};
const input: WorkInput = {quantity:'1',batchId:'4',weight:'25',trayIds:[]};
const stock: SeedOptions = {gramsPerTray:25,batches:[{id:4,label:'Batch 4',availableGrams:100}]};
beforeEach(()=>{
  vi.clearAllMocks();localStorage.clear();
  localStorage.setItem('sproutify_session',JSON.stringify({farmUuid:'farm-a',userId:'hand-a',role:'Farm Hand'}));
});
it('records a dry check as checked trays with no watered trays',async()=>{
  mocks.rpc.mockImplementationOnce(async(_name,args)=>({data:{operation_id:args.p_operation_id,checked_tray_ids:args.p_tray_ids,watered_tray_ids:args.p_watered_tray_ids,care_date:args.p_care_date},error:null}));
  await recordFarmWork(base,input,null,caps);
  expect(mocks.rpc).toHaveBeenCalledWith('record_crop_care',expect.objectContaining({p_tray_ids:[1,2],p_watered_tray_ids:[]}));
  expect(mocks.legacy).not.toHaveBeenCalled();
});
it('records only actual watered exceptions while marking the crop group checked',async()=>{
  mocks.rpc.mockImplementationOnce(async(_name,args)=>({data:{operation_id:args.p_operation_id,checked_tray_ids:args.p_tray_ids,watered_tray_ids:args.p_watered_tray_ids,care_date:args.p_care_date},error:null}));
  await recordFarmWork(base,{...input,trayIds:[2]},null,caps);
  expect(mocks.rpc).toHaveBeenCalledWith('record_crop_care',expect.objectContaining({p_watered_tray_ids:[2]}));
});
it('lets Farm Hand partial seeding use the atomic RPC without legacy request UPDATE permissions',async()=>{
  const seed={...base,action:'Seed',taskSource:'seed_request' as const,requestId:9,quantity:3,quantityCompleted:1,traysRemaining:2};
  mocks.rpc.mockImplementationOnce(async(_name,args)=>({data:{operation_id:args.p_operation_id,request_id:9,quantity:1,tray_ids:[33],quantity_completed:2,status:'in_progress',work_date:args.p_work_date},error:null}));
  await recordFarmWork(seed,input,stock,caps);
  expect(mocks.rpc).toHaveBeenCalledWith('record_seed_work',expect.objectContaining({p_quantity:1,p_request_id:9,p_seedbatch_id:4}));
  expect(mocks.legacy).not.toHaveBeenCalled();
});
it('records actual soaking grams through one server transaction',async()=>{
  const soak={...base,action:'Soak',requestId:9,traysRemaining:2};
  mocks.rpc.mockImplementationOnce(async(_name,args)=>({data:{operation_id:args.p_operation_id,request_id:9,quantity:1,soaked_id:12,seed_grams:25,work_date:args.p_work_date},error:null}));
  await recordFarmWork(soak,input,stock,caps);
  expect(mocks.rpc).toHaveBeenCalledWith('record_soak_work',expect.objectContaining({p_seed_grams:25}));
  expect(mocks.legacy).not.toHaveBeenCalled();
});
it('rejects invalid soak weight and foreign watered IDs before sending',()=>{
  expect(workValidation({...base,action:'Soak',requestId:9},{...input,weight:'NaN'},stock,caps)).toMatch(/finite/);
  expect(workValidation(base,{...input,trayIds:[99]},null,caps)).toMatch(/no longer/);
  expect(workValidation({...base,action:'Soak',requestId:9},{...input,weight:'24.995'},stock,caps)).toMatch(/match the recipe weight/);
});
it('can replay a pending seeded operation when its stock was already consumed',async()=>{
  const seed={...base,action:'Seed',requestId:9,quantity:2,quantityCompleted:0,traysRemaining:2};
  mocks.rpc.mockRejectedValueOnce(new Error('lost response'));
  await expect(recordFarmWork(seed,input,stock,caps)).rejects.toThrow();
  const id=mocks.rpc.mock.calls[0][1].p_operation_id;
  mocks.rpc.mockImplementationOnce(async(_name,args)=>({data:{operation_id:id,request_id:9,quantity:1,tray_ids:[33],quantity_completed:1,status:'in_progress',work_date:args.p_work_date},error:null}));
  await recordFarmWork(seed,input,{...stock,batches:[]},caps);
  expect(mocks.rpc.mock.calls[1][1].p_operation_id).toBe(id);
});
it('sends the grower calendar date and retains uncertainty if the server confirms a different day', async()=>{
  const seed={...base,action:'Seed',requestId:9,quantity:2,quantityCompleted:0,traysRemaining:2};
  mocks.rpc.mockImplementationOnce(async(_name,args)=>({data:{operation_id:args.p_operation_id,request_id:9,quantity:1,tray_ids:[33],quantity_completed:1,status:'in_progress',work_date:'1999-01-01'},error:null}));
  await expect(recordFarmWork(seed,input,stock,caps)).rejects.toThrow(/not confirmed/);
  expect(mocks.rpc.mock.calls[0][1].p_work_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
