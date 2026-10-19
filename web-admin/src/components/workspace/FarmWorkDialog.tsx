import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { DailyTask } from '@/services/dailyFlowService';
import { preparationTraysRemaining } from '@/services/workerTasks';
import { getFarmWorkCapabilities, listPendingFarmWork, retryPendingFarmWork, withFarmWorkContext, FarmWorkRejectedError, FarmWorkRetryError, type FarmWorkCapabilities } from '@/services/farmWorkBackend';
import { localDateString } from '@/lib/dateUtils';
import { loadWorkSeedOptions, recordFarmWork, workKind, workValidation, type SeedOptions, type WorkInput } from './farmWorkActions';

interface Props { task: DailyTask | null; onClose: () => void; onSaved: () => void; initialInput?: Partial<WorkInput>; previewOnly?: boolean }
// Keep an ambiguous result locked across closing/reopening either screen.
// A changed server snapshot is required before this task can be attempted again.
const uncertainRecords = new Set<string>();
const safeRetries = new Map<string, WorkInput>();
const unavailable: FarmWorkCapabilities = { care: false, soak: false, seed: false };

export default function FarmWorkDialog({ task, onClose, onSaved, initialInput, previewOnly = false }: Props) {
  return task ? <WorkForm key={task.id} task={task} onClose={onClose} onSaved={onSaved} initialInput={initialInput} previewOnly={previewOnly} /> : null;
}

