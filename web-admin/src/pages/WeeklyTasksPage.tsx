import { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, Circle, Clock, Play, Filter, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  generateWeeklyTasks, 
  fetchWeeklyTasks, 
  saveWeeklyTasks, 
  updateTaskStatus 
} from '../services/taskGeneratorService';

interface WeeklyTask {
  task_id?: number;
  task_type: 'soaking' | 'sowing' | 'uncovering' | 'harvesting';
  recipe_id: number;
  recipe_name: string;
  week_start_date: Date;
  week_number: number;
  task_date: Date;
  quantity: number;
  status: 'pending' | 'in-progress' | 'completed' | 'skipped';
  notes?: string;
}

const WeeklyTasksPage = () => {
  const [tasks, setTasks] = useState<WeeklyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string>(
    getWeekStartDate(new Date()).toISOString().split('T')[0]
  );
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    loadTasks();
  }, [selectedWeek]);

  const getWeekStartDate = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
  };

  const loadTasks = async () => {
    try {
      setLoading(true);
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);
      const weekStart = new Date(selectedWeek);

      const fetchedTasks = await fetchWeeklyTasks(weekStart, farmUuid);
      setTasks(fetchedTasks);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTasks = async () => {
    setGenerating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);
      const weekStart = new Date(selectedWeek);

      // Generate tasks
      const generatedTasks = await generateWeeklyTasks(weekStart, farmUuid);

      // Save to database
      const saved = await saveWeeklyTasks(generatedTasks, farmUuid);
      if (saved) {
        await loadTasks();
        alert(`Generated ${generatedTasks.length} tasks for the week`);
      } else {
        alert('Failed to save tasks');
      }
    } catch (error) {
      console.error('Error generating tasks:', error);
      alert('Failed to generate tasks');
    } finally {
      setGenerating(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId: number, newStatus: WeeklyTask['status']) => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      const updated = await updateTaskStatus(taskId, newStatus, farmUuid);
      if (updated) {
        await loadTasks();
      }
    } catch (error) {
      console.error('Error updating task status:', error);
      alert('Failed to update task status');
    }
  };

  const getTaskTypeColor = (type: string) => {
    switch (type) {
      case 'soaking': return 'bg-blue-100 text-blue-800';
      case 'sowing': return 'bg-green-100 text-green-800';
      case 'uncovering': return 'bg-yellow-100 text-yellow-800';
      case 'harvesting': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'in-progress': return <Play className="h-4 w-4 text-blue-600" />;
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
            onClick={handleGenerateTasks}
            disabled={generating}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : 'Generate Tasks'}
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
          <div className="grid grid-cols-4 gap-4 mb-6">
            {['soaking', 'sowing', 'uncovering', 'harvesting'].map((type) => {
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
            <div className="text-center py-8 text-gray-500">
              {tasks.length === 0 
                ? 'No tasks found for this week. Click "Generate Tasks" to create tasks from your active trays.'
                : 'No tasks match the selected filters.'}
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
                      {typeTasks.map((task) => (
                        <TableRow key={task.task_id || `${task.task_date}-${task.recipe_id}-${task.task_type}`}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-gray-400" />
                              {task.task_date.toLocaleDateString()}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{task.recipe_name}</TableCell>
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
                                  onClick={() => handleUpdateTaskStatus(task.task_id!, 'in-progress')}
                                >
                                  <Play className="h-4 w-4" />
                                </Button>
                              )}
                              {task.status !== 'completed' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUpdateTaskStatus(task.task_id!, 'completed')}
                                >
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                </Button>
                              )}
                              {task.status !== 'skipped' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUpdateTaskStatus(task.task_id!, 'skipped')}
                                >
                                  <Circle className="h-4 w-4 text-gray-400" />
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
    </div>
  );
};

export default WeeklyTasksPage;

