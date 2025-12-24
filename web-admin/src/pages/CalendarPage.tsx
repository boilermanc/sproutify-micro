import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type LucideIcon, AlertTriangle, Beaker, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Droplets, Scissors, Sprout, CheckSquare, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { fetchCalendarMonth, fetchDayTasks, type CalendarDaySummary, type CalendarDayTask } from '../services/calendarService';

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const taskPillStyles = {
  harvest: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-100',
  },
  warning: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-100',
  },
  seed: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-600',
    border: 'border-indigo-100',
  },
  prep: {
    bg: 'bg-purple-50',
    text: 'text-purple-600',
    border: 'border-purple-100',
  },
  water: {
    bg: 'bg-cyan-50',
    text: 'text-cyan-600',
    border: 'border-cyan-100',
  },
};

const taskGroupStyles = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  purple: 'bg-purple-50 text-purple-700 border-purple-100',
  cyan: 'bg-cyan-50 text-cyan-700 border-cyan-100',
};

type TaskGroupColor = keyof typeof taskGroupStyles;

function getTaskQuantityLabel(task: CalendarDayTask) {
  const quantity = task.quantity;
  if (!quantity) return null;

  const trayLabel = quantity === 1 ? 'tray' : 'trays';

  if (task.task_source === 'order_fulfillment') {
    return `${quantity} ${trayLabel} at risk`;
  }

  if (task.customer_name) {
    return `${quantity} ${trayLabel} for ${task.customer_name}`;
  }

  return `${quantity} ${trayLabel} ready (unassigned)`;
}

function getDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function generateCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const days: (number | null)[] = [];

  for (let i = 0; i < startDayOfWeek; i += 1) {
    days.push(null);
  }

  for (let d = 1; d <= daysInMonth; d += 1) {
    days.push(d);
  }

  while (days.length < 35) {
    days.push(null);
  }

  return days;
}

