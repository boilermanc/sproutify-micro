import {beforeEach, expect, it, vi} from 'vitest';
import {completeSeedRequestSafely} from './seedRequestCompletion';
const f=vi.hoisted(()=>({
  profile:{farm_uuid:'verified-farm',role:'Owner',is_active:true},
  requests:[{quantity:2,quantity_completed:0,status:'pending'},{quantity:2,quantity_completed:1,status:'in_progress'}],
  rpc:vi.fn(), filters:[] as Array<[string,unknown]>,
}));
vi.mock('@/lib/supabaseClient',()=>({getSupabaseClient:()=>({
  auth:{getUser:async()=>({data:{user:{id:'verified-user'}},error:null})},
  from:(table:string)=>{
    const chain={select:()=>chain,eq:(key:string,value:unknown)=>{f.filters.push([key,value]);return chain;},
      single:async()=>({data:table==='profile'?f.profile:f.requests.shift(),error:null})};return chain;
  },rpc:f.rpc,
})}));
beforeEach(()=>{
  f.profile={farm_uuid:'verified-farm',role:'Owner',is_active:true};
  f.requests=[{quantity:2,quantity_completed:0,status:'pending'},{quantity:2,quantity_completed:1,status:'in_progress'}];
  f.filters=[];f.rpc.mockReset().mockResolvedValue({data:1,error:null});
});
it('confirms actual request progress and uses the verified Auth user and farm',async()=>{
  await expect(completeSeedRequestSafely(779,1,34)).resolves.toBe(1);
  expect(f.rpc).toHaveBeenCalledWith('complete_seed_task',expect.objectContaining({p_user_id:'verified-user',p_quantity_completed:1}));
  expect(f.filters).toContainEqual(['farm_uuid','verified-farm']);
});
it.each(['Farm Hand','Viewer'])('blocks unsupported %s before any mutating RPC',async role=>{
  f.profile.role=role;
  await expect(completeSeedRequestSafely(779,1,34)).rejects.toThrow('owner or editor');
  expect(f.rpc).not.toHaveBeenCalled();
});
it('blocks an inactive membership before mutation',async()=>{
  f.profile.is_active=false;
  await expect(completeSeedRequestSafely(779,1,34)).rejects.toThrow('owner or editor');expect(f.rpc).not.toHaveBeenCalled();
});
it.each([0,-1,1.5,3])('refuses invalid or excessive quantity %s',async quantity=>{
  await expect(completeSeedRequestSafely(779,quantity,34)).rejects.toThrow('no longer available');expect(f.rpc).not.toHaveBeenCalled();
});
it('refuses replay of a completed request',async()=>{
  f.requests[0]={quantity:2,quantity_completed:2,status:'completed'};
  await expect(completeSeedRequestSafely(779,1,34)).rejects.toThrow('no longer available');expect(f.rpc).not.toHaveBeenCalled();
});
it('flags the observed silent zero-row request update as reconciliation, never success',async()=>{
  f.requests[1]={quantity:2,quantity_completed:0,status:'pending'};
  await expect(completeSeedRequestSafely(779,1,34)).rejects.toMatchObject({name:'SeedReconciliationError'});
});
it('requires completed status when the final tray is recorded',async()=>{
  f.requests=[{quantity:2,quantity_completed:1,status:'in_progress'},{quantity:2,quantity_completed:2,status:'in_progress'}];
  await expect(completeSeedRequestSafely(779,1,34)).rejects.toMatchObject({name:'SeedReconciliationError'});
});
it('treats a lost RPC response as ambiguous and warns against retry',async()=>{
  f.rpc.mockRejectedValue(new Error('connection lost'));
  await expect(completeSeedRequestSafely(779,1,34)).rejects.toThrow('Trays may already exist');
});
