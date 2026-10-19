import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sprout, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import FarmWorkDialog from '@/components/workspace/FarmWorkDialog';
import { formatCalendarDate } from '@/lib/dateUtils';
import { preparationTraysRemaining } from '@/services/workerTasks';
import { plantingPlan, type GrowingGroup } from '@/services/growingWorkspace';
import { fetchGrowingWorkspace, workspaceTasksForGrowingGroup, isWorkspaceCareTask } from '@/services/workspaceTasks';
import type { DailyTask } from '@/services/dailyFlowService';
import { taskPurpose, taskWorkLabel } from '@/lib/todayWorkspace';

const calendarDay = (value: string | null) => value ? formatCalendarDate(value) : 'Not recorded';

export default function GrowingPage() {
  const [groups, setGroups] = useState<GrowingGroup[]>([]);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<DailyTask | null>(null);
  const generation = useRef(0);
  let role = '';
  try { role = JSON.parse(localStorage.getItem('sproutify_session') || '{}').role || ''; } catch { /* The adapter reports a missing session. */ }
  const canOpenRecords = role === 'Owner' || role === 'Editor';
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const { groups: nextGroups, tasks: nextTasks } = await fetchGrowingWorkspace();
      if (current !== generation.current) return;
      setGroups(nextGroups);
      setTasks(nextTasks);
    } catch (cause) {
      if (current === generation.current) setError(cause instanceof Error ? cause.message : 'The farm records could not be loaded.');
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);
  const cancelPendingRead = useCallback(() => { generation.current++; }, []);
  useEffect(() => { void load(); return cancelPendingRead; }, [load, cancelPendingRead]);
  const plan = plantingPlan(tasks);
  const visible = groups.filter(group => (stage === 'all' || group.stage === stage) && `${group.crop} ${group.location} ${group.members.map(member => member.customerName || '').join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const count = groups.reduce((sum, group) => sum + group.trayIds.length, 0);
  const unconfirmedCare = tasks.filter(task => isWorkspaceCareTask(task) && !groups.some(group => task.trayIds.some(id => group.trayIds.includes(id))));

  return <div className="mx-auto max-w-6xl space-y-7 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm text-muted-foreground">Your farm, crop by crop</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Growing</h1><p className="mt-2 text-sm text-muted-foreground">See what is growing, where it is, and what needs attention next.</p></div>
      <div className="flex gap-2"><Button variant="outline" disabled={loading} onClick={() => void load()}>Refresh</Button>{canOpenRecords && <Button variant="outline" asChild><Link to="/trays">Tray records</Link></Button>}</div>
    </header>

    {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-card p-4"><p className="font-medium">Growing could not be refreshed</p><p className="mt-1 text-sm">{error}</p>{groups.length > 0 && <p className="mt-1 text-sm">The previous crop list remains below. Work actions are paused until refresh succeeds.</p>}<Button variant="outline" className="mt-3" onClick={() => void load()}>Try again</Button></div>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading growing crops and planting plan…</p>}

    {!loading && !error && <p className="text-sm text-muted-foreground">{count} active {count === 1 ? 'tray' : 'trays'} · {groups.length} crop {groups.length === 1 ? 'group' : 'groups'}</p>}

    {unconfirmedCare.length > 0 && <section aria-label="Unconfirmed care records" className="rounded-lg border border-amber-200 bg-card p-5">
      <h2 className="font-semibold">A care record needs confirmation</h2><p className="mt-1 text-sm text-muted-foreground">These trays have moved out of the active crop list. Check the original save before recording more work.</p>
      <div className="mt-3 flex flex-wrap gap-2">{unconfirmedCare.map(task => <Button key={task.id} variant="outline" disabled={loading || !!error} onClick={() => setActiveTask(task)}>Review saved care · {task.crop}</Button>)}</div>
    </section>}

    <section aria-labelledby="planting-plan" className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2"><Sprout aria-hidden="true" className="h-5 w-5 text-primary"/><h2 id="planting-plan" className="text-lg font-semibold">Planting plan</h2></div>
      <p className="mt-1 text-sm text-muted-foreground">What to seed next, including upcoming sowings and preparation due today. Partly finished sowings stay here until they are done.</p>
      {!loading && !error && plan.length === 0 && <p className="mt-4 text-sm">Nothing waiting to be seeded. No preparation is due today.</p>}
      <div className="mt-4 divide-y divide-border">{plan.map(task => <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div><p className="font-medium">{task.crop} <span className="font-normal text-muted-foreground">· {task.action}</span></p><p className="text-sm text-muted-foreground">{preparationTraysRemaining(task)} trays remaining{task.quantity !== undefined ? ` of ${task.quantity}` : ''}{task.isOverdue ? ' · Overdue' : ''}{task.sowDate ? ` · Planned ${calendarDay(task.sowDate)}` : ''}</p><p className="text-sm text-muted-foreground">{taskPurpose(task) || 'Purpose not recorded'}</p>{task.stepDescription && <p className="mt-1 text-sm text-muted-foreground">{task.stepDescription}</p>}</div>
        <Button variant="outline" disabled={loading || !!error} onClick={() => setActiveTask(task)}>Record {task.action.toLowerCase()}</Button>
      </div>)}</div>
    </section>

    <section aria-labelledby="active-crops" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="active-crops" className="text-lg font-semibold">Active crops</h2><div className="flex w-full flex-wrap gap-2 sm:w-auto"><Input aria-label="Search growing crops" placeholder="Search crop, location or customer" value={search} onChange={event => setSearch(event.target.value)} className="sm:w-72"/><select aria-label="Filter recorded stage" value={stage} onChange={event => setStage(event.target.value)} className="h-10 max-w-full rounded-md border border-input bg-background px-3 text-sm"><option value="all">All recorded stages</option>{[...new Set(groups.map(group => group.stage))].sort().map(value => <option key={value}>{value}</option>)}</select></div></div>
      {!loading && !error && groups.length === 0 && <div className="rounded-lg border border-border bg-card p-6"><h3 className="font-medium">No active crops yet</h3><p className="mt-2 text-sm text-muted-foreground">Record completed seeding from Today or the planting plan above. Harvested and lost trays stay in your records.</p></div>}
      {!loading && groups.length > 0 && visible.length === 0 && <p className="text-sm text-muted-foreground">No crops match these filters.</p>}
      {visible.map(group => {
        const open = expanded === group.id;
        const groupTasks = workspaceTasksForGrowingGroup(group, tasks);
        const estimates = [...new Set(group.members.map(member => member.estimatedHarvest).filter((date): date is string => !!date))];
        return <article key={group.id} className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-semibold">{group.crop}</h3><p className="mt-1 text-sm text-muted-foreground">{group.trayIds.length} {group.trayIds.length === 1 ? 'tray' : 'trays'} · Seeded {calendarDay(group.seededDate)}</p><p className="mt-2 flex items-center gap-1 text-sm"><MapPin aria-hidden="true" className="h-4 w-4"/>{group.location}</p></div><span className="max-w-full rounded-md border border-border bg-secondary px-2.5 py-1 text-sm">{group.stage === 'Stage not recorded' ? group.stage : `Last recorded: ${group.stage}`}</span></div>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Estimated harvest: </span>{estimates.length ? estimates.map(date => calendarDay(date)).join(', ') : 'Not scheduled'}{estimates.length > 0 && group.members.some(member => !member.estimatedHarvest) ? ' (some trays unscheduled)' : ''}</p><p><span className="text-muted-foreground">Observed readiness: </span>Not recorded — check the crop</p></div>
          <p className="mt-2 text-xs text-muted-foreground">Dates come from scheduled recipe steps. They do not confirm that a crop is ready to harvest.</p>
          <div className="mt-4 flex flex-wrap gap-2">{groupTasks.map(task => <Button key={task.id} variant="outline" disabled={loading || !!error} onClick={() => setActiveTask(task)}>{taskWorkLabel(task)} · {task.trays} {task.trays === 1 ? 'tray' : 'trays'}</Button>)}<Button variant="ghost" aria-expanded={open} onClick={() => setExpanded(open ? null : group.id)}>Tray details{open ? <ChevronUp className="ml-1 h-4 w-4"/> : <ChevronDown className="ml-1 h-4 w-4"/>}</Button></div>
          {open && <div className="mt-4 space-y-3 border-t border-border pt-4"><p className="text-sm text-muted-foreground">Each tray keeps its own record. Stage reflects the latest completed step; the next scheduled step may still need doing.</p>{group.members.map(member => <div key={member.tray_id} className="rounded-md bg-background p-3 text-sm"><p className="font-medium">Tray {member.tray_unique_id || member.tray_id}</p><p className="mt-1">Next recorded step: {member.nextStep || 'None recorded'}</p><p>Customer: {member.customerName || (member.customer_id ? `Customer #${member.customer_id} (name unavailable)` : 'No direct customer assignment')}</p>{member.standing_order_id && <p>Standing order #{member.standing_order_id}</p>}{member.order_schedule_id && <p>Order schedule #{member.order_schedule_id}</p>}{canOpenRecords && <Link className="mt-2 inline-block font-medium text-primary underline underline-offset-4" to={`/trays/${member.tray_id}`}>Open tray record for corrections, moves or loss</Link>}</div>)}</div>}
        </article>;
      })}
    </section>
    {activeTask && <FarmWorkDialog task={activeTask} onClose={() => setActiveTask(null)} onSaved={() => { setActiveTask(null); void load(); }}/>} 
  </div>;
}
