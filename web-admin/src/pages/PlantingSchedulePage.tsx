import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Sprout, Package, Clock, AlertCircle, AlertTriangle, ChevronRight, ChevronDown, Check, Printer, X, SkipForward } from 'lucide-react';
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
  quantityGrams: number; // Available quantity in grams
  traysPossible: number; // How many trays this batch can seed
  lotNumber?: string;
  purchaseDate?: string;
  soakDate?: string;
  expiresAt?: string;
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
  const [showBatchPicker, setShowBatchPicker] = useState(false);
  const [traysToCreate, setTraysToCreate] = useState(1);
  const [seedQuantityPerTray, setSeedQuantityPerTray] = useState(0); // grams per tray
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

  // Skipped schedules state (in-memory for immediate UI + DB-sourced for persistence)
  const [skippedSchedules, setSkippedSchedules] = useState<Set<string>>(new Set());
  const [dbSkippedKeys, setDbSkippedKeys] = useState<Set<string>>(new Set());
  const [skipDialog, setSkipDialog] = useState<PlantingSchedule | null>(null);
  const [toastNotification, setToastNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Animation state for removing schedules
  const [removingScheduleKey, setRemovingScheduleKey] = useState<string | null>(null);
  // Track which seeded date groups are expanded (collapsed by default)
  const [expandedSeededDates, setExpandedSeededDates] = useState<Set<string>>(new Set());

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

      // Fetch order_schedules with pending/generated status
      // IMPORTANT: .limit(1000) overrides Supabase default of 10
      const { data: orderSchedulesData, error: orderSchedulesError } = await getSupabaseClient()
        .from('order_schedules')
        .select('schedule_id, standing_order_id, recipe_id, scheduled_delivery_date, status')
        .in('standing_order_id', standingOrderIds)
        .in('status', ['pending', 'generated', 'skipped', 'completed'])
        .limit(1000);

      // DEBUG: Explicit logging of actual array length (NOT sliced)
      console.log('[PlantingSchedule] order_schedules query result:', {
        actualLength: orderSchedulesData?.length,
        errorMsg: orderSchedulesError?.message || null,
        first3: orderSchedulesData?.slice(0, 3),
        last3: orderSchedulesData?.slice(-3),
      });

      // Create lookup map: "standing_order_id-recipe_id-YYYY-MM-DD" → schedule_id
      // Key must be unique per (standing_order, recipe, delivery_date) combination
      // scheduled_delivery_date comes from DB as string like '2025-12-10' or '2025-12-10T00:00:00'
      const scheduleIdLookup = new Map<string, number>();
      const skippedOrCompletedKeys = new Set<string>();
      if (orderSchedulesData) {
        for (const schedule of orderSchedulesData) {
          // DB returns date as string, split on T to get YYYY-MM-DD
          const dateKey = String(schedule.scheduled_delivery_date).split('T')[0];
          const key = `${schedule.standing_order_id}-${schedule.recipe_id}-${dateKey}`;
          // Track skipped/completed schedules separately so we can exclude them during dedup
          if (schedule.status === 'skipped' || schedule.status === 'completed') {
            skippedOrCompletedKeys.add(key);
          } else {
            scheduleIdLookup.set(key, schedule.schedule_id);
          }
          // DEBUG: Log first few entries
          if (scheduleIdLookup.size + skippedOrCompletedKeys.size <= 3) {
            console.log('[PlantingSchedule] DEBUG - Building lookup:', {
              raw: schedule.scheduled_delivery_date,
              dateKey,
              key,
              recipe_id: schedule.recipe_id,
              status: schedule.status,
            });
          }
        }
      }
      // Store DB skipped keys in state for render-time overdue filtering
      setDbSkippedKeys(skippedOrCompletedKeys);
      console.log('[PlantingSchedule] Loaded order_schedules lookup:', scheduleIdLookup.size, 'entries,', skippedOrCompletedKeys.size, 'skipped/completed');

      // 2.6. Fetch trays that already have order_schedule_id assigned
      // These deliveries have already been seeded and should be excluded from counts
      // Each delivery date gets its own unique order_schedule_id, so we only check if ANY tray exists
      const { data: seededTraysData } = await getSupabaseClient()
        .from('trays')
        .select('order_schedule_id')
        .eq('farm_uuid', farmUuid)
        .not('order_schedule_id', 'is', null);

      const seededScheduleIds = new Set<number>(
        seededTraysData?.map(t => t.order_schedule_id).filter((id): id is number => id !== null) || []
      );
      console.log('[PlantingSchedule] DEBUG - Seeded schedule IDs:', {
        count: seededScheduleIds.size,
        ids: Array.from(seededScheduleIds).slice(0, 20),
      });

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
      // Skip deliveries that already have trays (order_schedule_id in seededScheduleIds)
      const dedupeMap = new Map<string, PlantingSchedule>();
      let skippedSeededCount = 0;
      let skippedByStatusCount = 0;

      for (const schedule of allSchedules) {
        const sowDateKey = getLocalDateKey(schedule.sow_date);
        const key = `${schedule.recipe_id}-${sowDateKey}`;
        const existing = dedupeMap.get(key);

        // DEBUG: Trace Kohlrabi dedup to diagnose delivery grouping
        if (schedule.recipe_id === 20) {
          console.log('[PlantingSchedule] DEBUG - Dedup Kohlrabi:', {
            recipe_id: schedule.recipe_id,
            sow_date: sowDateKey,
            delivery_date: schedule.delivery_date,
            standing_order_id: schedule.standing_order_id,
            quantity: schedule.quantity,
            group_key: key,
            merging_into_existing: !!existing,
            existing_quantity: existing?.quantity,
            existing_deliveries_count: existing?.deliveries?.length,
          });
        }

        // Look up the actual schedule_id from order_schedules
        // delivery_date is a Date object - use LOCAL date components (not UTC which shifts the date)
        // Key format: "standing_order_id-recipe_id-YYYY-MM-DD"
        const deliveryDate = new Date(schedule.delivery_date);
        const deliveryDateKey = `${deliveryDate.getFullYear()}-${String(deliveryDate.getMonth() + 1).padStart(2, '0')}-${String(deliveryDate.getDate()).padStart(2, '0')}`;
        const scheduleLookupKey = `${schedule.standing_order_id}-${schedule.recipe_id}-${deliveryDateKey}`;

        // Skip deliveries whose order_schedule is skipped or completed in the DB
        if (skippedOrCompletedKeys.has(scheduleLookupKey)) {
          skippedByStatusCount++;
          continue;
        }

        const scheduleId = scheduleIdLookup.get(scheduleLookupKey) || null;

        // Check if this delivery has already been seeded (any tray exists with this order_schedule_id)
        // Each delivery date gets its own unique order_schedule_id, so no sow_date check needed
        const isAlreadySeeded = scheduleId !== null && seededScheduleIds.has(scheduleId);

        // DEBUG: Log schedule_id lookup (only for first few)
        if (dedupeMap.size < 3) {
          console.log('[PlantingSchedule] DEBUG - schedule_id lookup:', {
            raw_delivery_date: schedule.delivery_date,
            deliveryDateKey,
            scheduleLookupKey,
            recipe_id: schedule.recipe_id,
            found: scheduleIdLookup.has(scheduleLookupKey),
            scheduleId,
            isAlreadySeeded,
          });
        }

        // Track if this delivery is already seeded (but don't skip it)
        if (isAlreadySeeded) {
          skippedSeededCount++;
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

      console.log(`[PlantingSchedule] Deduplicated ${allSchedules.length} → ${deduplicatedSchedules.length} schedules (skipped ${skippedSeededCount} already-seeded, ${skippedByStatusCount} skipped/completed deliveries)`);

      // DEBUG: Kohlrabi dedup summary
      const kohlrabiGroups = deduplicatedSchedules.filter(s => s.recipe_id === 20);
      if (kohlrabiGroups.length > 0) {
        console.log('[PlantingSchedule] DEBUG - Kohlrabi dedup summary:', kohlrabiGroups.map(s => ({
          group_key: `${s.recipe_id}-${getLocalDateKey(s.sow_date)}`,
          sow_date: getLocalDateKey(s.sow_date),
          total_quantity: s.quantity,
          deliveries_count: s.deliveries?.length,
          deliveries: s.deliveries?.map(d => ({
            delivery_date: d.delivery_date,
            schedule_id: d.schedule_id,
            standing_order_id: d.standing_order_id,
            customer_name: d.customer_name,
          })),
        })));
      }

      // DEBUG: Log all schedules with sow_date < today BEFORE tray-check filtering
      const todayForDebug = new Date();
      todayForDebug.setHours(0, 0, 0, 0);
      const overdueBeforeFilter = deduplicatedSchedules.filter(s => {
        const sowDate = new Date(s.sow_date);
        sowDate.setHours(0, 0, 0, 0);
        return sowDate < todayForDebug;
      });
      console.log('[PlantingSchedule] DEBUG - Overdue schedules BEFORE tray-check filter:', {
        count: overdueBeforeFilter.length,
        schedules: overdueBeforeFilter.map(s => ({
          recipe_name: s.recipe_name,
          sow_date: getLocalDateKey(s.sow_date),
          quantity_needed: Math.ceil(s.quantity),
          recipe_id: s.recipe_id,
          deliveries_count: s.deliveries?.length || 0,
        })),
      });

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
      // Include scheduled_sow_date to match against the original planned date (not actual sow_date)
      const { data: existingTrays, error: traysError } = await getSupabaseClient()
        .from('trays')
        .select('recipe_id, sow_date, scheduled_sow_date')
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
          if (tray.recipe_id && (tray.scheduled_sow_date || tray.sow_date)) {
            // Use scheduled_sow_date as the key for matching (the originally planned date)
            // This ensures a tray scheduled for Feb 2 but seeded on Feb 3 counts against Feb 2
            // Fall back to sow_date for legacy trays without scheduled_sow_date
            const matchDateStr = String(tray.scheduled_sow_date || tray.sow_date);
            const trayDateKey = matchDateStr.includes('T')
              ? matchDateStr.split('T')[0]
              : matchDateStr.slice(0, 10);
            incrementSeededTrays(tray.recipe_id, trayDateKey, 1);
          }
        });
      }

      // Only check exact date match now that we use scheduled_sow_date for lookup
      // The ±1 day offsets were needed when matching on actual sow_date (which varies)
      const candidateOffsets = [0];
      let filteredCount = 0;

      // DEBUG: Log seeded trays map before filtering
      console.log('[PlantingSchedule] DEBUG - Seeded trays by recipe/date:',
        Array.from(seededTraysByRecipeDate.entries()).map(([recipeId, dateMap]) => ({
          recipe_id: recipeId,
          dates: Array.from(dateMap.entries()),
        }))
      );

      for (const schedule of deduplicatedSchedules) {
        const scheduleDate = new Date(schedule.sow_date);
        scheduleDate.setHours(0, 0, 0, 0);
        const scheduledTrays = Math.max(1, Math.ceil(schedule.quantity || 0));
        const recipeSeedMap = seededTraysByRecipeDate.get(schedule.recipe_id);

        // DEBUG: Check if this is an overdue schedule
        const isOverdueSchedule = scheduleDate < todayForDebug;

        if (recipeSeedMap && recipeSeedMap.size > 0) {
          let remainingToCover = scheduledTrays;
          const debugOffsets: { offset: number; dateKey: string; available: number; used: number }[] = [];

          for (const offset of candidateOffsets) {
            if (remainingToCover <= 0) {
              break;
            }
            const candidateDate = new Date(scheduleDate);
            candidateDate.setDate(candidateDate.getDate() + offset);
            const candidateKey = getLocalDateKey(candidateDate);
            const available = recipeSeedMap.get(candidateKey) || 0;

            if (available <= 0) {
              debugOffsets.push({ offset, dateKey: candidateKey, available: 0, used: 0 });
              continue;
            }
            const used = Math.min(available, remainingToCover);
            recipeSeedMap.set(candidateKey, available - used);
            remainingToCover -= used;
            debugOffsets.push({ offset, dateKey: candidateKey, available, used });
          }

          // DEBUG: Log filtering decision for overdue schedules
          if (isOverdueSchedule) {
            console.log('[PlantingSchedule] DEBUG - Tray check for OVERDUE schedule:', {
              recipe_name: schedule.recipe_name,
              recipe_id: schedule.recipe_id,
              sow_date: getLocalDateKey(scheduleDate),
              trays_needed: scheduledTrays,
              remaining_after_check: remainingToCover,
              will_be_filtered: remainingToCover <= 0,
              offset_checks: debugOffsets,
            });
          }

          if (remainingToCover <= 0) {
            filteredCount++;
            // Mark as seeded instead of filtering out
            filteredSchedules.push({ ...schedule, isSeeded: true });
            continue;
          }
        } else if (isOverdueSchedule) {
          // DEBUG: Log overdue schedules that have no seeded trays at all
          console.log('[PlantingSchedule] DEBUG - OVERDUE schedule with NO seeded trays:', {
            recipe_name: schedule.recipe_name,
            recipe_id: schedule.recipe_id,
            sow_date: getLocalDateKey(scheduleDate),
            trays_needed: scheduledTrays,
            will_be_kept: true,
          });
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

    // DEBUG: Count overdue in schedules state before filtering
    const overdueInState = schedules.filter(s => {
      const d = new Date(s.sow_date);
      d.setHours(0, 0, 0, 0);
      return d < now;
    });
    console.log('[PlantingSchedule] DEBUG - filterSchedules() called:', {
      schedules_total: schedules.length,
      overdue_in_schedules_state: overdueInState.length,
      overdue_details: overdueInState.map(s => ({
        recipe_name: s.recipe_name,
        sow_date: s.sow_date,
        quantity: Math.ceil(s.quantity),
      })),
      dateRange,
      sevenDaysAgo: sevenDaysAgo.toISOString(),
      now: now.toISOString(),
    });

    const filtered = schedules.filter(schedule => {
      const sowDate = new Date(schedule.sow_date);
      sowDate.setHours(0, 0, 0, 0);
      // Include past 7 days (overdue) OR future dates within range
      const isOverdue = sowDate >= sevenDaysAgo && sowDate < now;
      const isInRange = sowDate >= now && sowDate <= endDate;
      return isOverdue || isInRange;
    });

    // DEBUG: Log filtered results
    const overdueInFiltered = filtered.filter(s => {
      const d = new Date(s.sow_date);
      d.setHours(0, 0, 0, 0);
      return d < now;
    });
    console.log('[PlantingSchedule] DEBUG - filterSchedules() result:', {
      filtered_total: filtered.length,
      overdue_in_filtered: overdueInFiltered.length,
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

  // Separate overdue schedules from upcoming/today schedules
  const separateSchedules = useCallback((schedules: PlantingSchedule[]) => {
    const today = getToday();
    const overdue: PlantingSchedule[] = [];
    const upcoming: PlantingSchedule[] = [];

    schedules.forEach(schedule => {
      const sowDate = new Date(schedule.sow_date);
      sowDate.setHours(0, 0, 0, 0);
      if (sowDate < today) {
        overdue.push(schedule);
      } else {
        upcoming.push(schedule);
      }
    });

    // Sort overdue by date descending (most recent first)
    overdue.sort((a, b) => new Date(b.sow_date).getTime() - new Date(a.sow_date).getTime());

    return { overdue, upcoming };
  }, []);

  const getDaysUntil = (date: Date) => {
    const today = getToday();
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const diff = targetDate.getTime() - today.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const getDaysOverdue = (date: Date) => {
    const today = getToday();
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const diff = today.getTime() - targetDate.getTime();
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
    setSkipDialog(schedule);
  };

  const confirmSkipSchedule = async () => {
    if (!skipDialog) return;
    const scheduleKey = `${skipDialog.standing_order_id}-${skipDialog.recipe_id}-${getLocalDateKey(new Date(skipDialog.sow_date))}`;
    setSkippedSchedules(prev => new Set([...prev, scheduleKey]));
    setSkipDialog(null);

    // Persist to DB — update all delivery schedule_ids to 'skipped'
    const scheduleIds = (skipDialog.deliveries || [])
      .map(d => d.schedule_id)
      .filter((id): id is number => id !== null);

    if (scheduleIds.length > 0) {
      const sessionData = localStorage.getItem('sproutify_session');
      const farmUuid = sessionData ? JSON.parse(sessionData).farmUuid : null;
      if (farmUuid) {
        const { error } = await getSupabaseClient()
          .from('order_schedules')
          .update({ status: 'skipped', notes: 'Skipped from Planting Schedule' })
          .in('schedule_id', scheduleIds);

        if (error) {
          console.error('[PlantingSchedule] Error persisting skip to DB:', error);
          setToastNotification({ type: 'error', message: 'Failed to save skip — it will reappear on reload' });
        } else {
          // Update dbSkippedKeys so render-time filter catches it immediately
          setDbSkippedKeys(prev => {
            const next = new Set(prev);
            (skipDialog.deliveries || []).forEach(d => {
              if (d.schedule_id !== null) {
                const dd = new Date(d.delivery_date);
                const key = `${d.standing_order_id}-${skipDialog.recipe_id}-${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
                next.add(key);
              }
            });
            return next;
          });
        }
      }
    }
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
    // Set tray count from grouped schedule quantity (not per-delivery)
    // Must be set here synchronously — fetchAvailableBatchesForRecipe runs async
    setTraysToCreate(Math.max(1, Math.ceil(schedule.quantity)));
    await fetchAvailableBatchesForRecipe(schedule);
  };

  const fetchAvailableBatchesForRecipe = async (schedule: PlantingSchedule) => {
    console.log('[PlantingSchedule] fetchAvailableBatchesForRecipe CALLED', {
      recipe_id: schedule.recipe_id,
      recipe_name: schedule.recipe_name,
      schedule,
    });
    setLoadingBatches(true);
    setSelectedBatchOption(null);
    setAvailableBatches([]);
    setBatchNotice(null);

    // Helper to wrap queries with timeout to prevent hanging after tab restoration
    // Uses PromiseLike to support Supabase query builders which are thenable but not Promises
    const withTimeout = <T,>(promiseLike: PromiseLike<T>, ms: number, label: string): Promise<T> => {
      return Promise.race([
        Promise.resolve(promiseLike),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Query timeout: ${label} took longer than ${ms}ms`)), ms)
        )
      ]);
    };

    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        console.log('[PlantingSchedule] No session data found, returning early');
        setAvailableBatches([]);
        return;
      }

      const { farmUuid } = JSON.parse(sessionData);
      console.log('[PlantingSchedule] Querying recipe for batch lookup...', { recipe_id: schedule.recipe_id, farmUuid });

      const { data: recipeData, error: recipeError } = await withTimeout(
        getSupabaseClient()
          .from('recipes')
          .select('recipe_id, recipe_name, variety_id, variety_name, seed_quantity, seed_quantity_unit')
          .eq('recipe_id', schedule.recipe_id)
          .eq('farm_uuid', farmUuid)
          .single(),
        10000,
        'recipe lookup'
      );

      console.log('[PlantingSchedule] Recipe query result:', { recipeData, recipeError });

      if (recipeError || !recipeData) {
        console.error('[PlantingSchedule] Error fetching recipe:', recipeError);
        return;
      }

      let seedPerTray = 0;
      if (recipeData.seed_quantity) {
        const unit = recipeData.seed_quantity_unit || 'grams';
        seedPerTray = unit === 'oz' ? recipeData.seed_quantity * 28.35 : recipeData.seed_quantity;
      }
      // Store for use in tray creation and UI
      setSeedQuantityPerTray(seedPerTray);

      const numberOfTrays = Math.max(1, Math.ceil(schedule.quantity));
      // traysToCreate is set synchronously in handleCreateTray (single source of truth)
      const totalSeedNeeded = seedPerTray * numberOfTrays;

      if (!recipeData.variety_id) {
        console.error('[PlantingSchedule] Recipe has no variety_id - returning early');
        return;
      }

      let varietyName = recipeData.variety_name || '';
      let requiresSoaking = false;
      try {
        const { data: varietyData, error: varietyError } = await withTimeout(
          getSupabaseClient()
            .from('varieties')
            .select('varietyid, name, soakingtimehours')
            .eq('varietyid', recipeData.variety_id)
            .single(),
          10000,
          'variety lookup'
        );
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

      // formatBatchQuantityText and formatDateLabel removed - now showing in card format

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
        const { data: soakedSeedsData, error: soakedSeedsError } = await withTimeout(
          getSupabaseClient()
            .from('soaked_seed')
            .select('soaked_id, seedbatch_id, quantity_remaining, unit, soak_date, expires_at')
            .eq('farm_uuid', farmUuid)
            .eq('variety_id', recipeData.variety_id)
            .eq('status', 'available')
            .order('soak_date', { ascending: false }),
          10000,
          'soaked seeds lookup'
        );

        if (soakedSeedsError) {
          console.error('[PlantingSchedule] Error fetching soaked seeds:', soakedSeedsError);
          setBatchNotice('This variety requires soaking. No soaked seeds available.');
          return;
        }

        const soakedOptions = (soakedSeedsData || [])
          .map<SeedSelectionOption | null>((soaked: any, index: number) => {
            const quantityGrams = convertToGrams(soaked.quantity_remaining ?? 0, soaked.unit);
            // Show all batches with quantity > 0, let user decide how many trays to seed
            if (quantityGrams <= 0) return null;
            const actualBatchId = resolveBatchIdFromSoaked(soaked);
            if (!actualBatchId) return null;
            const soakIdentifier = soaked.soaked_id ?? index;
            // Calculate how many trays this batch can seed
            const traysPossible = seedPerTray > 0 ? Math.floor(quantityGrams / seedPerTray) : 0;
            return {
              key: `soaked-${soakIdentifier}`,
              source: 'soaked_seed',
              actualBatchId,
              variety_name: varietyName,
              label: `${varietyName || 'Variety'} - Batch #${actualBatchId}`,
              description: '', // Will be shown in card format instead
              quantityGrams,
              traysPossible,
              soakDate: soaked.soak_date,
              expiresAt: soaked.expires_at,
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

      const { data: batchesData, error: batchesError } = await withTimeout(
        getSupabaseClient()
          .from('seed_inventory_status')
          .select('batch_id, variety_id, quantity_grams, seed_quantity_grams, trays_possible, lot_number, purchasedate, stock_status')
          .eq('farm_uuid', farmUuid)
          .eq('variety_id', recipeData.variety_id)
          .eq('is_active', true)
          .order('purchasedate', { ascending: true }),
        10000,
        'seed inventory status lookup'
      );

      if (batchesError) {
        console.error('[PlantingSchedule] Error fetching batches:', batchesError);
        return;
      }

      // Show batches with remaining seed > 0
      const formattedOptions = (batchesData || [])
        .filter((batch: any) => Number(batch.quantity_grams) > 0)
        .map((batch: any) => ({
          key: `seedbatch-${batch.batch_id}`,
          source: 'seedbatch' as const,
          actualBatchId: batch.batch_id,
          variety_name: varietyName,
          label: `${varietyName} - Batch #${batch.batch_id}`,
          description: '',
          quantityGrams: Number(batch.quantity_grams),
          traysPossible: Number(batch.trays_possible) || 0,
          lotNumber: batch.lot_number,
          purchaseDate: batch.purchasedate,
        }));

      console.log('[PlantingSchedule] Setting availableBatches:', { count: formattedOptions.length, formattedOptions });
      setAvailableBatches(formattedOptions);
    } catch (error) {
      console.error('[PlantingSchedule] Error in fetchAvailableBatchesForRecipe:', error);
      // Show user-friendly message for timeout errors (common after tab restoration)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('Query timeout')) {
        setBatchNotice('Connection timed out. Please close this dialog and try again.');
      } else {
        setBatchNotice('Failed to load seed batches. Please try again.');
      }
    } finally {
      console.log('[PlantingSchedule] fetchAvailableBatchesForRecipe FINISHED');
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
      // Use user-specified tray count (allows partial creation)
      const numberOfTraysToCreate = traysToCreate;

      // Convert seeding date to ISO string at midnight
      const sowDateISO = new Date(seedingDate + 'T00:00:00').toISOString();

      // Create tray creation requests - one per delivery so each tray links to its order
      const batchIdForRequest = selectedBatchOption.actualBatchId;
      // Sort deliveries by delivery date ascending so earliest deliveries get trays first
      const deliveries = [...(seedingSchedule.deliveries || [])].sort((a, b) => {
        const dateA = new Date(a.delivery_date).getTime();
        const dateB = new Date(b.delivery_date).getTime();
        return dateA - dateB;
      });
      // Only use the first N deliveries based on how many trays user wants to create
      const deliveriesToUse = deliveries.slice(0, numberOfTraysToCreate);

      // DEBUG: Log deliveries being used
      console.log('[PlantingSchedule] DEBUG - Creating trays:', {
        traysToCreate: numberOfTraysToCreate,
        totalDeliveries: deliveries.length,
        deliveriesUsed: deliveriesToUse.length,
      });

      // If we have delivery info, create one request per delivery (with order_schedule_id)
      // Otherwise fall back to creating identical requests
      const requests = deliveriesToUse.length > 0
        ? deliveriesToUse.map((delivery, index) => {
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
        : Array.from({ length: numberOfTraysToCreate }, () => ({
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
        numberOfTraysToCreate,
        recipeName: recipeData.recipe_name,
        batchId: batchIdForRequest,
        sowDate: sowDateISO,
        deliveriesCount: deliveries.length,
        orderScheduleIds: deliveriesToUse.map(d => d.schedule_id),
        standingOrderIds: deliveriesToUse.map(d => d.standing_order_id),
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
          quantity_used: numberOfTraysToCreate,
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
        message: `Successfully seeded ${numberOfTraysToCreate} ${numberOfTraysToCreate === 1 ? 'tray' : 'trays'} of ${recipeDisplayName}!`,
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

  // Separate overdue from upcoming schedules
  // Seeded overdue schedules go into the upcoming/grouped section (not urgent)
  const { overdue: overdueSchedules, upcoming: upcomingSchedules } = separateSchedules(filteredSchedules);
  const isDbSkipped = (s: PlantingSchedule) => {
    if (!s.deliveries || s.deliveries.length === 0) return false;
    return s.deliveries.every(d => {
      const dd = new Date(d.delivery_date);
      const key = `${d.standing_order_id}-${s.recipe_id}-${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
      return dbSkippedKeys.has(key);
    });
  };
  const filteredOverdue = overdueSchedules.filter(s => !isScheduleSkipped(s) && !s.isSeeded && !isDbSkipped(s));
  const allGrouped = [...upcomingSchedules, ...overdueSchedules.filter(s => s.isSeeded)];
  const groupedSchedules = groupSchedulesByDate(allGrouped);
  const dateKeys = Object.keys(groupedSchedules).sort();
  const unseededSchedules = filteredSchedules.filter(s => !s.isSeeded);
  const seededSchedules = filteredSchedules.filter(s => s.isSeeded);

  // DEBUG: Log what ends up in filteredOverdue
  console.log('[PlantingSchedule] DEBUG - Final overdue display:', {
    filteredSchedules_total: filteredSchedules.length,
    overdueSchedules_from_separate: overdueSchedules.length,
    filteredOverdue_after_skip_check: filteredOverdue.length,
    skipped_count: skippedSchedules.size,
    overdue_details: filteredOverdue.map(s => ({
      recipe_name: s.recipe_name,
      sow_date: s.sow_date,
      quantity: Math.ceil(s.quantity),
      customer: s.customer_name,
    })),
  });

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
      {(filteredSchedules.length > 0 || filteredOverdue.length > 0) && (
        <div className={`grid grid-cols-1 gap-4 ${filteredOverdue.length > 0 ? 'md:grid-cols-4' : seededSchedules.length > 0 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
          {filteredOverdue.length > 0 && (
            <Card className="border-amber-300 bg-amber-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-amber-700">Overdue Seedings</p>
                    <p className="text-2xl font-bold text-amber-900">{filteredOverdue.length}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-amber-600" />
                </div>
              </CardContent>
            </Card>
          )}
          {seededSchedules.length > 0 && filteredOverdue.length === 0 && (
            <Card className="border-emerald-300 bg-emerald-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-emerald-700">Already Seeded</p>
                    <p className="text-2xl font-bold text-emerald-900">{seededSchedules.length}</p>
                  </div>
                  <Check className="h-8 w-8 text-emerald-600" />
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Upcoming Plantings</p>
                  <p className="text-2xl font-bold text-gray-900">{unseededSchedules.filter(s => new Date(s.sow_date) >= getToday()).length}</p>
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
                  <p className="text-sm text-gray-500">Trays Still Needed</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {Math.ceil(unseededSchedules.reduce((sum, s) => sum + s.quantity, 0))}
                  </p>
                </div>
                <Package className="h-8 w-8 text-amber-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Schedule List */}
      {dateKeys.length === 0 && filteredOverdue.length === 0 ? (
        <EmptyState
          icon={seededSchedules.length > 0
            ? <Check className="h-12 w-12 text-emerald-500" />
            : <Calendar className="h-12 w-12 text-gray-400" />
          }
          title={seededSchedules.length > 0
            ? "All caught up!"
            : "No upcoming plantings"
          }
          description={
            schedules.length === 0
              ? "Create standing orders to see your planting schedule"
              : seededSchedules.length > 0
              ? `All ${seededSchedules.length} planting${seededSchedules.length === 1 ? '' : 's'} in this period ${seededSchedules.length === 1 ? 'has' : 'have'} been seeded already`
              : `No plantings scheduled in the selected time range`
          }
          actionLabel={schedules.length === 0 ? "Create Standing Order" : undefined}
          onAction={schedules.length === 0 ? () => navigate('/standing-orders') : undefined}
        />
      ) : (
        <div className="space-y-6">
          {/* Overdue Seedings Section */}
          {filteredOverdue.length > 0 && (
            <Card className="border-2 border-amber-300 bg-amber-50 overflow-hidden">
              <div className="h-1 bg-amber-500 w-full"></div>
              <CardHeader className="bg-gradient-to-r from-amber-100 to-amber-50 border-b border-amber-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-200">
                      <AlertTriangle className="h-5 w-5 text-amber-700" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-bold text-amber-900">
                        Overdue Seedings
                      </CardTitle>
                      <CardDescription className="text-amber-700">
                        These seedings were scheduled but not completed. Seed now to catch up, or skip if not needed.
                      </CardDescription>
                    </div>
                  </div>
                  <Badge className="bg-amber-200 text-amber-800 font-mono">
                    {filteredOverdue.length} overdue
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-amber-200">
                  {filteredOverdue.map((schedule, index) => {
                    const scheduleKey = getScheduleKey(schedule, index);
                    const isRemoving = removingScheduleKey === scheduleKey;
                    const daysOverdue = getDaysOverdue(new Date(schedule.sow_date));

                    return (
                      <div
                        key={scheduleKey}
                        className={`p-4 transition-all duration-300 ease-out hover:bg-amber-100/50 ${
                          isRemoving ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-amber-900">
                                {schedule.recipe_name}
                              </h3>
                              <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">
                                {Math.ceil(schedule.quantity)} {Math.ceil(schedule.quantity) === 1 ? 'tray' : 'trays'}
                              </Badge>
                              <Badge className="bg-amber-100 text-amber-700 font-mono text-xs">
                                {daysOverdue} {daysOverdue === 1 ? 'day' : 'days'} late
                              </Badge>
                            </div>
                            <div className="space-y-1 text-sm text-amber-700">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                <span>
                                  <strong>Was scheduled:</strong> {formatDate(new Date(schedule.sow_date))}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                <span>
                                  <strong>Order:</strong> {schedule.order_name}
                                  {schedule.customer_name && ` • ${schedule.customer_name}`}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                <span>
                                  <strong>Delivery:</strong> {formatDate(schedule.delivery_date)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSkipSchedule(schedule)}
                              className="text-amber-700 border-amber-400 hover:bg-amber-200"
                            >
                              <SkipForward className="h-4 w-4 mr-1" />
                              Skip
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleCreateTray(schedule, index)}
                              className="bg-amber-600 hover:bg-amber-700 text-white"
                            >
                              <Sprout className="h-4 w-4 mr-1" />
                              Seed Now
                              <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Today and Upcoming Schedules */}
          {dateKeys.map(dateKey => {
            const daySchedules = groupedSchedules[dateKey];
            // Parse as local time (noon) to avoid timezone shifts
            const sowDate = new Date(dateKey + 'T12:00:00');
            const daysUntil = getDaysUntil(sowDate);
            const isToday = daysUntil === 0;
            const isPast = daysUntil < 0;
            const visibleSchedules = daySchedules.filter(s => !isScheduleSkipped(s));
            const allSeeded = visibleSchedules.length > 0 && visibleSchedules.every(s => s.isSeeded);
            // Don't show amber overdue styling if everything is seeded
            const showOverdue = isPast && !allSeeded;

            return (
              <Card key={dateKey} className={
                isToday && !allSeeded
                  ? 'border-emerald-500 border-2'
                  : showOverdue
                  ? 'border-amber-500 border-2 bg-amber-50/30'
                  : allSeeded
                  ? 'border-emerald-200 bg-emerald-50/20'
                  : ''
              }>
                <CardHeader
                  className={`${
                    showOverdue
                      ? 'bg-gradient-to-r from-amber-50 to-amber-25 border-b'
                      : allSeeded
                      ? 'bg-gradient-to-r from-emerald-50/50 to-white'
                      : 'bg-gradient-to-r from-gray-50 to-white border-b'
                  } ${allSeeded ? 'cursor-pointer select-none' : ''}`}
                  onClick={allSeeded ? () => setExpandedSeededDates(prev => {
                    const next = new Set(prev);
                    if (next.has(dateKey)) next.delete(dateKey);
                    else next.add(dateKey);
                    return next;
                  }) : undefined}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        isToday && !allSeeded
                          ? 'bg-emerald-100'
                          : showOverdue
                          ? 'bg-amber-100'
                          : allSeeded
                          ? 'bg-emerald-100'
                          : 'bg-gray-100'
                      }`}>
                        {showOverdue ? (
                          <AlertTriangle className="h-5 w-5 text-amber-600" />
                        ) : allSeeded ? (
                          <Check className="h-5 w-5 text-emerald-600" />
                        ) : (
                          <Calendar className={`h-5 w-5 ${isToday ? 'text-emerald-600' : 'text-gray-600'}`} />
                        )}
                      </div>
                      <div>
                        <CardTitle className={`text-lg font-bold ${showOverdue ? 'text-amber-800' : allSeeded ? 'text-emerald-800' : 'text-gray-800'}`}>
                          {formatDate(sowDate)}
                        </CardTitle>
                        <CardDescription className={showOverdue ? 'text-amber-700' : allSeeded ? 'text-emerald-600' : ''}>
                          {isToday
                            ? allSeeded ? 'All seeded for today' : 'Today - Plant Now!'
                            : showOverdue
                            ? `${Math.abs(daysUntil)} ${Math.abs(daysUntil) === 1 ? 'day' : 'days'} overdue - Seed now or skip`
                            : allSeeded
                            ? `All ${visibleSchedules.length} ${visibleSchedules.length === 1 ? 'planting' : 'plantings'} seeded`
                            : daysUntil === 1
                            ? 'Tomorrow'
                            : `${daysUntil} days away`}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isToday && !allSeeded && (
                        <Badge className="bg-emerald-600 text-white">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Action Required
                        </Badge>
                      )}
                      {showOverdue && (
                        <Badge className="bg-amber-500 text-white">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          OVERDUE
                        </Badge>
                      )}
                      {allSeeded && (
                        <>
                          <Badge className="bg-emerald-100 text-emerald-700">
                            <Check className="h-3 w-3 mr-1" />
                            Complete
                          </Badge>
                          <ChevronDown className={`h-4 w-4 text-emerald-600 transition-transform ${expandedSeededDates.has(dateKey) ? 'rotate-180' : ''}`} />
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {(!allSeeded || expandedSeededDates.has(dateKey)) && (
                <CardContent className="p-0">
                  <div className="divide-y divide-gray-100">
                    {daySchedules
                      .filter(schedule => !isScheduleSkipped(schedule))
                      .map((schedule, index) => {
                        const scheduleKey = getScheduleKey(schedule, index);
                        const isRemoving = removingScheduleKey === scheduleKey;
                        const isSeeded = schedule.isSeeded;
                        return (
                      <div
                        key={scheduleKey}
                        className={`p-4 transition-all duration-300 ease-out ${
                          isRemoving
                            ? 'opacity-0 -translate-y-2'
                            : 'opacity-100 translate-y-0'
                        } ${isSeeded ? 'opacity-60 hover:bg-gray-50' : isPast ? 'hover:bg-amber-50' : 'hover:bg-gray-50'}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className={`font-semibold ${isSeeded ? 'text-gray-500' : isPast ? 'text-amber-900' : 'text-gray-900'}`}>
                                {schedule.recipe_name}
                              </h3>
                              <Badge variant="outline" className={`text-xs ${isSeeded ? 'border-gray-300 text-gray-400' : isPast ? 'border-amber-400 text-amber-700' : ''}`}>
                                {Math.ceil(schedule.quantity)} {Math.ceil(schedule.quantity) === 1 ? 'tray' : 'trays'}
                              </Badge>
                              {isSeeded && (
                                <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                                  <Check className="h-3 w-3 mr-1" />
                                  Seeded
                                </Badge>
                              )}
                            </div>
                            <div className={`space-y-1 text-sm ${isSeeded ? 'text-gray-400' : isPast ? 'text-amber-700' : 'text-gray-600'}`}>
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
                            {isSeeded ? (
                              <span className="text-xs text-emerald-600 font-medium px-2">Done</span>
                            ) : (
                              <>
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
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                        );
                      })}
                  </div>
                </CardContent>
                )}
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
                <Label className="text-sm font-medium">
                  Seed Batch <span className="text-red-500">*</span>
                </Label>
                {loadingBatches ? (
                  <div className="text-sm text-slate-500">Loading available batches...</div>
                ) : availableBatches.length === 0 ? (
                  <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p>
                      {batchNotice ?? 'No available batches found for this recipe.'}
                    </p>
                  </div>
                ) : selectedBatchOption ? (
                  // Show selected batch as a card
                  <div className="border border-emerald-300 bg-emerald-50 rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-emerald-900">Batch #{selectedBatchOption.actualBatchId}</p>
                        <p className="text-sm text-emerald-700">
                          {selectedBatchOption.quantityGrams.toFixed(1)}g available
                          {selectedBatchOption.traysPossible > 0 && (
                            <span className="ml-1">• Enough for {selectedBatchOption.traysPossible} tray{selectedBatchOption.traysPossible === 1 ? '' : 's'}</span>
                          )}
                        </p>
                        {selectedBatchOption.lotNumber && (
                          <p className="text-xs text-emerald-600">Lot: {selectedBatchOption.lotNumber}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowBatchPicker(true)}
                        className="text-emerald-700 hover:text-emerald-900"
                      >
                        Change
                      </Button>
                    </div>
                    {selectedBatchOption.traysPossible < traysToCreate && (
                      <div className="mt-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                        ⚠️ This batch only has enough for {selectedBatchOption.traysPossible} tray{selectedBatchOption.traysPossible === 1 ? '' : 's'}, but you want to create {traysToCreate}.
                      </div>
                    )}
                  </div>
                ) : (
                  // Show button to open batch picker
                  <Button
                    variant="outline"
                    onClick={() => setShowBatchPicker(true)}
                    className="w-full justify-start text-slate-500"
                  >
                    <Package className="h-4 w-4 mr-2" />
                    Select a seed batch ({availableBatches.length} available)
                  </Button>
                )}
              </div>

              {/* Trays to Create */}
              <div className="space-y-2">
                <Label htmlFor="trays-count" className="text-sm font-medium">
                  Trays to Create
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="trays-count"
                    type="number"
                    min={1}
                    max={Math.ceil(seedingSchedule.quantity)}
                    value={traysToCreate}
                    onChange={(e) => setTraysToCreate(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24"
                  />
                  <span className="text-sm text-slate-500">
                    of {Math.ceil(seedingSchedule.quantity)} scheduled
                  </span>
                </div>
                {traysToCreate < Math.ceil(seedingSchedule.quantity) && (
                  <p className="text-xs text-amber-600">
                    Creating partial order: {Math.ceil(seedingSchedule.quantity) - traysToCreate} tray{Math.ceil(seedingSchedule.quantity) - traysToCreate === 1 ? '' : 's'} will still be needed.
                  </p>
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
              disabled={!selectedBatchOption || !seedingDate || isSubmittingSeeding.current || availableBatches.length === 0 || isCreatingTray || traysToCreate <= 0 || (selectedBatchOption?.traysPossible === 0)}
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

      {/* Batch Picker Modal */}
      <Dialog open={showBatchPicker} onOpenChange={setShowBatchPicker}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Select Seed Batch</DialogTitle>
            <DialogDescription>
              Choose a batch to use for seeding. Each batch shows how many trays it can produce.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {availableBatches.map((batch) => (
              <button
                key={batch.key}
                onClick={() => {
                  setSelectedBatchOption(batch);
                  setShowBatchPicker(false);
                  // Auto-adjust trays if batch can't support requested amount
                  if (batch.traysPossible < traysToCreate && batch.traysPossible > 0) {
                    setTraysToCreate(batch.traysPossible);
                  }
                }}
                className={`w-full text-left p-4 rounded-lg border transition-all ${
                  selectedBatchOption?.key === batch.key
                    ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                    : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">Batch #{batch.actualBatchId}</span>
                      {batch.source === 'soaked_seed' && (
                        <Badge variant="outline" className="text-xs">Soaked</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      <span className="font-medium">{batch.quantityGrams.toFixed(1)}g</span> available
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                      {batch.lotNumber && <span>Lot: {batch.lotNumber}</span>}
                      {batch.purchaseDate && (
                        <span>Purchased: {new Date(batch.purchaseDate).toLocaleDateString()}</span>
                      )}
                      {batch.soakDate && (
                        <span>Soaked: {new Date(batch.soakDate).toLocaleDateString()}</span>
                      )}
                      {batch.expiresAt && (
                        <span className="text-amber-600">Expires: {new Date(batch.expiresAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    {batch.traysPossible > 0 ? (
                      <div className={`text-sm font-medium ${
                        batch.traysPossible >= traysToCreate ? 'text-emerald-600' : 'text-amber-600'
                      }`}>
                        {batch.traysPossible} tray{batch.traysPossible === 1 ? '' : 's'}
                      </div>
                    ) : (
                      <div className="text-sm text-red-500">Insufficient</div>
                    )}
                    {seedQuantityPerTray > 0 && (
                      <div className="text-xs text-gray-400">
                        {seedQuantityPerTray.toFixed(1)}g/tray
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchPicker(false)}>
              Cancel
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

      {/* Skip Overdue Seeding Confirmation Dialog */}
      <Dialog open={!!skipDialog} onOpenChange={(open) => !open && setSkipDialog(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Skip Overdue Seeding?</DialogTitle>
            <DialogDescription>
              This will mark the delivery as skipped and remove it from your schedule.
            </DialogDescription>
          </DialogHeader>
          {skipDialog && (
            <div className="py-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm font-medium text-amber-900">
                  {skipDialog.recipe_name}
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  {skipDialog.quantity} tray{skipDialog.quantity !== 1 ? 's' : ''} &bull; Scheduled {formatDate(new Date(skipDialog.sow_date))}
                </p>
                {skipDialog.customer_name && (
                  <p className="text-xs text-amber-700 mt-1">
                    {skipDialog.order_name} &bull; {skipDialog.customer_name}
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipDialog(null)}>
              Cancel
            </Button>
            <Button onClick={confirmSkipSchedule} className="bg-amber-600 hover:bg-amber-700">
              Skip Seeding
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

