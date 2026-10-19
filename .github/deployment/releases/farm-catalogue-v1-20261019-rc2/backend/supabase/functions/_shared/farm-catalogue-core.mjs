// Pure read-only contracts shared by the local proxy and client. No persistence.
const string = (value, max) => { if (typeof value !== 'string' || value.length > max) throw Error('Invalid catalogue data.'); return value; };
const number = value => { if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000)) throw Error('Invalid recipe amount.'); return value; };
const list = (value, max) => { if (!Array.isArray(value) || value.length > max) throw Error('Invalid catalogue list.'); return value; };
const nullableId = value => value === null ? null : string(value, 90);
function sanitizeResearch(value) {
  if(value==null)return undefined;
  const result={};
  for(const key of ['reviewedOn','scope','tray','seedRate','soak','germination','cover','harvest','cautions'])result[key]=string(value[key],350);
  result.sources=list(value.sources,3).map(source=>{
    const url=new URL(string(source.url,400));
    if(url.protocol!=='https:' || url.username || url.password || !['www.johnnyseeds.com','trueleafmarket.com','www.pubs.ext.vt.edu','liveaquaponics.com'].includes(url.hostname))throw Error('Invalid research source.');
    return {title:string(source.title,100),url:url.href};
  });
  if(!result.sources.length)throw Error('Research needs a source.');
  return result;
}
export const recipeDraftSchema = { anyOf: [{ type: 'null' }, {
  type: 'object', additionalProperties: false,
  required: ['operation','sourceRecipeId','varietyId','name','traySize','seedGrams','expectedYieldOz','steps','notes','needsConfirmation'],
  properties: {
    operation: {type:'string',enum:['create','copy','change']}, sourceRecipeId:{type:['string','null']}, varietyId:{type:['string','null']}, name:{type:'string'},
    traySize:{type:['string','null']}, seedGrams:{type:['number','null']}, expectedYieldOz:{type:['number','null']},
    steps:{type:'array',items:{type:'object',additionalProperties:false,required:['action','duration','unit','instructions'],properties:{action:{type:'string'},duration:{type:['number','null']},unit:{type:'string',enum:['days','hours']},instructions:{type:'string'}}}},
    notes:{type:'string'}, needsConfirmation:{type:'array',items:{type:'string'}},
  },
}] };
export const catalogueRefsSchema = {type:'object',additionalProperties:false,required:['recipeIds','varietyIds'],properties:{recipeIds:{type:'array',items:{type:'string'}},varietyIds:{type:'array',items:{type:'string'}}}};
export function sanitizeRecipeDraft(value, catalogue) {
  if (value == null) return null;
  if (!['create','copy','change'].includes(value.operation)) throw Error('Invalid recipe draft.');
  const sourceRecipeId = nullableId(value.sourceRecipeId), varietyId = nullableId(value.varietyId);
  if (sourceRecipeId && !catalogue.recipeIndex.some(row=>row.id===sourceRecipeId)) throw Error('Recipe source is unavailable.');
  if (sourceRecipeId && !catalogue.recipes.some(row=>row.id===sourceRecipeId)) throw Error('Read the source recipe details before drafting.');
  if (varietyId && !catalogue.varietyIndex.some(row=>row.id===varietyId)) throw Error('Variety is unavailable.');
  if (value.operation !== 'create' && !sourceRecipeId || value.operation === 'change' && !sourceRecipeId?.startsWith('farm:')) throw Error('Reference recipes can only become farm-copy drafts.');
  const steps = list(value.steps,12).map(step=>({action:string(step.action,80),duration:number(step.duration),unit:['days','hours'].includes(step.unit)?step.unit:(()=>{throw Error('Invalid recipe duration unit.');})(),instructions:string(step.instructions,350)}));
  const name=string(value.name,150);if(!name.trim() || !steps.length) throw Error('A named recipe draft needs steps.');
  return {operation:value.operation,sourceRecipeId,varietyId,name,traySize:value.traySize==null?null:string(value.traySize,80),seedGrams:number(value.seedGrams),expectedYieldOz:number(value.expectedYieldOz),steps,notes:string(value.notes,600),needsConfirmation:list(value.needsConfirmation,12).map(row=>string(row,180))};
}
export function sanitizeCatalogue(value) {
  if (value == null) return null;
  const recipeIndex=list(value.recipeIndex,150).map(row=>({id:string(row.id,90),name:string(row.name,150),crop:string(row.crop,150),status:string(row.status,60)}));
  const varietyIndex=list(value.varietyIndex,150).map(row=>({id:string(row.id,90),name:string(row.name,150),hasImage:row.hasImage===true}));
  if(new Set(recipeIndex.map(x=>x.id)).size!==recipeIndex.length || new Set(varietyIndex.map(x=>x.id)).size!==varietyIndex.length) throw Error('Duplicate catalogue identities.');
  const recipes=list(value.recipes,6).map(row=>{
    if(!recipeIndex.some(x=>x.id===row.id))throw Error('Unknown recipe detail.');
    return {id:row.id,name:string(row.name,150),crop:string(row.crop,150),status:string(row.status,60),notes:string(row.notes,600),seedGrams:number(row.seedGrams),expectedYieldOz:number(row.expectedYieldOz),steps:list(row.steps,12).map(step=>({action:string(step.action,80),duration:number(step.duration),unit:['days','hours'].includes(step.unit)?step.unit:'days',instructions:string(step.instructions,350)})),...(row.research?{research:sanitizeResearch(row.research)}:{})};
  });
  const varieties=list(value.varieties,6).map(row=>{
    if(!varietyIndex.some(x=>x.id===row.id))throw Error('Unknown variety detail.');
    return {id:row.id,name:string(row.name,150),description:string(row.description,500),care:string(row.care,500),seedGrams:number(row.seedGrams),germinationDays:number(row.germinationDays),soakHours:number(row.soakHours),growthDays:number(row.growthDays),blackoutDays:number(row.blackoutDays),lightDays:number(row.lightDays),hasImage:row.hasImage===true};
  });
  const result={recipeIndex,varietyIndex,recipes,varieties,unavailable:list(value.unavailable||[],4).map(x=>string(x,100))};
  if(JSON.stringify(result).length>38000)throw Error('Catalogue snapshot is too large.');return result;
}
export function validateCatalogueReply(reply,catalogue) {
  const refs=reply.catalogueRefs||{recipeIds:[],varietyIds:[]};
  const recipeIds=list(refs.recipeIds,6).map(id=>string(id,90));const varietyIds=list(refs.varietyIds,6).map(id=>string(id,90));
  if(recipeIds.some(id=>!catalogue.recipes.some(x=>x.id===id)) || varietyIds.some(id=>!catalogue.varieties.some(x=>x.id===id)))throw Error('The assistant referenced catalogue details it did not read.');
  return {recipeDraft:sanitizeRecipeDraft(reply.recipeDraft,catalogue),catalogueRefs:{recipeIds,varietyIds}};
}
