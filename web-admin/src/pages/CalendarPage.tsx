import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type LucideIcon, AlertTriangle, Beaker, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Droplets, Scissors, Sprout, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
}: {
  title: string;
  icon: LucideIcon;
  color: TaskGroupColor;
  tasks: CalendarDayTask[];
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
        {tasks.map((task) => (
          <div key={`${task.task_name}-${task.recipe_name}-${task.task_date}`} className="border rounded-lg p-3 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-slate-900">{task.recipe_name || task.task_name || 'Task'}</div>
              {task.quantity ? <span className="text-xs text-slate-500">{task.quantity} trays</span> : null}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-2">
              {task.task_name ? <span>{task.task_name}</span> : null}
              {task.variety_name ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{task.variety_name}</span> : null}
              {task.customer_name ? <span>Customer: {task.customer_name}</span> : null}
            </div>
          </div>
        ))}
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
                {harvestTasks.length ? <TaskGroup title="Harvest Time" icon={Scissors} color="emerald" tasks={harvestTasks} /> : null}
                {selectedSummary?.warning_count ? <TaskGroup title="At Risk" icon={AlertTriangle} color="amber" tasks={dayTasks.filter((task) => task.task_name?.toLowerCase().includes('risk'))} /> : null}
                {seedTasks.length ? <TaskGroup title="To Seed" icon={Sprout} color="indigo" tasks={seedTasks} /> : null}
                {soakTasks.length ? <TaskGroup title="To Soak" icon={Beaker} color="purple" tasks={soakTasks} /> : null}
                {passiveTasks.length ? <TaskGroup title="Check-ins" icon={Droplets} color="cyan" tasks={passiveTasks} /> : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CalendarPage;
