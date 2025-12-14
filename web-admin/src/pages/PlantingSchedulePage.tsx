import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Sprout, Package, Clock, AlertCircle, ChevronRight, Check } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { calculateStandingOrderSowDates } from '../services/predictiveScheduler';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
  isSeeded?: boolean; // Flag to track if trays have already been created
}

interface SeedBatch {
  batchid: number;
  quantity: number;
  unit: string;
  lot_number: string | null;
  purchasedate: string | null;
  variety_name: string;
}

const PlantingSchedulePage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<PlantingSchedule[]>([]);
  const [filteredSchedules, setFilteredSchedules] = useState<PlantingSchedule[]>([]);
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'all'>('week');
  
  // Seeding dialog state
  const [seedingSchedule, setSeedingSchedule] = useState<PlantingSchedule | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [availableBatches, setAvailableBatches] = useState<SeedBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [seedingDate, setSeedingDate] = useState('');
  const [isCreatingTray, setIsCreatingTray] = useState(false);
  const isSubmittingSeeding = useRef(false);

  useEffect(() => {
    fetchPlantingSchedule();
  }, []);

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
      
      // 7. Filter out schedules where trays have already been created
      // Check for existing trays or task_completions for each schedule
      const filteredSchedules: PlantingSchedule[] = [];
      
      if (allSchedules.length === 0) {
        setSchedules([]);
        setLoading(false);
        return;
      }
      
      // Batch check for all schedules at once for better performance
      // Fetch ALL trays and tasks for these recipes (not just within date range)
      // We'll match them to each schedule's specific recipe_id and sow_date
      const recipeIds = [...new Set(allSchedules.map(s => s.recipe_id))];
      
      // Fetch all existing trays for these recipes (no date filter - we need all of them)
      const { data: existingTrays, error: traysError } = await supabase
        .from('trays')
        .select('recipe_id, sow_date')
        .eq('farm_uuid', farmUuid)
        .in('recipe_id', recipeIds);
      
      if (traysError) {
        console.error('[PlantingSchedule] Error fetching existing trays:', traysError);
      }
      
      // Fetch all completed sowing tasks for these recipes (no date filter - we need all of them)
      const { data: completedTasks, error: tasksError } = await supabase
        .from('task_completions')
        .select('recipe_id, task_date')
        .eq('farm_uuid', farmUuid)
        .in('recipe_id', recipeIds)
        .eq('task_type', 'sowing')
        .eq('status', 'completed');
      
      if (tasksError) {
        console.error('[PlantingSchedule] Error fetching completed tasks:', tasksError);
      }
      
      // Create a map of recipe_id -> set of seeded dates (for flexible matching)
      // This allows us to check if a schedule is fulfilled by early seeding
      const seededDatesByRecipe = new Map<number, Set<string>>();
      
      // Add dates for existing trays
      if (existingTrays && existingTrays.length > 0) {
        console.log(`[PlantingSchedule] Found ${existingTrays.length} existing trays for these recipes`);
        existingTrays.forEach((tray: any) => {
          if (tray.sow_date) {
            const recipeId = tray.recipe_id;
            const traySowDateStr = new Date(tray.sow_date).toISOString().split('T')[0];
            if (!seededDatesByRecipe.has(recipeId)) {
              seededDatesByRecipe.set(recipeId, new Set<string>());
            }
            seededDatesByRecipe.get(recipeId)!.add(traySowDateStr);
          }
        });
      }
      
      // Add dates for completed tasks
      if (completedTasks && completedTasks.length > 0) {
        console.log(`[PlantingSchedule] Found ${completedTasks.length} completed sowing tasks for these recipes`);
        completedTasks.forEach((task: any) => {
          const taskDateStr = task.task_date ? (task.task_date.includes('T') ? task.task_date.split('T')[0] : task.task_date) : '';
          if (taskDateStr) {
            const recipeId = task.recipe_id;
            if (!seededDatesByRecipe.has(recipeId)) {
              seededDatesByRecipe.set(recipeId, new Set<string>());
            }
            seededDatesByRecipe.get(recipeId)!.add(taskDateStr);
          }
        });
      }
      
      console.log(`[PlantingSchedule] Total schedules before filtering: ${allSchedules.length}`);
      
      // Filter schedules: remove any that have trays or task_completions for that recipe
      // on the scheduled date OR within ±1 day (handles same-day or next-day seeding)
      const DATE_TOLERANCE_DAYS = 1;
      let filteredCount = 0;
      
      for (const schedule of allSchedules) {
        const scheduleDate = new Date(schedule.sow_date);
        scheduleDate.setHours(0, 0, 0, 0);
        const scheduleDateMs = scheduleDate.getTime();
        
        const seededDates = seededDatesByRecipe.get(schedule.recipe_id);
        if (!seededDates || seededDates.size === 0) {
          // No trays/tasks for this recipe, keep the schedule
          filteredSchedules.push(schedule);
          continue;
        }
        
        // Check if any seeded date is within tolerance of the schedule date
        let isFulfilled = false;
        for (const seededDateStr of seededDates) {
          const seededDate = new Date(seededDateStr + 'T00:00:00');
          const seededDateMs = seededDate.getTime();
          const daysDiff = Math.abs(seededDateMs - scheduleDateMs) / (1000 * 60 * 60 * 24);
          
          // If seeded within tolerance days of the scheduled date, the schedule is fulfilled
          if (daysDiff <= DATE_TOLERANCE_DAYS) {
            isFulfilled = true;
            break;
          }
        }
        
        if (isFulfilled) {
          filteredCount++;
        } else {
          filteredSchedules.push(schedule);
        }
      }
      
      console.log(`[PlantingSchedule] Filtered out ${filteredCount} already-seeded schedules`);
      console.log(`[PlantingSchedule] Total schedules after filtering: ${filteredSchedules.length}`);
      
      setSchedules(filteredSchedules);
    } catch (error) {
      console.error('Error fetching planting schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  const getToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  const filterSchedules = useCallback(() => {
    const now = getToday();

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
  }, [dateRange, schedules]);

  useEffect(() => {
    filterSchedules();
  }, [schedules, dateRange, filterSchedules]);

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
    const today = getToday();
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const diff = targetDate.getTime() - today.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatDateForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleCreateTray = async (schedule: PlantingSchedule) => {
    setSeedingSchedule(schedule);
    // Set default seeding date to the schedule's sow_date
    setSeedingDate(formatDateForInput(schedule.sow_date));
    setSelectedBatchId(null);
    setAvailableBatches([]);
    await fetchAvailableBatchesForRecipe(schedule);
  };

  const fetchAvailableBatchesForRecipe = async (schedule: PlantingSchedule) => {
    setLoadingBatches(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        setAvailableBatches([]);
        return;
      }

      const { farmUuid } = JSON.parse(sessionData);

      // Fetch recipe to get variety_id and seed_quantity
      const { data: recipeData, error: recipeError } = await supabase
        .from('recipes')
        .select('recipe_id, recipe_name, variety_id, variety_name, seed_quantity, seed_quantity_unit')
        .eq('recipe_id', schedule.recipe_id)
        .eq('farm_uuid', farmUuid)
        .single();

      if (recipeError || !recipeData) {
        console.error('[PlantingSchedule] Error fetching recipe:', recipeError);
        setAvailableBatches([]);
        return;
      }

      // Calculate seed quantity needed per tray (convert to grams)
      let seedQuantityPerTray = 0;
      if (recipeData.seed_quantity) {
        const unit = recipeData.seed_quantity_unit || 'grams';
        seedQuantityPerTray = unit === 'oz' ? recipeData.seed_quantity * 28.35 : recipeData.seed_quantity;
      }

      // Total seed needed for all trays (quantity is the number of trays)
      const numberOfTrays = Math.ceil(schedule.quantity);
      const totalSeedNeeded = seedQuantityPerTray * numberOfTrays;

      if (!recipeData.variety_id) {
        console.error('[PlantingSchedule] Recipe has no variety_id');
        setAvailableBatches([]);
        return;
      }

      // Query available batches matching the requirements
      let query = supabase
        .from('seedbatches')
        .select(`
          batchid,
          quantity,
          unit,
          lot_number,
          purchasedate,
          varietyid
        `)
        .eq('farm_uuid', farmUuid)
        .eq('varietyid', recipeData.variety_id)
        .eq('is_active', true);

      // Only filter by quantity if we have a seed requirement
      if (totalSeedNeeded > 0) {
        query = query.gte('quantity', totalSeedNeeded);
      }

      const { data: batchesData, error: batchesError } = await query
        .order('purchasedate', { ascending: true });

      // Fetch variety name separately
      let varietyName = recipeData.variety_name || '';
      if (recipeData.variety_id) {
        const { data: varietyData } = await supabase
          .from('varieties')
          .select('name')
          .eq('varietyid', recipeData.variety_id)
          .single();
        if (varietyData) {
          varietyName = varietyData.name || varietyName;
        }
      }

      if (batchesError) {
        console.error('[PlantingSchedule] Error fetching batches:', batchesError);
        setAvailableBatches([]);
        return;
      }

      // Format batches for display
      const formattedBatches = (batchesData || []).map((batch: any) => ({
        batchid: batch.batchid,
        quantity: batch.quantity,
        unit: batch.unit || 'grams',
        lot_number: batch.lot_number || null,
        purchasedate: batch.purchasedate,
        variety_name: varietyName,
      }));

      setAvailableBatches(formattedBatches);
    } catch (error) {
      console.error('[PlantingSchedule] Error in fetchAvailableBatchesForRecipe:', error);
      setAvailableBatches([]);
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleSeedingConfirm = async () => {
    if (!seedingSchedule || !selectedBatchId) {
      alert('Please select a seed batch');
      return;
    }

    if (!seedingDate) {
      alert('Please select a seeding date');
      return;
    }

    // Prevent double-clicks
    if (isSubmittingSeeding.current) {
      console.log('[PlantingSchedule] Seeding already in progress, ignoring duplicate call');
      return;
    }

    isSubmittingSeeding.current = true;
    setIsCreatingTray(true);

    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        throw new Error('No session found');
      }

      const { farmUuid, userId } = JSON.parse(sessionData);

      // Fetch recipe to get variety name
      const { data: recipeData, error: recipeError } = await supabase
        .from('recipes')
        .select('recipe_name, variety_name')
        .eq('recipe_id', seedingSchedule.recipe_id)
        .eq('farm_uuid', farmUuid)
        .single();

      if (recipeError || !recipeData) {
        throw new Error('Failed to fetch recipe details');
      }

      const varietyName = recipeData.variety_name || recipeData.recipe_name || '';
      const numberOfTrays = Math.ceil(seedingSchedule.quantity);

      // Convert seeding date to ISO string at midnight
      const sowDateISO = new Date(seedingDate + 'T00:00:00').toISOString();

      // Create tray creation requests (one per tray)
      const requests = Array.from({ length: numberOfTrays }, () => ({
        customer_name: null,
        variety_name: varietyName,
        recipe_name: recipeData.recipe_name,
        farm_uuid: farmUuid,
        user_id: userId,
        requested_at: sowDateISO,
        batch_id: selectedBatchId,
      }));

      console.log('[PlantingSchedule] Creating tray creation requests:', {
        numberOfTrays,
        recipeName: recipeData.recipe_name,
        batchId: selectedBatchId,
        sowDate: sowDateISO,
      });

      const { error: requestError } = await supabase
        .from('tray_creation_requests')
        .insert(requests);

      if (requestError) {
        console.error('[PlantingSchedule] Error creating tray requests:', requestError);
        throw requestError;
      }

      console.log('[PlantingSchedule] Tray creation requests created successfully');

      // Create task_completion record so daily flow knows this is done
      const sowDateStr = seedingDate; // Already in YYYY-MM-DD format from date input
      const { error: completionError } = await supabase
        .from('task_completions')
        .upsert({
          farm_uuid: farmUuid,
          user_id: userId,
          task_type: 'sowing',
          task_date: sowDateStr,
          recipe_id: seedingSchedule.recipe_id,
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: userId,
          batch_id: selectedBatchId,
          yield_quantity: null,
          yield_unit: null,
          notes: 'Seeding completed from Planting Schedule',
        }, {
          onConflict: 'farm_uuid,task_type,task_date,recipe_id'
        });

      if (completionError) {
        console.error('[PlantingSchedule] Error creating task completion:', completionError);
        // Don't throw - tray creation succeeded, this is just for tracking
      } else {
        console.log('[PlantingSchedule] Task completion created successfully:', {
          recipe_id: seedingSchedule.recipe_id,
          task_date: sowDateStr,
          task_type: 'sowing'
        });
      }

      // Close dialog
      setSeedingSchedule(null);
      setSelectedBatchId(null);
      setAvailableBatches([]);
      setSeedingDate('');
      
      // Wait a moment for database triggers to complete before refreshing
      // The trigger creates trays asynchronously, so we need to give it time
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Refresh the schedule to show updated data
      await fetchPlantingSchedule();
      
      alert(`Successfully created ${numberOfTrays} ${numberOfTrays === 1 ? 'tray' : 'trays'}!`);
    } catch (error) {
      console.error('[PlantingSchedule] Error creating trays:', error);
      const errorMessage = (error instanceof Error ? error.message : String(error)) || 'Failed to create trays. Please try again.';
      const errorCode = (error as { code?: string })?.code;
      
      // Check for specific error types
      if (errorCode === 'P0001' || errorMessage.includes('Not enough seed') || errorMessage.includes('insufficient')) {
        alert(`Error: ${errorMessage}\n\nPlease select a different batch with sufficient seed quantity.`);
      } else {
        alert(`Error: ${errorMessage}`);
      }
    } finally {
      isSubmittingSeeding.current = false;
      setIsCreatingTray(false);
    }
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
                            onClick={() => handleCreateTray(schedule)}
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

      {/* Seeding Dialog */}
      <Dialog open={!!seedingSchedule} onOpenChange={(open) => {
        if (!open) {
          setSeedingSchedule(null);
          setSelectedBatchId(null);
          setAvailableBatches([]);
          setSeedingDate('');
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <Sprout className="h-5 w-5" />
              </div>
              Create Trays
            </DialogTitle>
            <DialogDescription>
              Select a seed batch to create trays for this planting schedule
            </DialogDescription>
          </DialogHeader>

          {seedingSchedule && (
            <div className="space-y-6 py-4">
              {/* Summary Card */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-indigo-600 font-medium uppercase">Recipe</p>
                    <p className="text-lg font-bold text-indigo-900">{seedingSchedule.recipe_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-indigo-600 font-medium uppercase">Trays</p>
                    <p className="text-lg font-bold text-indigo-900">
                      {Math.ceil(seedingSchedule.quantity)} {Math.ceil(seedingSchedule.quantity) === 1 ? 'tray' : 'trays'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-indigo-600 font-medium uppercase">Order</p>
                    <p className="text-base text-indigo-800">{seedingSchedule.order_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-indigo-600 font-medium uppercase">Delivery</p>
                    <p className="text-base text-indigo-800">{formatDate(seedingSchedule.delivery_date)}</p>
                  </div>
                </div>
              </div>

              {/* Batch Selection */}
              <div className="space-y-3">
                <Label htmlFor="batch-select" className="text-sm font-medium">
                  Select Seed Batch <span className="text-red-500">*</span>
                </Label>
                {loadingBatches ? (
                  <div className="text-sm text-slate-500">Loading available batches...</div>
                ) : availableBatches.length === 0 ? (
                  <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    No available batches found for this recipe. Please ensure you have:
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>A seed batch for this variety</li>
                      <li>Sufficient quantity for {Math.ceil(seedingSchedule.quantity)} {Math.ceil(seedingSchedule.quantity) === 1 ? 'tray' : 'trays'}</li>
                      <li>An active batch status</li>
                    </ul>
                  </div>
                ) : (
                  <Select
                    value={selectedBatchId?.toString() || ''}
                    onValueChange={(value) => setSelectedBatchId(parseInt(value, 10))}
                  >
                    <SelectTrigger id="batch-select" className="w-full">
                      <SelectValue placeholder="Select a seed batch" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableBatches.map((batch) => (
                        <SelectItem key={batch.batchid} value={batch.batchid.toString()}>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {batch.variety_name} - Batch #{batch.batchid}
                            </span>
                            <span className="text-xs text-slate-500">
                              {batch.quantity} {batch.unit || 'grams'} available
                              {batch.lot_number && ` • Lot: ${batch.lot_number}`}
                              {batch.purchasedate && ` • Purchased: ${new Date(batch.purchasedate).toLocaleDateString()}`}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedBatchId && (
                  <div className="text-xs text-slate-500">
                    Selected batch will be used to create {Math.ceil(seedingSchedule.quantity)} {Math.ceil(seedingSchedule.quantity) === 1 ? 'tray' : 'trays'}
                  </div>
                )}
              </div>

              {/* Seeding Date */}
              <div className="space-y-2">
                <Label htmlFor="seeding-date" className="text-sm font-medium">
                  Seeding Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="seeding-date"
                  type="date"
                  value={seedingDate}
                  onChange={(e) => setSeedingDate(e.target.value)}
                  className="w-full"
                  required
                />
                <p className="text-xs text-slate-500">
                  This will be the sow date for the new trays. Defaults to the scheduled sow date.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSeedingSchedule(null);
                setSelectedBatchId(null);
                setAvailableBatches([]);
                setSeedingDate('');
              }}
              className="flex-1"
              disabled={isCreatingTray}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSeedingConfirm}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              disabled={!selectedBatchId || !seedingDate || isSubmittingSeeding.current || availableBatches.length === 0 || isCreatingTray}
            >
              {isCreatingTray ? (
                'Creating...'
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Create Trays
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlantingSchedulePage;

