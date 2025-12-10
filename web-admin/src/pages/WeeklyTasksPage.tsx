import { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, Circle, Clock, Filter, X, AlertCircle, CheckCircle, Info, Settings, Plus, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '../lib/supabaseClient';
import { 
  fetchWeeklyTasks, 
  updateTaskStatus,
  type WeeklyTask
} from '../services/taskGeneratorService';

// Move function declaration before use
const getWeekStartDate = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
};

const WeeklyTasksPage = () => {
  const [tasks, setTasks] = useState<WeeklyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<string>(() => 
    getWeekStartDate(new Date()).toISOString().split('T')[0]
  );
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    show: boolean;
  }>({ type: 'success', message: '', show: false });
  const [maintenanceTasks, setMaintenanceTasks] = useState<Array<{
    maintenance_task_id: number;
    task_name: string;
    description: string | null;
    day_of_week: number | null;
    quantity: number;
    notes: string | null;
    is_active: boolean;
  }>>([]);
  const [isMaintenanceDialogOpen, setIsMaintenanceDialogOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [taskType, setTaskType] = useState<'one-time' | 'recurring' | null>(null);
  const [newMaintenanceTask, setNewMaintenanceTask] = useState({
    task_name: '',
    description: '',
    frequency: 'weekly' as 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'yearly' | 'one-time',
    day_of_week: null as number | null,
    task_date: null as string | null,
    day_of_month: null as number | null,
    notes: '',
  });

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message, show: true });
    setTimeout(() => setNotification({ type, message, show: false }), 6000);
  };

  const loadMaintenanceTasks = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .order('day_of_week', { ascending: true });

      if (error) throw error;
      setMaintenanceTasks(data || []);
    } catch (error) {
      console.error('Error loading maintenance tasks:', error);
    }
  };

  useEffect(() => {
    loadMaintenanceTasks();
  }, []);

  useEffect(() => {
    loadTasks();
  }, [selectedWeek]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);
      // Ensure the date is parsed correctly and set to midnight
      const weekStart = new Date(selectedWeek + 'T00:00:00');
      weekStart.setHours(0, 0, 0, 0);

      const fetchedTasks = await fetchWeeklyTasks(weekStart, farmUuid);
      setTasks(fetchedTasks);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTaskStatus = async (task: WeeklyTask, newStatus: 'pending' | 'completed' | 'skipped') => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        showNotification('error', 'Session expired. Please refresh the page.');
        return;
      }

      const { farmUuid } = JSON.parse(sessionData);

      const updated = await updateTaskStatus(task, newStatus, farmUuid);
      if (updated) {
        await loadTasks();
        showNotification('success', 'Task status updated successfully.');
      } else {
        showNotification('error', 'Failed to update task status. Please try again.');
      }
    } catch (error: any) {
      console.error('Error updating task status:', error);
      const errorMessage = error?.message || 'An unexpected error occurred.';
      showNotification('error', `Failed to update task status: ${errorMessage}`);
    }
  };


  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'skipped': return <Circle className="h-4 w-4 text-gray-400" />;
      default: return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  const filteredTasks = tasks.filter(task => {
    if (taskTypeFilter !== 'all' && task.task_type !== taskTypeFilter) return false;
    if (statusFilter !== 'all' && task.status !== statusFilter) return false;
    return true;
  });

  const tasksByType = filteredTasks.reduce((acc, task) => {
    if (!acc[task.task_type]) {
      acc[task.task_type] = [];
    }
    acc[task.task_type].push(task);
    return acc;
  }, {} as Record<string, WeeklyTask[]>);

  const weekStart = new Date(selectedWeek);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Weekly Tasks</h1>
          <p className="text-gray-600 mt-1">Manage your weekly growing tasks</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setIsMaintenanceDialogOpen(true)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Manage Maintenance Tasks
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Week Overview</CardTitle>
              <CardDescription>
                {weekStart.toLocaleDateString()} - {weekEnd.toLocaleDateString()}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="px-3 py-2 border rounded-lg"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-6 gap-4 mb-6">
            {['soaking', 'sowing', 'uncovering', 'harvesting', 'delivery', 'maintenance'].map((type) => {
              const typeTasks = tasks.filter(t => t.task_type === type);
              const completed = typeTasks.filter(t => t.status === 'completed').length;
              return (
                <div key={type} className="p-4 border rounded-lg">
                  <div className="text-sm text-gray-600 capitalize mb-1">{type}</div>
                  <div className="text-2xl font-bold">{typeTasks.length}</div>
                  <div className="text-xs text-gray-500">{completed} completed</div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <Select value={taskTypeFilter} onValueChange={setTaskTypeFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="soaking">Soaking</SelectItem>
                  <SelectItem value="sowing">Sowing</SelectItem>
                  <SelectItem value="uncovering">Uncovering</SelectItem>
                  <SelectItem value="harvesting">Harvesting</SelectItem>
                  <SelectItem value="delivery">Delivery</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="text-center py-8">Loading tasks...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-8">
              <div className="max-w-md mx-auto">
                <p className="text-gray-500 mb-4">
                  {tasks.length === 0 
                    ? 'No tasks found for this week. Click "Generate Tasks" to create tasks from your active trays.'
                    : 'No tasks match the selected filters.'}
                </p>
                {tasks.length === 0 && (
                  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Tip:</strong> To generate tasks, you need active trays with sow dates. 
                      Create trays in the <strong>Trays</strong> page first!
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(tasksByType).map(([type, typeTasks]) => (
                <div key={type} className="border rounded-lg">
                  <div className="p-3 bg-gray-50 border-b">
                    <h3 className="font-semibold capitalize">{type} Tasks</h3>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Recipe</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {typeTasks.map((task, index) => (
                        <TableRow key={`${task.task_date}-${task.recipe_id}-${task.task_type}-${index}`}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-gray-400" />
                              {task.task_date.toLocaleDateString()}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {task.task_description || task.recipe_name || 'N/A'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{task.quantity} tray(s)</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(task.status)}
                              <span className="capitalize">{task.status}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {task.status !== 'completed' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUpdateTaskStatus(task, 'completed')}
                                >
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                </Button>
                              )}
                              {task.status !== 'skipped' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUpdateTaskStatus(task, 'skipped')}
                                >
                                  <Circle className="h-4 w-4 text-gray-400" />
                                </Button>
                              )}
                              {task.status !== 'pending' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUpdateTaskStatus(task, 'pending')}
                                >
                                  <Clock className="h-4 w-4 text-yellow-600" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification Toast */}
      {notification.show && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5">
          <Card className={cn(
            "p-4 shadow-lg border-2 min-w-[300px] max-w-md",
            notification.type === 'success' 
              ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
              : notification.type === 'error'
              ? "bg-red-50 border-red-200 text-red-900"
              : "bg-blue-50 border-blue-200 text-blue-900"
          )}>
            <div className="flex items-start gap-3">
              <div className={cn(
                "flex-shrink-0 rounded-full p-1.5",
                notification.type === 'success'
                  ? "bg-emerald-100"
                  : notification.type === 'error'
                  ? "bg-red-100"
                  : "bg-blue-100"
              )}>
                {notification.type === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                ) : notification.type === 'error' ? (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                ) : (
                  <Info className="h-5 w-5 text-blue-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium whitespace-pre-wrap break-words">
                  {notification.message}
                </p>
              </div>
              <button
                onClick={() => setNotification({ ...notification, show: false })}
                className={cn(
                  "flex-shrink-0 rounded-md p-1 hover:bg-opacity-80 transition-colors",
                  notification.type === 'success'
                    ? "text-emerald-600 hover:bg-emerald-100"
                    : notification.type === 'error'
                    ? "text-red-600 hover:bg-red-100"
                    : "text-blue-600 hover:bg-blue-100"
                )}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Maintenance Tasks Dialog */}
      <Dialog 
        open={isMaintenanceDialogOpen} 
        onOpenChange={(open) => {
            setIsMaintenanceDialogOpen(open);
            if (!open) {
              // Reset wizard when dialog closes
              setWizardStep(1);
              setTaskType(null);
              setNewMaintenanceTask({
                task_name: '',
                description: '',
                frequency: 'weekly',
                day_of_week: null,
                task_date: null,
                day_of_month: null,
                notes: '',
              });
            }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Maintenance Tasks</DialogTitle>
            <DialogDescription>
              Create and manage recurring maintenance tasks that will appear in your weekly task list.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Existing Maintenance Tasks */}
            <div>
              <h3 className="font-semibold mb-2">Existing Tasks</h3>
              {maintenanceTasks.length === 0 ? (
                <p className="text-sm text-gray-500">No maintenance tasks configured yet.</p>
              ) : (
                <div className="space-y-2">
                  {maintenanceTasks.map((task) => (
                    <div key={task.maintenance_task_id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{task.task_name}</div>
                        {task.description && (
                          <div className="text-sm text-gray-600">{task.description}</div>
                        )}
                        <div className="text-xs text-gray-500 mt-1">
                          Day: {task.day_of_week !== null ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][task.day_of_week] : 'Monday (default)'}
                          {task.is_active ? '' : ' (Inactive)'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const sessionData = localStorage.getItem('sproutify_session');
                            if (!sessionData) return;
                            const { farmUuid } = JSON.parse(sessionData);
                            const { error } = await supabase
                              .from('maintenance_tasks')
                              .update({ is_active: !task.is_active })
                              .eq('maintenance_task_id', task.maintenance_task_id)
                              .eq('farm_uuid', farmUuid);
                            if (!error) {
                              await loadMaintenanceTasks();
                              showNotification('success', 'Maintenance task updated');
                            }
                          }}
                        >
                          {task.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const sessionData = localStorage.getItem('sproutify_session');
                            if (!sessionData) return;
                            const { farmUuid } = JSON.parse(sessionData);
                            const { error } = await supabase
                              .from('maintenance_tasks')
                              .delete()
                              .eq('maintenance_task_id', task.maintenance_task_id)
                              .eq('farm_uuid', farmUuid);
                            if (!error) {
                              await loadMaintenanceTasks();
                              showNotification('success', 'Maintenance task deleted');
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add New Maintenance Task - Multi-Step Wizard */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Add New Task</h3>
                {wizardStep > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setWizardStep(1);
                      setTaskType(null);
                      setNewMaintenanceTask({
                        task_name: '',
                        description: '',
                        frequency: 'weekly',
                        day_of_week: null,
                        task_date: null,
                        day_of_month: null,
                        notes: '',
                      });
                    }}
                  >
                    Start Over
                  </Button>
                )}
              </div>

              {/* Step Indicator */}
              <div className="flex items-center gap-2 mb-6">
                {[1, 2, 3, 4].map((step) => (
                  <div key={step} className="flex items-center flex-1">
                    <div className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors",
                      wizardStep === step
                        ? "bg-blue-600 border-blue-600 text-white"
                        : wizardStep > step
                        ? "bg-green-500 border-green-500 text-white"
                        : "bg-gray-100 border-gray-300 text-gray-500"
                    )}>
                      {wizardStep > step ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : (
                        <span className="text-sm font-medium">{step}</span>
                      )}
                    </div>
                    {step < 4 && (
                      <div className={cn(
                        "flex-1 h-0.5 mx-2",
                        wizardStep > step ? "bg-green-500" : "bg-gray-300"
                      )} />
                    )}
                  </div>
                ))}
              </div>

              {/* Step 1: Choose Task Type */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-lg font-medium mb-2">What type of task is this?</h4>
                    <p className="text-sm text-gray-600 mb-4">Choose whether this is a one-time task or a recurring task.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      variant={taskType === 'one-time' ? 'default' : 'outline'}
                      className="h-24 flex flex-col items-center justify-center gap-2"
                      onClick={() => {
                        setTaskType('one-time');
                        setNewMaintenanceTask({ ...newMaintenanceTask, frequency: 'one-time' });
                      }}
                    >
                      <Calendar className="h-6 w-6" />
                      <span className="font-medium">One-Time Task</span>
                      <span className="text-xs text-gray-500">Single occurrence on a specific date</span>
                    </Button>
                    <Button
                      variant={taskType === 'recurring' ? 'default' : 'outline'}
                      className="h-24 flex flex-col items-center justify-center gap-2"
                      onClick={() => {
                        setTaskType('recurring');
                        setNewMaintenanceTask({ ...newMaintenanceTask, frequency: 'weekly' });
                      }}
                    >
                      <RefreshCw className="h-6 w-6" />
                      <span className="font-medium">Recurring Task</span>
                      <span className="text-xs text-gray-500">Repeats on a schedule</span>
                    </Button>
                  </div>
                  {taskType && (
                    <Button
                      onClick={() => setWizardStep(2)}
                      className="w-full"
                    >
                      Continue
                    </Button>
                  )}
                </div>
              )}

              {/* Step 2: Basic Information */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-lg font-medium mb-2">Task Details</h4>
                    <p className="text-sm text-gray-600 mb-4">Tell us about this task.</p>
                  </div>
                  <div>
                    <Label htmlFor="task_name">Task Name *</Label>
                    <Input
                      id="task_name"
                      value={newMaintenanceTask.task_name}
                      onChange={(e) => setNewMaintenanceTask({ ...newMaintenanceTask, task_name: e.target.value })}
                      placeholder="e.g., Clean Trays"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={newMaintenanceTask.description}
                      onChange={(e) => setNewMaintenanceTask({ ...newMaintenanceTask, description: e.target.value })}
                      placeholder="e.g., Weekly maintenance: Clean and sanitize empty trays"
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setWizardStep(1)}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => {
                        if (!newMaintenanceTask.task_name.trim()) {
                          showNotification('error', 'Task name is required');
                          return;
                        }
                        if (taskType === 'one-time') {
                          setWizardStep(3); // Skip to schedule step for one-time
                        } else {
                          setWizardStep(3); // Go to frequency step for recurring
                        }
                      }}
                      className="flex-1"
                      disabled={!newMaintenanceTask.task_name.trim()}
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Schedule Details */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-lg font-medium mb-2">
                      {taskType === 'one-time' ? 'When should this task occur?' : 'How often should this task repeat?'}
                    </h4>
                    <p className="text-sm text-gray-600 mb-4">
                      {taskType === 'one-time' 
                        ? 'Select the specific date for this one-time task.'
                        : 'Choose the frequency and schedule for this recurring task.'}
                    </p>
                  </div>

                  {taskType === 'one-time' ? (
                    <div>
                      <Label htmlFor="task_date">Task Date *</Label>
                      <Input
                        id="task_date"
                        type="date"
                        value={newMaintenanceTask.task_date || ''}
                        onChange={(e) => setNewMaintenanceTask({ ...newMaintenanceTask, task_date: e.target.value })}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label htmlFor="frequency">Frequency *</Label>
                        <Select
                          value={newMaintenanceTask.frequency}
                          onValueChange={(value: any) => setNewMaintenanceTask({ ...newMaintenanceTask, frequency: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="bi-weekly">Bi-Weekly (Every 2 weeks)</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="yearly">Yearly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Day of Week for Weekly/Bi-Weekly */}
                      {(newMaintenanceTask.frequency === 'weekly' || newMaintenanceTask.frequency === 'bi-weekly') && (
                        <div>
                          <Label htmlFor="day_of_week">Day of Week *</Label>
                          <Select
                            value={newMaintenanceTask.day_of_week?.toString() || ''}
                            onValueChange={(value) => setNewMaintenanceTask({ ...newMaintenanceTask, day_of_week: parseInt(value) })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a day" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">Sunday</SelectItem>
                              <SelectItem value="1">Monday</SelectItem>
                              <SelectItem value="2">Tuesday</SelectItem>
                              <SelectItem value="3">Wednesday</SelectItem>
                              <SelectItem value="4">Thursday</SelectItem>
                              <SelectItem value="5">Friday</SelectItem>
                              <SelectItem value="6">Saturday</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Day of Month for Monthly */}
                      {newMaintenanceTask.frequency === 'monthly' && (
                        <div>
                          <Label htmlFor="day_of_month">Day of Month *</Label>
                          <Input
                            id="day_of_month"
                            type="number"
                            min="1"
                            max="31"
                            value={newMaintenanceTask.day_of_month || ''}
                            onChange={(e) => setNewMaintenanceTask({ ...newMaintenanceTask, day_of_month: parseInt(e.target.value) || null })}
                            placeholder="e.g., 1 (first day of month)"
                          />
                          <p className="text-xs text-gray-500 mt-1">Enter 1-31 for the day of the month</p>
                        </div>
                      )}

                      {/* Date for Yearly */}
                      {newMaintenanceTask.frequency === 'yearly' && (
                        <div>
                          <Label htmlFor="yearly_date">Date *</Label>
                          <Input
                            id="yearly_date"
                            type="date"
                            value={newMaintenanceTask.task_date || ''}
                            onChange={(e) => setNewMaintenanceTask({ ...newMaintenanceTask, task_date: e.target.value })}
                          />
                          <p className="text-xs text-gray-500 mt-1">This task will repeat on this date every year</p>
                        </div>
                      )}
                    </>
                  )}

                  <div>
                    <Label htmlFor="notes">Notes (Optional)</Label>
                    <Textarea
                      id="notes"
                      value={newMaintenanceTask.notes}
                      onChange={(e) => setNewMaintenanceTask({ ...newMaintenanceTask, notes: e.target.value })}
                      placeholder="Additional notes or instructions..."
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setWizardStep(2)}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => {
                        // Validate based on task type
                        if (taskType === 'one-time' && !newMaintenanceTask.task_date) {
                          showNotification('error', 'Please select a task date');
                          return;
                        }
                        if (taskType === 'recurring') {
                          if ((newMaintenanceTask.frequency === 'weekly' || newMaintenanceTask.frequency === 'bi-weekly') && newMaintenanceTask.day_of_week === null) {
                            showNotification('error', 'Please select a day of the week');
                            return;
                          }
                          if (newMaintenanceTask.frequency === 'monthly' && !newMaintenanceTask.day_of_month) {
                            showNotification('error', 'Please enter a day of the month');
                            return;
                          }
                          if (newMaintenanceTask.frequency === 'yearly' && !newMaintenanceTask.task_date) {
                            showNotification('error', 'Please select a date');
                            return;
                          }
                        }
                        setWizardStep(4);
                      }}
                      className="flex-1"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 4: Review and Save */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-lg font-medium mb-2">Review Your Task</h4>
                    <p className="text-sm text-gray-600 mb-4">Review the details before creating this task.</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div>
                      <span className="text-sm font-medium text-gray-600">Task Name:</span>
                      <p className="text-base font-semibold">{newMaintenanceTask.task_name}</p>
                    </div>
                    {newMaintenanceTask.description && (
                      <div>
                        <span className="text-sm font-medium text-gray-600">Description:</span>
                        <p className="text-base">{newMaintenanceTask.description}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-sm font-medium text-gray-600">Type:</span>
                      <p className="text-base capitalize">{taskType === 'one-time' ? 'One-Time Task' : 'Recurring Task'}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-600">Schedule:</span>
                      <p className="text-base">
                        {taskType === 'one-time' ? (
                          new Date(newMaintenanceTask.task_date!).toLocaleDateString()
                        ) : (
                          <>
                            {newMaintenanceTask.frequency === 'daily' && 'Every day'}
                            {newMaintenanceTask.frequency === 'weekly' && `Every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][newMaintenanceTask.day_of_week!]}`}
                            {newMaintenanceTask.frequency === 'bi-weekly' && `Every other ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][newMaintenanceTask.day_of_week!]}`}
                            {newMaintenanceTask.frequency === 'monthly' && `Day ${newMaintenanceTask.day_of_month} of every month`}
                            {newMaintenanceTask.frequency === 'yearly' && `Every year on ${new Date(newMaintenanceTask.task_date!).toLocaleDateString()}`}
                          </>
                        )}
                      </p>
                    </div>
                    {newMaintenanceTask.notes && (
                      <div>
                        <span className="text-sm font-medium text-gray-600">Notes:</span>
                        <p className="text-base">{newMaintenanceTask.notes}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setWizardStep(3)}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={async () => {
                        const sessionData = localStorage.getItem('sproutify_session');
                        if (!sessionData) return;
                        const { farmUuid } = JSON.parse(sessionData);
                        
                        const insertData: any = {
                          farm_uuid: farmUuid,
                          task_name: newMaintenanceTask.task_name,
                          description: newMaintenanceTask.description || null,
                          frequency: newMaintenanceTask.frequency,
                          quantity: 1, // Default to 1, quantity not needed for maintenance tasks
                          notes: newMaintenanceTask.notes || null,
                          is_active: true,
                        };

                        // Set appropriate date fields based on frequency
                        if (taskType === 'one-time') {
                          insertData.task_date = newMaintenanceTask.task_date;
                          insertData.day_of_week = null;
                          insertData.day_of_month = null;
                        } else {
                          if (newMaintenanceTask.frequency === 'weekly' || newMaintenanceTask.frequency === 'bi-weekly') {
                            insertData.day_of_week = newMaintenanceTask.day_of_week;
                            insertData.task_date = null;
                            insertData.day_of_month = null;
                          } else if (newMaintenanceTask.frequency === 'monthly') {
                            insertData.day_of_month = newMaintenanceTask.day_of_month;
                            insertData.day_of_week = null;
                            insertData.task_date = null;
                          } else if (newMaintenanceTask.frequency === 'yearly') {
                            insertData.task_date = newMaintenanceTask.task_date;
                            insertData.day_of_week = null;
                            insertData.day_of_month = null;
                          } else if (newMaintenanceTask.frequency === 'daily') {
                            insertData.day_of_week = null;
                            insertData.task_date = null;
                            insertData.day_of_month = null;
                          }
                        }

                        const { error } = await supabase
                          .from('maintenance_tasks')
                          .insert(insertData);

                        if (error) {
                          console.error('Error creating task:', error);
                          showNotification('error', 'Failed to create maintenance task');
                        } else {
                          showNotification('success', 'Maintenance task created successfully!');
                          setWizardStep(1);
                          setTaskType(null);
                          setNewMaintenanceTask({
                            task_name: '',
                            description: '',
                            frequency: 'weekly',
                            day_of_week: null,
                            task_date: null,
                            day_of_month: null,
                            notes: '',
                          });
                          await loadMaintenanceTasks();
                        }
                      }}
                      className="flex-1"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Task
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMaintenanceDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WeeklyTasksPage;

