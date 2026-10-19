import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TestAccountsManager from './TestAccountsManager';
import AdminDashboard from '../pages/AdminDashboard';
import AdminFarmsUsers from '../pages/AdminFarmsUsers';
import AdminTraysBatches from '../pages/AdminTraysBatches';
import AdminCustomersOrders from '../pages/AdminCustomersOrders';
import AdminProducts from '../pages/AdminProducts';
import AdminRecipesVarieties from '../pages/AdminRecipesVarieties';
import AdminNotifications from '../pages/AdminNotifications';
import AdminEmailEvents from '../pages/AdminEmailEvents';
import AdminEmailBroadcast from '../pages/AdminEmailBroadcast';
const mocks=vi.hoisted(()=>({read:vi.fn(),action:vi.fn(),fetch:vi.fn()}));
vi.mock('../services/adminConsole',()=>({readAdminPage:mocks.read,adminAction:mocks.action,cancelAdminRead:(request:{current:number})=>{request.current++;}}));
vi.mock('../lib/supabaseClient',()=>({getSupabaseClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'admin-session'}}})}})}));
const uuid='10000000-0000-4000-8000-000000000001';
beforeEach(()=>{
  vi.stubGlobal('fetch',mocks.fetch);
  mocks.read.mockImplementation(async(resource:string,page=1)=>({rows:resource==='dashboard'?[{totalFarms:7,activeFarms:2,totalUsers:3,newUsersToday:1,totalTrays:4,activeTrays:2,totalRecipes:5,totalVarieties:6,totalCustomers:1,totalOrders:2,totalBatches:3}]:[],total:0,page,page_size:100}));
  mocks.action.mockImplementation(async(action:string,payload:Record<string,unknown>)=>action==='read'?{rows:[{count:1}]}:action==='send_notification'?{inserted:2,request_id:payload.request_id}:{changed:true,user_id:payload.user_id,enabled:payload.enabled,email:'grower@example.test',request_id:payload.request_id});
  mocks.fetch.mockImplementation(async(_url:string,options:{body:string})=>{const body=JSON.parse(options.body);return {ok:true,json:async()=>({success:true,partialFailure:false,status:'sent',emailsSent:1,recipientCount:1,campaignId:'campaign',broadcastId:'broadcast',request_id:body.request_id})};});
});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
function form(){fireEvent.change(screen.getByLabelText('Account UUID'),{target:{value:uuid}});fireEvent.change(screen.getByLabelText('Reason'),{target:{value:'Demo rehearsal'}});}
it('grants access only by UUID and confirms the matching server result',async()=>{
  render(<TestAccountsManager/>);form();fireEvent.click(screen.getByRole('button',{name:'Grant demo access'}));
  expect(await screen.findByRole('status')).toHaveTextContent('Confirmed: demo access granted');
  expect(mocks.action).toHaveBeenCalledWith('set_demo_access',expect.objectContaining({user_id:uuid,enabled:true,reason:'Demo rehearsal',request_id:expect.any(String)}));
});
it('rejects email suffix entitlement and missing reasons locally',async()=>{
  render(<TestAccountsManager/>);fireEvent.change(screen.getByLabelText('Account UUID'),{target:{value:'x@sproutify.app'}});fireEvent.click(screen.getByRole('button',{name:'Grant demo access'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('UUID and a reason');expect(mocks.action).not.toHaveBeenCalled();
});
it('reports a no-op without saying access changed',async()=>{
  mocks.action.mockImplementation(async(_action:string,p:Record<string,unknown>)=>({...p,changed:false,email:'grower@example.test'}));
  render(<TestAccountsManager/>);form();fireEvent.click(screen.getByRole('button',{name:'Revoke demo access'}));
  expect(await screen.findByRole('status')).toHaveTextContent('No change:');
});
it('does not accept a mismatched or empty mutation response',async()=>{
  mocks.action.mockResolvedValue({});render(<TestAccountsManager/>);form();fireEvent.click(screen.getByRole('button',{name:'Grant demo access'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('No matching access change');expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('reuses the same operation ID after an ambiguous transport failure',async()=>{
  mocks.action.mockRejectedValue(new Error('Connection lost'));render(<TestAccountsManager/>);form();
  fireEvent.click(screen.getByRole('button',{name:'Grant demo access'}));await screen.findByText(/Connection lost/);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Grant demo access'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Grant demo access'}));
  await waitFor(()=>expect(mocks.action).toHaveBeenCalledTimes(2));expect(mocks.action.mock.calls[0][1].request_id).toBe(mocks.action.mock.calls[1][1].request_id);
});
it('uses bounded pages and makes local search scope visible',async()=>{
  mocks.read.mockImplementation(async(_r:string,page=1)=>({rows:[],total:101,page,page_size:100}));render(<AdminFarmsUsers/>);
  const next=screen.getByRole('button',{name:'Next page'});await waitFor(()=>expect(next).toBeEnabled());fireEvent.click(next);
  await waitFor(()=>expect(mocks.read).toHaveBeenCalledWith('farms',2));expect(screen.getByText(/Search, filters and farm summaries apply to loaded rows/)).toBeInTheDocument();
});
for(const [title,Page] of [['Farms',AdminFarmsUsers],['Trays',AdminTraysBatches],['Customers',AdminCustomersOrders],['Products',AdminProducts],['Recipes',AdminRecipesVarieties],['Notifications',AdminNotifications],['Email events',AdminEmailEvents]] as const){
  it(`${title} shows backend failure instead of a false empty result`,async()=>{mocks.read.mockRejectedValue(new Error('Admin access denied'));render(<MemoryRouter><Page/></MemoryRouter>);expect(await screen.findByRole('alert')).toHaveTextContent('Admin access denied');expect(screen.getByRole('button',{name:'Retry'})).toBeInTheDocument();});
}
it('shows actual dashboard totals from the protected backend',async()=>{render(<AdminDashboard/>);expect(await screen.findByText('7')).toBeInTheDocument();expect(mocks.read).toHaveBeenCalledWith('dashboard');});
it('shows unavailable active farm counts when the schema does not record farm activity',async()=>{
  mocks.read.mockResolvedValue({rows:[{totalFarms:7,activeFarms:null,totalUsers:3,newUsersToday:1,totalTrays:4,activeTrays:2,totalRecipes:5,totalVarieties:6,totalCustomers:1,totalOrders:2,totalBatches:3}],total:1,page:1,page_size:100});
  render(<AdminDashboard/>);expect(await screen.findByText('Unavailable')).toBeInTheDocument();expect(screen.getByText('Unknown active')).toBeInTheDocument();
});
it('does not show zero dashboard totals when the backend is unavailable',async()=>{mocks.read.mockRejectedValue(new Error('Totals unavailable'));render(<AdminDashboard/>);expect(await screen.findByRole('alert')).toHaveTextContent('Totals unavailable');expect(screen.queryByText('0')).not.toBeInTheDocument();});
it('submits notifications only through the confirmed backend action',async()=>{
  render(<AdminNotifications/>);await waitFor(()=>expect(mocks.read).toHaveBeenCalledWith('notifications',1));
  fireEvent.change(screen.getByLabelText('Title *'),{target:{value:'Check the farm'}});fireEvent.change(screen.getByLabelText('Body *'),{target:{value:'A rehearsal message'}});fireEvent.change(screen.getByLabelText('Reason *'),{target:{value:'Rehearsal'}});
  fireEvent.click(screen.getByRole('button',{name:'Send Notification'}));await waitFor(()=>expect(mocks.action).toHaveBeenCalledWith('send_notification',expect.objectContaining({target:'all',reason:'Rehearsal',request_id:expect.any(String)})));
  expect(mocks.action.mock.calls.find(call=>call[0]==='send_notification')?.[1]).not.toHaveProperty('link');
  expect(await screen.findByText(/Confirmed 2 notifications created/)).toBeInTheDocument();
});
function composeEmail(){fireEvent.change(screen.getByLabelText('Your verified administrator email *'),{target:{value:'admin@example.test'}});fireEvent.change(screen.getByLabelText('Subject Line *'),{target:{value:'Farm update'}});fireEvent.change(screen.getByLabelText('Message Body * (HTML supported)'),{target:{value:'<p>Farm update rehearsal</p>'}});}
it('only confirms email after matching nonzero provider delivery counts',async()=>{
  render(<AdminEmailBroadcast/>);composeEmail();fireEvent.click(screen.getByRole('button',{name:'Send Test Email'}));expect(await screen.findByText('Email sent successfully!')).toBeInTheDocument();
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual(expect.objectContaining({request_id:expect.any(String),testEmail:'admin@example.test'}));
});
it('does not report success for an HTTP 200 without delivery confirmation',async()=>{
  mocks.fetch.mockResolvedValue({ok:true,json:async()=>({success:true})});render(<AdminEmailBroadcast/>);composeEmail();fireEvent.click(screen.getByRole('button',{name:'Send Test Email'}));expect(await screen.findByText(/Delivery was not confirmed/)).toBeInTheDocument();expect(screen.queryByText('Email sent successfully!')).not.toBeInTheDocument();
});
it('reuses the email operation ID after a failed response',async()=>{
  mocks.fetch.mockResolvedValue({ok:false,json:async()=>({error:'Provider outcome unknown'})});render(<AdminEmailBroadcast/>);composeEmail();fireEvent.click(screen.getByRole('button',{name:'Send Test Email'}));
  await screen.findByText('Provider outcome unknown');await waitFor(()=>expect(screen.getByRole('button',{name:'Send Test Email'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Send Test Email'}));
  await waitFor(()=>expect(mocks.fetch).toHaveBeenCalledTimes(2));expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).request_id).toBe(JSON.parse(mocks.fetch.mock.calls[1][1].body).request_id);
});
it('isolates stored broadcast HTML in an iframe without script or origin privileges',async()=>{
  mocks.read.mockResolvedValue({rows:[{id:'b',subject:'Stored message',created_at:'2026-10-17',status:'sent',html_body:'<script>bad()</script>',is_test:true,recipient_count:1,campaign_id:'c'}],total:1,page:1,page_size:100});
  render(<AdminEmailBroadcast/>);fireEvent.click(await screen.findByText('Stored message'));expect(screen.getByTitle('Email content preview')).toHaveAttribute('sandbox','');expect(screen.getByText('Delivery count unavailable')).toBeInTheDocument();
});
