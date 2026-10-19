import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import AdminDataStatus from './AdminDataStatus';
import { cancelAdminRead, adminAction, readAdminPage } from '../services/adminConsole';
interface TestAccount { user_id:string;email:string;enabled:boolean;farm_uuid?:string; }
const TestAccountsManager = () => {
  const [rows,setRows]=useState<TestAccount[]>([]);
  const [page,setPage]=useState(1);
  const [total,setTotal]=useState<number|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [status,setStatus]=useState('');
  const [userId,setUserId]=useState('');
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const request=useRef(0);
  const intent=useRef<{signature:string;requestId:string}|null>(null);
  const load=useCallback(async()=>{
    const current=++request.current;setLoading(true);setError('');setTotal(null);
    try {const result=await readAdminPage<TestAccount>('test_accounts',page);if(current!==request.current)return;setRows(result.rows);setTotal(result.total);}
    catch(e){if(current===request.current){setRows([]);setError(e instanceof Error?e.message:'Test accounts unavailable.');}}
    finally{if(current===request.current)setLoading(false);}
  },[page]);
  useEffect(()=>{void load();return()=>{cancelAdminRead(request);};},[load]);
  async function update(target:string,enabled:boolean) {
    target = target.toLowerCase();
    if(busy)return;setError('');setStatus('');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target)||!reason.trim()){setError('An existing account UUID and a reason are required.');return;}
    const payload={user_id:target,enabled,reason};const signature=JSON.stringify(payload);
    if(intent.current?.signature!==signature)intent.current={signature,requestId:crypto.randomUUID()};
    const requestId=intent.current.requestId;setBusy(true);
    try {
      const result=await adminAction<{changed:boolean;user_id:string;enabled:boolean;email:string;request_id:string}>('set_demo_access',{...payload,request_id:requestId});
      if(result.request_id!==requestId||result.user_id!==target||result.enabled!==enabled||typeof result.changed!=='boolean'||typeof result.email!=='string')throw new Error('No matching access change was confirmed. Refresh before making a different request.');
      setStatus(result.changed?`Confirmed: demo access ${enabled?'granted':'revoked'} for ${result.email}.`:`No change: ${result.email} already has demo access ${enabled?'enabled':'disabled'}.`);
      intent.current=null;setUserId('');setReason('');void load();
    } catch(e){setError(e instanceof Error?e.message:'Access change failed.');}finally{setBusy(false);}
  }
  return <Card><CardHeader><CardTitle>Test Accounts</CardTitle></CardHeader><CardContent className="space-y-4">
    <p>Grant or revoke demo access for an existing verified account by its Auth UUID. Email domains do not grant access.</p>
    <AdminDataStatus error={error} page={page} total={total} loading={loading||busy} onPage={setPage}/>
    <Button variant="outline" disabled={busy||loading} onClick={load}>Refresh accounts</Button>
    <div><Label htmlFor="test-user-id">Account UUID</Label><Input id="test-user-id" value={userId} onChange={e=>setUserId(e.target.value)} disabled={busy}/></div>
    <div><Label htmlFor="test-reason">Reason</Label><Input id="test-reason" value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} disabled={busy}/></div>
    <Button disabled={busy} onClick={()=>update(userId.trim(),true)}>Grant demo access</Button>
    <Button variant="outline" disabled={busy} onClick={()=>update(userId.trim(),false)}>Revoke demo access</Button>
    {status&&<p role="status">{status}</p>}
    {loading?<p>Loading accounts...</p>:rows.length===0&&!error?<p>No test accounts on this page.</p>:<ul>{rows.map(row=><li key={row.user_id} className="py-2"><strong>{row.email}</strong> — {row.user_id} — {row.enabled?'Demo access enabled':'Demo access disabled'}</li>)}</ul>}
  </CardContent></Card>;
};
export default TestAccountsManager;
