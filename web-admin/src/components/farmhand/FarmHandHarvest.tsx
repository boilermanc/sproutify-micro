import { useState, useEffect, useCallback } from 'react';
import {
  Scissors,
  RefreshCw,
  AlertCircle,
  Loader2,
  Check,
  Scale
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const FarmHandHarvest = () => {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<DailyTask | null>(null);
  const [yieldWeight, setYieldWeight] = useState('');
  const [completing, setCompleting] = useState(false);

  const loadTasks = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      setError(null);

      const allTasks = await fetchDailyTasks(new Date(), true);

      // Filter to only harvest tasks
      const harvestTasks = allTasks.filter(t => t.action === 'Harvest');

      // Sort: urgent first, then by crop name
      harvestTasks.sort((a, b) => {
        if (a.status === 'urgent' && b.status !== 'urgent') return -1;
        if (a.status !== 'urgent' && b.status === 'urgent') return 1;
        return a.crop.localeCompare(b.crop);
      });

      setTasks(harvestTasks);
    } catch (err) {
      console.error('Error loading harvest tasks:', err);
      setError('Failed to load harvest tasks');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleHarvest = async () => {
    if (!selectedTask) return;

    try {
      setCompleting(true);

      // Parse yield weight (optional)
      const yieldValue = yieldWeight ? parseFloat(yieldWeight) : undefined;

      await completeTask(selectedTask, yieldValue);

      // Remove completed task from list
      setTasks(prev => prev.filter(t => t.id !== selectedTask.id));
      setSelectedTask(null);
      setYieldWeight('');
    } catch (err) {
      console.error('Error completing harvest:', err);
      setError('Failed to complete harvest');
    } finally {
      setCompleting(false);
    }
  };

  const openHarvestDialog = (task: DailyTask) => {
    setSelectedTask(task);
    setYieldWeight('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Ready to Harvest</h1>
          <p className="text-sm text-slate-500">
            {tasks.length === 0 ? 'No trays ready' : `${tasks.length} batch${tasks.length !== 1 ? 'es' : ''} ready`}
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

      {/* Harvest List */}
      {tasks.length === 0 ? (
        <Card className="p-8 text-center">
          <Scissors className="h-12 w-12 mx-auto text-slate-400 mb-3" />
          <p className="text-lg font-medium text-slate-700">No harvest tasks today</p>
          <p className="text-sm text-slate-500 mt-1">Check back later for ready trays.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card
              key={task.id}
              className={cn(
                "p-4 border-l-4 cursor-pointer transition-all active:scale-[0.98]",
                "border-amber-400 bg-amber-50",
                task.status === 'urgent' && "ring-2 ring-red-400 ring-offset-2"
              )}
              onClick={() => openHarvestDialog(task)}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-100">
                  <Scissors className="h-5 w-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{task.crop}</span>
                    {task.status === 'urgent' && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                        READY
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-sm text-slate-600">
                    <span className="font-medium">{task.trays} tray{task.trays !== 1 ? 's' : ''}</span>
                    {task.dayCurrent && task.dayTotal && (
                      <>
                        <span>•</span>
                        <span>Day {task.dayCurrent}/{task.dayTotal}</span>
                      </>
                    )}
                  </div>
                  {task.location && (
                    <p className="text-xs text-slate-500 mt-1 truncate">{task.location}</p>
                  )}
                  {task.trayIds && task.trayIds.length > 0 && (
                    <p className="text-xs text-slate-400 mt-1">
                      Tray IDs: {task.trayIds.slice(0, 3).join(', ')}
                      {task.trayIds.length > 3 && ` +${task.trayIds.length - 3} more`}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Harvest Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5 text-amber-600" />
              Harvest {selectedTask?.crop}
            </DialogTitle>
            <DialogDescription>
              {selectedTask && (
                <>
                  Harvesting {selectedTask.trays} tray{selectedTask.trays !== 1 ? 's' : ''}.
                  Optionally enter the total yield weight.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="yield" className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-slate-500" />
                Total Yield Weight (optional)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="yield"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={yieldWeight}
                  onChange={(e) => setYieldWeight(e.target.value)}
                  className="flex-1"
                />
                <span className="text-sm text-slate-500 w-8">lbs</span>
              </div>
              {yieldWeight && selectedTask && parseFloat(yieldWeight) > 0 && (
                <p className="text-xs text-slate-500">
                  ~{(parseFloat(yieldWeight) / selectedTask.trays).toFixed(2)} lbs per tray
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSelectedTask(null)}
              disabled={completing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleHarvest}
              disabled={completing}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {completing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Mark Harvested
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FarmHandHarvest;