function formatDateReadable(date: string) {
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function DayCell({
  day,
  daySummary,
  isSelected,
  isToday,
  onClick,
}: {
  day: number | null;
  daySummary?: CalendarDaySummary;
  isSelected: boolean;
  isToday: boolean;
  onClick: () => void;
}) {
  if (!day) {
    return <div className="bg-slate-50/50 min-h-[108px]" />;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative bg-white min-h-[108px] p-2 text-left hover:bg-slate-50 transition-colors border border-slate-100',
        isSelected && 'ring-2 ring-inset ring-slate-900 z-10'
      )}
    >
      <span
        className={cn(
          'inline-flex w-8 h-8 items-center justify-center rounded-full text-sm font-semibold',
          isToday ? 'bg-slate-900 text-white' : 'text-slate-700'
        )}
      >
        {day}
      </span>

      <div className="flex flex-col gap-1 mt-2">
        {daySummary?.harvest_count ? (
          <div
            className={cn(
              'flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] font-bold border',
              taskPillStyles.harvest.bg,
              taskPillStyles.harvest.text,
              taskPillStyles.harvest.border
            )}
          >
            <Scissors size={10} />
            <span>
              {daySummary.harvest_count} Harvest{daySummary.harvest_count > 1 ? 's' : ''}
            </span>
          </div>
        ) : null}

        {daySummary?.warning_count ? (
          <div
            className={cn(
              'flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] font-bold border',
              taskPillStyles.warning.bg,
              taskPillStyles.warning.text,
              taskPillStyles.warning.border
            )}
          >
            <AlertTriangle size={10} />
            <span>{daySummary.warning_count} At Risk</span>
          </div>
        ) : null}

        <div className="flex gap-1 flex-wrap">
          {daySummary?.seed_count ? (
            <div
              className={cn(
                'flex items-center h-5 px-1.5 rounded border text-[9px] font-bold',
                taskPillStyles.seed.bg,
                taskPillStyles.seed.text,
                taskPillStyles.seed.border
              )}
            >
              <Sprout size={10} />
              <span className="ml-1">{daySummary.seed_count}</span>
            </div>
          ) : null}

          {daySummary?.prep_count ? (
            <div
              className={cn(
                'flex items-center h-5 px-1.5 rounded border text-[9px] font-bold',
                taskPillStyles.prep.bg,
                taskPillStyles.prep.text,
                taskPillStyles.prep.border
              )}
            >
              <Beaker size={10} />
              <span className="ml-1">{daySummary.prep_count}</span>
            </div>
          ) : null}

          {daySummary?.water_count ? (
            <div
              className={cn(
                'flex items-center h-5 px-1.5 rounded border text-[9px] font-bold',
                taskPillStyles.water.bg,
                taskPillStyles.water.text,
                taskPillStyles.water.border
              )}
            >
              <Droplets size={10} />
              <span className="ml-1">{daySummary.water_count}</span>
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function TaskGroup({
  title,
  icon: Icon,
  color,
  tasks,
  onTaskClick,
}: {
  title: string;
  icon: LucideIcon;
  color: TaskGroupColor;
  tasks: CalendarDayTask[];
  onTaskClick?: (task: CalendarDayTask) => void;
}) {
  const style = taskGroupStyles[color];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center border', style)}>
          <Icon size={16} />
        </div>
        <span>{title}</span>
      </div>
      <div className="space-y-2">
        {tasks.map((task, index) => {
          // Create a unique key that includes all identifying fields
          const uniqueKey = `${task.task_name || ''}-${task.recipe_name || ''}-${task.task_date}-${task.customer_name || ''}-${task.task_source || ''}-${(task as any).standing_order_id || ''}-${index}`;
          const quantityLabel = getTaskQuantityLabel(task);
          return (
            <div 
              key={uniqueKey} 
              className={cn(
                "border rounded-lg p-3 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
                onTaskClick && "cursor-pointer hover:bg-slate-50 hover:border-slate-300 transition-colors"
              )}
              onClick={() => onTaskClick && onTaskClick(task)}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-900">{task.recipe_name || task.task_name || 'Task'}</div>
                {quantityLabel ? <span className="text-xs text-slate-500">{quantityLabel}</span> : null}
              </div>
              <div className="text-xs text-slate-500 mt-1 space-y-1">
                {task.task_name && task.task_name !== task.recipe_name ? <div>{task.task_name}</div> : null}
                {task.variety_name ? <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{task.variety_name}</div> : null}
                {task.customer_name ? <div>Customer: {task.customer_name}</div> : null}
                {/* Show date information for at-risk items */}
                {task.task_source === 'order_fulfillment' && (task as any).sow_date ? (
                  <div className="pt-1 border-t border-slate-200 space-y-0.5">
                    {(task as any).sow_date ? (
                      <div className="text-amber-600">
                        <span className="font-medium">Sow date:</span> {new Date((task as any).sow_date + 'T00:00:00').toLocaleDateString()} 
                        {new Date((task as any).sow_date + 'T00:00:00') < new Date() ? (
                          <span className="ml-1 text-red-600">(Past due)</span>
                        ) : null}
                      </div>
                    ) : null}
                    {(task as any).harvest_date ? (
                      <div>
                        <span className="font-medium">Harvest:</span> {new Date((task as any).harvest_date + 'T00:00:00').toLocaleDateString()}
                        {(() => {
                          const harvestDate = new Date((task as any).harvest_date + 'T00:00:00');
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const daysUntil = Math.ceil((harvestDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                          return daysUntil >= 0 ? (
                            <span className="ml-1 text-slate-600">({daysUntil} days)</span>
                          ) : null;
                        })()}
                      </div>
                    ) : null}
                    {(task as any).delivery_date ? (
                      <div>
                        <span className="font-medium">Delivery:</span> {new Date((task as any).delivery_date + 'T00:00:00').toLocaleDateString()}
                      </div>
                    ) : null}
                    {(task as any).trays_ready !== undefined && (task as any).trays_needed !== undefined ? (
                      <div className="text-slate-600">
                        <span className="font-medium">Trays:</span> {(task as any).trays_ready} / {(task as any).trays_needed} ready
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CalendarPage = () => {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const [farmUuid, setFarmUuid] = useState<string | null>(null);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(getDateString(today.getFullYear(), today.getMonth() + 1, today.getDate()));

  const [monthSummary, setMonthSummary] = useState<CalendarDaySummary[]>([]);
  const [monthError, setMonthError] = useState<string | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);

  const [dayTasks, setDayTasks] = useState<CalendarDayTask[]>([]);
  const [dayError, setDayError] = useState<string | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<CalendarDayTask | null>(null);

  useEffect(() => {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) {
      setMonthError('Session not found. Please sign in again.');
      setDayError('Session not found. Please sign in again.');
      return;
    }
    const { farmUuid: storedFarmUuid } = JSON.parse(sessionData);
    setFarmUuid(storedFarmUuid);
  }, []);

  useEffect(() => {
    if (!farmUuid) return;
    setMonthLoading(true);
    setMonthError(null);
    fetchCalendarMonth(farmUuid, currentYear, currentMonth)
      .then((data) => {
        setMonthSummary(data);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unable to load calendar data.';
        setMonthError(message);
      })
      .finally(() => setMonthLoading(false));
  }, [farmUuid, currentMonth, currentYear]);

  useEffect(() => {
    if (!farmUuid || !selectedDate) return;
    setDayLoading(true);
    setDayError(null);
    fetchDayTasks(farmUuid, selectedDate)
      .then((data) => {
        setDayTasks(data);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unable to load day tasks.';
        setDayError(message);
      })
      .finally(() => setDayLoading(false));
  }, [farmUuid, selectedDate]);

  useEffect(() => {
    setSelectedDate((prev) => {
      if (!prev) return getDateString(currentYear, currentMonth, 1);
      const [prevYear, prevMonth] = prev.split('-').map((part) => parseInt(part, 10));
      if (prevYear === currentYear && prevMonth === currentMonth) {
        return prev;
      }
      return getDateString(currentYear, currentMonth, 1);
    });
  }, [currentMonth, currentYear]);

  const calendarDays = useMemo(() => generateCalendarDays(currentYear, currentMonth), [currentYear, currentMonth]);

  const summaryMap = useMemo(() => {
    const map: Record<string, CalendarDaySummary> = {};
    monthSummary.forEach((day) => {
      map[day.task_date] = day;
    });
    return map;
  }, [monthSummary]);

  const todayString = useMemo(() => getDateString(today.getFullYear(), today.getMonth() + 1, today.getDate()), [today]);
  const monthLabel = useMemo(
    () => new Date(currentYear, currentMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    [currentMonth, currentYear]
  );

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => {
      if (prev === 1) {
        setCurrentYear((year) => year - 1);
        return 12;
      }
      return prev - 1;
    });
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => {
      if (prev === 12) {
        setCurrentYear((year) => year + 1);
        return 1;
      }
      return prev + 1;
    });
  };

  const selectedSummary = selectedDate ? summaryMap[selectedDate] : undefined;

  const harvestTasks = useMemo(() => dayTasks.filter((task) => task.task_name?.toLowerCase().includes('harvest')), [dayTasks]);
  const atRiskTasks = useMemo(() => dayTasks.filter((task) => 
    task.task_name?.toLowerCase().includes('risk') || task.task_source === 'order_fulfillment'
  ), [dayTasks]);
  const seedTasks = useMemo(() => dayTasks.filter((task) => task.task_source === 'seed_request'), [dayTasks]);
  const soakTasks = useMemo(() => dayTasks.filter((task) => task.task_source === 'soak_request'), [dayTasks]);
  const passiveTasks = useMemo(() => dayTasks.filter((task) => task.step_type === 'passive'), [dayTasks]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Calendar</h1>
          <p className="text-slate-600 mt-1">See harvests, warnings, and seeding tasks by date.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/weekly-tasks')} className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4" />
            Weekly tasks
          </Button>
          <Button variant="outline" onClick={() => setSelectedDate(todayString)}>
            <CalendarIcon className="h-4 w-4 mr-2" />
            Today
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{monthLabel}</CardTitle>
              <p className="text-sm text-slate-500">Tap a date to see tasks</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={handlePrevMonth}>
                <ChevronLeft size={16} />
              </Button>
              <Button variant="outline" size="icon" onClick={handleNextMonth}>
                <ChevronRight size={16} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-500">
              {weekdayLabels.map((day) => (
                <div key={day} className="py-2">
                  {day}
                </div>
              ))}
            </div>

            {monthError ? (
              <div className="p-4 border border-amber-200 bg-amber-50 text-amber-800 rounded-lg text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <div>{monthError}</div>
              </div>
            ) : null}

            <div className="grid grid-cols-7 gap-[1px] bg-slate-200 rounded-xl overflow-hidden">
              {monthLoading
                ? calendarDays.map((_, index) => <div key={`placeholder-${index}`} className="bg-white min-h-[108px] animate-pulse" />)
                : calendarDays.map((day, index) => {
                    const dateString = day ? getDateString(currentYear, currentMonth, day) : '';
                    return (
                      <DayCell
                        key={`day-${dateString || index}`}
                        day={day}
                        daySummary={dateString ? summaryMap[dateString] : undefined}
                        isSelected={Boolean(day && selectedDate === dateString)}
                        isToday={Boolean(day && dateString === todayString)}
                        onClick={() => dateString && setSelectedDate(dateString)}
                      />
                    );
                  })}
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              {selectedDate ? formatDateReadable(selectedDate) : 'Select a date'}
            </CardTitle>
            {selectedSummary ? (
              <p className="text-sm text-slate-500">
                {selectedSummary.harvest_count + selectedSummary.warning_count + selectedSummary.seed_count + selectedSummary.prep_count + selectedSummary.water_count}{' '}
                tasks scheduled
              </p>
            ) : (
              <p className="text-sm text-slate-500">No tasks recorded yet.</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {dayError ? (
              <div className="p-3 border border-amber-200 bg-amber-50 text-amber-800 rounded-lg text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <div>{dayError}</div>
              </div>
            ) : null}

            {dayLoading ? (
              <div className="py-10 text-center text-slate-500">Loading tasks...</div>
            ) : !selectedDate ? (
              <div className="py-10 text-center text-slate-500">Select a date to view tasks.</div>
            ) : dayTasks.length === 0 ? (
              <div className="py-10 text-center text-slate-500">No tasks scheduled for this date.</div>
            ) : (
              <div className="space-y-4">
                {harvestTasks.length ? <TaskGroup title="Harvest Time" icon={Scissors} color="emerald" tasks={harvestTasks} onTaskClick={setSelectedTask} /> : null}
                {selectedSummary?.warning_count && atRiskTasks.length > 0 ? <TaskGroup title="At Risk" icon={AlertTriangle} color="amber" tasks={atRiskTasks} onTaskClick={setSelectedTask} /> : null}
                {seedTasks.length ? <TaskGroup title="To Seed" icon={Sprout} color="indigo" tasks={seedTasks} onTaskClick={setSelectedTask} /> : null}
                {soakTasks.length ? <TaskGroup title="To Soak" icon={Beaker} color="purple" tasks={soakTasks} onTaskClick={setSelectedTask} /> : null}
                {passiveTasks.length ? <TaskGroup title="Check-ins" icon={Droplets} color="cyan" tasks={passiveTasks} onTaskClick={setSelectedTask} /> : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Task Detail Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTask && (
                <>
                  {selectedTask.task_name?.toLowerCase().startsWith('harvest') && !selectedTask.task_name?.toLowerCase().includes('risk') && <Scissors className="h-5 w-5 text-emerald-600" />}
                  {selectedTask.task_name?.toLowerCase().includes('risk') && <AlertTriangle className="h-5 w-5 text-amber-600" />}
                  {selectedTask.task_name?.toLowerCase().includes('seed') && <Sprout className="h-5 w-5 text-indigo-600" />}
                  {selectedTask.task_name?.toLowerCase().includes('soak') && <Beaker className="h-5 w-5 text-purple-600" />}
                  {(selectedTask.task_name?.toLowerCase().includes('water') || selectedTask.step_type === 'passive') && <Droplets className="h-5 w-5 text-cyan-600" />}
                  {selectedTask.task_name?.toLowerCase().includes('uncover') && <Sun className="h-5 w-5 text-amber-600" />}
                  Task Details
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Detailed information about this task
            </DialogDescription>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Task</p>
                  <p className="text-base font-semibold text-slate-900">{selectedTask.task_name || 'Task'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Recipe</p>
                  <p className="text-base font-semibold text-slate-900">{selectedTask.recipe_name || 'Unknown'}</p>
                </div>
              </div>

              {selectedTask.variety_name && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Variety</p>
                  <p className="text-base text-slate-900">{selectedTask.variety_name}</p>
                </div>
              )}

              {selectedTask.quantity !== null && selectedTask.quantity !== undefined && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Quantity</p>
                  <p className="text-base font-semibold text-slate-900">
                    {selectedTask.quantity} {selectedTask.quantity === 1 ? 'tray' : 'trays'}
                  </p>
                </div>
              )}

              {selectedTask.customer_name && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Customer</p>
                  <p className="text-base text-slate-900">{selectedTask.customer_name}</p>
                </div>
              )}

              {/* At-risk specific details */}
              {selectedTask.task_source === 'order_fulfillment' && (selectedTask as any).sow_date && (
                <div className="pt-4 border-t border-slate-200 space-y-2">
                  <p className="text-sm font-medium text-slate-700">Order Details</p>
                  {(selectedTask as any).sow_date && (
                    <div className="text-sm">
                      <span className="font-medium text-slate-600">Sow date:</span>{' '}
                      <span className="text-slate-900">
                        {new Date((selectedTask as any).sow_date + 'T00:00:00').toLocaleDateString()}
                      </span>
                      {new Date((selectedTask as any).sow_date + 'T00:00:00') < new Date() && (
                        <span className="ml-2 text-red-600">(Past due)</span>
                      )}
                    </div>
                  )}
                  {(selectedTask as any).harvest_date && (
                    <div className="text-sm">
                      <span className="font-medium text-slate-600">Harvest date:</span>{' '}
                      <span className="text-slate-900">
                        {new Date((selectedTask as any).harvest_date + 'T00:00:00').toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {(selectedTask as any).delivery_date && (
                    <div className="text-sm">
                      <span className="font-medium text-slate-600">Delivery date:</span>{' '}
                      <span className="text-slate-900">
                        {new Date((selectedTask as any).delivery_date + 'T00:00:00').toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {(selectedTask as any).trays_ready !== undefined && (selectedTask as any).trays_needed !== undefined && (
                    <div className="text-sm">
                      <span className="font-medium text-slate-600">Trays:</span>{' '}
                      <span className="text-slate-900">
                        {(selectedTask as any).trays_ready} / {(selectedTask as any).trays_needed} ready
                      </span>
                      {((selectedTask as any).trays_ready || 0) < ((selectedTask as any).trays_needed || 0) && (
                        <span className="ml-2 text-amber-600">
                          ({(selectedTask as any).trays_needed - (selectedTask as any).trays_ready} missing)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Harvest specific details */}
              {selectedTask.task_source === 'planting_schedule' && selectedTask.task_name?.toLowerCase().includes('harvest') && (
                <div className="pt-4 border-t border-slate-200 space-y-2">
                  <p className="text-sm font-medium text-slate-700">Harvest Details</p>
                  <div className="text-sm">
                    <span className="font-medium text-slate-600">Date:</span>{' '}
                    <span className="text-slate-900">
                      {new Date(selectedTask.task_date + 'T00:00:00').toLocaleDateString()}
                    </span>
                  </div>
                  {selectedTask.quantity && (
                    <div className="text-sm">
                      <span className="font-medium text-slate-600">Trays ready:</span>{' '}
                      <span className="text-slate-900">{selectedTask.quantity}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Seed/Soak specific details */}
              {(selectedTask.task_source === 'seed_request' || selectedTask.task_source === 'soak_request') && (
                <div className="pt-4 border-t border-slate-200 space-y-2">
                  <p className="text-sm font-medium text-slate-700">Preparation Details</p>
                  <div className="text-sm">
                    <span className="font-medium text-slate-600">Date:</span>{' '}
                    <span className="text-slate-900">
                      {new Date(selectedTask.task_date + 'T00:00:00').toLocaleDateString()}
                    </span>
                  </div>
                  {selectedTask.quantity && (
                    <div className="text-sm">
                      <span className="font-medium text-slate-600">Trays needed:</span>{' '}
                      <span className="text-slate-900">{selectedTask.quantity}</span>
                    </div>
                  )}
                  {selectedTask.customer_name && (
                    <div className="text-sm">
                      <span className="font-medium text-slate-600">For customer:</span>{' '}
                      <span className="text-slate-900">{selectedTask.customer_name}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-slate-200">
                <Button
                  variant="outline"
                  onClick={() => setSelectedTask(null)}
                  className="w-full"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CalendarPage;






