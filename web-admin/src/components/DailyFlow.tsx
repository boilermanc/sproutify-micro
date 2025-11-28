import { useState, useEffect } from 'react';
import { 
  Check, 
  Droplets, 
  Sun, 
  Scissors, 
  Clock, 
  MoreVertical,
  ArrowRight,
  Sprout,
  Eye,
  ExternalLink,
  SkipForward
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchDailyTasks, completeTask, getActiveTraysCount } from '../services/dailyFlowService';
import type { DailyTask } from '../services/dailyFlowService';
import { cn } from '@/lib/utils';

export default function DailyFlow() {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [activeTraysCount, setActiveTraysCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [viewingTask, setViewingTask] = useState<DailyTask | null>(null);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const [tasksData, count] = await Promise.all([
        fetchDailyTasks(),
        getActiveTraysCount()
      ]);
      setTasks(tasksData);
      setActiveTraysCount(count);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
    // Refresh every 5 minutes
    const interval = setInterval(loadTasks, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
    show: boolean;
  }>({ type: 'success', message: '', show: false });

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message, show: true });
    setTimeout(() => setNotification({ type, message, show: false }), 5000);
  };

  const handleComplete = async (task: DailyTask) => {
    setCompletingIds(prev => new Set(prev).add(task.id));
    try {
      const success = await completeTask(task);
      if (success) {
        // Remove completed task from list immediately for better UX
        setTasks(prev => prev.filter(t => t.id !== task.id));
        
        // Wait a moment for database to commit, then reload to get updated counts
        // This ensures the fetchDailyTasks sees the updated tray_steps
        setTimeout(async () => {
          await loadTasks();
        }, 500);
        
        // Show formatted success notification
        showNotification('success', `${task.action} completed for ${task.trays} ${task.trays === 1 ? 'tray' : 'trays'} (${task.batchId})`);
      } else {
        showNotification('error', 'Failed to complete task. Please try again.');
      }
    } catch (error: any) {
      console.error('Error completing task:', error);
      const errorMessage = error?.message || 'Failed to complete task. Please try again.';
      showNotification('error', errorMessage);
    } finally {
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const handleViewDetails = (task: DailyTask) => {
    setViewingTask(task);
  };

  const handleSkip = async (task: DailyTask) => {
    if (!confirm(`Skip this ${task.action} task for ${task.trays} tray(s)? You can complete it later.`)) {
      return;
    }
    // For now, just remove from the list (you might want to mark as skipped in the database)
    setTasks(prev => prev.filter(t => t.id !== task.id));
  };

  // Grouping Logic: Group by action type
  const harvestTasks = tasks.filter(t => t.action === 'Harvest');
  const workflowTasks = tasks.filter(t => t.action !== 'Harvest');

  // Get day name for header
  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  if (loading) {
    return (
      <div className="min-h-screen bg-white p-4 md:p-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-slate-500">Loading tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-4 md:p-8">
      
      {/* 1. TOP HEADER: High Level Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-1">{dayName}'s Flow</h2>
          <p className="text-slate-600 flex items-center gap-2">
            <Clock size={16} /> {tasks.length} {tasks.length === 1 ? 'Batch' : 'Batches'} require attention
          </p>
        </div>
        
        {/* Progress Summary Widget */}
        <div className="bg-white border border-slate-200 shadow-sm p-3 rounded-xl flex items-center gap-4 min-w-[200px]">
          <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
            <Sprout size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase">Active Trays</p>
            <p className="text-xl font-bold text-slate-900">{activeTraysCount.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        
        {/* SECTION 1: THE HARVEST (Priority #1) */}
        {harvestTasks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="h-8 w-1 bg-emerald-500 rounded-full"></span>
              <h3 className="text-xl font-semibold text-slate-900">Ready for Harvest</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {harvestTasks.map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  variant="harvest" 
                  onComplete={handleComplete}
                  isCompleting={completingIds.has(task.id)}
                  onViewDetails={handleViewDetails}
                />
              ))}
            </div>
          </section>
        )}

        {/* SECTION 2: WORKFLOW TASKS */}
        {workflowTasks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="h-8 w-1 bg-blue-500 rounded-full"></span>
              <h3 className="text-xl font-semibold text-slate-900">Tasks & Maintenance</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workflowTasks.map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  variant={task.action.toLowerCase() === 'uncover' ? 'warning' : 'default'} 
                  onComplete={handleComplete}
                  isCompleting={completingIds.has(task.id)}
                  onViewDetails={handleViewDetails}
                  onSkip={handleSkip}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Sprout size={64} className="text-slate-300 mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No Tasks Today</h3>
            <p className="text-slate-500 max-w-md">
              All caught up! No batches require attention right now. Check back later or create new trays to get started.
            </p>
          </div>
        )}

      </div>

      {/* Notification Toast */}
      {notification.show && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5">
          <Card className={cn(
            "p-4 shadow-lg border-2 min-w-[300px]",
            notification.type === 'success' 
              ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
              : "bg-red-50 border-red-200 text-red-900"
          )}>
            <div className="flex items-start gap-3">
              <div className={cn(
                "h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                notification.type === 'success' ? "bg-emerald-500" : "bg-red-500"
              )}>
                {notification.type === 'success' ? (
                  <Check className="h-3 w-3 text-white" />
                ) : (
                  <span className="text-white text-xs font-bold">×</span>
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">
                  {notification.type === 'success' ? 'Success' : 'Error'}
                </p>
                <p className="text-sm mt-1">{notification.message}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-500 hover:text-slate-900"
                onClick={() => setNotification({ ...notification, show: false })}
              >
                <span className="text-lg">×</span>
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Task Details Modal */}
      <Dialog open={!!viewingTask} onOpenChange={(open) => !open && setViewingTask(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingTask && (
                <>
                  {viewingTask.action === 'Harvest' && <Scissors className="h-5 w-5 text-emerald-600" />}
                  {viewingTask.action === 'Uncover' && <Sun className="h-5 w-5 text-amber-600" />}
                  {(viewingTask.action === 'Water' || viewingTask.action === 'Blackout') && <Droplets className="h-5 w-5 text-blue-600" />}
                  Task Details
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Detailed information about this task
            </DialogDescription>
          </DialogHeader>
          {viewingTask && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Action</p>
                  <p className="text-base font-semibold text-slate-900">{viewingTask.action}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Crop</p>
                  <p className="text-base font-semibold text-slate-900">{viewingTask.crop}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Batch ID</p>
                  <p className="text-base font-mono text-slate-900">{viewingTask.batchId}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Number of Trays</p>
                  <p className="text-base font-semibold text-slate-900">{viewingTask.trays} {viewingTask.trays === 1 ? 'Tray' : 'Trays'}</p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-500">Growth Progress</p>
                <div className="flex items-center gap-2">
                  <Progress 
                    value={(viewingTask.dayCurrent / viewingTask.dayTotal) * 100} 
                    className="flex-1 h-2"
                  />
                  <span className="text-sm font-semibold text-slate-700">
                    Day {viewingTask.dayCurrent} of {viewingTask.dayTotal}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Location</p>
                  <p className="text-base text-slate-900">{viewingTask.location}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Status</p>
                  <Badge 
                    variant={viewingTask.status === 'urgent' ? 'destructive' : 'secondary'}
                    className="mt-1"
                  >
                    {viewingTask.status === 'urgent' ? 'Urgent' : 'Pending'}
                  </Badge>
                </div>
              </div>

              {viewingTask.stepDescription && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Current Step</p>
                  <p className="text-base text-slate-900 italic">{viewingTask.stepDescription}</p>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setViewingTask(null)}
                    className="flex-1"
                  >
                    Close
                  </Button>
                  <Button
                    onClick={() => {
                      setViewingTask(null);
                      handleComplete(viewingTask);
                    }}
                    className="flex-1"
                    disabled={completingIds.has(viewingTask.id)}
                  >
                    {completingIds.has(viewingTask.id) ? 'Processing...' : 'Mark as Done'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- SUB-COMPONENT: The "Cool" Card ---
interface TaskCardProps {
  task: DailyTask;
  variant: 'harvest' | 'warning' | 'default';
  onComplete: (task: DailyTask) => void;
  isCompleting: boolean;
  onViewDetails?: (task: DailyTask) => void;
  onSkip?: (task: DailyTask) => void;
}

const TaskCard = ({ task, variant, onComplete, isCompleting, onViewDetails, onSkip }: TaskCardProps) => {
  // Styles based on action type
  const styles = {
    harvest: {
      accent: 'bg-emerald-500',
      border: 'hover:border-emerald-500/50',
      icon: <Scissors size={18} />,
      btn: 'hover:bg-emerald-500 hover:text-white',
      progress: 'bg-emerald-500'
    },
    warning: {
      accent: 'bg-amber-500',
      border: 'hover:border-amber-500/50',
      icon: <Sun size={18} />,
      btn: 'hover:bg-amber-500 hover:text-black',
      progress: 'bg-amber-500'
    },
    default: {
      accent: 'bg-blue-500',
      border: 'hover:border-blue-500/50',
      icon: <Droplets size={18} />,
      btn: 'hover:bg-blue-500 hover:text-white',
      progress: 'bg-blue-500'
    }
  };

  const style = styles[variant] || styles.default;
  const progressPercent = Math.min((task.dayCurrent / task.dayTotal) * 100, 100);

  return (
    <Card className={cn(
      "group relative overflow-hidden transition-all duration-300 hover:shadow-lg border-slate-200 bg-white",
      style.border
    )}>
      
      {/* Top Decor Bar */}
      <div className={cn("absolute top-0 left-0 w-full h-1", style.accent)}></div>

      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            {/* Icon Box */}
            <div className={cn(
              "h-10 w-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 group-hover:text-slate-900 transition-colors"
            )}>
              {style.icon}
            </div>
            <div>
              <h4 className="font-bold text-lg text-slate-900">{task.action}</h4>
              <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{task.batchId}</p>
            </div>
          </div>
          
          <Badge variant="secondary" className="font-mono bg-slate-100 text-slate-700">
            {task.trays} {task.trays === 1 ? 'Tray' : 'Trays'}
          </Badge>
        </div>

        {/* Content Body */}
        <div className="mb-5">
          <div className="flex justify-between items-end mb-2">
            <span className="text-slate-700 font-medium">{task.crop}</span>
            <span className="text-xs text-slate-500">Day {task.dayCurrent} of {task.dayTotal}</span>
          </div>
          {/* Lifecycle Progress Bar */}
          <div className="mb-2">
            <Progress 
              value={progressPercent} 
              className="h-1.5 bg-slate-200"
              indicatorColor={style.progress === 'bg-emerald-500' ? '#10b981' : 
                            style.progress === 'bg-amber-500' ? '#f59e0b' : 
                            '#3b82f6'}
            />
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <span>{task.location}</span>
          </div>
          {task.stepDescription && (
            <div className="mt-2 text-xs text-slate-500 italic">
              {task.stepDescription}
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="flex gap-2">
          <Button
            onClick={() => onComplete(task)}
            disabled={isCompleting}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 border-slate-200 text-slate-700 font-medium transition-all active:scale-95 hover:bg-slate-50",
              style.btn
            )}
            variant="outline"
          >
            {isCompleting ? 'Processing...' : (
              <>
                Mark Done <ArrowRight size={16} />
              </>
            )}
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline"
                size="icon"
                className="border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              >
                <MoreVertical size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem 
                onClick={() => onViewDetails?.(task)}
                className="cursor-pointer"
              >
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => {
                  // Navigate to trays page filtered by this batch/recipe
                  window.location.href = `/trays?recipe=${task.recipeId}`;
                }}
                className="cursor-pointer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View Trays
              </DropdownMenuItem>
              {onSkip && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => onSkip(task)}
                    className="cursor-pointer text-amber-600 focus:text-amber-600"
                  >
                    <SkipForward className="mr-2 h-4 w-4" />
                    Skip Task
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
};