function WorkForm({ task: currentTask, onClose, onSaved, initialInput, previewOnly = false }: Props & { task: DailyTask }) {
  const [restored] = useState(() => {
    try {
      return { operation: listPendingFarmWork().find(record => record.context && (
        record.context.task.id === currentTask.id || (currentTask.requestId && record.context.task.requestId === currentTask.requestId)
        || (workKind(currentTask) === 'water' && record.rpc === 'record_crop_care' && currentTask.trayIds.some(id => record.context!.task.trayIds.includes(id)))
      )), error: null };
    } catch { return { operation: undefined, error: 'A retained save could not be read. Reconcile the pending record before recording more work.' }; }
  });
  const task = restored.operation?.context?.task || currentTask;
  const kind = workKind(task);
  const preparation = kind === 'seed' || kind === 'soak';
  const [session] = useState<{ role?: string; farmUuid?: string; userId?: string }>(() => {
    try { return JSON.parse(localStorage.getItem('sproutify_session') || '{}'); }
    catch { return {}; }
  });
  const role = session.role || '';
  const snapshot = JSON.stringify([session.farmUuid, session.userId, task.id, task.action, task.trays, task.traysRemaining, task.quantityCompleted, task.trayIds]);
  const [caps, setCaps] = useState<FarmWorkCapabilities>(unavailable);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [checkingCapabilities, setCheckingCapabilities] = useState(true);
  const canPrepare = ['Owner', 'Editor'].includes(role) || (['FarmHand', 'Farm Hand'].includes(role) && (kind === 'seed' ? caps.seed : caps.soak));
  const [input, setInput] = useState<WorkInput>(() => restored.operation?.context?.input || safeRetries.get(snapshot) || { quantity: String(preparationTraysRemaining(task)), batchId: '', weight: '', trayIds: kind === 'water' ? [] : [...new Set(task.trayIds)], ...initialInput });
  const [waterChoice, setWaterChoice] = useState<'none' | 'all' | 'some' | null>(() => {
    const saved = restored.operation?.context?.input || safeRetries.get(snapshot) || (initialInput?.trayIds ? { trayIds: initialInput.trayIds } : undefined);
    return saved ? saved.trayIds.length === 0 ? 'none' : saved.trayIds.length === new Set(task.trayIds).size ? 'all' : 'some' : null;
  });
  const [retrySafe, setRetrySafe] = useState(!!restored.operation?.context || safeRetries.has(snapshot));
  const [options, setOptions] = useState<SeedOptions | null>(restored.operation?.context?.options || null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(!!restored.operation?.context || safeRetries.has(snapshot));
  const [error, setError] = useState<string | null>(uncertainRecords.has(snapshot) ? 'A previous attempt needs reconciliation. Refresh Today and Growing and check the recorded work with an owner before another attempt.' : null);
  const [reconcile, setReconcile] = useState(uncertainRecords.has(snapshot));
  const pending = useRef(false);
  const retryCapability = kind === 'water' ? caps.care : kind === 'seed' ? caps.seed : kind === 'soak' ? caps.soak : false;
  const validation = restored.error || capabilityError || (kind === 'water' && caps.care && !['Owner','Editor','Farm Hand','FarmHand'].includes(role) ? 'Your current role cannot record crop care.' : preparation && !canPrepare ? 'Ask an owner to record seeding and soaking until the backend permission fix is released.' : retrySafe ? retryCapability ? null : 'The original farm action is unavailable. Reconcile the retained record before continuing.' : kind === 'water' && caps.care && !waterChoice ? 'Choose how much watering this checked group needed.' : kind === 'water' && caps.care && waterChoice === 'some' && (!input.trayIds.length || input.trayIds.length === new Set(task.trayIds).size) ? 'Select only the trays watered, or choose No watering needed or All needed water.' : workValidation(task, input, options, caps));
  const title = kind === 'water' ? 'Check and water as needed' : kind === 'seed' ? 'Record seeding' : kind === 'soak' ? 'Record soaking' : kind === 'harvest' ? 'Record harvest' : `Record ${task.action.toLowerCase()}`;

  useEffect(() => {
    let cancelled = false;
    getFarmWorkCapabilities().then(result => { if (!cancelled) setCaps(result); })
      .catch(() => { if (!cancelled) { setCaps(unavailable); setCapabilityError('Available farm actions could not be verified. Close and reopen before recording work.'); } })
      .finally(() => { if (!cancelled) setCheckingCapabilities(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (retrySafe) { setLoading(false); return; }
    if (checkingCapabilities || !preparation || !canPrepare) return;
    let cancelled = false;
    setLoading(true);
    loadWorkSeedOptions(task, caps).then(result => {
      if (cancelled) return;
      setOptions(result);
      if (result.batches.length === 1 && !safeRetries.has(snapshot)) setInput(current => ({ ...current, batchId: String(result.batches[0].id) }));
    }).catch(() => { if (!cancelled) setError('Seed inventory could not be verified. Close and check the crop recipe and seed inventory before continuing.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [preparation, canPrepare, task, caps, checkingCapabilities, snapshot, retrySafe]);

  function update(value: Partial<WorkInput>) { if (retrySafe || pending.current) return; setInput(current => ({ ...current, ...value })); setConfirmed(false); setError(null); }
  function close() { if (!pending.current) onClose(); }
  async function save() {
    if (previewOnly) return;
    if (pending.current || reconcile || validation || !confirmed || loading || checkingCapabilities) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      const retained = retrySafe ? listPendingFarmWork().find(record => record.context?.task.id === task.id) : undefined;
      if (retained) await retryPendingFarmWork(retained.key);
      else if (retryCapability) await withFarmWorkContext({ task, input, options, date: localDateString() }, () => recordFarmWork(task, input, options, caps));
      else await recordFarmWork(task, input, options, caps);
      safeRetries.delete(snapshot); onSaved(); onClose();
    }
    catch (failure) {
      if (failure instanceof FarmWorkRetryError && failure.retrySafe) {
        safeRetries.set(snapshot, { ...input, trayIds: [...input.trayIds] });
        setRetrySafe(true);
        setError(`${failure.message} Your entered values are frozen. Retry this same record to safely confirm the original result.`);
      } else if (failure instanceof FarmWorkRejectedError && failure.rejected) {
        safeRetries.delete(snapshot);
        setRetrySafe(false);
        setConfirmed(false);
        setError(`${failure.message} Check and correct the entered values before confirming again.`);
      } else {
        uncertainRecords.add(snapshot);
        setError(`${failure instanceof Error ? failure.message : 'The result could not be confirmed.'} Refresh Today and Growing and check what was recorded before another attempt. This dialog cannot undo recorded work.`);
        setReconcile(true);
      }
    } finally { pending.current = false; setSaving(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto" onEscapeKeyDown={event => { if (saving) event.preventDefault(); }} onPointerDownOutside={event => { if (saving) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{task.crop} · {task.location || 'Location not set'}. Record only work you have actually finished.</DialogDescription></DialogHeader>
      {previewOnly && <p role="status" className="rounded-md border bg-secondary p-3 text-sm">Local chat rehearsal. Review and edit this draft; saving is disabled. Nothing has been recorded. Existing unconfirmed records take priority over a new draft.</p>}
      {restored.operation?.context && <p role="status" className="rounded-md border bg-secondary p-3 text-sm">Original unconfirmed record from {restored.operation.context.date}. These values and the original operation key are retained; retry confirms that record even if the day or crop progress changed.</p>}
      {checkingCapabilities && <p role="status">Checking available farm actions…</p>}
      <fieldset disabled={saving || reconcile || retrySafe || checkingCapabilities} className="space-y-4">
        {preparation ? <>
          <div className="space-y-2"><Label htmlFor="work-quantity">Trays {kind === 'seed' ? 'seeded' : 'being prepared'}</Label><Input id="work-quantity" type="number" min="1" max={preparationTraysRemaining(task)} step="1" value={input.quantity} onChange={event => update({ quantity: event.target.value })} /><p className="text-sm text-muted-foreground">{preparationTraysRemaining(task)} trays remain. A smaller quantity leaves the rest outstanding.</p></div>
          {retrySafe ? <p className="text-sm text-muted-foreground">Retained seed batch {input.batchId}. Original quantities are frozen for safe retry.</p> : loading ? <p role="status">Checking seed inventory…</p> : <div className="space-y-2"><Label htmlFor="work-batch">Seed batch</Label><select id="work-batch" className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm" value={input.batchId} onChange={event => update({ batchId: event.target.value })}><option value="">Choose a batch</option>{options?.batches.map(batch => <option key={batch.id} value={batch.id}>{batch.label} · {batch.availableGrams.toFixed(1)} g available</option>)}</select>{options?.batches.length === 0 && <p>No seed inventory is available for this recipe’s crop.</p>}{options && <p className="text-sm text-muted-foreground">Recipe: {options.gramsPerTray.toFixed(1)} g per tray.</p>}</div>}
          {kind === 'soak' && (caps.soak ? <div className="space-y-2"><Label htmlFor="work-weight">Actual dry seed weight put into soak (g)</Label><Input id="work-weight" type="number" min="0.01" step="any" value={input.weight} onChange={event => update({ weight: event.target.value })} /><p className="text-sm text-muted-foreground">Record the actual grams you weighed for these trays. The remaining planned trays stay outstanding.</p></div> : <p className="text-sm text-muted-foreground">Recording soaking is unavailable while the existing inventory writer is being reconciled. Do not retry the same soaking action through another screen.</p>)}
        </> : <>
          {kind === 'water' && <p className="rounded-md border bg-secondary p-3 text-sm">{caps.care ? `Check all ${new Set(task.trayIds).size} trays in this crop group. Tell us which needed water; a check can be saved without watering.` : 'Check the crop first. Select only trays you actually watered. The current backend can save watering only for this entire crop group; partial watering and a check with no watering cannot be recorded yet.'}</p>}
          <div className="space-y-3">
            {kind === 'water' ? caps.care ? <fieldset className="space-y-2"><legend className="text-sm font-medium">Watering after checking the group</legend>{([{ value: 'none', label: 'No watering needed' }, { value: 'all', label: 'All needed water' }, { value: 'some', label: 'Some needed water' }] as const).map(choice => <label key={choice.value} className="flex min-h-11 items-center gap-3 rounded-md border bg-card p-3"><input type="radio" name="water-choice" checked={waterChoice === choice.value} onChange={() => { setWaterChoice(choice.value); update({ trayIds: choice.value === 'all' ? [...new Set(task.trayIds)] : [] }); }} /><span>{choice.label}</span></label>)}</fieldset> : <label className="flex min-h-11 items-center gap-3 rounded-md border bg-card p-3"><input type="checkbox" checked={task.trayIds.length > 0 && input.trayIds.length === new Set(task.trayIds).size} onChange={event => update({ trayIds: event.target.checked ? [...new Set(task.trayIds)] : [] })} /><span>All {new Set(task.trayIds).size} trays needed water and were watered</span></label> : <div className="flex flex-wrap items-center gap-2"><span className="text-sm">{input.trayIds.length} of {new Set(task.trayIds).size} whole trays selected</span><Button type="button" variant="outline" size="sm" onClick={() => update({ trayIds: [...new Set(task.trayIds)] })}>Select all trays</Button><Button type="button" variant="ghost" size="sm" onClick={() => update({ trayIds: [] })}>Clear selection</Button></div>}
            {(kind !== 'water' || !caps.care || waterChoice === 'some') && <details open={kind === 'water' && caps.care && waterChoice === 'some'}><summary className="cursor-pointer py-2 text-sm font-medium">Choose individual trays or exceptions</summary><fieldset className="space-y-2"><legend className="mb-2 font-medium">{kind === 'water' ? 'Trays actually watered' : kind === 'harvest' ? 'Whole trays harvested' : 'Trays where this step is finished'}</legend>{[...new Set(task.trayIds)].map(id => <label key={id} className="flex min-h-11 items-center gap-3 rounded-md border bg-card px-3"><input type="checkbox" checked={input.trayIds.includes(id)} onChange={event => update({ trayIds: event.target.checked ? [...input.trayIds, id] : input.trayIds.filter(value => value !== id) })} /><span>Tray {id}{task.trayDetails?.find(tray => tray.trayId === id)?.varietyName ? ` · ${task.trayDetails.find(tray => tray.trayId === id)?.varietyName}` : ''}</span></label>)}{!task.trayIds.length && <p>No verified trays are attached to this task.</p>}</fieldset></details>}
          </div>
          {kind === 'harvest' && <div className="space-y-2"><Label htmlFor="work-weight">Total harvest weight (g, optional)</Label><Input id="work-weight" type="number" min="0.01" step="any" value={input.weight} onChange={event => update({ weight: event.target.value })} /><p className="text-sm text-muted-foreground">Applies only to the {input.trayIds.length} selected whole trays, split evenly for the existing per-tray yield record. Unselected trays stay growing.</p></div>}
          {kind === 'step' && <p className="text-sm text-muted-foreground">{task.stepDescription || task.action}. This completes the recipe step; it does not change the tray’s assigned physical location.</p>}
        </>}
        <label className="flex min-h-11 items-start gap-3 rounded-md border bg-card p-3 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>{kind === 'water' && caps.care ? 'I checked every tray in this group and recorded only the trays actually watered. Save this check now.' : 'I finished this work and checked these quantities. Save this record now.'}</span></label>
      </fieldset>
      {validation && !loading && !checkingCapabilities && <p className="text-sm text-muted-foreground">{validation}</p>}
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <DialogFooter><Button variant="outline" disabled={saving} onClick={close}>{reconcile ? 'Close and reconcile' : retrySafe ? 'Close (record retained)' : 'Close without saving'}</Button><Button disabled={previewOnly || saving || reconcile || loading || checkingCapabilities || !!validation || !confirmed || (!!error && !retrySafe)} onClick={save}>{previewOnly ? 'Local preview · saving disabled' : saving ? 'Saving…' : retrySafe ? 'Retry same record' : 'Save completed work'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
