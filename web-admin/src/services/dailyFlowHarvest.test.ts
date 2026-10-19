import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {completeTask,fetchDailyTasks,markTraysAsLost,type DailyTask} from './dailyFlowService';
const f=vi.hoisted(()=>({
  rows:{} as Record<string,Array<Record<string,unknown>>>,
  writes:[] as Array<{table:string,payload:unknown}>,
  rejectUpdate:false,
}));
vi.mock('../lib/supabaseClient',()=>({getSupabaseClient:()=>({
  auth:{getUser:async()=>({data:{user:{id:'qa-user'}},error:null})},
  rpc:async()=>({data:[],error:null}),
  from:(table:string)=>{
    let updating=false;
    const result=()=>({data:updating&&f.rejectUpdate?[]:(f.rows[table]||[]),error:null});
    const chain:object=new Proxy({}, {get:(_target,key)=>{
      if(key==='then')return (resolve:(value:unknown)=>unknown,reject:(reason:unknown)=>unknown)=>Promise.resolve(result()).then(resolve,reject);
      if(key==='single'||key==='maybeSingle')return async()=>({data:f.rows[table]?.[0]||null,error:null});
      if(key==='update'||key==='insert'||key==='upsert')return (payload:unknown)=>{
        updating=key==='update';f.writes.push({table,payload});
        if(updating&&!f.rejectUpdate)f.rows[table]=(f.rows[table]||[]).map(row=>({...row,...payload as Record<string,unknown>}));
        return chain;
      };
      return ()=>chain;
    }});return chain;
  },
})}));
beforeEach(()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,18,12));
  localStorage.setItem('sproutify_session',JSON.stringify({farmUuid:'qa-farm',userId:'qa-user'}));
  f.writes=[];f.rejectUpdate=false;
  f.rows={
    trays:[{tray_id:327,recipe_id:42,sow_date:'2026-10-04',scheduled_sow_date:null,batch_id:34,location:'QA Rack A',customer_id:null,status:'active',harvest_date:null,recipes:{recipe_id:42,recipe_name:'QA Radish',variety_name:'Radish',variety_id:9}}],
    recipes:[{recipe_id:42,recipe_name:'QA Radish',variety_name:'Radish',variety_id:9}],
    steps:[
      {step_id:118,recipe_id:42,step_name:'Seeding',sequence_order:1,duration:1,duration_unit:'Hours',step_descriptions:{description_name:'Seeding',step_type:'active'}},
      {step_id:119,recipe_id:42,step_name:'Growing',sequence_order:2,duration:12,duration_unit:'Days',step_descriptions:{description_name:'Growing',step_type:'passive'}},
      {step_id:120,recipe_id:42,step_name:'Harvesting',sequence_order:3,duration:0,duration_unit:'Days',step_descriptions:{description_name:'Harvesting',step_type:'active'}},
    ],
  };
});
afterEach(()=>vi.useRealTimers());
it('creates a harvest action for mature inventory trays without any standing order or schedule',async()=>{
  const tasks=await fetchDailyTasks(new Date(2026,9,18));
  expect(tasks).toContainEqual(expect.objectContaining({action:'Harvest Radish',trayIds:[327],trays:1,recipeId:42}));
});
it('does not make immature inventory harvestable merely because there are no orders',async()=>{
  f.rows.trays[0].sow_date='2026-10-17';
  const tasks=await fetchDailyTasks(new Date(2026,9,18));
  expect(tasks.filter(task=>task.action.startsWith('Harvest'))).toHaveLength(0);
});
it('persists a crop-named harvest as harvested with yield in grams',async()=>{
  const task={id:'qa-harvest',action:'Harvest Radish',crop:'Radish',batchId:'B-34',location:'QA Rack A',dayCurrent:14,dayTotal:12,trays:1,status:'urgent',trayIds:[327],recipeId:42,taskSource:'tray_step'} satisfies DailyTask;
  await expect(completeTask(task,100)).resolves.toBe(true);
  expect(f.writes).toContainEqual({table:'trays',payload:expect.objectContaining({status:'harvested',yield:100,harvest_date:expect.any(String)})});
});
it('records an active tray loss with recipe metadata and verifies the update before logging success',async()=>{
  await expect(markTraysAsLost([327],'other','QA loss')).resolves.toBe(true);
  expect(f.writes).toContainEqual({table:'trays',payload:expect.objectContaining({status:'lost',loss_reason:'other',loss_notes:'QA loss'})});
  expect(f.writes).toContainEqual({table:'activity_log',payload:expect.objectContaining({description:'Marked 1 tray as lost: Radish'})});
});
it('does not claim a loss when row permissions or concurrent changes prevent the update',async()=>{
  f.rejectUpdate=true;
  await expect(markTraysAsLost([327],'other')).resolves.toBe(false);
  expect(f.writes.filter(write=>write.table==='activity_log')).toHaveLength(0);
});
