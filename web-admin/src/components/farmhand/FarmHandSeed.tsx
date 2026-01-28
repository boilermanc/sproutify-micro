import { useState, useEffect, useCallback } from 'react';
import {
  Sprout,
  Check,
  Loader2,
  AlertCircle,
  RefreshCw,
  Package,
  User,
  Calendar,
  ChevronRight,
  Droplets
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchDailyTasks, completeSeedTask, completeSoakTask, completeSoakTaskByRecipe } from '@/services/dailyFlowService';
import type { DailyTask } from '@/services/dailyFlowService';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

interface SeedBatch {
  batchid: number;
  variety_name: string;
  quantity: number;
  lot_number: string | null;
  purchasedate: string | null;
}

const FarmHandSeed = () => {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seeding dialog state
  const [selectedTask, setSelectedTask] = useState<DailyTask | null>(null);
  const [batches, setBatches] = useState<SeedBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const loadTasks = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      setError(null);

      const allTasks = await fetchDailyTasks(new Date(), true);

      // Filter to seeding-related tasks only:
      // - Seed tasks (from planting schedule or seed_request)
      // - Soak tasks (for varieties that need soaking)
      const seedingTasks = allTasks.filter(t => {
        const action = t.action.toLowerCase();
        return action === 'seed' || action === 'soak' || action.includes('seed');
      });

      // Sort: urgent first, then by crop name
      seedingTasks.sort((a, b) => {
        if (a.status === 'urgent' && b.status !== 'urgent') return -1;
        if (a.status !== 'urgent' && b.status === 'urgent') return 1;
        // Then by overdue status
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        return a.crop.localeCompare(b.crop);
      });

      setTasks(seedingTasks);
    } catch (err) {
      console.error('Error loading seeding tasks:', err);
      setError('Failed to load seeding schedule');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Load available seed batches when a task is selected
  const loadBatches = useCallback(async (task: DailyTask) => {
    try {
      setLoadingBatches(true);
      setBatches([]);
      setSelectedBatchId('');

      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) throw new Error('Session not found');
      const { farmUuid } = JSON.parse(sessionData);

      // Get variety name from task
      const varietyName = task.crop;

      // Fetch seed batches for this variety
      const { data: batchesData, error: batchesError } = await getSupabaseClient()
        .from('seedbatches')
        .select(`
          batchid,
          quantity,
          lot_number,
          purchasedate,
          varieties!inner(name)
        `)
        .eq('farm_uuid', farmUuid)
        .gt('quantity', 0)
        .order('purchasedate', { ascending: false });

      if (batchesError) throw batchesError;

      // Filter to matching variety and transform
      const matchingBatches = (batchesData || [])
        .filter((b: any) => {
          const batchVariety = b.varieties?.name?.toLowerCase() || '';
          return batchVariety === varietyName.toLowerCase();
        })
        .map((b: any) => ({
          batchid: b.batchid,
          variety_name: b.varieties?.name || '',
          quantity: b.quantity,
          lot_number: b.lot_number,
          purchasedate: b.purchasedate,
        }));

      setBatches(matchingBatches);

      // Auto-select if only one batch
      if (matchingBatches.length === 1) {
        setSelectedBatchId(String(matchingBatches[0].batchid));
      }
    } catch (err) {
      console.error('Error loading batches:', err);
      setError('Failed to load seed batches');
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  const handleTaskSelect = (task: DailyTask) => {
    setSelectedTask(task);
    setSuccess(null);
    loadBatches(task);
  };

  const handleComplete = async () => {
    if (!selectedTask) return;

    try {
      setCompleting(true);
      setError(null);

      const batchId = selectedBatchId ? parseInt(selectedBatchId) : null;
      const quantity = selectedTask.trays || selectedTask.quantity || 1;
      const taskDate = new Date().toISOString().split('T')[0];

      // Handle based on task type
      if (selectedTask.action.toLowerCase() === 'soak') {
        // Soak task - use completeSoakTask or completeSoakTaskByRecipe
        if (selectedTask.requestId) {
          // completeSoakTask params: requestId, seedbatchId, quantityGrams, taskDate
          await completeSoakTask(
            selectedTask.requestId,
            batchId || 0,
            quantity * 100, // Convert trays to approx grams (adjust as needed)
            taskDate
          );
        } else if (selectedTask.recipeId) {
          // Use recipe-based completion for planting_schedule tasks
          await completeSoakTaskByRecipe(
            selectedTask.recipeId,
            batchId || 0,
            quantity * 100,
            taskDate
          );
        }
      } else if (selectedTask.requestId) {
        // Seed request task - use completeSeedTask
        await completeSeedTask(
          selectedTask.requestId,
          quantity,
          batchId,
          undefined,
          selectedTask.recipeId
        );
      } else {
        // Fallback - create tray_creation_request manually
        const sessionData = localStorage.getItem('sproutify_session');
        if (!sessionData) throw new Error('Session not found');
        const { farmUuid, userId } = JSON.parse(sessionData);

        const { error: requestError } = await getSupabaseClient()
          .from('tray_creation_requests')
          .insert({
            farm_uuid: farmUuid,
            recipe_id: selectedTask.recipeId,
            recipe_name: selectedTask.crop,
            variety_name: selectedTask.crop,
            quantity: quantity,
            seed_date: new Date().toISOString().split('T')[0],
            status: 'completed',
            source_type: 'manual',
            user_id: userId,
            batch_id: batchId,
          });

        if (requestError) throw requestError;
      }

      // Show success and remove task from list
      setSuccess(`Seeded ${quantity} tray${quantity !== 1 ? 's' : ''} of ${selectedTask.crop}`);
      setTasks(prev => prev.filter(t => t.id !== selectedTask.id));

      // Close dialog after delay
      setTimeout(() => {
        setSelectedTask(null);
        setSuccess(null);
      }, 2000);
    } catch (err) {
      console.error('Error completing seeding:', err);
      setError('Failed to complete seeding');
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
          <h1 className="text-xl font-bold text-slate-900">Seeding Schedule</h1>
          <p className="text-sm text-slate-500">
            {tasks.length === 0 ? 'No seeding scheduled' : `${tasks.length} item${tasks.length !== 1 ? 's' : ''} to seed`}
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
          <Sprout className="h-12 w-12 mx-auto text-slate-400 mb-3" />
          <p className="text-lg font-medium text-slate-700">No seeding tasks today</p>
          <p className="text-sm text-slate-500 mt-1">
            Seeding tasks from the planting schedule will appear here.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const isSoak = task.action.toLowerCase() === 'soak';
            const isOverdue = task.isOverdue || task.status === 'urgent';

            return (
              <Card
                key={task.id}
                className={cn(
                  "p-4 border-l-4 cursor-pointer transition-all active:scale-[0.98]",
                  isSoak
                    ? "border-cyan-400 bg-cyan-50"
                    : "border-emerald-400 bg-emerald-50",
                  isOverdue && "ring-2 ring-red-400 ring-offset-2"
                )}
                onClick={() => handleTaskSelect(task)}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    isSoak ? "bg-cyan-100" : "bg-emerald-100"
                  )}>
                    {isSoak ? (
                      <Droplets className="h-5 w-5 text-cyan-600" />
                    ) : (
                      <Sprout className="h-5 w-5 text-emerald-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">{task.crop}</span>
                      <div className="flex items-center gap-2">
                        {isOverdue && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                            {task.daysOverdue ? `${task.daysOverdue}d overdue` : 'URGENT'}
                          </span>
                        )}
                        <ChevronRight className="h-5 w-5 text-slate-400" />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn(
                        "text-sm font-medium",
                        isSoak ? "text-cyan-700" : "text-emerald-700"
                      )}>
                        {isSoak ? 'Soak' : 'Seed'} {task.trays || task.quantity || 1} tray{(task.trays || task.quantity || 1) !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Customer / Order context */}
                    {task.customerName && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                        <User className="h-3 w-3" />
                        <span>{task.customerName}</span>
                      </div>
                    )}

                    {/* Delivery date if available */}
                    {task.deliveryDate && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                        <Calendar className="h-3 w-3" />
                        <span>Deliver: {new Date(task.deliveryDate).toLocaleDateString()}</span>
                      </div>
                    )}

                    {/* Location */}
                    {task.location && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                        <Package className="h-3 w-3" />
                        <span>{task.location}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Seeding Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTask?.action.toLowerCase() === 'soak' ? (
                <Droplets className="h-5 w-5 text-cyan-600" />
              ) : (
                <Sprout className="h-5 w-5 text-emerald-600" />
              )}
              {selectedTask?.action} {selectedTask?.crop}
            </DialogTitle>
            <DialogDescription>
              {selectedTask && (
                <>
                  {selectedTask.action.toLowerCase() === 'soak' ? 'Soaking' : 'Seeding'}{' '}
                  {selectedTask.trays || selectedTask.quantity || 1} tray
                  {(selectedTask.trays || selectedTask.quantity || 1) !== 1 ? 's' : ''}.
                  {selectedTask.customerName && (
                    <> For <strong>{selectedTask.customerName}</strong>.</>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {success ? (
            <div className="py-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="h-8 w-8 text-emerald-600" />
              </div>
              <p className="text-lg font-medium text-slate-900">{success}</p>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="batch">Select Seed Batch</Label>
                  {loadingBatches ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                  ) : batches.length === 0 ? (
                    <Card className="p-3 bg-amber-50 border-amber-200">
                      <p className="text-sm text-amber-700">
                        No seed batches available for {selectedTask?.crop}.
                      </p>
                    </Card>
                  ) : (
                    <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a batch..." />
                      </SelectTrigger>
                      <SelectContent>
                        {batches.map((batch) => (
                          <SelectItem key={batch.batchid} value={String(batch.batchid)}>
                            <div className="flex items-center justify-between gap-4">
                              <span>
                                {batch.lot_number || `Batch #${batch.batchid}`}
                              </span>
                              <span className="text-slate-500 text-sm">
                                {batch.quantity.toFixed(0)}g
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Summary */}
                {selectedTask && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Variety</span>
                      <span className="font-medium">{selectedTask.crop}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Quantity</span>
                      <span className="font-medium">
                        {selectedTask.trays || selectedTask.quantity || 1} tray{(selectedTask.trays || selectedTask.quantity || 1) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                )}
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
                  onClick={handleComplete}
                  disabled={completing || (batches.length > 0 && !selectedBatchId)}
                  className={cn(
                    selectedTask?.action.toLowerCase() === 'soak'
                      ? "bg-cyan-600 hover:bg-cyan-700"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  )}
                >
                  {completing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      {selectedTask?.action.toLowerCase() === 'soak' ? 'Mark Soaked' : 'Mark Seeded'}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FarmHandSeed;
