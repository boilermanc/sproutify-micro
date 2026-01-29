import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Sprout, Package, Clock, AlertCircle, AlertTriangle, ChevronRight, Check, Printer, X } from 'lucide-react';
import SeedingPlanPrint from '../components/print/SeedingPlanPrint';
import { getSupabaseClient } from '../lib/supabaseClient';
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

const ALL_WEEK_SEEDING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
  size_value?: number;
  size_unit?: string;
}

interface Recipe {
  recipe_id: number;
  recipe_name: string;
  variety_name: string;
  total_days: number;
  seed_quantity?: number;
  seed_quantity_unit?: string;
  expected_yield_oz?: number;
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

interface DeliveryInfo {
  schedule_id: number | null;
  delivery_date: Date;
  standing_order_id: number;
  customer_name?: string;
  order_name: string;
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
  seed_quantity?: number; // Seed quantity per tray (in grams)
  seed_quantity_unit?: string; // Unit for seed quantity
  oz_needed?: number; // Ounces needed for this schedule (used for tray calculation)
  expected_yield_oz?: number; // Expected yield per tray in oz
  deliveries?: DeliveryInfo[]; // Individual delivery info for each tray (used when creating trays)
}

interface SeedSelectionOption {
  key: string;
  source: 'seedbatch' | 'soaked_seed';
  actualBatchId: number;
  variety_name: string;
  label: string;
  description: string;
}

const PlantingSchedulePage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<PlantingSchedule[]>([]);
  const [filteredSchedules, setFilteredSchedules] = useState<PlantingSchedule[]>([]);
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'all'>('week');
  
  // Seeding dialog state
  const [seedingSchedule, setSeedingSchedule] = useState<PlantingSchedule | null>(null);
  const [seedingScheduleKey, setSeedingScheduleKey] = useState<string>('');
  const [seedingScheduleRef, setSeedingScheduleRef] = useState<PlantingSchedule | null>(null);
  const [selectedBatchOption, setSelectedBatchOption] = useState<SeedSelectionOption | null>(null);
  const [availableBatches, setAvailableBatches] = useState<SeedSelectionOption[]>([]);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [seedingDate, setSeedingDate] = useState('');
  const [isCreatingTray, setIsCreatingTray] = useState(false);
  const isSubmittingSeeding = useRef(false);

  // Print dialog state
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [selectedPrintDate, setSelectedPrintDate] = useState<string | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [farmName, setFarmName] = useState<string>('');
  const [seedingDays, setSeedingDays] = useState<string[]>([...ALL_WEEK_SEEDING_DAYS]);

