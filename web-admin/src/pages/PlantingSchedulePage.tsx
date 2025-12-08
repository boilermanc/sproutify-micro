import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Sprout, Package, Clock, AlertCircle, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { calculateStandingOrderSowDates } from '../services/predictiveScheduler';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EmptyState from '../components/onboarding/EmptyState';

interface StandingOrder {
  standing_order_id: number;
  order_name: string;
  customer_name?: string;
  frequency: 'weekly' | 'bi-weekly';
  delivery_days: string[];
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  items: StandingOrderItem[];
}

interface StandingOrderItem {
  item_id: number;
  product_id: number;
  variant_id: number | null;
  quantity: number;
  product_name?: string;
  variant_name?: string;
}

interface Recipe {
  recipe_id: number;
  recipe_name: string;
  variety_name: string;
  total_days: number;
}

interface ProductRecipeMapping {
  mapping_id: number;
  product_id: number;
  recipe_id: number;
  variety_id: number;
  ratio: number;
  recipe_name?: string;
  variety_name?: string;
}

interface PlantingSchedule {
  sow_date: Date;
  delivery_date: Date;
  recipe_id: number;
  recipe_name: string;
  quantity: number;
  days_before_delivery: number;
  standing_order_id: number;
  order_name: string;
  customer_name?: string;
  product_name?: string;
  variant_name?: string;
}

