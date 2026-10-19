import '@testing-library/jest-dom/vitest';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import HarvestReport from './HarvestReport';
const f=vi.hoisted(()=>({fail:false,filters:[] as Array<[string,string]>,rows:[{harvest_date:'2026-10-18',yield:'100',recipes:{recipe_name:'QA Radish',variety_name:'Radish',varieties:{name:'Rambo Radish'}}}]}));
vi.mock('../../lib/supabaseClient',()=>({getSupabaseClient:()=>({from:()=>{
  const chain={select:()=>chain,eq:()=>chain,not:()=>chain,
    gte:(_column:string,value:string)=>{f.filters.push(['gte',value]);return chain;},
    lte:(_column:string,value:string)=>{f.filters.push(['lte',value]);return chain;},
    order:async()=>({data:f.fail?null:f.rows,error:f.fail?new Error('Denied'):null})};return chain;
}})}));
beforeEach(()=>{f.fail=false;f.filters=[];localStorage.setItem('sproutify_session',JSON.stringify({farmUuid:'qa-farm'}));});
afterEach(cleanup);
it('shows a stored 100-gram harvest as grams and queries the selected calendar days',async()=>{
  render(<HarvestReport startDate={new Date(2026,9,11)} endDate={new Date(2026,9,18,23,59,59)} />);
  expect(await screen.findByText('100.00 g')).toBeInTheDocument();
  expect(screen.getByText(/Report Period:.*10\/11\/2026.*10\/18\/2026/)).toBeInTheDocument();
  expect(f.filters).toEqual([['gte','2026-10-11'],['lte','2026-10-18']]);
  expect(screen.queryByText(/100.00 oz/)).not.toBeInTheDocument();
});
it('shows a failed read instead of reporting an empty harvest',async()=>{
  f.fail=true;render(<HarvestReport startDate={new Date(2026,9,11)} endDate={new Date(2026,9,18)} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
  expect(screen.queryByText(/No harvest data found/)).not.toBeInTheDocument();
});
