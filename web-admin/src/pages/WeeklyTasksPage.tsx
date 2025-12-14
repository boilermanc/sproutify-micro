import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, Calendar, Check, CheckCircle2, ChevronDown, Clock, FileText, Info, Loader2, RefreshCw, Sprout, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '../lib/supabaseClient';
import {
  fetchOrderFulfillmentDetails,
  fetchOrderFulfillmentSummary,
  getSowDateForOrder,
  type OrderFulfillmentStatus,
  type OrderFulfillmentSummary,
} from '../services/orderFulfillmentService';
import { fetchWeeklyTasks, updateTaskStatus, type WeeklyTask } from '../services/taskGeneratorService';
import { GenerateSeedingRequestsButton } from '../components/GenerateSeedingRequestsButton';
import { recordFulfillmentAction, type FulfillmentActionType } from '../services/orderFulfillmentActions';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';

type DeliveryKey = { deliveryDate: string; customerName: string; orderStatus: OrderFulfillmentSummary['order_status'] };

type RecipeOption = {
  recipe_id: number;
  recipe_name: string;
  variety_name?: string | null;
  varieties?: { name?: string | null };
};

const statusColors = {
  ready: { bg: 'bg-green-50', border: 'border-green-500', text: 'text-green-700' },
  plantable: { bg: 'bg-blue-50', border: 'border-blue-500', text: 'text-blue-700' },
  at_risk: { bg: 'bg-red-50', border: 'border-red-500', text: 'text-red-700' },
};

const statusDisplay = {
  ready: { label: 'Ready', icon: CheckCircle2 },
  plantable: { label: 'Pending', icon: Clock },
  at_risk: { label: 'At Risk', icon: XCircle },
};

const itemStatusLabel: Record<OrderFulfillmentStatus['fulfillment_status'], string> = {
  fulfilled: 'Fulfilled',
  partial: 'Partial',
  no_trays: 'No Trays',
};

const formatDate = (iso: string) => {
  if (!iso) return '—';
  return format(parseISO(iso), 'MMM d, yyyy');
};

const isoDate = (d: Date) => d.toISOString().split('T')[0];

const getWeekStartDate = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  return new Date(d.setDate(diff));
};

