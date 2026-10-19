import { ArrowRight, Leaf } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DailyTask } from '@/services/dailyFlowService';
import type { TodayOrderSummary } from '@/services/todayDashboard';
import { dashboardTaskKind, harvestTasks, type ReadState, type StageTotals } from '@/lib/todayDashboard';
import { isPreparationTask, taskPurpose, taskTrayCount, taskWorkLabel } from '@/lib/todayWorkspace';

export function TaskRow({ task, onReview }: { task: DailyTask; onReview: (task: DailyTask) => void }) {
  const count = taskTrayCount(task);
  const purpose = taskPurpose(task);
  return <button type="button" className={`today-task today-kind-${dashboardTaskKind(task)}`}
    aria-label={`Review ${taskWorkLabel(task)} for ${task.crop}`} onClick={() => onReview(task)}>
    <span className="today-review-icon" aria-hidden="true"><ArrowRight size={16} /></span>
    <span className="today-task-kind">{taskWorkLabel(task)}</span>
    <span className="today-task-body">
      <span className="today-task-title">{task.crop}</span>
      <span className="today-task-meta">{count} {task.recipeId || task.trayIds.length ? (count === 1 ? 'tray' : 'trays') : (count === 1 ? 'task' : 'tasks')}{isPreparationTask(task) ? ' remaining' : ''}</span>
      {purpose && <span className="today-task-meta">{purpose}</span>}
      {task.stepDescription && <span className="today-task-note">{task.stepDescription}</span>}
      {task.taskSource === 'order_fulfillment' && task.traysReady !== undefined && <span className="today-task-note">{task.traysReady} trays ready · {count} needed</span>}
      {task.isOverdue && <span className="today-warning">{task.daysOverdue ? `${task.daysOverdue} ${task.daysOverdue === 1 ? 'day' : 'days'} overdue` : 'Overdue'}</span>}
      {Boolean(task.missedSteps?.length) && <span className="today-warning">Earlier care needs review</span>}
    </span>
    <span className="today-location">{task.location && task.location !== 'Not set' ? task.location : 'Location not set'}</span>
  </button>;
}

const stageLabels = [
  { key: 'blackout', label: 'Blackout', color: '#57564C' },
  { key: 'lights', label: 'Under lights', color: '#9CCB7A' },
  { key: 'harvest', label: 'Harvest due', color: '#2F6B2A' },
] as const;

export function StageSummary({ totals, prepared, loading }: {
  totals: StageTotals | null; prepared: ReadState<number | null>; loading: boolean;
}) {
  const preparedValue = prepared.status === 'ready' ? prepared.data : null;
  const preparedLabel = prepared.status === 'loading' ? 'Loading…' : preparedValue === null ? 'Unavailable' : preparedValue;
  const stages = stageLabels.map(stage => ({ ...stage, value: totals?.[stage.key] ?? null }));
  const physicalCount = totals ? totals.blackout + totals.lights + totals.harvest + totals.other : 0;
  return <section className="today-stages" aria-label="Crop stage summary" aria-live="polite" aria-busy={loading || prepared.status === 'loading'}>
    <div className="today-stage-cards">
      <div className="today-stage-stat">
        <p><span className="today-swatch" style={{ background: '#8FB3C9' }} />Prepared seed</p>
        <div className={typeof preparedLabel === 'string' ? 'today-stat-unavailable' : 'today-stat-number'}>{preparedLabel}</div>
        <span className="today-stat-unit">tray equivalents</span>
      </div>
      {stages.map(stage => <div className="today-stage-stat" key={stage.key}>
        <p><span className="today-swatch" style={{ background: stage.color }} />{stage.label}</p>
        <div className={stage.value === null ? 'today-stat-unavailable' : 'today-stat-number'}>{stage.value ?? (loading ? 'Loading…' : 'Unavailable')}</div>
        <span className="today-stat-unit">trays</span>
      </div>)}
    </div>
    <div className="today-mobile-stages">
      <div className="today-stage-bar" aria-hidden="true">
        {stages.filter(stage => stage.value !== null && stage.value > 0).map(stage => <span key={stage.key} style={{ flex: stage.value!, background: stage.color }} />)}
        {totals && totals.other > 0 && <span style={{ flex: totals.other, background: '#B9B3A3' }} />}
      </div>
      <p className="today-stage-labels">{stages.map(stage => `${stage.label} ${stage.value ?? (loading ? '…' : 'unavailable')}`).join(' · ')}{totals && totals.other > 0 ? ` · Other ${totals.other}` : ''}</p>
      <p className="today-stage-labels">Prepared seed: {preparedLabel} · tray equivalents</p>
      {totals && physicalCount === 0 && <p className="today-stage-labels">No active trays recorded.</p>}
    </div>
    {totals && totals.other > 0 && <p className="today-other-stages">Other / unrecorded: {totals.other} {totals.other === 1 ? 'tray' : 'trays'}</p>}
    <p className="today-stage-footnote">Recorded stages · harvest due is scheduled work, not verified readiness.</p>
  </section>;
}

export function OrdersPanel({ orders, onRetry }: { orders: ReadState<TodayOrderSummary[]>; onRetry: () => void }) {
  return <section className="today-panel" aria-labelledby="today-orders-title" aria-live="polite" aria-busy={orders.status === 'loading'}>
    <div className="today-panel-heading"><h2 id="today-orders-title">Orders due today</h2><Link to="/orders">View orders <ArrowRight size={14} aria-hidden="true" /></Link></div>
    {orders.status === 'loading' ? <p className="today-panel-message">Loading today’s orders…</p>
      : orders.status === 'error' ? <div className="today-panel-message"><p>Today’s orders are unavailable.</p><button type="button" className="today-text-button" onClick={onRetry}>Retry orders</button></div>
        : !orders.data.length ? <p className="today-panel-message">No orders recorded for delivery today. View Orders for all upcoming demand.</p>
          : <ul className="today-orders">{orders.data.map(order => <li key={order.id}>
            <div><strong>{order.customer}</strong><span className="today-order-status">{order.status}</span></div>
            <p>{order.itemsSummary}</p>
          </li>)}</ul>}
  </section>;
}

export function HarvestCallout({ tasks, available }: { tasks: DailyTask[]; available: boolean }) {
  const harvests = harvestTasks(tasks);
  return <section className="today-harvest" aria-labelledby="today-harvest-title">
    <Leaf size={24} aria-hidden="true" />
    <h2 id="today-harvest-title">Harvest due today</h2>
    {!available ? <p>Load today’s work to see harvest tasks.</p> : !harvests.length ? <p>No harvest work due in this task list.</p> : <>
      <ul>{harvests.map(task => <li key={task.id}><strong>{task.crop}</strong><span>{taskTrayCount(task)} trays</span></li>)}</ul>
      {harvests.some(task => task.isOverdue || task.missedSteps?.length) && <p className="today-harvest-warning">Some harvest work needs attention. Review overdue work and earlier care before recording.</p>}
      <p>Check the crops before recording a harvest.</p>
    </>}
  </section>;
}
