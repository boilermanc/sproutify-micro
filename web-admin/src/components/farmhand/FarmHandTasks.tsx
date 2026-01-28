import { useState, useEffect, useCallback } from 'react';
import {
  Check,
  Droplets,
  Sun,
  Scissors,
  Sprout,
  RefreshCw,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { fetchDailyTasks, completeTask } from '@/services/dailyFlowService';
import type { DailyTask } from '@/services/dailyFlowService';
import { cn } from '@/lib/utils';

const ACTION_ICONS: Record<string, typeof Check> = {
  'Harvest': Scissors,
  'Water': Droplets,
  'Uncover': Sun,
  'Blackout': Sun,
  'Seed': Sprout,
  'Soak': Droplets,
};

const ACTION_COLORS: Record<string, string> = {
  'Harvest': 'text-amber-600 bg-amber-50 border-amber-200',
  'Water': 'text-blue-600 bg-blue-50 border-blue-200',
  'Uncover': 'text-yellow-600 bg-yellow-50 border-yellow-200',
  'Blackout': 'text-slate-600 bg-slate-50 border-slate-200',
  'Seed': 'text-emerald-600 bg-emerald-50 border-emerald-200',
  'Soak': 'text-cyan-600 bg-cyan-50 border-cyan-200',
};

const FarmHandTasks = () => {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmTask, setConfirmTask] = useState<DailyTask | null>(null);
  const [completing, setCompleting] = useState(false);

  const loadTasks = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      setError(null);

      const allTasks = await fetchDailyTasks(new Date(), true);

      // Filter out harvest tasks (they go to the Harvest tab)
      // Keep: Water, Uncover, Blackout, Seed, Soak, and other maintenance tasks
      const nonHarvestTasks = allTasks.filter(t => t.action !== 'Harvest');

      setTasks(nonHarvestTasks);
    } catch (err) {
      console.error('Error loading tasks:', err);
      setError('Failed to load tasks');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleCompleteTask = async () => {
    if (!confirmTask) return;

    try {
      setCompleting(true);
      await completeTask(confirmTask);

      // Remove completed task from list
      setTasks(prev => prev.filter(t => t.id !== confirmTask.id));
      setConfirmTask(null);
    } catch (err) {
      console.error('Error completing task:', err);
      setError('Failed to complete task');
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Today's Tasks</h1>
          <p className="text-sm text-slate-500">
            {tasks.length === 0 ? 'All caught up!' : `${tasks.length} task${tasks.length !== 1 ? 's' : ''} remaining`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => loadTasks(true)}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </Card>
      )}

      {/* Task List */}
      {tasks.length === 0 ? (
        <Card className="p-8 text-center">
          <Check className="h-12 w-12 mx-auto text-emerald-500 mb-3" />
          <p className="text-lg font-medium text-slate-700">All tasks complete!</p>
          <p className="text-sm text-slate-500 mt-1">Great work today.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const Icon = ACTION_ICONS[task.action] || Check;
            const colorClass = ACTION_COLORS[task.action] || 'text-slate-600 bg-slate-50 border-slate-200';

            return (
              <Card
                key={task.id}
                className={cn(
                  "p-4 border-l-4 cursor-pointer transition-all active:scale-[0.98]",
                  colorClass,
                  task.status === 'urgent' && "ring-2 ring-red-400 ring-offset-2"
                )}
                onClick={() => setConfirmTask(task)}
              >
                <div className="flex items-start gap-3">
                  <div className={cn("p-2 rounded-lg", colorClass.split(' ')[1])}>
                    <Icon className={cn("h-5 w-5", colorClass.split(' ')[0])} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">{task.action}</span>
                      {task.status === 'urgent' && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                          URGENT
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-700 truncate">{task.crop}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                      <span>{task.trays} tray{task.trays !== 1 ? 's' : ''}</span>
                      {task.dayCurrent && task.dayTotal && (
                        <>
                          <span>•</span>
                          <span>Day {task.dayCurrent}/{task.dayTotal}</span>
                        </>
                      )}
                      {task.location && (
                        <>
                          <span>•</span>
                          <span className="truncate">{task.location}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmTask} onOpenChange={() => setConfirmTask(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Complete Task?</DialogTitle>
            <DialogDescription>
              {confirmTask && (
                <>
                  Mark <strong>{confirmTask.action}</strong> for{' '}
                  <strong>{confirmTask.crop}</strong> ({confirmTask.trays} tray{confirmTask.trays !== 1 ? 's' : ''}) as complete?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmTask(null)}
              disabled={completing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCompleteTask}
              disabled={completing}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {completing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Complete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FarmHandTasks;
