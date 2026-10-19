import { beforeEach, expect, it, vi } from 'vitest';
import { assertLegacyFarmWorkAvailable } from './legacyFarmWork';
import { FarmWorkRejectedError } from './farmWorkBackend';
import { completeSeedTask, completeSoakTask, completeSoakTaskByRecipe, completeTask, useLeftoverSoakedSeed } from './dailyFlowService';
import type { DailyTask } from './dailyFlowService';

const f = vi.hoisted(() => ({ caps: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock('./farmWorkBackend', async importOriginal => ({ ...await importOriginal<typeof import('./farmWorkBackend')>(), getFarmWorkCapabilities: f.caps }));
vi.mock('@/lib/supabaseClient', () => ({ getSupabaseClient: () => ({ from: f.from, rpc: f.rpc }) }));
const task: DailyTask = { id:'old',action:'Water',crop:'Pea',recipeId:1,trayIds:[1],trays:1,batchId:'1',location:'A',dayCurrent:3,dayTotal:10,status:'pending' };
beforeEach(() => { vi.clearAllMocks(); f.caps.mockResolvedValue({care:true,seed:true,soak:true}); f.rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}}); });
it.each([
  ['request soaking',()=>completeSoakTask(1,1,20,'2026-10-18')],
  ['recipe-only soaking',()=>completeSoakTaskByRecipe(1,1,20,'2026-10-18')],
  ['legacy seeding',()=>completeSeedTask(1,1,1)],
  ['leftover trays',()=>useLeftoverSoakedSeed(1,1,1,1)],
  ['legacy watering',()=>completeTask(task)],
  ['legacy mist',()=>completeTask({...task,action:'Mist'})],
  ['legacy completion-only soaking',()=>completeTask({...task,action:'Soak'})],
])('blocks %s before any obsolete RPC or direct-table mutation',async(_name,record)=>{
  await expect(record()).rejects.toThrow(/Today or Growing/);
  expect(f.from).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
});
it('preserves the legacy branch before matching replacement capabilities are installed',async()=>{
  f.caps.mockResolvedValue({care:false,seed:false,soak:false});
  await expect(assertLegacyFarmWorkAvailable('seed')).resolves.toBeUndefined();
  await expect(assertLegacyFarmWorkAvailable('soak')).resolves.toBeUndefined();
});
it('does not retire unrelated work when only another capability is installed',async()=>{
  f.caps.mockResolvedValue({care:true,seed:false,soak:false});
  await expect(assertLegacyFarmWorkAvailable('seed')).resolves.toBeUndefined();
});
it('refuses an unverifiable capability check without performing work',async()=>{
  f.caps.mockRejectedValue(new Error('Access changed'));
  await expect(completeSeedTask(1,1,1)).rejects.toThrow(/could not be verified/);
  expect(f.from).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
});
it('reports a blocked preflight as definitely unwritten instead of an ambiguous save to reconcile',async()=>{
  await expect(completeSeedTask(1,1,1)).rejects.toBeInstanceOf(FarmWorkRejectedError);
  expect(f.from).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
});
it('keeps legacy writers retired when new operations have been safely paused',async()=>{
  f.caps.mockResolvedValue({care:false,seed:false,soak:false});
  f.rpc.mockResolvedValue({data:true,error:null});
  await expect(completeSeedTask(1,1,1)).rejects.toThrow(/recording is paused/);
  expect(f.rpc).toHaveBeenCalledExactlyOnceWith('legacy_farm_work_retired');
  expect(f.from).not.toHaveBeenCalled();
});
it('treats a lost read-only retirement check as unwritten and never proceeds to a save',async()=>{
  f.caps.mockResolvedValue({care:false,seed:false,soak:false});
  f.rpc.mockRejectedValueOnce(new Error('Disconnected'));
  await expect(completeSeedTask(1,1,1)).rejects.toBeInstanceOf(FarmWorkRejectedError);
  expect(f.from).not.toHaveBeenCalled(); expect(f.rpc).toHaveBeenCalledExactlyOnceWith('legacy_farm_work_retired');
});
it.each([{data:null,error:{code:'42501'}},{data:'yes',error:null}])('does not fall back after a denied or malformed retirement check',async result=>{
  f.caps.mockResolvedValue({care:false,seed:false,soak:false}); f.rpc.mockResolvedValue(result);
  await expect(completeSoakTask(1,1,20,'2026-10-18')).rejects.toThrow(/could not|unrecognized/);
  expect(f.from).not.toHaveBeenCalled(); expect(f.rpc).toHaveBeenCalledTimes(1);
});