const WeeklyTasksPage = () => {
  const navigate = useNavigate();
  const [farmUuid, setFarmUuid] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summary, setSummary] = useState<OrderFulfillmentSummary[]>([]);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [weeklyTasks, setWeeklyTasks] = useState<WeeklyTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<string>(() =>
    getWeekStartDate(new Date()).toISOString().split('T')[0]
  );
  const [taskError, setTaskError] = useState<string | null>(null);

  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryKey | null>(null);
  const [details, setDetails] = useState<OrderFulfillmentStatus[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [actionDialog, setActionDialog] = useState<{
    type: FulfillmentActionType | null;
    item: OrderFulfillmentStatus | null;
  }>({ type: null, item: null });
  const [actionReason, setActionReason] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [actionSaving, setActionSaving] = useState(false);

  useEffect(() => {
    if (detailsOpen && details.length > 0) {
      const todayStr = new Date().toISOString().split('T')[0];
      console.log('Order items (render):', details.map((i) => ({
        recipe: i.recipe_name,
        sow_date: i.sow_date,
        harvest_date: i.harvest_date,
        trays_ready: i.trays_ready,
        trays_needed: i.trays_needed,
        today: todayStr,
      })));
    }
  }, [detailsOpen, details]);

  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);

  const [addTrayOpen, setAddTrayOpen] = useState(false);
  const [addTraySubmitting, setAddTraySubmitting] = useState(false);
  const [addTrayError, setAddTrayError] = useState<string | null>(null);
  const [addTraySuccess, setAddTraySuccess] = useState<string | null>(null);
  const [addTrayForm, setAddTrayForm] = useState({
    recipeId: '',
    quantity: 1,
    seedDate: '',
    deliveryDate: '',
    customerName: '',
    recipeName: '',
  });

  const dateRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    return { start: isoDate(start), end: isoDate(end) };
  }, []);

  useEffect(() => {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) {
      setSummaryError('Session not found. Please sign in again.');
      return;
    }
    const { farmUuid: storedFarmUuid, userId: storedUserId } = JSON.parse(sessionData);
    setFarmUuid(storedFarmUuid);
    setUserId(storedUserId);
    loadRecipes(storedFarmUuid);
    loadSummary(storedFarmUuid, dateRange.start, dateRange.end);
    loadWeekly(storedFarmUuid, selectedWeek);
  }, [dateRange.end, dateRange.start, selectedWeek]);

  useEffect(() => {
    if (farmUuid) {
      loadWeekly(farmUuid, selectedWeek);
    }
  }, [farmUuid, selectedWeek]);

  const loadRecipes = async (farmId: string) => {
    setRecipesLoading(true);
    const { data, error } = await supabase
      .from('recipes')
      .select('recipe_id, recipe_name, variety_name, varieties(name)')
      .eq('farm_uuid', farmId)
      .eq('is_active', true)
      .order('recipe_name', { ascending: true });

    if (!error && data) {
      setRecipes(data);
    }
    setRecipesLoading(false);
  };

  const loadSummary = async (farmId: string, start: string, end: string) => {
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const data = await fetchOrderFulfillmentSummary(farmId, start, end);
      setSummary(data);
    } catch (error: any) {
      setSummaryError(error?.message || 'Unable to load fulfillment overview.');
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadWeekly = async (farmId: string, weekStartIso: string) => {
    setTasksLoading(true);
    setTaskError(null);
    try {
      const weekStart = new Date(weekStartIso + 'T00:00:00');
      const data = await fetchWeeklyTasks(weekStart, farmId);
      setWeeklyTasks(data);
    } catch (error: any) {
      setTaskError(error?.message || 'Unable to load weekly tasks.');
    } finally {
      setTasksLoading(false);
    }
  };

  const loadDetails = async (key: DeliveryKey) => {
    if (!farmUuid) return;
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      console.log('Fetching order items for', key.deliveryDate, key.customerName);
      const data = await fetchOrderFulfillmentDetails(farmUuid, key.deliveryDate, key.customerName);
      console.log('Order items (fetched):', (data || []).map((i) => ({
        recipe: i.recipe_name,
        sow_date: i.sow_date,
        harvest_date: i.harvest_date,
        trays_ready: i.trays_ready,
        trays_needed: i.trays_needed,
      })));
      setDetails(data);
    } catch (error: any) {
      setDetailsError(error?.message || 'Unable to load delivery details.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSelectDelivery = (item: OrderFulfillmentSummary) => {
    const key = { deliveryDate: item.delivery_date, customerName: item.customer_name, orderStatus: item.order_status };
    setSelectedDelivery(key);
    setDetailsOpen(true);
    loadDetails(key);
  };

  const handlePlantNow = async (item: OrderFulfillmentStatus) => {
    if (!farmUuid) return;
    setAddTrayError(null);
    setAddTraySuccess(null);

    const missing = Math.max(1, (item.trays_needed || 0) - (item.trays_ready || 0));
    const seedDate = await getSowDateForOrder(farmUuid, item.recipe_id, item.delivery_date);

    setAddTrayForm({
      recipeId: item.recipe_id.toString(),
      quantity: missing,
      seedDate: seedDate ? seedDate.split('T')[0] : '',
      deliveryDate: item.delivery_date,
      customerName: item.customer_name,
      recipeName: item.recipe_name,
    });
    setAddTrayOpen(true);
  };

  const handleSubmitTray = async () => {
    if (!farmUuid || !userId) {
      setAddTrayError('Session not found. Please sign in again.');
      return;
    }
    if (!addTrayForm.recipeId || !addTrayForm.seedDate) {
      setAddTrayError('Recipe and seed date are required.');
      return;
    }

    setAddTraySubmitting(true);
    setAddTrayError(null);
    setAddTraySuccess(null);

    const recipeIdNum = parseInt(addTrayForm.recipeId, 10);
    const recipe = recipes.find((r) => r.recipe_id === recipeIdNum);
    const recipeName = recipe?.recipe_name || addTrayForm.recipeName || 'Recipe';
    const varietyName = recipe?.varieties?.name || recipe?.variety_name || '';

    try {
      const { error } = await supabase.from('tray_creation_requests').insert({
        farm_uuid: farmUuid,
        recipe_id: recipeIdNum,
        recipe_name: recipeName,
        variety_name: varietyName,
        quantity: Math.max(1, addTrayForm.quantity),
        seed_date: addTrayForm.seedDate,
        status: 'pending',
        source_type: 'manual',
        user_id: userId,
      });

      if (error) throw error;

      setAddTraySuccess('Seeding request created. Trays will be generated automatically.');
      setAddTrayOpen(false);

      if (selectedDelivery) {
        loadDetails(selectedDelivery);
        loadSummary(farmUuid, dateRange.start, dateRange.end);
      }
    } catch (error: any) {
      setAddTrayError(error?.message || 'Failed to create seeding request.');
    } finally {
      setAddTraySubmitting(false);
    }
  };

  const handleActionConfirm = async () => {
    if (!farmUuid || !actionDialog.item || !actionDialog.type) return;
    try {
      setActionSaving(true);
      await recordFulfillmentAction(farmUuid, actionDialog.item, actionDialog.type, {
        reason: actionReason,
        notes: actionNotes,
        userId,
      });
      setActionDialog({ type: null, item: null });
      setActionReason('');
      setActionNotes('');
      if (selectedDelivery) {
        loadDetails(selectedDelivery);
        loadSummary(farmUuid, dateRange.start, dateRange.end);
      }
      setDetailsOpen(false);
    } catch (error) {
      console.error('Error recording fulfillment action', error);
    } finally {
      setActionSaving(false);
    }
  };

  const handleUpdateTaskStatus = async (task: WeeklyTask, newStatus: 'pending' | 'completed' | 'skipped') => {
    if (!farmUuid) return;
    try {
      const updated = await updateTaskStatus(task, newStatus, farmUuid);
      if (updated) {
        await loadWeekly(farmUuid, selectedWeek);
      }
    } catch (error) {
      console.error('Error updating task status', error);
    }
  };

  const weeklyOverview = useMemo(() => {
    const byType: Record<string, WeeklyTask[]> = {};
    weeklyTasks.forEach((t) => {
      if (!byType[t.task_type]) byType[t.task_type] = [];
      byType[t.task_type].push(t);
    });
    return byType;
  }, [weeklyTasks]);

  const weeklySections = useMemo(() => {
    const typeOrder: Array<WeeklyTask['task_type'] | 'uncovering'> = [
      'soaking',
      'sowing',
      'uncovering',
      'harvesting',
      'delivery',
      'maintenance',
    ];

    return typeOrder
      .map((type) => {
        const items = weeklyTasks
          .filter((t) => t.task_type === type)
          .sort((a, b) => a.task_date.getTime() - b.task_date.getTime());
        return { type, items };
      })
      .filter((section) => section.items.length > 0);
  }, [weeklyTasks]);

  const sectionColors: Record<string, { dot: string; text: string }> = {
    soaking: { dot: 'bg-purple-400', text: 'text-purple-700' },
    sowing: { dot: 'bg-indigo-400', text: 'text-indigo-700' },
    uncovering: { dot: 'bg-amber-400', text: 'text-amber-700' },
    harvesting: { dot: 'bg-emerald-400', text: 'text-emerald-700' },
    delivery: { dot: 'bg-blue-400', text: 'text-blue-700' },
    maintenance: { dot: 'bg-slate-400', text: 'text-slate-700' },
  };

  const typeLabels: Record<string, string> = {
    soaking: 'Soaking',
    sowing: 'Seeding',
    uncovering: 'Uncovering',
    harvesting: 'Harvesting',
    delivery: 'Delivery',
    maintenance: 'Maintenance',
  };

  type EnrichedItemStatus = OrderFulfillmentStatus & {
    canStillPlant: boolean;
    isMissed: boolean;
    status: 'fulfilled' | 'plantable' | 'at_risk' | 'missed';
    daysUntilHarvest: number;
  };

  const statusConfig: Record<EnrichedItemStatus['status'], { label: string; color: string; icon: string }> = {
    fulfilled: { label: 'Ready', color: 'bg-green-100 text-green-800', icon: '✓' },
    plantable: { label: 'No Trays', color: 'bg-amber-100 text-amber-800', icon: '⚠️' },
    at_risk: { label: 'At Risk', color: 'bg-orange-100 text-orange-800', icon: '⏰' },
    missed: { label: 'Missed', color: 'bg-red-100 text-red-800', icon: '✗' },
  };

  const calculateOrderItemStatus = (item: OrderFulfillmentStatus): EnrichedItemStatus => {
    const todayStr = new Date().toISOString().split('T')[0];
    const canStillPlant = todayStr <= item.sow_date;
    const isAtRisk = todayStr > item.sow_date && todayStr <= item.harvest_date;
    const isMissed = todayStr > item.harvest_date;
    const daysUntilHarvest = Math.ceil(
      (new Date(item.harvest_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );

    let status: EnrichedItemStatus['status'];
    if ((item.trays_ready || 0) >= (item.trays_needed || 0)) {
      status = 'fulfilled';
    } else if (isMissed) {
      status = 'missed';
    } else if (isAtRisk) {
      status = 'at_risk';
    } else {
      status = 'plantable';
    }

    return {
      ...item,
      canStillPlant,
      isMissed,
      status,
      daysUntilHarvest,
    };
  };

  const statusBadge = (status: OrderFulfillmentStatus['fulfillment_status']) => {
    const color =
      status === 'fulfilled'
        ? 'bg-green-100 text-green-700 border-green-200'
        : status === 'partial'
        ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
        : 'bg-red-100 text-red-700 border-red-200';

    const icon = status === 'fulfilled' ? '✅' : status === 'partial' ? '🟡' : '⚠️';
    return (
      <Badge className={`flex items-center gap-1 border ${color}`}>
        <span>{icon}</span>
        {itemStatusLabel[status]}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Order Fulfillment</h1>
          <p className="text-gray-600 mt-1">See if trays are ready for upcoming deliveries.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate('/calendar')} className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Open calendar
          </Button>
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <Info className="h-4 w-4" />
            Showing deliveries for the next 2 weeks.
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Task Overview (This Week)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="text-sm text-gray-600">
              Week of {new Date(selectedWeek).toLocaleDateString()} to{' '}
              {new Date(new Date(selectedWeek).setDate(new Date(selectedWeek).getDate() + 6)).toLocaleDateString()}
            </div>
            <Input
              type="date"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="w-[180px]"
            />
          </div>
          {taskError && (
            <div className="p-3 border border-red-200 bg-red-50 text-red-700 rounded-md text-sm">{taskError}</div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {['soaking', 'sowing', 'harvesting', 'delivery', 'maintenance'].map((type) => {
              const tasks = weeklyOverview[type] || [];
              const completed = tasks.filter((t) => t.status === 'completed').length;
              return (
                <Card key={type} className="border">
                  <CardContent className="p-3 space-y-1">
                    <div className="text-xs uppercase tracking-wide text-gray-500">
                      {typeLabels[type] || type}
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{tasks.length}</div>
                    <div className="text-xs text-gray-500">{completed} completed</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {summaryError && (
        <div className="p-4 border border-red-200 bg-red-50 text-red-700 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <div>
            <div className="font-semibold">Couldn&apos;t load overview</div>
            <div className="text-sm">{summaryError}</div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Upcoming Deliveries</CardTitle>
            <GenerateSeedingRequestsButton
              farmUuid={farmUuid}
              onGenerated={() => {
                if (farmUuid) {
                  loadSummary(farmUuid, dateRange.start, dateRange.end);
                }
              }}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loadingSummary ? (
            <div className="flex items-center justify-center py-10 text-gray-600">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Loading fulfillment summary...
            </div>
          ) : summary.length === 0 ? (
            <div className="text-center py-10 text-gray-600">
              No deliveries in the next two weeks.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-center">Items Ready</TableHead>
                    <TableHead className="text-center">Plantable</TableHead>
                    <TableHead className="text-center">At Risk</TableHead>
                    <TableHead className="text-center">Trays Ready</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.map((delivery) => {
                    const style = statusColors[delivery.order_status];
                    const status = statusDisplay[delivery.order_status];
                    const readyText = `${delivery.items_fulfilled}/${delivery.total_items}`;
                    const plantableText = delivery.items_plantable ?? 0;
                    const atRiskText = delivery.items_at_risk ?? 0;
                    const trayText = `${delivery.total_trays_ready}/${delivery.total_trays_needed}`;
                    const StatusIcon = status?.icon;
                    return (
                      <TableRow key={`${delivery.delivery_date}-${delivery.customer_name}`}>
                        <TableCell>
                          <div className={`inline-flex items-center gap-2 px-2 py-1 rounded ${style.bg} ${style.border} ${style.text}`}>
                            {StatusIcon && <StatusIcon className="h-4 w-4" />}
                            <span className="text-sm font-medium">{status?.label || delivery.order_status}</span>
                          </div>
                        </TableCell>
                        <TableCell>{delivery.delivery_date ? format(parseISO(delivery.delivery_date), 'MMM d, yyyy') : '—'}</TableCell>
                        <TableCell className="font-medium">{delivery.customer_name}</TableCell>
                        <TableCell className="text-center">{readyText}</TableCell>
                        <TableCell className="text-center">{plantableText}</TableCell>
                        <TableCell className="text-center text-red-600 font-semibold">{atRiskText}</TableCell>
                        <TableCell className="text-center">{trayText}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => handleSelectDelivery(delivery)}>
                            View details
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Tasks (Soak / Seed / Harvest / Maintenance)</CardTitle>
        </CardHeader>
        <CardContent>
          {tasksLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-600">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading tasks...
            </div>
          ) : weeklyTasks.length === 0 ? (
            <div className="text-center py-6 text-gray-600">No tasks for this week.</div>
          ) : (
            <div className="space-y-6">
              {weeklySections.map((section) => (
                <div key={section.type} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${sectionColors[section.type]?.dot || 'bg-gray-400'}`}
                    />
                    <h4
                      className={`text-sm font-semibold capitalize ${
                        sectionColors[section.type]?.text || 'text-gray-800'
                      }`}
                    >
                      {typeLabels[section.type] || section.type} tasks
                    </h4>
                    <span className="text-xs text-gray-500">({section.items.length})</span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-center">Qty</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {section.items.map((task, idx) => (
                          <TableRow key={`${task.task_date}-${task.task_type}-${idx}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-gray-400" />
                                {task.task_date.toLocaleDateString()}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">
                              {task.task_description || task.recipe_name || '—'}
                            </TableCell>
                            <TableCell className="text-center">{task.quantity}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {task.status === 'completed' ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                ) : task.status === 'skipped' ? (
                                  <Info className="h-4 w-4 text-gray-400" />
                                ) : (
                                  <Clock className="h-4 w-4 text-amber-500" />
                                )}
                                <span className="capitalize">{task.status}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {task.task_type === 'harvesting' ? (
                                <span className="text-xs text-gray-500">Manage harvest in trays</span>
                              ) : task.task_type === 'soaking' || task.task_type === 'sowing' ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    navigate(`/flow?date=${task.task_date.toISOString().split('T')[0]}`)
                                  }
                                >
                                  View in Daily Flow
                                </Button>
                              ) : (
                                <div className="flex items-center justify-end gap-2">
                                  {task.status === 'completed' ? (
                                    <div className="flex items-center gap-1 text-green-600 text-sm">
                                      <CheckCircle2 className="h-4 w-4" />
                                      <span>Completed</span>
                                    </div>
                                  ) : (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleUpdateTaskStatus(task, 'completed')}
                                        className="flex items-center gap-1"
                                      >
                                        <Check size={14} />
                                        Complete
                                      </Button>
                                      {task.status !== 'pending' && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleUpdateTaskStatus(task, 'pending')}
                                        >
                                          Mark pending
                                        </Button>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={(open) => setDetailsOpen(open)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {selectedDelivery
                ? `${selectedDelivery.customerName} - ${formatDate(selectedDelivery.deliveryDate)}`
                : 'Delivery details'}
            </DialogTitle>
            <DialogDescription>
              Fulfillment status per item. Plant missing trays directly from here.
            </DialogDescription>
          </DialogHeader>

          {detailsLoading ? (
            <div className="flex items-center justify-center py-10 text-gray-600">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Loading delivery items...
            </div>
          ) : detailsError ? (
            <div className="p-4 border border-red-200 bg-red-50 text-red-700 rounded-lg flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <div>
                <div className="font-semibold">Couldn&apos;t load items</div>
                <div className="text-sm">{detailsError}</div>
              </div>
            </div>
          ) : details.length === 0 ? (
            <div className="text-center py-8 text-gray-600">No line items for this delivery.</div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-center">Needed</TableHead>
                    <TableHead className="text-center">Ready</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.map((item) => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    let itemStatus: 'ready' | 'plantable' | 'at_risk' | 'missed';
                    if ((item.trays_ready || 0) >= (item.trays_needed || 0)) {
                      itemStatus = 'ready';
                    } else if (todayStr > item.harvest_date) {
                      itemStatus = 'missed';
                    } else if (todayStr > item.sow_date) {
                      itemStatus = 'at_risk';
                    } else {
                      itemStatus = 'plantable';
                    }
                    const config = statusDisplay[itemStatus];
                    const missing = Math.max(0, (item.trays_needed || 0) - (item.trays_ready || 0));
                    const isPlantDay = todayStr >= item.sow_date;
                    return (
                      <TableRow key={`${item.delivery_date}-${item.recipe_id}-${item.recipe_name}`}>
                        <TableCell>
                          <div className="font-medium">{item.recipe_name}</div>
                          <div className="text-xs text-gray-500">
                            Harvest: {item.harvest_date ? format(parseISO(item.harvest_date), 'MMM d, yyyy') : '—'}
                          </div>
                          <div className="text-xs text-slate-500">
                            Plant by {item.sow_date ? format(parseISO(item.sow_date), 'MMM d') : '—'}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{item.trays_needed}</TableCell>
                        <TableCell className="text-center">{item.trays_ready}</TableCell>
                        <TableCell>
                          <div className={`inline-flex items-center gap-2 px-2 py-1 rounded ${config?.bg || ''} ${config?.color || ''}`}>
                            {config?.icon && <config.icon className="h-4 w-4" />}
                            <span className="text-sm">{config?.label || itemStatus}</span>
                          </div>
                          {itemStatus === 'at_risk' && (
                            <div className="text-xs text-orange-600 mt-1">
                              Too late to plant
                            </div>
                          )}
                          {itemStatus === 'plantable' && (
                            <div className="text-xs text-slate-500 mt-1">
                              Still time to plant
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {itemStatus === 'ready' ? (
                            <span className="text-sm text-green-600">✓</span>
                          ) : itemStatus === 'plantable' ? (
                            isPlantDay ? (
                              <Button size="sm" onClick={() => handlePlantNow(item)} className="bg-emerald-500 hover:bg-emerald-600">
                                <Sprout className="h-4 w-4 mr-2" />
                                Plant {missing > 0 ? missing : ''}
                              </Button>
                            ) : (
                              <span className="text-sm text-slate-400">—</span>
                            )
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                  Options <ChevronDown className="h-4 w-4 ml-1" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setActionDialog({ type: 'skipped', item })}>
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Skip
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setActionDialog({ type: 'substituted', item })}>
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  Check substitutes
                                </DropdownMenuItem>
                                {itemStatus === 'missed' && (
                                  <DropdownMenuItem onClick={() => setActionDialog({ type: 'log', item })}>
                                    <FileText className="h-4 w-4 mr-2" />
                                    Log issue
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex justify-end text-sm text-gray-600">
                Totals: {details.reduce((acc, item) => acc + (item.trays_ready || 0), 0)} trays ready /{' '}
                {details.reduce((acc, item) => acc + (item.trays_needed || 0), 0)} needed
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addTrayOpen} onOpenChange={setAddTrayOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Plant Now</DialogTitle>
            <DialogDescription>Pre-fill a seeding request for this order item.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="recipe">Recipe</Label>
              <select
                id="recipe"
                className="border rounded-md px-3 py-2"
                value={addTrayForm.recipeId}
                onChange={(e) => setAddTrayForm((prev) => ({ ...prev, recipeId: e.target.value }))}
              >
                <option value="" disabled>
                  Select a recipe
                </option>
                {recipesLoading ? (
                  <option value="">Loading recipes...</option>
                ) : (
                  recipes.map((recipe) => (
                    <option key={recipe.recipe_id} value={recipe.recipe_id}>
                      {recipe.recipe_name} {recipe.varieties?.name ? `(${recipe.varieties.name})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                value={addTrayForm.quantity}
                onChange={(e) =>
                  setAddTrayForm((prev) => ({ ...prev, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) }))
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="seedDate">Seed Date</Label>
              <Input
                id="seedDate"
                type="date"
                value={addTrayForm.seedDate}
                onChange={(e) => setAddTrayForm((prev) => ({ ...prev, seedDate: e.target.value }))}
              />
              <p className="text-xs text-gray-500">
                Back-calculated from harvest date when available. Adjust if needed.
              </p>
            </div>

            {addTrayError && (
              <div className="p-3 border border-red-200 bg-red-50 text-red-700 rounded-md text-sm">{addTrayError}</div>
            )}
            {addTraySuccess && (
              <div className="p-3 border border-green-200 bg-green-50 text-green-700 rounded-md text-sm">
                {addTraySuccess}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTrayOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitTray} disabled={addTraySubmitting}>
              {addTraySubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                </span>
              ) : (
                'Create seeding request'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!actionDialog.type} onOpenChange={(open) => {
        if (!open) {
          setActionDialog({ type: null, item: null });
          setActionReason('');
          setActionNotes('');
        }
      }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {actionDialog.type === 'skipped' && 'Skip Delivery'}
              {actionDialog.type === 'substituted' && 'Check Substitute'}
              {actionDialog.type === 'log' && 'Log Issue'}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.item
                ? `${actionDialog.item.recipe_name} — ${formatDate(actionDialog.item.delivery_date)}`
                : 'Select an action'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                placeholder="e.g., Crop failure, inventory shortage"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Add details or customer notes..."
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActionDialog({ type: null, item: null });
                setActionReason('');
                setActionNotes('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleActionConfirm} disabled={actionSaving || !actionDialog.type}>
              {actionSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WeeklyTasksPage;