const PlantingSchedulePage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<PlantingSchedule[]>([]);
  const [filteredSchedules, setFilteredSchedules] = useState<PlantingSchedule[]>([]);
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'all'>('month');
  const [today] = useState(new Date());
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    fetchPlantingSchedule();
  }, []);

  useEffect(() => {
    filterSchedules();
  }, [schedules, dateRange]);

  const fetchPlantingSchedule = async () => {
    try {
      setLoading(true);
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // 1. Fetch active standing orders with items
      const { data: standingOrdersData, error: ordersError } = await supabase
        .from('standing_orders')
        .select(`
          *,
          customers!inner(customerid, name)
        `)
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true);

      if (ordersError) throw ordersError;

      if (!standingOrdersData || standingOrdersData.length === 0) {
        setSchedules([]);
        setLoading(false);
        return;
      }

      // 2. Fetch items for each standing order
      const ordersWithItems: StandingOrder[] = await Promise.all(
        standingOrdersData.map(async (order: any) => {
          const { data: itemsData } = await supabase
            .from('standing_order_items')
            .select(`
              *,
              products(product_id, product_name),
              product_variants(variant_id, variant_name)
            `)
            .eq('standing_order_id', order.standing_order_id);

          return {
            standing_order_id: order.standing_order_id,
            order_name: order.order_name,
            customer_name: order.customers?.name || 'Unknown',
            frequency: order.frequency,
            delivery_days: order.delivery_days || [],
            start_date: order.start_date,
            end_date: order.end_date,
            is_active: order.is_active,
            items: (itemsData || []).map((item: any) => ({
              item_id: item.item_id,
              product_id: item.product_id,
              variant_id: item.variant_id,
              quantity: Number(item.quantity) || 0,
              product_name: item.products?.product_name || 'Unknown',
              variant_name: item.product_variants?.variant_name || null,
            })),
          };
        })
      );

      // 3. Fetch all recipes with their total days
      const { data: recipesData, error: recipesError } = await supabase
        .from('recipes')
        .select('recipe_id, recipe_name, variety_name')
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true);

      if (recipesError) throw recipesError;

      // Calculate total days for each recipe
      const recipes: Recipe[] = await Promise.all(
        (recipesData || []).map(async (recipe: any) => {
          const { data: stepsData } = await supabase
            .from('steps')
            .select('duration, duration_unit, sequence_order')
            .eq('recipe_id', recipe.recipe_id);

          const sortedSteps = stepsData ? [...stepsData].sort((a, b) => {
            const orderA = a.sequence_order ?? 0;
            const orderB = b.sequence_order ?? 0;
            return orderA - orderB;
          }) : [];

          const totalDays = sortedSteps.reduce((sum: number, step: any) => {
            const duration = step.duration || 0;
            const unit = (step.duration_unit || 'Days').toUpperCase();
            if (unit === 'DAYS') {
              return sum + duration;
            } else if (unit === 'HOURS') {
              return sum + (duration >= 12 ? 1 : 0);
            }
            return sum + duration;
          }, 0);

          return {
            recipe_id: recipe.recipe_id,
            recipe_name: recipe.recipe_name,
            variety_name: recipe.variety_name || '',
            total_days: totalDays || 10, // Default to 10 if no steps
          };
        })
      );

      // 4. For each standing order, map products to recipes via product_recipe_mapping
      const allSchedules: PlantingSchedule[] = [];

      for (const order of ordersWithItems) {
        if (order.items.length === 0) continue;

        // Get product IDs from order items
        const productIds = [...new Set(order.items.map(item => item.product_id))];

        // Fetch product_recipe_mappings for these products
        const { data: mappingsData } = await supabase
          .from('product_recipe_mapping')
          .select(`
            *,
            recipes!inner(recipe_id, recipe_name, variety_name)
          `)
          .in('product_id', productIds);

        if (!mappingsData || mappingsData.length === 0) continue;

        // Group mappings by product_id
        const mappingsByProduct: Record<number, ProductRecipeMapping[]> = {};
        mappingsData.forEach((m: any) => {
          if (!mappingsByProduct[m.product_id]) {
            mappingsByProduct[m.product_id] = [];
          }
          mappingsByProduct[m.product_id].push({
            mapping_id: m.mapping_id,
            product_id: m.product_id,
            recipe_id: m.recipe_id,
            variety_id: m.variety_id,
            ratio: Number(m.ratio) || 1.0,
            recipe_name: m.recipes?.recipe_name,
            variety_name: m.recipes?.variety_name,
          });
        });

        // Build recipe items for this standing order
        const recipeItems: Array<{ recipe_id: number; quantity: number }> = [];

        for (const item of order.items) {
          const productMappings = mappingsByProduct[item.product_id] || [];
          
          if (productMappings.length === 0) continue;

          // Calculate total ratio for normalization
          const totalRatio = productMappings.reduce((sum, m) => sum + m.ratio, 0);
          
          // Distribute product quantity across recipes based on ratios
          for (const mapping of productMappings) {
            const recipeQuantity = (item.quantity * mapping.ratio) / totalRatio;
            
            // Check if recipe already exists in recipeItems
            const existingIndex = recipeItems.findIndex(r => r.recipe_id === mapping.recipe_id);
            if (existingIndex >= 0) {
              recipeItems[existingIndex].quantity += recipeQuantity;
            } else {
              recipeItems.push({
                recipe_id: mapping.recipe_id,
                quantity: recipeQuantity,
              });
            }
          }
        }

        if (recipeItems.length === 0) continue;

        // 5. Calculate sow dates using the predictive scheduler
        const sowSchedules = calculateStandingOrderSowDates(
          {
            frequency: order.frequency,
            delivery_days: order.delivery_days,
            start_date: new Date(order.start_date),
            end_date: order.end_date ? new Date(order.end_date) : null,
            items: recipeItems,
          },
          recipes
        );

        // 6. Convert to PlantingSchedule format with order context
        for (const schedule of sowSchedules) {
          // Find the product info for this recipe (if available)
          const productInfo = order.items.find(item => {
            const mappings = mappingsByProduct[item.product_id] || [];
            return mappings.some(m => m.recipe_id === schedule.recipe_id);
          });

          allSchedules.push({
            sow_date: schedule.sow_date,
            delivery_date: schedule.delivery_date,
            recipe_id: schedule.recipe_id,
            recipe_name: schedule.recipe_name,
            quantity: schedule.quantity,
            days_before_delivery: schedule.days_before_delivery,
            standing_order_id: order.standing_order_id,
            order_name: order.order_name,
            customer_name: order.customer_name,
            product_name: productInfo?.product_name,
            variant_name: productInfo?.variant_name || undefined,
          });
        }
      }

      // Sort by sow date
      allSchedules.sort((a, b) => a.sow_date.getTime() - b.sow_date.getTime());
      setSchedules(allSchedules);
    } catch (error) {
      console.error('Error fetching planting schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterSchedules = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let endDate: Date;
    switch (dateRange) {
      case 'week':
        endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 7);
        break;
      case 'month':
        endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case 'quarter':
        endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 3);
        break;
      default:
        endDate = new Date('2099-12-31');
    }

    const filtered = schedules.filter(schedule => {
      const sowDate = new Date(schedule.sow_date);
      sowDate.setHours(0, 0, 0, 0);
      return sowDate >= now && sowDate <= endDate;
    });

    setFilteredSchedules(filtered);
  };

  const groupSchedulesByDate = (schedules: PlantingSchedule[]) => {
    const grouped: Record<string, PlantingSchedule[]> = {};
    schedules.forEach(schedule => {
      const dateKey = schedule.sow_date.toISOString().split('T')[0];
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(schedule);
    });
    return grouped;
  };

  const getDaysUntil = (date: Date) => {
    const diff = date.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const groupedSchedules = groupSchedulesByDate(filteredSchedules);
  const dateKeys = Object.keys(groupedSchedules).sort();

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Calendar className="h-8 w-8 text-emerald-600" />
            Planting Schedule
          </h1>
          <p className="text-gray-500 mt-1">
            Upcoming planting dates based on your standing orders
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={(value: 'week' | 'month' | 'quarter' | 'all') => setDateRange(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Next 7 Days</SelectItem>
              <SelectItem value="month">Next Month</SelectItem>
              <SelectItem value="quarter">Next 3 Months</SelectItem>
              <SelectItem value="all">All Upcoming</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => navigate('/standing-orders')} variant="outline">
            Manage Standing Orders
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      {filteredSchedules.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Upcoming Plantings</p>
                  <p className="text-2xl font-bold text-gray-900">{filteredSchedules.length}</p>
                </div>
                <Sprout className="h-8 w-8 text-emerald-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Unique Recipes</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {new Set(filteredSchedules.map(s => s.recipe_id)).size}
                  </p>
                </div>
                <Package className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Trays Needed</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {Math.ceil(filteredSchedules.reduce((sum, s) => sum + s.quantity, 0))}
                  </p>
                </div>
                <Package className="h-8 w-8 text-amber-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Schedule List */}
      {dateKeys.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-12 w-12 text-gray-400" />}
          title="No upcoming plantings"
          description={
            schedules.length === 0
              ? "Create standing orders to see your planting schedule"
              : `No plantings scheduled in the selected time range`
          }
          actionLabel={schedules.length === 0 ? "Create Standing Order" : undefined}
          onAction={schedules.length === 0 ? () => navigate('/standing-orders') : undefined}
        />
      ) : (
        <div className="space-y-6">
          {dateKeys.map(dateKey => {
            const daySchedules = groupedSchedules[dateKey];
            const sowDate = new Date(dateKey);
            const daysUntil = getDaysUntil(sowDate);
            const isToday = daysUntil === 0;
            const isPast = daysUntil < 0;

            return (
              <Card key={dateKey} className={isToday ? 'border-emerald-500 border-2' : ''}>
                <CardHeader className="bg-gradient-to-r from-gray-50 to-white border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isToday ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                        <Calendar className={`h-5 w-5 ${isToday ? 'text-emerald-600' : 'text-gray-600'}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg font-bold text-gray-800">
                          {formatDate(sowDate)}
                        </CardTitle>
                        <CardDescription>
                          {isToday
                            ? 'Today - Plant Now!'
                            : isPast
                            ? `${Math.abs(daysUntil)} days ago`
                            : daysUntil === 1
                            ? 'Tomorrow'
                            : `${daysUntil} days away`}
                        </CardDescription>
                      </div>
                    </div>
                    {isToday && (
                      <Badge className="bg-emerald-600 text-white">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Action Required
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-gray-100">
                    {daySchedules.map((schedule, index) => (
                      <div
                        key={`${schedule.standing_order_id}-${schedule.recipe_id}-${index}`}
                        className="p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-gray-900">{schedule.recipe_name}</h3>
                              <Badge variant="outline" className="text-xs">
                                {Math.ceil(schedule.quantity)} {Math.ceil(schedule.quantity) === 1 ? 'tray' : 'trays'}
                              </Badge>
                            </div>
                            <div className="space-y-1 text-sm text-gray-600">
                              <div className="flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                <span>
                                  <strong>Order:</strong> {schedule.order_name}
                                  {schedule.customer_name && ` • ${schedule.customer_name}`}
                                </span>
                              </div>
                              {schedule.product_name && (
                                <div className="flex items-center gap-2">
                                  <Package className="h-4 w-4" />
                                  <span>
                                    <strong>Product:</strong> {schedule.product_name}
                                    {schedule.variant_name && ` (${schedule.variant_name})`}
                                  </span>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                <span>
                                  <strong>Delivery:</strong> {formatDate(schedule.delivery_date)} 
                                  {' '}({schedule.days_before_delivery} days to grow)
                                </span>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate('/trays')}
                            className="flex items-center gap-1"
                          >
                            Create Tray
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PlantingSchedulePage;

