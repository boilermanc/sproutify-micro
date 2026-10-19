import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import LoadingState from '@/components/LoadingState';
import FarmWorkDialog from '@/components/workspace/FarmWorkDialog';
import { HarvestCallout, OrdersPanel, StageSummary, TaskRow } from '@/components/workspace/TodayDashboard';
import { createTodayWorkspaceReads, fetchTodayWorkspaceTasks } from '@/services/workspaceTasks';
import { fetchTodayOrders, type TodayOrderSummary } from '@/services/todayDashboard';
import type { DailyTask } from '@/services/dailyFlowService';
import type { GrowingGroup } from '@/services/growingWorkspace';
import { groupTodayTasks, isPreparationTask, taskTrayCount } from '@/lib/todayWorkspace';
import { dashboardStageTotals, type ReadState } from '@/lib/todayDashboard';
import { canManageFarm } from '@/lib/workspaceNavigation';
import { localDateString } from '@/lib/dateUtils';
import './TodayPage.css';

const densityKey = 'sproutify_today_density_v1';

export default function TodayPage() {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [growing, setGrowing] = useState<ReadState<GrowingGroup[]>>({ status: 'loading' });
  const [prepared, setPrepared] = useState<ReadState<number | null>>({ status: 'loading' });
  const [orders, setOrders] = useState<ReadState<TodayOrderSummary[]>>({ status: 'loading' });
  const [selected, setSelected] = useState<DailyTask | null>(null);
  const [date, setDate] = useState(() => new Date());
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    try { return localStorage.getItem(densityKey) === 'compact' ? 'compact' : 'comfortable'; } catch { return 'comfortable'; }
  });
  const requestId = useRef(0);
  const orderRequestId = useRef(0);
  const mounted = useRef(false);
  const loadedDay = useRef(localDateString());
  let role: string | undefined;
  let farmUuid: string | undefined;
  try { const session = JSON.parse(localStorage.getItem('sproutify_session') || '{}'); role = session.role; farmUuid = session.farmUuid; } catch { /* Reader reports missing session. */ }
  const showOrders = canManageFarm(role);

  const loadOrders = useCallback(async (now = new Date()) => {
    const id = ++orderRequestId.current;
    if (!showOrders) return;
    setOrders({ status: 'loading' });
    try {
      const data = await fetchTodayOrders(now);
      if (mounted.current && id === orderRequestId.current) setOrders({ status: 'ready', data });
    } catch {
      if (mounted.current && id === orderRequestId.current) setOrders({ status: 'error' });
    }
  }, [showOrders]);

  const load = useCallback(() => {
    const now = new Date();
    loadedDay.current = localDateString(now);
    setDate(now);
    const id = ++requestId.current;
    const current = () => mounted.current && id === requestId.current;
    setLoading(true); setError(false); setTasks([]);
    setGrowing({ status: 'loading' }); setPrepared({ status: 'loading' });
    const reads = createTodayWorkspaceReads();
    void fetchTodayWorkspaceTasks(now, reads).then(data => {
      if (current()) setTasks(data);
    }).catch(() => { if (current()) setError(true); })
      .finally(() => { if (current()) setLoading(false); });
    void reads.groups().then(data => { if (current()) setGrowing({ status: 'ready', data }); })
      .catch(() => { if (current()) setGrowing({ status: 'error' }); });
    void reads.capabilities.then(async caps => {
      if (!caps.soak) return null;
      const rows = await reads.preparation();
      if (rows.some(row => row.blocked_soaked_stock)) return null;
      return [...new Map(rows.map(row => [row.request_id, row])).values()].reduce((sum, row) => sum + row.available_soaked_trays, 0);
    }).then(data => { if (current()) setPrepared({ status: 'ready', data }); })
      .catch(() => { if (current()) setPrepared({ status: 'error' }); });
    void loadOrders(now);
  }, [loadOrders]);

  const cancelPendingRead = useCallback(() => {
    mounted.current = false; ++requestId.current; ++orderRequestId.current;
  }, []);

  useEffect(() => {
    mounted.current = true;
    setSelected(null);
    load();
    const checkDay = () => { if (localDateString() !== loadedDay.current) load(); };
    const visible = () => { if (document.visibilityState === 'visible') checkDay(); };
    const timer = window.setInterval(checkDay, 30_000);
    window.addEventListener('focus', checkDay);
    document.addEventListener('visibilitychange', visible);
    return () => {
      cancelPendingRead();
      window.clearInterval(timer);
      window.removeEventListener('focus', checkDay);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [load, cancelPendingRead, farmUuid, role]);

  const groups = groupTodayTasks(tasks);
  const visibleTasks = groups.flatMap(group => group.tasks);
  const preparationTrays = visibleTasks.filter(isPreparationTask).reduce((sum, task) => sum + taskTrayCount(task), 0);
  const existingTrays = new Set(visibleTasks.flatMap(task => task.trayIds)).size;
  const totals = growing.status === 'ready' && !loading && !error ? dashboardStageTotals(growing.data, visibleTasks) : null;
  const stageLoading = growing.status === 'loading' || loading;

  return <div className={`today-dashboard today-density-${density}`}>
    <header className="today-header">
      <div><p className="today-eyebrow">{date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
        <h1>{loading ? 'Today’s farm work' : error ? 'Today’s work is unavailable' : `${visibleTasks.length} work ${visibleTasks.length === 1 ? 'group' : 'groups'} left today`}</h1>
        <p className="today-intro">A clear view of the work ahead.</p>
      </div>
      <div className="today-header-actions">
        <button className="today-button" type="button" onClick={load} disabled={loading}><RefreshCw size={16} aria-hidden="true" />Refresh</button>
        <Link className="today-button today-button-primary" to="/growing">See what’s growing <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    </header>
    <StageSummary totals={totals} prepared={prepared} loading={stageLoading} />
    {growing.status === 'error' && <p className="today-support-error">Recorded crop stages are unavailable. Refresh to retry.</p>}
    <div className="today-columns">
      <section className="today-panel today-task-panel" aria-labelledby="today-tasks-title" aria-busy={loading}>
        <div className="today-panel-heading"><h2 id="today-tasks-title">Today’s tasks</h2>
          <label className="today-density-control">Density <select value={density} onChange={event => {
            const value = event.target.value === 'compact' ? 'compact' : 'comfortable';
            setDensity(value);
            try { localStorage.setItem(densityKey, value); } catch { /* Preferences remain usable without storage. */ }
          }}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
        </div>
        {loading ? <LoadingState compact message="Loading today’s farm work…" /> : error ? <div role="alert" className="today-panel-message">
          <h3>We couldn’t load today’s work.</h3><p>The task list is unavailable. Refresh it before deciding what needs doing.</p>
          <button type="button" className="today-button" onClick={load}>Retry</button>
        </div> : <>
          <p className="today-task-summary" role="status">{visibleTasks.length} work {visibleTasks.length === 1 ? 'group' : 'groups'}
            {preparationTrays > 0 && ` · ${preparationTrays} trays to seed or prepare`}
            {existingTrays > 0 && ` · ${existingTrays} existing trays in this list`}</p>
          {!visibleTasks.length ? <div className="today-panel-message"><h3>Nothing due in this task list</h3><p>Check Growing for crops already on the farm{showOrders ? ', or Orders to review upcoming demand.' : '.'}</p></div>
            : groups.filter(group => group.tasks.length).map(group => <section key={group.id} className="today-task-group" aria-labelledby={`today-${group.id}`}>
              <h3 id={`today-${group.id}`}>{group.title}<span>{group.tasks.length}</span></h3>
              {group.id === 'water' && <p className="today-group-note">Check the crop group, water what needs it, and record the work you actually did.</p>}
              {group.tasks.map(task => <TaskRow key={task.id} task={task} onReview={setSelected} />)}
            </section>)}
        </>}
      </section>
      <aside className="today-support" aria-label="Today at a glance">
        {showOrders && <OrdersPanel orders={orders} onRetry={() => void loadOrders()} />}
        <HarvestCallout tasks={visibleTasks} available={!loading && !error} />
      </aside>
    </div>
    <FarmWorkDialog task={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); load(); }} />
  </div>;
}