  // Skipped schedules state (persisted for this session)
  const [skippedSchedules, setSkippedSchedules] = useState<Set<string>>(new Set());
  const [toastNotification, setToastNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Animation state for removing schedules
  const [removingScheduleKey, setRemovingScheduleKey] = useState<string | null>(null);

  // Helper to generate unique key for a schedule (index required for uniqueness)
  const getScheduleKey = (schedule: PlantingSchedule, index: number): string => {
    const sowDateKey = getLocalDateKey(new Date(schedule.sow_date));
    return `${schedule.standing_order_id}-${schedule.recipe_id}-${sowDateKey}-${schedule.customer_name || ''}-${schedule.product_name || ''}-${index}`;
  };

  useEffect(() => {
    fetchPlantingSchedule();
  }, []);

  useEffect(() => {
    if (!toastNotification) return;
    const timer = setTimeout(() => setToastNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [toastNotification]);

  const fetchPlantingSchedule = async () => {
    try {
      setLoading(true);
      const defaultSeedingDays = [...ALL_WEEK_SEEDING_DAYS];
      let farmSeedingDaysForSchedule: string[] | null = null;
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Fetch farm name and seeding days for print
      const { data: farmData } = await getSupabaseClient()
        .from('farms')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .single();
      if (farmData?.farmname) {
        setFarmName(farmData.farmname);
      }
      if (farmData) {
        const validatedSeedingDays = Array.isArray(farmData.seeding_days) && farmData.seeding_days.length > 0
          ? farmData.seeding_days
          : null;
        farmSeedingDaysForSchedule = validatedSeedingDays;
        setSeedingDays(validatedSeedingDays ?? defaultSeedingDays);
      }

      // 1. Fetch active standing orders with items
      const { data: standingOrdersData, error: ordersError } = await getSupabaseClient()
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
          const { data: itemsData } = await getSupabaseClient()
            .from('standing_order_items')
            .select(`
              *,
              products(product_id, product_name),
              product_variants(variant_id, variant_name, size_value, size_unit)
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
              size_value: item.product_variants?.size_value || null,
              size_unit: item.product_variants?.size_unit || 'oz',
            })),
          };
        })
      );

      // 2.5. Fetch order_schedules to get schedule_id for each delivery
      // This allows us to link each tray to its specific order schedule
      const standingOrderIds = ordersWithItems.map(o => o.standing_order_id);
      console.log('[PlantingSchedule] DEBUG - Fetching order_schedules for standing_order_ids:', standingOrderIds);

      const { data: orderSchedulesData, error: orderSchedulesError } = await getSupabaseClient()
        .from('order_schedules')
        .select('schedule_id, standing_order_id, scheduled_delivery_date, status')
        .in('standing_order_id', standingOrderIds)
        .in('status', ['pending', 'generated']);

      // DEBUG: Log raw order_schedules data
      console.log('[PlantingSchedule] DEBUG - Raw order_schedules data:', {
        error: orderSchedulesError,
        count: orderSchedulesData?.length || 0,
        data: orderSchedulesData?.slice(0, 10), // Show first 10 entries
      });

      // Create lookup map: "standing_order_id-YYYY-MM-DD" → schedule_id
      const scheduleIdLookup = new Map<string, number>();
      if (orderSchedulesData) {
        for (const schedule of orderSchedulesData) {
          const deliveryDate = new Date(schedule.scheduled_delivery_date);
          const dateKey = getLocalDateKey(deliveryDate);
          const key = `${schedule.standing_order_id}-${dateKey}`;
          scheduleIdLookup.set(key, schedule.schedule_id);
        }
      }
      // DEBUG: Log lookup map contents
      console.log('[PlantingSchedule] DEBUG - scheduleIdLookup entries:', Array.from(scheduleIdLookup.entries()).slice(0, 10));
      console.log('[PlantingSchedule] Loaded order_schedules lookup:', scheduleIdLookup.size, 'entries');

      // 3. Fetch all recipes with their total days and seed quantities
      const { data: recipesData, error: recipesError } = await getSupabaseClient()
        .from('recipes')
        .select('recipe_id, recipe_name, variety_name, seed_quantity, seed_quantity_unit, global_recipes(expected_yield_oz)')
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true);

      if (recipesError) throw recipesError;

      // Calculate total days for each recipe
      const recipes: Recipe[] = await Promise.all(
        (recipesData || []).map(async (recipe: any) => {
          const { data: stepsData } = await getSupabaseClient()
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

          // Convert seed quantity to grams for consistency
          let seedQuantityGrams = recipe.seed_quantity || 0;
          const seedUnit = recipe.seed_quantity_unit || 'grams';
          if (seedUnit === 'oz') {
            seedQuantityGrams = seedQuantityGrams * 28.35;
          }

          return {
            recipe_id: recipe.recipe_id,
            recipe_name: recipe.recipe_name,
            variety_name: recipe.variety_name || '',
            total_days: totalDays || 10, // Default to 10 if no steps
            seed_quantity: seedQuantityGrams,
            seed_quantity_unit: 'grams', // Always store in grams for consistency
            expected_yield_oz: recipe.global_recipes?.expected_yield_oz || 9, // Default to 9 oz if not set
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
        const { data: mappingsData } = await getSupabaseClient()
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

        // Build recipe items for this standing order with oz_needed calculation
        const recipeItems: Array<{ recipe_id: number; quantity: number; oz_needed: number }> = [];

        for (const item of order.items) {
          const productMappings = mappingsByProduct[item.product_id] || [];

          if (productMappings.length === 0) continue;

          // Calculate total ratio for normalization
          const totalRatio = productMappings.reduce((sum, m) => sum + m.ratio, 0);

          // Calculate oz for this item (convert from grams if needed)
          let itemOz = item.quantity * (item.size_value || 1);
          if (item.size_unit === 'g') {
            itemOz = itemOz / 28.35; // Convert grams to oz
          }

          // Distribute product oz across recipes based on ratios
          for (const mapping of productMappings) {
            const recipeOzNeeded = (itemOz * mapping.ratio) / totalRatio;
            const recipeQuantity = (item.quantity * mapping.ratio) / totalRatio;

            // Check if recipe already exists in recipeItems
            const existingIndex = recipeItems.findIndex(r => r.recipe_id === mapping.recipe_id);
            if (existingIndex >= 0) {
              recipeItems[existingIndex].quantity += recipeQuantity;
              recipeItems[existingIndex].oz_needed += recipeOzNeeded;
            } else {
              recipeItems.push({
                recipe_id: mapping.recipe_id,
                quantity: recipeQuantity,
                oz_needed: recipeOzNeeded,
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
          recipes,
          farmSeedingDaysForSchedule
        );

        // 6. Convert to PlantingSchedule format with order context
        for (const schedule of sowSchedules) {
          // Find the product info for this recipe (if available)
          const productInfo = order.items.find(item => {
            const mappings = mappingsByProduct[item.product_id] || [];
            return mappings.some(m => m.recipe_id === schedule.recipe_id);
          });

          // Find the recipe to get seed quantity and expected yield info
          const recipeInfo = recipes.find(r => r.recipe_id === schedule.recipe_id);
          const expectedYieldOz = recipeInfo?.expected_yield_oz || 9; // Default 9 oz per tray

          // Find the oz_needed from recipeItems (calculated earlier with proper unit conversion)
          const recipeItem = recipeItems.find(r => r.recipe_id === schedule.recipe_id);
          const ozNeeded = recipeItem?.oz_needed || 0;

          // Calculate trays from oz: trays = ceil(oz_needed / expected_yield_oz)
          const traysNeeded = ozNeeded > 0 ? Math.ceil(ozNeeded / expectedYieldOz) : Math.max(1, Math.ceil(schedule.quantity));

          allSchedules.push({
            sow_date: schedule.sow_date,
            delivery_date: schedule.delivery_date,
            recipe_id: schedule.recipe_id,
            recipe_name: schedule.recipe_name,
            quantity: traysNeeded,
            days_before_delivery: schedule.days_before_delivery,
            standing_order_id: order.standing_order_id,
            order_name: order.order_name,
            customer_name: order.customer_name,
            product_name: productInfo?.product_name,
            variant_name: productInfo?.variant_name || undefined,
            seed_quantity: recipeInfo?.seed_quantity,
            seed_quantity_unit: recipeInfo?.seed_quantity_unit,
            oz_needed: ozNeeded,
            expected_yield_oz: expectedYieldOz,
          });
        }
      }

      // Sort by sow date
      allSchedules.sort((a, b) => a.sow_date.getTime() - b.sow_date.getTime());

      // 6.5. Deduplicate schedules with same (recipe_id, sow_date)
      // This happens when multiple delivery days align to the same seeding day
      // Each tray is for ONE delivery only - sum trays across all deliveries
      // Collect delivery info so we can link each tray to its specific order
      const dedupeMap = new Map<string, PlantingSchedule>();
      for (const schedule of allSchedules) {
        const sowDateKey = getLocalDateKey(schedule.sow_date);
        const key = `${schedule.recipe_id}-${sowDateKey}`;
        const existing = dedupeMap.get(key);

        // Look up the actual schedule_id from order_schedules
        const deliveryDateKey = getLocalDateKey(schedule.delivery_date);
        const scheduleLookupKey = `${schedule.standing_order_id}-${deliveryDateKey}`;
        const scheduleId = scheduleIdLookup.get(scheduleLookupKey) || null;

        // DEBUG: Log schedule_id lookup (only for first few)
        if (dedupeMap.size < 3) {
          console.log('[PlantingSchedule] DEBUG - schedule_id lookup:', {
            scheduleLookupKey,
            found: scheduleIdLookup.has(scheduleLookupKey),
            scheduleId,
            standing_order_id: schedule.standing_order_id,
            delivery_date: schedule.delivery_date,
            deliveryDateKey,
          });
        }

        // Create delivery info for this schedule (one tray per delivery)
        const deliveryInfo: DeliveryInfo = {
          schedule_id: scheduleId,
          delivery_date: schedule.delivery_date,
          standing_order_id: schedule.standing_order_id,
          customer_name: schedule.customer_name,
          order_name: schedule.order_name,
        };

        if (existing) {
          // Sum quantities - each delivery needs its own tray(s)
          existing.quantity = (existing.quantity || 0) + (schedule.quantity || 0);
          existing.oz_needed = (existing.oz_needed || 0) + (schedule.oz_needed || 0);
          // Collect delivery info for tray creation
          if (!existing.deliveries) existing.deliveries = [];
          // Add one entry per tray needed for this delivery
          const traysForDelivery = Math.ceil(schedule.quantity || 1);
          for (let i = 0; i < traysForDelivery; i++) {
            existing.deliveries.push(deliveryInfo);
          }
        } else {
          // Clone to avoid mutating original and initialize deliveries
          const traysForDelivery = Math.ceil(schedule.quantity || 1);
          const deliveries: DeliveryInfo[] = [];
          for (let i = 0; i < traysForDelivery; i++) {
            deliveries.push(deliveryInfo);
          }
          dedupeMap.set(key, { ...schedule, deliveries });
        }
      }
      const deduplicatedSchedules = Array.from(dedupeMap.values());
      deduplicatedSchedules.sort((a, b) => a.sow_date.getTime() - b.sow_date.getTime());

      console.log(`[PlantingSchedule] Deduplicated ${allSchedules.length} → ${deduplicatedSchedules.length} schedules`);

      // 7. Filter out schedules where trays have already been created
      // Check for existing trays or task_completions for each schedule
      const filteredSchedules: PlantingSchedule[] = [];

      if (deduplicatedSchedules.length === 0) {
        setSchedules([]);
        setLoading(false);
        return;
      }

      // Batch check for all schedules at once for better performance
      // Fetch ALL trays and tasks for these recipes (not just within date range)
      // We'll match them to each schedule's specific recipe_id and sow_date
      const recipeIds = [...new Set(deduplicatedSchedules.map(s => s.recipe_id))];
      
      // Fetch all existing trays for these recipes (no date filter - we need all of them)
      const { data: existingTrays, error: traysError } = await getSupabaseClient()
        .from('trays')
        .select('recipe_id, sow_date')
        .eq('farm_uuid', farmUuid)
        .in('recipe_id', recipeIds);
      
      if (traysError) {
        console.error('[PlantingSchedule] Error fetching existing trays:', traysError);
      }

      // Build seeded trays map from the trays table (source of truth)
      // Note: task_completions is used for audit/tracking purposes only, not for filtering
      const seededTraysByRecipeDate = new Map<number, Map<string, number>>();

      const incrementSeededTrays = (recipeId: number, dateKey: string, count: number) => {
        if (typeof recipeId !== 'number' || Number.isNaN(recipeId) || !dateKey || count <= 0) {
          return;
        }
        if (!seededTraysByRecipeDate.has(recipeId)) {
          seededTraysByRecipeDate.set(recipeId, new Map<string, number>());
        }
        const recipeMap = seededTraysByRecipeDate.get(recipeId)!;
        recipeMap.set(dateKey, (recipeMap.get(dateKey) || 0) + count);
      };

      if (existingTrays && existingTrays.length > 0) {
        existingTrays.forEach((tray: any) => {
          if (tray.recipe_id && tray.sow_date) {
            // Extract YYYY-MM-DD directly from the date string to avoid timezone shifts
            const sowDateStr = String(tray.sow_date);
            const trayDateKey = sowDateStr.includes('T')
              ? sowDateStr.split('T')[0]
              : sowDateStr.slice(0, 10);
            incrementSeededTrays(tray.recipe_id, trayDateKey, 1);
          }
        });
      }

      const candidateOffsets = [0, -1, 1];
      let filteredCount = 0;

      for (const schedule of deduplicatedSchedules) {
        const scheduleDate = new Date(schedule.sow_date);
        scheduleDate.setHours(0, 0, 0, 0);
        const scheduledTrays = Math.max(1, Math.ceil(schedule.quantity || 0));
        const recipeSeedMap = seededTraysByRecipeDate.get(schedule.recipe_id);

        if (recipeSeedMap && recipeSeedMap.size > 0) {
          let remainingToCover = scheduledTrays;
          for (const offset of candidateOffsets) {
            if (remainingToCover <= 0) {
              break;
            }
            const candidateDate = new Date(scheduleDate);
            candidateDate.setDate(candidateDate.getDate() + offset);
            const candidateKey = getLocalDateKey(candidateDate);
            const available = recipeSeedMap.get(candidateKey) || 0;

            if (available <= 0) {
              continue;
            }
            const used = Math.min(available, remainingToCover);
            recipeSeedMap.set(candidateKey, available - used);
            remainingToCover -= used;
          }
          if (remainingToCover <= 0) {
            filteredCount++;
            continue;
          }
        }

        filteredSchedules.push(schedule);
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

    // Include overdue schedules from the last 7 days
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const filtered = schedules.filter(schedule => {
      const sowDate = new Date(schedule.sow_date);
      sowDate.setHours(0, 0, 0, 0);
      // Include past 7 days (overdue) OR future dates within range
      const isOverdue = sowDate >= sevenDaysAgo && sowDate < now;
      const isInRange = sowDate >= now && sowDate <= endDate;
      return isOverdue || isInRange;
    });

    setFilteredSchedules(filtered);
  }, [dateRange, schedules]);

  useEffect(() => {
    filterSchedules();
  }, [schedules, dateRange, filterSchedules]);

  const groupSchedulesByDate = (schedules: PlantingSchedule[]) => {
    const grouped: Record<string, PlantingSchedule[]> = {};
    schedules.forEach(schedule => {
      // Use local date key to match scheduler calculations
      const dateKey = getLocalDateKey(new Date(schedule.sow_date));
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

  // Helper to get local date key (YYYY-MM-DD) from a Date object
  const getLocalDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Get unique dates that have seeding tasks, filtered by farm's seeding days
  // Includes past 7 days (for catch-up) plus future dates from filteredSchedules
  const getAvailablePrintDates = () => {
    const dateSet = new Set<string>();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Use local time for comparisons (scheduler uses local time)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Use ALL schedules (not just filtered) to catch missed past dates
    schedules.forEach(schedule => {
      const sowDate = new Date(schedule.sow_date);
      const dateKey = getLocalDateKey(sowDate);
      // Use local getDay() to match how scheduler calculates day of week
      const dayOfWeek = dayNames[sowDate.getDay()];

      // Include dates from last 7 days OR future dates within the filtered range
      const sowDateMidnight = new Date(sowDate);
      sowDateMidnight.setHours(0, 0, 0, 0);
      const isRecentPast = sowDateMidnight >= sevenDaysAgo && sowDateMidnight < today;
      const isInFilteredRange = filteredSchedules.some(fs => {
        return getLocalDateKey(new Date(fs.sow_date)) === dateKey;
      });

      // Only include dates that fall on configured seeding days
      if (seedingDays.length === 0 || seedingDays.includes(dayOfWeek)) {
        if (isRecentPast || isInFilteredRange) {
          dateSet.add(dateKey);
        }
      }
    });

    return Array.from(dateSet).sort();
  };

  // Helper to check if a date is in the past (uses local time)
  const isDatePast = (dateKey: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Parse as local time by using noon to avoid timezone shifts
    const date = new Date(dateKey + 'T12:00:00');
    date.setHours(0, 0, 0, 0);
    return date < today;
  };

  const handlePrintDate = (dateKey: string) => {
    setSelectedPrintDate(dateKey);
    setShowPrintDialog(false);
    // Show preview dialog instead of immediately printing
    setShowPrintPreview(true);
  };

  const handlePrint = () => {
    // Close preview dialog and print
    setShowPrintPreview(false);
    // Small delay to allow dialog to close before printing
    setTimeout(() => {
      window.print();
    }, 100);
  };

  // Handle skipping an overdue schedule
  const handleSkipSchedule = (schedule: PlantingSchedule) => {
    const scheduleKey = `${schedule.standing_order_id}-${schedule.recipe_id}-${getLocalDateKey(new Date(schedule.sow_date))}`;
    setSkippedSchedules(prev => new Set([...prev, scheduleKey]));
  };

  // Check if a schedule has been skipped
  const isScheduleSkipped = (schedule: PlantingSchedule) => {
    const scheduleKey = `${schedule.standing_order_id}-${schedule.recipe_id}-${getLocalDateKey(new Date(schedule.sow_date))}`;
    return skippedSchedules.has(scheduleKey);
  };

  const handleCreateTray = async (schedule: PlantingSchedule, index: number) => {
    setSeedingSchedule(schedule);
    setSeedingScheduleKey(getScheduleKey(schedule, index));
    setSeedingScheduleRef(schedule); // Keep reference for removal
    // Set default seeding date to the schedule's sow_date
    setSeedingDate(formatDateForInput(schedule.sow_date));
    setSelectedBatchOption(null);
    setAvailableBatches([]);
    setBatchNotice(null);
    await fetchAvailableBatchesForRecipe(schedule);
  };

  const fetchAvailableBatchesForRecipe = async (schedule: PlantingSchedule) => {
    setLoadingBatches(true);
    setSelectedBatchOption(null);
    setAvailableBatches([]);
    setBatchNotice(null);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        setAvailableBatches([]);
        return;
      }

      const { farmUuid } = JSON.parse(sessionData);

      const { data: recipeData, error: recipeError } = await getSupabaseClient()
        .from('recipes')
        .select('recipe_id, recipe_name, variety_id, variety_name, seed_quantity, seed_quantity_unit')
        .eq('recipe_id', schedule.recipe_id)
        .eq('farm_uuid', farmUuid)
        .single();

      if (recipeError || !recipeData) {
        console.error('[PlantingSchedule] Error fetching recipe:', recipeError);
        return;
      }

      let seedQuantityPerTray = 0;
      if (recipeData.seed_quantity) {
        const unit = recipeData.seed_quantity_unit || 'grams';
        seedQuantityPerTray = unit === 'oz' ? recipeData.seed_quantity * 28.35 : recipeData.seed_quantity;
      }

      const numberOfTrays = Math.max(1, Math.ceil(schedule.quantity));
      const totalSeedNeeded = seedQuantityPerTray * numberOfTrays;

      if (!recipeData.variety_id) {
        console.error('[PlantingSchedule] Recipe has no variety_id');
        return;
      }

      let varietyName = recipeData.variety_name || '';
      let requiresSoaking = false;
      try {
        const { data: varietyData, error: varietyError } = await getSupabaseClient()
          .from('varieties')
          .select('varietyid, name, soakingtimehours')
          .eq('varietyid', recipeData.variety_id)
          .single();
        if (varietyError && !varietyData) {
          console.error('[PlantingSchedule] Error fetching variety info:', varietyError);
        }
        if (varietyData) {
          varietyName = varietyData.name || varietyName;
          requiresSoaking = Number(varietyData.soakingtimehours ?? 0) > 0;
        }
      } catch (error) {
        console.error('[PlantingSchedule] Unexpected error fetching variety info:', error);
      }

      console.log('[PlantingSchedule] Recipe data for batch lookup:', {
        recipe_id: recipeData.recipe_id,
        variety_id: recipeData.variety_id,
        variety_name: varietyName,
        seed_quantity: recipeData.seed_quantity,
        seed_quantity_unit: recipeData.seed_quantity_unit,
        seedQuantityPerTray,
        numberOfTrays,
        totalSeedNeeded,
        requiresSoaking,
      });

      const convertToGrams = (quantity: number | string | null | undefined, unit?: string | null) => {
        const numeric = typeof quantity === 'number' ? quantity : Number(quantity ?? 0);
        if (!Number.isFinite(numeric)) return 0;
        const normalizedUnit = (unit || 'grams').toLowerCase();
        if (normalizedUnit.includes('lb')) {
          return numeric * 453.592;
        }
        return numeric;
      };

      const formatBatchQuantityText = (quantity: number | string | null | undefined, unit?: string | null) => {
        const numeric = typeof quantity === 'number' ? quantity : Number(quantity ?? 0);
        const formattedValue = Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';
        return `${formattedValue} ${unit || 'grams'} available`;
      };

      const formatDateLabel = (value?: string | null) => {
        if (!value) return 'unknown date';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return 'unknown date';
        return parsed.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      };

      const resolveBatchIdFromSoaked = (record: any): number | null => {
        const candidates = [
          record.seedbatch_id,
          record.seedbatchid,
          record.seed_batch_id,
          record.batchid,
          record.batch_id,
        ];
        for (const candidate of candidates) {
          if (candidate || candidate === 0) {
            const parsed = typeof candidate === 'number' ? candidate : Number(candidate);
            if (!Number.isNaN(parsed)) {
              return parsed;
            }
          }
        }
        return null;
      };

      if (requiresSoaking) {
        const { data: soakedSeedsData, error: soakedSeedsError } = await getSupabaseClient()
          .from('soaked_seed')
          .select('soaked_id, seedbatch_id, quantity_remaining, unit, soak_date, expires_at')
          .eq('farm_uuid', farmUuid)
          .eq('variety_id', recipeData.variety_id)
          .eq('status', 'available')
          .order('soak_date', { ascending: false });

        if (soakedSeedsError) {
          console.error('[PlantingSchedule] Error fetching soaked seeds:', soakedSeedsError);
          setBatchNotice('This variety requires soaking. No soaked seeds available.');
          return;
        }

        const soakedOptions = (soakedSeedsData || [])
          .map<SeedSelectionOption | null>((soaked: any, index: number) => {
            const quantityGrams = convertToGrams(soaked.quantity_remaining ?? 0, soaked.unit);
            const hasEnough = totalSeedNeeded > 0 ? quantityGrams >= totalSeedNeeded : true;
            if (!hasEnough) return null;
            const actualBatchId = resolveBatchIdFromSoaked(soaked);
            if (!actualBatchId) return null;
            const soakIdentifier = soaked.soaked_id ?? index;
            const soakDateLabel = formatDateLabel(soaked.soak_date);
            const displayQuantity = `${quantityGrams.toFixed(2)} g remaining`;
            const expiresLabel = soaked.expires_at ? `Expires ${formatDateLabel(soaked.expires_at)}` : 'Available';
            return {
              key: `soaked-${soakIdentifier}`,
              source: 'soaked_seed',
              actualBatchId,
              variety_name: varietyName,
              label: `${varietyName || 'Variety'} • Soaked on ${soakDateLabel} - ${displayQuantity}`,
              description: `${expiresLabel} • Batch #${actualBatchId}`,
            };
          })
          .filter((option): option is SeedSelectionOption => option !== null);

        if (soakedOptions.length === 0) {
          setBatchNotice('This variety requires soaking. No soaked seeds available.');
          return;
        }

        setAvailableBatches(soakedOptions);
        setBatchNotice(null);
        return;
      }

      const { data: allBatches, error: allBatchesError } = await getSupabaseClient()
        .from('seedbatches')
        .select('*')
        .eq('farm_uuid', farmUuid);

      if (allBatchesError) {
        console.error('[PlantingSchedule] Error fetching all batches for debug:', allBatchesError);
      } else {
        console.log('[PlantingSchedule] All batches for farm:', {
          count: allBatches?.length || 0,
          batches: allBatches,
        });
      }

      const { data: batchesData, error: batchesError } = await getSupabaseClient()
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
        .order('purchasedate', { ascending: true });

      if (batchesError) {
        console.error('[PlantingSchedule] Error fetching batches:', batchesError);
        return;
      }

      const qualifyingBatches = (batchesData || []).filter((batch: any) => {
        const batchQuantityGrams = convertToGrams(batch.quantity, batch.unit);
        const passes = totalSeedNeeded > 0 ? batchQuantityGrams >= totalSeedNeeded : true;
        return passes;
      });

      const formattedOptions = qualifyingBatches.map((batch: any) => {
        const quantityText = formatBatchQuantityText(batch.quantity, batch.unit);
        const descriptionParts = [quantityText];
        if (batch.lot_number) {
          descriptionParts.push(`Lot: ${batch.lot_number}`);
        }
        if (batch.purchasedate) {
          descriptionParts.push(`Purchased: ${formatDateLabel(batch.purchasedate)}`);
        }
        return {
          key: `seedbatch-${batch.batchid}`,
          source: 'seedbatch' as const,
          actualBatchId: batch.batchid,
          variety_name: varietyName,
          label: `${varietyName} - Batch #${batch.batchid}`,
          description: descriptionParts.join(' • '),
        };
      });

      setAvailableBatches(formattedOptions);
    } catch (error) {
      console.error('[PlantingSchedule] Error in fetchAvailableBatchesForRecipe:', error);
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleSeedingConfirm = async () => {
    if (!seedingSchedule || !selectedBatchOption || !selectedBatchOption.actualBatchId) {
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
      const { data: recipeData, error: recipeError } = await getSupabaseClient()
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

      // Create tray creation requests - one per delivery so each tray links to its order
      const batchIdForRequest = selectedBatchOption.actualBatchId;
      const deliveries = seedingSchedule.deliveries || [];

      // DEBUG: Log full deliveries array
      console.log('[PlantingSchedule] DEBUG - Full deliveries array:', JSON.stringify(deliveries, (_key, value) => {
        if (value instanceof Date) return value.toISOString();
        return value;
      }, 2));

      // If we have delivery info, create one request per delivery (with order_schedule_id)
      // Otherwise fall back to creating identical requests
      const requests = deliveries.length > 0
        ? deliveries.map((delivery, index) => {
            const request = {
              customer_name: delivery.customer_name || null,
              variety_name: varietyName,
              recipe_name: recipeData.recipe_name,
              farm_uuid: farmUuid,
              user_id: userId,
              requested_at: sowDateISO,
              batch_id: batchIdForRequest,
              standing_order_id: delivery.standing_order_id,
              order_schedule_id: delivery.schedule_id,
            };
            // DEBUG: Log each request being built
            console.log(`[PlantingSchedule] DEBUG - Tray request ${index + 1}:`, {
              order_schedule_id: delivery.schedule_id,
              standing_order_id: delivery.standing_order_id,
              delivery_date: delivery.delivery_date,
              customer_name: delivery.customer_name,
            });
            return request;
          })
        : Array.from({ length: numberOfTrays }, () => ({
            customer_name: null,
            variety_name: varietyName,
            recipe_name: recipeData.recipe_name,
            farm_uuid: farmUuid,
            user_id: userId,
            requested_at: sowDateISO,
            batch_id: batchIdForRequest,
          }));

      // DEBUG: Log full requests array before insert
      console.log('[PlantingSchedule] DEBUG - Full requests array to insert:', JSON.stringify(requests, null, 2));

      console.log('[PlantingSchedule] Creating tray creation requests:', {
        numberOfTrays,
        recipeName: recipeData.recipe_name,
        batchId: batchIdForRequest,
        sowDate: sowDateISO,
        deliveriesCount: deliveries.length,
        orderScheduleIds: deliveries.map(d => d.schedule_id),
        standingOrderIds: deliveries.map(d => d.standing_order_id),
      });

      const { error: requestError } = await getSupabaseClient()
        .from('tray_creation_requests')
        .insert(requests);

      if (requestError) {
        console.error('[PlantingSchedule] Error creating tray requests:', requestError);
        throw requestError;
      }

      console.log('[PlantingSchedule] Tray creation requests created successfully');

      // Create task_completion record so daily flow knows this is done
      const sowDateStr = seedingDate; // Already in YYYY-MM-DD format from date input
      const { error: completionError } = await getSupabaseClient()
        .from('task_completions')
        .upsert({
          farm_uuid: farmUuid,
          task_type: 'sowing',
          task_date: sowDateStr,
          recipe_id: seedingSchedule.recipe_id,
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: userId,
          batch_id: batchIdForRequest,
          quantity_used: numberOfTrays,
          quantity_unit: 'trays',
          customer_name: seedingSchedule.customer_name || null,
          product_name: seedingSchedule.product_name || null,
          notes: 'Seeding completed from Planting Schedule',
        }, {
          onConflict: 'farm_uuid,task_type,task_date,recipe_id,customer_name,product_name'
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

      // Get the schedule key and reference that were stored when dialog opened
      const scheduleKey = seedingScheduleKey;
      const scheduleToRemove = seedingScheduleRef;
      const recipeDisplayName = recipeData.variety_name || recipeData.recipe_name || 'recipe';

      // Close dialog immediately
      setSeedingSchedule(null);
      setSeedingScheduleKey('');
      setSeedingScheduleRef(null);
      setSelectedBatchOption(null);
      setAvailableBatches([]);
      setBatchNotice(null);
      setSeedingDate('');

      // Show success toast immediately
      setToastNotification({
        type: 'success',
        message: `Successfully seeded ${numberOfTrays} ${numberOfTrays === 1 ? 'tray' : 'trays'} of ${recipeDisplayName}!`,
      });

      // Trigger fade-out animation
      setRemovingScheduleKey(scheduleKey);

      // After animation completes, remove from local state (optimistic update)
      // Use object reference to ensure we remove the exact schedule that was seeded
      setTimeout(() => {
        setSchedules(prev => prev.filter(s => s !== scheduleToRemove));
        setRemovingScheduleKey(null);
      }, 300);
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
          <Button
            onClick={() => setShowPrintDialog(true)}
            variant="outline"
            disabled={filteredSchedules.length === 0}
          >
            <Printer className="h-4 w-4 mr-2" />
            Print Seeding Plan
          </Button>
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
            // Parse as local time (noon) to avoid timezone shifts
            const sowDate = new Date(dateKey + 'T12:00:00');
            const daysUntil = getDaysUntil(sowDate);
            const isToday = daysUntil === 0;
            const isPast = daysUntil < 0;

            return (
              <Card key={dateKey} className={
                isToday
                  ? 'border-emerald-500 border-2'
                  : isPast
                  ? 'border-amber-500 border-2 bg-amber-50/30'
                  : ''
              }>
                <CardHeader className={
                  isPast
                    ? 'bg-gradient-to-r from-amber-50 to-amber-25 border-b'
                    : 'bg-gradient-to-r from-gray-50 to-white border-b'
                }>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        isToday
                          ? 'bg-emerald-100'
                          : isPast
                          ? 'bg-amber-100'
                          : 'bg-gray-100'
                      }`}>
                        {isPast ? (
                          <AlertTriangle className="h-5 w-5 text-amber-600" />
                        ) : (
                          <Calendar className={`h-5 w-5 ${isToday ? 'text-emerald-600' : 'text-gray-600'}`} />
                        )}
                      </div>
                      <div>
                        <CardTitle className={`text-lg font-bold ${isPast ? 'text-amber-800' : 'text-gray-800'}`}>
                          {formatDate(sowDate)}
                        </CardTitle>
                        <CardDescription className={isPast ? 'text-amber-700' : ''}>
                          {isToday
                            ? 'Today - Plant Now!'
                            : isPast
                            ? `${Math.abs(daysUntil)} ${Math.abs(daysUntil) === 1 ? 'day' : 'days'} overdue - Seed now or skip`
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
                    {isPast && (
                      <Badge className="bg-amber-500 text-white">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        OVERDUE
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-gray-100">
                    {daySchedules
                      .filter(schedule => !isScheduleSkipped(schedule))
                      .map((schedule, index) => {
                        const scheduleKey = getScheduleKey(schedule, index);
                        const isRemoving = removingScheduleKey === scheduleKey;
                        return (
                      <div
                        key={scheduleKey}
                        className={`p-4 transition-all duration-300 ease-out ${
                          isRemoving
                            ? 'opacity-0 -translate-y-2'
                            : 'opacity-100 translate-y-0'
                        } ${isPast ? 'hover:bg-amber-50' : 'hover:bg-gray-50'}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className={`font-semibold ${isPast ? 'text-amber-900' : 'text-gray-900'}`}>
                                {schedule.recipe_name}
                              </h3>
                              <Badge variant="outline" className={`text-xs ${isPast ? 'border-amber-400 text-amber-700' : ''}`}>
                                {Math.ceil(schedule.quantity)} {Math.ceil(schedule.quantity) === 1 ? 'tray' : 'trays'}
                              </Badge>
                            </div>
                            <div className={`space-y-1 text-sm ${isPast ? 'text-amber-700' : 'text-gray-600'}`}>
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
                          <div className="flex items-center gap-2">
                            {isPast && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSkipSchedule(schedule)}
                                className="text-amber-700 border-amber-400 hover:bg-amber-100"
                              >
                                <X className="h-4 w-4 mr-1" />
                                Skip
                              </Button>
                            )}
                            <Button
                              variant={isPast ? "default" : "ghost"}
                              size="sm"
                              onClick={() => handleCreateTray(schedule, index)}
                              className={isPast ? "bg-amber-600 hover:bg-amber-700 text-white" : "flex items-center gap-1"}
                            >
                              {isPast ? 'Seed Now' : 'Create Tray'}
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {toastNotification && (
        <div className="fixed bottom-4 right-4 z-50">
          <Card className="border border-gray-200 shadow-lg bg-white">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                <Check className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-xs font-semibold uppercase text-emerald-600">Success</p>
                <p className="text-sm text-slate-700">{toastNotification.message}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-500 hover:text-slate-900"
                onClick={() => setToastNotification(null)}
                aria-label="Dismiss success message"
              >
                <span className="text-lg leading-none">×</span>
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Seeding Dialog */}
      <Dialog open={!!seedingSchedule} onOpenChange={(open) => {
        if (!open) {
          setSeedingSchedule(null);
          setSelectedBatchOption(null);
          setAvailableBatches([]);
          setBatchNotice(null);
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
                    <p>
                      {batchNotice ?? 'No available batches found for this recipe. Please ensure you have:'}
                    </p>
                    {!batchNotice && (
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>A seed batch for this variety</li>
                        <li>Sufficient quantity for {Math.ceil(seedingSchedule.quantity)} {Math.ceil(seedingSchedule.quantity) === 1 ? 'tray' : 'trays'}</li>
                        <li>An active batch status</li>
                      </ul>
                    )}
                  </div>
                ) : (
                  <Select
                    value={selectedBatchOption?.key || ''}
                    onValueChange={(value) => {
                      const option = availableBatches.find(batch => batch.key === value);
                      setSelectedBatchOption(option || null);
                    }}
                  >
                    <SelectTrigger id="batch-select" className="w-full">
                      <SelectValue placeholder="Select a seed batch" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableBatches.map((option) => (
                        <SelectItem key={option.key} value={option.key}>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {option.label}
                            </span>
                            <span className="text-xs text-slate-500">
                              {option.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedBatchOption && (
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
                setSelectedBatchOption(null);
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
              disabled={!selectedBatchOption || !seedingDate || isSubmittingSeeding.current || availableBatches.length === 0 || isCreatingTray}
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

      {/* Print Date Selection Dialog */}
      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Printer className="h-5 w-5 text-emerald-600" />
              </div>
              Print Seeding Plan
            </DialogTitle>
            <DialogDescription>
              Select which day's seeding plan you want to print
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-2">
            {getAvailablePrintDates().length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No seeding tasks available for the selected date range.
              </p>
            ) : (
              getAvailablePrintDates().map((dateKey) => {
                // Use local time (no Z) for display so day names match correctly
                const dateObj = new Date(dateKey + 'T12:00:00');
                const isPast = isDatePast(dateKey);
                // Use ALL schedules for past dates, filtered for future
                const schedulesForDate = schedules.filter(
                  s => getLocalDateKey(new Date(s.sow_date)) === dateKey
                );
                const totalTrays = schedulesForDate.reduce((sum, s) => sum + Math.ceil(s.quantity), 0);
                const uniqueRecipes = new Set(schedulesForDate.map(s => s.recipe_id)).size;

                return (
                  <button
                    key={dateKey}
                    onClick={() => handlePrintDate(dateKey)}
                    className={`w-full p-4 text-left rounded-lg border transition-colors ${
                      isPast
                        ? 'border-amber-300 bg-amber-50 hover:border-amber-500 hover:bg-amber-100'
                        : 'border-gray-200 hover:border-emerald-500 hover:bg-emerald-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900">
                            {formatDate(dateObj)}
                          </p>
                          {isPast && (
                            <Badge className="bg-amber-500 text-white text-xs">
                              Overdue
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {uniqueRecipes} {uniqueRecipes === 1 ? 'variety' : 'varieties'} • {totalTrays} {totalTrays === 1 ? 'tray' : 'trays'}
                        </p>
                      </div>
                      <Printer className={`h-5 w-5 ${isPast ? 'text-amber-500' : 'text-gray-400'}`} />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrintDialog(false)} className="w-full">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Preview Dialog */}
      <Dialog open={showPrintPreview} onOpenChange={setShowPrintPreview}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Printer className="h-5 w-5 text-emerald-600" />
              </div>
              Print Preview
            </DialogTitle>
            <DialogDescription>
              Preview your seeding plan before printing
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable Preview Content */}
          <div className="flex-1 overflow-y-auto border rounded-lg bg-white p-6 my-4" style={{ maxHeight: '60vh' }}>
            {selectedPrintDate && (() => {
              const dateSchedules = schedules.filter(s => {
                return getLocalDateKey(new Date(s.sow_date)) === selectedPrintDate;
              });

              const groupedByRecipe = dateSchedules.reduce((acc, schedule) => {
                const key = schedule.recipe_id;
                if (!acc[key]) {
                  acc[key] = {
                    recipe_id: schedule.recipe_id,
                    recipe_name: schedule.recipe_name,
                    seed_quantity: schedule.seed_quantity || 0,
                    total_trays: 0,
                    orders: [] as { order_name: string; customer_name?: string; quantity: number; delivery_date: Date }[],
                  };
                }
                acc[key].total_trays += Math.ceil(schedule.quantity);
                acc[key].orders.push({
                  order_name: schedule.order_name,
                  customer_name: schedule.customer_name,
                  quantity: Math.ceil(schedule.quantity),
                  delivery_date: schedule.delivery_date,
                });
                return acc;
              }, {} as Record<number, { recipe_id: number; recipe_name: string; seed_quantity: number; total_trays: number; orders: { order_name: string; customer_name?: string; quantity: number; delivery_date: Date }[] }>);

              const consolidatedSchedules = Object.values(groupedByRecipe);
              const sowDate = new Date(selectedPrintDate + 'T12:00:00');

              const formatSeedQuantity = (grams: number) => {
                if (grams >= 1000) return `${(grams / 1000).toFixed(2)} kg`;
                return `${grams.toFixed(1)} g`;
              };

              return (
                <div className="text-black font-sans">
                  {/* Header */}
                  <div className="text-center mb-6 border-b-2 border-black pb-4">
                    <div className="flex items-center justify-center gap-3 mb-2">
                      <Sprout className="h-8 w-8" />
                      <h1 className="text-2xl font-bold tracking-tight">SEEDING PLAN</h1>
                    </div>
                    {farmName && <p className="text-lg text-gray-600">{farmName}</p>}
                    <p className="text-xl font-semibold mt-2">
                      {sowDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>

                  {/* Summary Stats */}
                  <div className="grid grid-cols-3 gap-4 mb-6 text-center">
                    <div className="border border-gray-300 rounded p-3">
                      <p className="text-sm text-gray-600">Total Varieties</p>
                      <p className="text-2xl font-bold">{consolidatedSchedules.length}</p>
                    </div>
                    <div className="border border-gray-300 rounded p-3">
                      <p className="text-sm text-gray-600">Total Trays</p>
                      <p className="text-2xl font-bold">
                        {consolidatedSchedules.reduce((sum, s) => sum + s.total_trays, 0)}
                      </p>
                    </div>
                    <div className="border border-gray-300 rounded p-3">
                      <p className="text-sm text-gray-600">Total Seed Needed</p>
                      <p className="text-2xl font-bold">
                        {formatSeedQuantity(
                          consolidatedSchedules.reduce((sum, s) => sum + (s.seed_quantity * s.total_trays), 0)
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Seeding Tasks */}
                  <div className="space-y-4">
                    {consolidatedSchedules.map((schedule, index) => (
                      <div key={schedule.recipe_id} className="border border-gray-400 rounded-lg p-4">
                        <div className="flex items-start gap-4 mb-3">
                          <div className="flex-shrink-0 w-8 h-8 border-2 border-gray-600 rounded flex items-center justify-center text-lg font-bold">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <h2 className="text-lg font-bold">{schedule.recipe_name}</h2>
                            <div className="grid grid-cols-3 gap-4 mt-2 text-sm">
                              <div>
                                <span className="text-gray-600">Trays:</span>{' '}
                                <span className="font-semibold">{schedule.total_trays}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Seed/Tray:</span>{' '}
                                <span className="font-semibold">{formatSeedQuantity(schedule.seed_quantity)}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Total Seed:</span>{' '}
                                <span className="font-semibold">{formatSeedQuantity(schedule.seed_quantity * schedule.total_trays)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* Orders */}
                        <div className="ml-12 text-sm">
                          <p className="text-gray-600 mb-1">For Orders:</p>
                          <ul className="space-y-1">
                            {schedule.orders.map((order, i) => (
                              <li key={i} className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                                <span>
                                  {order.order_name}
                                  {order.customer_name && ` (${order.customer_name})`}
                                  {' - '}{order.quantity} {order.quantity === 1 ? 'tray' : 'trays'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowPrintPreview(false);
                setSelectedPrintDate(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handlePrint}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden Print Component - Only visible when printing */}
      {selectedPrintDate && (
        <SeedingPlanPrint
          schedules={schedules}
          selectedDate={selectedPrintDate}
          farmName={farmName}
        />
      )}
    </div>
  );
};

export default PlantingSchedulePage;

