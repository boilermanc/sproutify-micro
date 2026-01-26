import { getSupabaseClient } from '../lib/supabaseClient';
import { resolveVarietyNameFromRelation } from '../lib/varietyUtils';

/**
 * Parse a date string (YYYY-MM-DD) as a local date, not UTC
 * This prevents timezone shifts that cause dates to display as the previous day
 */
const parseLocalDate = (dateStr: string | null | undefined | Date): Date | null => {
  if (!dateStr) return null;
  
  // If it's already a Date object, return it
  if (dateStr instanceof Date) return dateStr;
  
  // TypeScript guard - ensure it's a string from here on
  if (typeof dateStr !== 'string') return null;
  
  // Extract date parts from string (handles both "2025-12-15" and "2025-12-15T00:00:00Z")
  const dateOnly = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [year, month, day] = dateOnly.split('-').map(Number);
  
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    // Fallback to standard parsing if format is unexpected
    return new Date(dateStr);
  }
  
  // Create date in local timezone (month is 0-indexed)
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

/**
 * Format a Date object to YYYY-MM-DD string
 */
const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface OrderFulfillmentContext {
  orderDetails: any[];
  orderError: any;
  completedScheduleKeys: Set<string>;
}

const buildActiveOrderLookup = (orderDetails: any[]): Map<string, boolean> => {
  const lookup = new Map<string, boolean>();
  orderDetails.forEach((detail) => {
    const normalizedCustomerName = detail.customer_name?.trim().toLowerCase();
    const recipeId = detail.recipe_id ?? '';
    if (!normalizedCustomerName || !detail.recipe_id) {
      return;
    }
    const key = `${normalizedCustomerName}||${recipeId}`;
    lookup.set(key, true);
  });
  return lookup;
};

const fetchOrderFulfillmentContext = async (
  farmUuid: string,
  targetDateStr: string,
  forceRefresh: boolean
): Promise<OrderFulfillmentContext> => {
  const context: OrderFulfillmentContext = {
    orderDetails: [],
    orderError: null,
    completedScheduleKeys: new Set<string>(),
  };

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDateString(today);

    const { data: orderDetails, error: orderError } = await getSupabaseClient()
      .from('order_fulfillment_status')
      .select('*')
      .eq('farm_uuid', farmUuid)
      .eq('delivery_date', targetDateStr)
      .gt('trays_needed', 0);

    context.orderDetails = orderDetails || [];
    context.orderError = orderError;

    console.log('[fetchDailyTasks] Fresh fetch from order_fulfillment_status:', {
      forceRefresh,
      targetDate: targetDateStr,
      totalItems: orderDetails?.length || 0,
      allItems: orderDetails?.map((item: any) => ({
        recipe_name: item.recipe_name,
        recipe_id: item.recipe_id,
        customer_name: item.customer_name,
        delivery_date: item.delivery_date,
        standing_order_id: item.standing_order_id,
        sow_date: item.sow_date,
        harvest_date: item.harvest_date,
        trays_ready: item.trays_ready,
        trays_needed: item.trays_needed
      })) || [],
      timestamp: new Date().toISOString(),
      today: todayStr,
    });

    const { data: completedSchedules, error: completedSchedulesError } = await getSupabaseClient()
      .from('order_schedules')
      .select('standing_order_id, scheduled_delivery_date')
      .eq('farm_uuid', farmUuid)
      .eq('scheduled_delivery_date', targetDateStr)
      .eq('status', 'completed');

    if (completedSchedulesError) {
      console.warn('[fetchDailyTasks] Error fetching completed order_schedules:', completedSchedulesError);
    } else if (completedSchedules) {
      completedSchedules.forEach((schedule: any) => {
        const deliveryDate = formatDateString(parseLocalDate(schedule.scheduled_delivery_date) || new Date(schedule.scheduled_delivery_date));
        const key = `${schedule.standing_order_id}-${deliveryDate}`;
        context.completedScheduleKeys.add(key);
      });
      console.log('[fetchDailyTasks] Completed schedules for target date:', {
        targetDate: targetDateStr,
        count: completedSchedules.length,
        keys: Array.from(context.completedScheduleKeys.values()),
      });
    }
  } catch (error) {
    console.warn('[fetchDailyTasks] Error fetching order fulfillment context:', error);
    context.orderError = error;
  }

  return context;
};

export interface DailyTask {
  id: string;
  action: string;
  crop: string;
  batchId: string;
  location: string;
  dayCurrent: number;
  dayTotal: number;
  trays: number;
  traysRemaining?: number; // Trays remaining to complete (from view)
  status: 'urgent' | 'pending';
  trayIds: number[];
  trayDetails?: Array<{ trayId: number; varietyName?: string; sowDate?: string }>;
  recipeId: number;
  stepId?: number;
  stepDescription?: string;
  missedSteps?: MissedStep[];
  // New fields for seeding workflow
  taskSource?: 'tray_step' | 'soak_request' | 'seed_request' | 'expiring_seed' | 'planting_schedule' | 'order_fulfillment';
  requestId?: number;
  quantity?: number;
  quantityCompleted?: number;
  stepColor?: string;
  sourceType?: string;
  customerName?: string;
  customerId?: number;
  deliveryDate?: string;
  standingOrderId?: number;
  orderScheduleId?: number;
  traysNeeded?: number;
  traysReady?: number;
  notes?: string;
  // Germination step weight info for seeding tasks
  requiresWeight?: boolean;
  weightLbs?: number;
  // Overdue tracking for seeding tasks
  isOverdue?: boolean;
  daysOverdue?: number;
  sowDate?: string;
}

export interface MissedStep {
  stepId: number;
  stepName: string;
  description: string;
  expectedDay: number;
  trayIds: number[];
}

export interface OrderGapStatus {
  farm_uuid: string;
  customer_id: number;
  customer_name: string;
  product_id: number;
  product_name: string;
  standing_order_id?: number | null;
  scheduled_delivery_date?: string | null;
  delivery_date?: string | null;
  is_mix: boolean;
  trays_needed: number;
  varieties_in_product: number;
  varieties_missing: number;
  trays_ready: number;
  gap: number;
  near_ready_assigned: number;
  soonest_ready_date: string | null;
  unassigned_ready: number;
  unassigned_near_ready: number;
  missing_varieties: string | null;
}

export async function fetchOrderGapStatus(farmUuid: string, signal?: AbortSignal): Promise<OrderGapStatus[]> {
  const query = getSupabaseClient()
    .from('order_gap_status')
    .select('*')
    .eq('farm_uuid', farmUuid);

  const { data, error } = signal ? await query.abortSignal(signal) : await query;

  if (error) {
    if (error.name === 'AbortError' || signal?.aborted) {
      throw new DOMException('Request aborted', 'AbortError');
    }
    console.error('[fetchOrderGapStatus] unexpected error', error);
    throw error;
  }

  return (data ?? []) as OrderGapStatus[];
}

/**
 * Fetch maintenance tasks for a specific date
 * Handles daily, weekly, monthly, and one-time frequencies
 * Filters out tasks that have already been completed today
 */
export const fetchMaintenanceTasks = async (
  farmUuid: string,
  targetDate: Date
): Promise<DailyTask[]> => {
  const dayOfWeek = targetDate.getDay(); // 0=Sunday, 4=Thursday, etc.
  const dayOfMonth = targetDate.getDate(); // 1-31
  const dateStr = formatDateString(targetDate);

  const { data: maintenanceTasks, error } = await getSupabaseClient()
    .from('maintenance_tasks')
    .select('*')
    .eq('farm_uuid', farmUuid)
    .eq('is_active', true)
    .or(`frequency.eq.daily,and(frequency.eq.weekly,day_of_week.eq.${dayOfWeek}),and(frequency.eq.one-time,task_date.eq.${dateStr}),and(frequency.eq.monthly,day_of_month.eq.${dayOfMonth})`);

  if (error) {
    console.error('[fetchMaintenanceTasks] Error fetching maintenance tasks:', error);
    return [];
  }

  // Fetch completed maintenance tasks for today to filter them out
  const { data: completedMaintenanceTasks, error: completedError } = await getSupabaseClient()
    .from('task_completions')
    .select('maintenance_task_id')
    .eq('farm_uuid', farmUuid)
    .eq('task_type', 'maintenance')
    .eq('task_date', dateStr)
    .eq('status', 'completed');

  const completedMaintenanceIds = new Set<number>();
  if (!completedError && completedMaintenanceTasks) {
    completedMaintenanceTasks.forEach((ct: any) => {
      if (ct.maintenance_task_id) {
        completedMaintenanceIds.add(ct.maintenance_task_id);
      }
    });
  }

  console.log('[fetchMaintenanceTasks] Fetched maintenance tasks:', {
    farmUuid,
    targetDate: dateStr,
    dayOfWeek,
    totalCount: maintenanceTasks?.length || 0,
    completedCount: completedMaintenanceIds.size,
    completedIds: Array.from(completedMaintenanceIds),
    tasks: maintenanceTasks?.map((t: any) => ({ name: t.task_name, frequency: t.frequency }))
  });

  // Convert to DailyTask format, filtering out completed tasks
  return (maintenanceTasks || [])
    .filter((mt: any) => !completedMaintenanceIds.has(mt.maintenance_task_id))
    .map((mt: any) => ({
      id: `maintenance-${mt.maintenance_task_id}-${dateStr}`,
      action: mt.task_name,
      crop: mt.task_type || 'Maintenance',
      batchId: `maintenance-${mt.maintenance_task_id}`,
      location: '',
      dayCurrent: 0,
      dayTotal: 0,
      trays: mt.quantity || 1,
      status: 'pending' as const,
      trayIds: [],
      recipeId: 0,
      taskSource: 'maintenance' as any,
      notes: mt.description || undefined,
    }));
};

/**
 * Fetch daily tasks from daily_flow_aggregated view
 * This view includes tray_step tasks, soak_request tasks, seed_request tasks, and expiring_seed tasks
 */
export const fetchDailyTasks = async (selectedDate?: Date, forceRefresh: boolean = false, signal?: AbortSignal): Promise<DailyTask[]> => {
  try {
    // Check if already aborted
    if (signal?.aborted) {
      throw new DOMException('Request aborted', 'AbortError');
    }

    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return [];

    const { farmUuid } = JSON.parse(sessionData);
    const normalizedToday = selectedDate ? new Date(selectedDate.getTime()) : new Date();
    normalizedToday.setHours(0, 0, 0, 0);
    const taskDate = formatDateString(normalizedToday); // Use formatDateString to avoid UTC timezone shift

    // Query daily_flow_aggregated view for today's tasks
    // Note: The view may not include recipe_id directly, so we'll fetch it from requests when needed
    console.log('[fetchDailyTasks] daily_flow_aggregated filters', {
      farm_uuid: farmUuid,
      task_date: taskDate,
      selectedDate: normalizedToday.toISOString(),
    });

    let taskQuery = getSupabaseClient()
      .from('daily_flow_aggregated')
      .select('*')
      .eq('farm_uuid', farmUuid)
      .eq('task_date', taskDate)
      .order('task_source', { ascending: true })
      .order('recipe_name', { ascending: true });

    if (signal) {
      taskQuery = taskQuery.abortSignal(signal);
    }

    const { data: tasksData, error: tasksError } = await taskQuery;

    if (tasksError) throw tasksError;

    console.log('[fetchDailyTasks] Raw data from daily_flow_aggregated:', {
      taskDate,
      count: tasksData?.length || 0,
      tasks: tasksData?.map((t: any) => ({
        task_name: t.task_name,
        task_source: t.task_source,
        recipe_name: t.recipe_name,
        request_id: t.request_id
      })) || [],
      error: tasksError
    });

    // Always supplement with direct tray queries to ensure we don't miss any active trays
    // The view might miss tasks due to scheduled_date mismatches or other issues
    const supplementalTasks: DailyTask[] = [];
    
    // ✅ OPTIMIZED: Cache active trays data for reuse (eliminates 2-3 duplicate queries)
    let cachedActiveTrays: any[] | null = null;
    
    // ✅ OPTIMIZED: Cache steps data for reuse (eliminates 3-4 duplicate queries)
    let cachedSteps: any[] | null = null;
    
    console.log('[fetchDailyTasks] Supplementing with direct tray queries to ensure completeness...');
      try {
        // ✅ OPTIMIZED: Fetch active trays ONCE with ALL needed columns
        // This data will be reused for harvest tasks, watering tasks, and more
        const { data: activeTrays, error: traysError } = await getSupabaseClient()
          .from('trays')
          .select(`
            tray_id,
            recipe_id,
            sow_date,
            scheduled_sow_date,
            batch_id,
            location,
            customer_id,
            status,
            recipes(
              recipe_id,
              recipe_name,
              variety_id,
              variety_name
            )
          `)
          .eq('farm_uuid', farmUuid)
          .is('harvest_date', null)
          .not('sow_date', 'is', null)
          .or('status.is.null,status.eq.active');

        if (!traysError && activeTrays && activeTrays.length > 0) {
          // ✅ Cache the result for reuse in harvest and watering sections
          cachedActiveTrays = activeTrays;
          
          const traysWithRecipes = activeTrays.filter((t: any) => t.recipes && t.recipe_id);
          const recipeIds = [...new Set(traysWithRecipes.map((t: any) => t.recipe_id).filter(Boolean))];
          
          // Build customer name lookup map for supplemental tray step tasks
          const trayCustomerIds = [...new Set(traysWithRecipes.map((t: any) => t.customer_id).filter(Boolean))];
          const trayCustomerMap: Record<number, string> = {};
          if (trayCustomerIds.length > 0) {
            const { data: customersData } = await getSupabaseClient()
              .from('customers')
              .select('customerid, name')
              .in('customerid', trayCustomerIds);
            if (customersData) {
              customersData.forEach((customer: any) => {
                if (customer.customerid && customer.name) {
                  trayCustomerMap[customer.customerid] = customer.name;
                }
              });
            }
          }
          
          if (recipeIds.length > 0) {
            // ✅ OPTIMIZED: Fetch steps ONCE for ALL recipes (cache for reuse)
            const { data: allSteps, error: stepsError } = await getSupabaseClient()
              .from('steps')
              .select('*')
              .in('recipe_id', recipeIds);

            if (!stepsError && allSteps) {
              // ✅ Cache steps for reuse in seeding, harvest, and watering sections
              cachedSteps = allSteps;
              // Group steps by recipe
              const stepsByRecipe: Record<number, any[]> = {};
              allSteps.forEach((step: any) => {
                if (!stepsByRecipe[step.recipe_id]) {
                  stepsByRecipe[step.recipe_id] = [];
                }
                stepsByRecipe[step.recipe_id].push(step);
              });

              // Sort steps by order
              Object.keys(stepsByRecipe).forEach((recipeId) => {
                stepsByRecipe[Number(recipeId)].sort((a, b) => {
                  const orderA = a.step_order ?? a.sequence_order ?? 0;
                  const orderB = b.step_order ?? b.sequence_order ?? 0;
                  return orderA - orderB;
                });
              });

              // Fetch tray_steps to check completion status
              const trayIds = traysWithRecipes.map((t: any) => t.tray_id);
              const { data: trayStepsData } = await getSupabaseClient()
                .from('tray_steps')
                .select('tray_id, step_id, completed, skipped, scheduled_date')
                .in('tray_id', trayIds)
                .eq('scheduled_date', taskDate);

              // Create maps for quick lookup
              const completedStepsMap: Record<number, Set<number>> = {};
              const skippedStepsMap: Record<number, Set<number>> = {};
              (trayStepsData || []).forEach((ts: any) => {
                if (!completedStepsMap[ts.tray_id]) {
                  completedStepsMap[ts.tray_id] = new Set();
                }
                if (!skippedStepsMap[ts.tray_id]) {
                  skippedStepsMap[ts.tray_id] = new Set();
                }
                if (ts.completed) {
                  completedStepsMap[ts.tray_id].add(ts.step_id);
                }
                if (ts.skipped) {
                  skippedStepsMap[ts.tray_id].add(ts.step_id);
                }
              });

              // Calculate current step for each tray
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              
              for (const tray of traysWithRecipes) {
                const recipe = tray.recipes as any;
                if (!recipe || !recipe.recipe_id) continue;
                
                const recipeId = recipe.recipe_id;
                const steps = stepsByRecipe[recipeId] || [];
                if (steps.length === 0) continue;

                const sowDate = parseLocalDate(tray.sow_date);
                if (!sowDate) continue;
                
                const daysSinceSow = Math.max(1, Math.floor((today.getTime() - sowDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                
                // Calculate total days
                const totalDays = steps.reduce((sum: number, step: any) => {
                  const duration = step.duration || 0;
                  const unit = (step.duration_unit || 'Days').toUpperCase();
                  if (unit === 'DAYS') {
                    return sum + duration;
                  } else if (unit === 'HOURS') {
                    return sum + (duration >= 12 ? 1 : 0);
                  }
                  return sum + duration;
                }, 0);

                // Find current step
                let currentStep: any = null;
                let daysIntoRecipe = 0;
                const daysForStepComparison = daysSinceSow - 1;
                
                for (const step of steps) {
                  const duration = step.duration || 0;
                  const unit = (step.duration_unit || 'Days').toUpperCase();
                  let stepDurationDays = 0;
                  if (unit === 'DAYS') {
                    stepDurationDays = duration;
                  } else if (unit === 'HOURS') {
                    stepDurationDays = duration >= 12 ? 1 : 0;
                  } else {
                    stepDurationDays = duration;
                  }
                  
                  if (daysForStepComparison >= daysIntoRecipe && daysForStepComparison < daysIntoRecipe + stepDurationDays) {
                    currentStep = step;
                    break;
                  }
                  daysIntoRecipe += stepDurationDays;
                }

                // If past all steps, it's harvest
                if (!currentStep && daysSinceSow >= totalDays) {
                  currentStep = steps[steps.length - 1];
                }

                if (!currentStep) {
                  currentStep = steps[0];
                }

                // Check if step is completed or skipped
                const completedSteps = completedStepsMap[tray.tray_id] || new Set();
                const skippedSteps = skippedStepsMap[tray.tray_id] || new Set();
                const isStepCompleted = completedSteps.has(currentStep.step_id);
                const isStepSkipped = skippedSteps.has(currentStep.step_id);

                // Skip if completed or skipped
                if (isStepCompleted || isStepSkipped) {
                  continue;
                }

                // Check if this step is scheduled for today (any day within the step duration)
                const stepStartDay = daysIntoRecipe + 1;
                // Use at least 1 day duration to ensure step is included for at least one day
                const stepDuration = Math.max(1, currentStep.duration || 0);
                const stepEndDay = daysIntoRecipe + stepDuration;
                const isToday = daysSinceSow >= stepStartDay && daysSinceSow <= stepEndDay;

                // Determine action from step
                const stepName = currentStep.step_name || currentStep.description_name || 'Unknown Step';
                
                // Only add if it's scheduled for today and not already in tasksData
                if (isToday && currentStep && !isStepCompleted && !isStepSkipped) {
                  // Add the step task itself (unless the step is just watering or seeding/soaking/harvest-related)
                  // Seeding and soaking steps should only appear before trays are created, not for active trays
                  // Harvest steps are handled by the dedicated harvest task generation code
                  const stepNameLower = stepName?.toLowerCase() || '';
                  const isSeedingStep = stepNameLower.includes('seed') && 
                                       (stepNameLower.includes('tray') || stepNameLower === 'seed' || stepNameLower === 'seeding');
                  const isSoakingStep = stepNameLower.includes('soak');
                  const isHarvestStep = stepNameLower.includes('harvest'); // ✅ FIX: Exclude harvest steps - handled by dedicated harvest logic
                  
                  if (isHarvestStep) {
                    console.log('[fetchDailyTasks] Filtering out harvest step from supplemental tray_step tasks:', {
                      tray_id: tray.tray_id,
                      step_name: stepName,
                      recipe_id: recipeId,
                      reason: 'Harvest tasks are handled by dedicated harvest logic'
                    });
                  }
                  
                  if (stepName && 
                      stepNameLower !== 'water' && 
                      !stepNameLower.includes('mist') && 
                      !isSeedingStep &&
                      !isSoakingStep &&
                      !isHarvestStep) { // ✅ FIX: Don't create harvest tasks - those are handled separately
                    // Check if this task already exists in tasksData
                    // The view aggregates tasks by recipe+step (no individual tray_ids), so we check if
                    // ANY task exists for this recipe+step combination
                    const existsInView = tasksData?.some((t: any) => {
                      const tRecipeId = t.recipe_id || t.recipeId;
                      const tAction = t.task_name || t.action;
                      const tVarietyName = t.variety_name;
                      const tRecipeName = t.recipe_name;
                      
                      // Match based on task_name and variety/recipe (view doesn't have step_id or tray_ids)
                      const sameAction = tAction === stepName;
                      const sameSource = t.task_source === 'tray_step';
                      
                      // Match on variety_name if available (more specific than recipe_name)
                      const recipe = tray.recipes as any;
                      const varietyName = recipe?.variety_name;
                      const recipeName = recipe?.recipe_name;
                      
                      const sameVariety = varietyName && tVarietyName === varietyName;
                      const sameRecipeName = !sameVariety && recipeName && tRecipeName === recipeName;
                      const sameRecipeId = !sameVariety && !sameRecipeName && tRecipeId === recipeId;
                      
                      const taskExists = sameAction && sameSource && (sameVariety || sameRecipeName || sameRecipeId);
                      
                      if (taskExists) {
                        console.log('[fetchDailyTasks] Task already in view, skipping supplemental:', {
                          tray_id: tray.tray_id,
                          recipe_id: recipeId,
                          variety_name: varietyName,
                          step_name: stepName,
                          view_variety: tVarietyName,
                          view_recipe: tRecipeName,
                          view_quantity: t.quantity
                        });
                      }
                      
                      return taskExists;
                    });
                    
                    if (!existsInView) {
                      console.log('[fetchDailyTasks] Adding tray to supplemental tasks (not in view):', {
                        tray_id: tray.tray_id,
                        recipe_id: recipeId,
                        step_id: currentStep.step_id,
                        step_name: stepName
                      });
                      
                      // Aggregate by recipe+step - find existing or create new
                      const existingTask = supplementalTasks.find(t => 
                        t.recipeId === recipeId && 
                        t.stepId === currentStep.step_id && 
                        t.action === stepName
                      );

                      // Get customer info for this tray
                      const customerName = tray.customer_id ? trayCustomerMap[tray.customer_id] : undefined;
                      
                      if (existingTask) {
                        // Add tray to existing task only if not already present
                        if (!existingTask.trayIds.includes(tray.tray_id)) {
                          existingTask.trayIds.push(tray.tray_id);
                          existingTask.trays += 1;
                          existingTask.traysRemaining = (existingTask.traysRemaining || 0) + 1;
                        }
                        
                        // Preserve customerName if this tray has a customer
                        // Note: If multiple trays in same task have different customers, preserve the first one
                        if (!existingTask.customerName && customerName) {
                          existingTask.customerName = customerName;
                          existingTask.customerId = tray.customer_id;
                        }
                      } else {
                        // Create new aggregated task - use same ID format as view tasks
                        supplementalTasks.push({
                          id: `tray_step-${stepName}-${recipe.variety_name || recipe.recipe_name || 'Unknown'}-${taskDate}`,
                          action: stepName,
                          crop: recipe.variety_name || recipe.recipe_name || 'Unknown',
                          batchId: tray.batch_id ? `B-${tray.batch_id}` : 'N/A',
                          location: tray.location || 'Not set',
                          customerName: customerName || undefined,
                          customerId: tray.customer_id || undefined,
                          dayCurrent: daysSinceSow,
                          dayTotal: totalDays,
                          trays: 1,
                          traysRemaining: 1,
                          status: 'pending',
                          trayIds: [tray.tray_id],
                          recipeId: recipeId,
                          stepId: currentStep.step_id,
                          stepDescription: currentStep.description_name || currentStep.step_name || stepName,
                          taskSource: 'tray_step',
                        });
                      }
                    }
                  }
                  
                  // NOTE: Watering tasks are NOT generated here in supplemental tasks.
                  // They are generated separately in the dedicated watering task logic below
                  // (around line 799+) which properly checks for Growing phase and water_frequency.
                }
              }
            }
          }
        }
      } catch (supplementError) {
        console.warn('[fetchDailyTasks] Error supplementing with direct tray queries:', supplementError);
      }
    
    console.log('[fetchDailyTasks] Supplemental tasks found:', supplementalTasks.length);

    // Parse the date to ensure we're comparing correctly
    const targetDate = parseLocalDate(taskDate);
    if (!targetDate) {
      // If date parsing fails, just return tasks from view (without harvest/at-risk tasks)
      // This should rarely happen, but handle it gracefully
      if (!tasksData || tasksData.length === 0) {
        return [];
      }
      // Continue with existing logic but skip harvest/at-risk tasks
    }

    const targetDateStr = targetDate ? formatDateString(targetDate) : taskDate;

    // ✅ PHASE 5A: Parallelize Level 0 independent queries for 2.4 second speedup
    // Calculate date ranges upfront for planting schedule query
    const startDate = targetDate ? new Date(targetDate) : new Date(normalizedToday);
    startDate.setDate(startDate.getDate() - 7);
    const startDateStr = formatDateString(startDate);
    
    const endDate = targetDate ? new Date(targetDate) : new Date(normalizedToday);
    endDate.setDate(endDate.getDate() + 14);
    const endDateStr = formatDateString(endDate);

    console.log('[fetchDailyTasks] Phase 5A: Running Level 0 queries in parallel...');
    const level0Results = await Promise.allSettled([
      // Query 1: Order fulfillment context (conditional)
      targetDate
        ? fetchOrderFulfillmentContext(farmUuid, targetDateStr, forceRefresh)
        : Promise.resolve(null),
      
      // Query 2: Maintenance tasks (always runs)
      targetDate
        ? fetchMaintenanceTasks(farmUuid, targetDate)
        : fetchMaintenanceTasks(farmUuid, normalizedToday),
      
      // Query 3: Planting schedule view (conditional)
      targetDate
        ? getSupabaseClient()
            .from('planting_schedule_view')
            .select('sow_date, harvest_date, recipe_name, trays_needed, recipe_id, customer_name, customer_id, standing_order_id, schedule_id, delivery_date')
            .eq('farm_uuid', farmUuid)
            .gte('sow_date', startDateStr)
            .lte('sow_date', endDateStr)
        : Promise.resolve({ data: null, error: null })
    ]);

    // Extract results from parallel execution
    const orderFulfillmentContext = level0Results[0].status === 'fulfilled' 
      ? level0Results[0].value 
      : null;
    
    const maintenanceTasks: DailyTask[] = level0Results[1].status === 'fulfilled'
      ? level0Results[1].value
      : [];
    
    const plantingScheduleResult = level0Results[2].status === 'fulfilled'
      ? level0Results[2].value
      : { data: null, error: null };
    
    // Extract planting schedule data (will be null if targetDate is not set)
    const allSchedules = plantingScheduleResult.data;
    const scheduleError = plantingScheduleResult.error;

    // Fetch seeding/soaking tasks from planting_schedule_view where sow_date = today
    const seedingTasks: DailyTask[] = [];
    const soakingTasks: DailyTask[] = [];
    
    // Fetch projected harvest tasks from planting_schedule_view
    // Only show as "Harvest" if there are actual trays ready, otherwise show as "At Risk"
    const harvestTasks: DailyTask[] = [];
    
    // Fetch watering tasks for trays in grow phase
    const wateringTasks: DailyTask[] = [];

    if (targetDate) {
      try {
        // Date ranges already calculated above for parallel query execution
        
        // Fetch recipe steps to calculate soak duration (needed for both seeding/soaking and harvest)
        const recipeIds = allSchedules ? [...new Set(allSchedules.map((s: any) => s.recipe_id).filter(Boolean))] : [];
        console.log('[DEBUG] Recipe IDs from planting_schedule_view:', recipeIds);
        
        // Fetch variety_name from recipes table for seeding tasks
        const { data: recipesData, error: recipesError } = recipeIds.length > 0 ? await getSupabaseClient()
          .from('recipes')
          .select('recipe_id, variety_name')
          .in('recipe_id', recipeIds)
          .eq('farm_uuid', farmUuid) : { data: null, error: null };
        
        // Create a map of recipe_id -> variety_name
        const varietyNameMap: Record<number, string> = {};
        if (recipesData && !recipesError) {
          recipesData.forEach((recipe: any) => {
            if (recipe.recipe_id && recipe.variety_name) {
              varietyNameMap[recipe.recipe_id] = recipe.variety_name;
            }
          });
        }
        
        // ✅ OPTIMIZED: Reuse cached steps data, filter for relevant recipe IDs
        const allSteps = cachedSteps ? cachedSteps.filter((step: any) => recipeIds.includes(step.recipe_id)) : null;
        const stepsError = cachedSteps === null;
        
        // Group steps by recipe and calculate pre-seeding duration
        const stepsByRecipe: Record<number, any[]> = {};
        const soakDurationByRecipe: Record<number, number> = {};
        // Map of recipe_id -> { requires_weight, weight_lbs } for germination steps
        const germinationWeightMapForSchedule: Record<number, { requires_weight: boolean; weight_lbs: number | null }> = {};

        if (allSteps && !stepsError) {
          // First pass: group steps by recipe
          allSteps.forEach((step: any) => {
            if (!stepsByRecipe[step.recipe_id]) {
              stepsByRecipe[step.recipe_id] = [];
            }
            stepsByRecipe[step.recipe_id].push(step);

            // Find germination step and store weight info
            const isGermination = (step.description_name || '').toLowerCase() === 'germination' ||
                                  (step.step_name || '').toLowerCase() === 'germination';
            if (isGermination && step.recipe_id) {
              germinationWeightMapForSchedule[step.recipe_id] = {
                requires_weight: step.requires_weight || false,
                weight_lbs: step.weight_lbs || null
              };
            }
          });

          // Second pass: calculate total pre-seeding hours for each recipe
          // Pre-seeding steps are all steps BEFORE the "Seed Trays" step
          Object.keys(stepsByRecipe).forEach((recipeIdStr) => {
            const recipeId = Number(recipeIdStr);
            const steps = stepsByRecipe[recipeId];

            // Sort steps by sequence_order
            steps.sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));

            // Find the seeding step (step_name contains "seed" but not "soak")
            const seedStepIndex = steps.findIndex((s: any) => {
              const stepName = (s.step_name || '').toLowerCase();
              return stepName.includes('seed') && !stepName.includes('soak');
            });

            if (seedStepIndex > 0) {
              // Sum durations of all steps BEFORE the seeding step
              let totalPrepHours = 0;
              for (let i = 0; i < seedStepIndex; i++) {
                const step = steps[i];
                const duration = step.duration || 0;
                const unit = (step.duration_unit || 'Days').toUpperCase();

                if (unit === 'HOURS') {
                  totalPrepHours += duration;
                } else if (unit === 'DAYS') {
                  totalPrepHours += duration * 24;
                }
              }

              // Calculate days before seeding: FLOOR(total_hours / 24), minimum 1
              // 30 hours prep = 1 day before (start Sunday for Monday seeding)
              // 50 hours prep = 2 days before (start Saturday for Monday seeding)
              if (totalPrepHours > 0) {
                soakDurationByRecipe[recipeId] = Math.max(1, Math.floor(totalPrepHours / 24));
              }
            }
          });
        }
        
        // Fetch completed seeding/soaking tasks to filter them out
        const { data: completedTasks, error: completedTasksError } = await getSupabaseClient()
          .from('task_completions')
          .select('recipe_id, task_type, task_date')
          .eq('farm_uuid', farmUuid)
          .eq('task_date', targetDateStr)
          .in('task_type', ['sowing', 'soaking'])
          .eq('status', 'completed');
        
        // Create a set of completed task keys: "task_type-recipe_id"
        const completedTaskKeys = new Set<string>();
        if (completedTasks && !completedTasksError) {
          completedTasks.forEach((ct: any) => {
            const key = `${ct.task_type}-${ct.recipe_id}`;
            completedTaskKeys.add(key);
          });
        }

        // Fetch existing tray_creation_requests to avoid duplicates
        // If a request exists for a recipe/date, we should show it from seed_request tasks only
        const { data: existingRequests, error: requestsError } = await getSupabaseClient()
          .from('tray_creation_requests')
          .select('recipe_id, seed_date, requested_at, farm_uuid')
          .eq('farm_uuid', farmUuid)
          .in('status', ['pending', 'approved']); // Only check active requests
        
        // Create a set of existing request keys: "recipe_id-sow_date"
        // Check both seed_date (planned seeding date) and requested_at (which becomes sow_date)
        const existingRequestKeys = new Set<string>();
        if (existingRequests && !requestsError) {
          existingRequests.forEach((req: any) => {
            // Check seed_date first (planned seeding date)
            if (req.seed_date) {
              const seedDate = parseLocalDate(req.seed_date);
              if (seedDate) {
                const seedDateStr = formatDateString(seedDate);
                const key = `${req.recipe_id}-${seedDateStr}`;
                existingRequestKeys.add(key);
              }
            }
            // Also check requested_at (which becomes sow_date when tray is created)
            // This handles cases where seed_date might not be set
            if (req.requested_at) {
              const requestedDate = parseLocalDate(req.requested_at);
              if (requestedDate) {
                const requestedDateStr = formatDateString(requestedDate);
                const key = `${req.recipe_id}-${requestedDateStr}`;
                existingRequestKeys.add(key);
              }
            }
          });
        }
        
        if (!scheduleError && allSchedules) {
          
          // Process schedules for seeding and soaking tasks
          for (const schedule of allSchedules) {
            if (!schedule.sow_date || !schedule.recipe_id) continue;
            
            const sowDate = parseLocalDate(schedule.sow_date);
            if (!sowDate) continue;
            
            const sowDateStr = formatDateString(sowDate);
            const soakDuration = soakDurationByRecipe[schedule.recipe_id] || 0;
            const soakDate = new Date(sowDate);
            soakDate.setDate(soakDate.getDate() - soakDuration);
            const soakDateStr = formatDateString(soakDate);
            
            // Check for seeding tasks (sow_date = today)
            if (sowDateStr === targetDateStr) {
              // Check if a tray_creation_request already exists for this recipe/date
              const requestKey = `${schedule.recipe_id}-${sowDateStr}`;
              if (existingRequestKeys.has(requestKey)) {
                console.log('[fetchDailyTasks] Skipping seeding task from planting_schedule - request already exists:', {
                  recipe_id: schedule.recipe_id,
                  recipe_name: schedule.recipe_name,
                  sow_date: sowDateStr,
                  reason: 'tray_creation_request exists (will show from seed_request tasks)'
                });
                continue; // Skip - this will be shown from seed_request tasks instead
              }

              // Check if this seeding task has already been completed
              const seedingKey = `sowing-${schedule.recipe_id}`;
              if (!completedTaskKeys.has(seedingKey)) {
                // Use variety_name for seeding tasks (growers look for variety names on seed bags)
                const varietyName = varietyNameMap[schedule.recipe_id] || schedule.recipe_name || 'Unknown';
                // Get germination weight info for this recipe
                const germinationWeight = germinationWeightMapForSchedule[schedule.recipe_id];
                const orderScheduleId = schedule.schedule_id ?? (schedule as any).order_schedule_id ?? undefined;
                seedingTasks.push({
                  id: `seed-${schedule.recipe_id}-${schedule.recipe_name}-${targetDateStr}`,
                  action: 'Seed',
                  crop: varietyName,
                  batchId: 'N/A',
                  location: 'Not set',
                  dayCurrent: 0,
                  dayTotal: 0,
                  trays: schedule.trays_needed || 0,
                  status: 'urgent',
                  trayIds: [],
                  recipeId: schedule.recipe_id,
                  taskSource: 'planting_schedule',
                  quantity: schedule.trays_needed || 0,
                  customerName: schedule.customer_name || null,
                  customerId: schedule.customer_id ?? undefined,
                  standingOrderId: schedule.standing_order_id ?? undefined,
                  orderScheduleId,
                  deliveryDate: schedule.delivery_date || null,
                  // Germination weight info
                  requiresWeight: germinationWeight?.requires_weight || false,
                  weightLbs: germinationWeight?.weight_lbs || undefined,
                });
              } else {
                console.log('[fetchDailyTasks] Skipping completed seeding task:', {
                  recipe_id: schedule.recipe_id,
                  recipe_name: schedule.recipe_name,
                  task_date: targetDateStr
                });
              }
            }
            
            // Check for soaking tasks (sow_date - soak_duration = today)
            // This shows "Soak Seeds" task for recipes that have pre-seeding steps (soak, pre-sprout, etc.)
            if (soakDateStr === targetDateStr && soakDuration > 0) {
              // Check if this soaking task has already been completed
              const soakingKey = `soaking-${schedule.recipe_id}`;
              if (!completedTaskKeys.has(soakingKey)) {
                soakingTasks.push({
                  id: `soak-${schedule.recipe_id}-${schedule.recipe_name}-${targetDateStr}`,
                  action: 'Soak',
                  crop: schedule.recipe_name || 'Unknown',
                  batchId: 'N/A',
                  location: 'Not set',
                  dayCurrent: 0,
                  dayTotal: soakDuration, // Days of prep before seeding
                  trays: schedule.trays_needed || 0,
                  status: 'urgent',
                  trayIds: [],
                  recipeId: schedule.recipe_id,
                  taskSource: 'planting_schedule',
                  quantity: schedule.trays_needed || 0,
                  customerName: schedule.customer_name || null,
                  deliveryDate: schedule.delivery_date || null,
                  sowDate: sowDateStr, // Link to the upcoming seeding date
                });
              } else {
                console.log('[fetchDailyTasks] Skipping completed soaking task:', {
                  recipe_id: schedule.recipe_id,
                  recipe_name: schedule.recipe_name,
                  task_date: targetDateStr
                });
              }
            }
          }
        }
        
        // Continue with harvest logic - filter schedules for harvest_date = today
        if (allSchedules && allSchedules.length > 0) {
        // ✅ OPTIMIZED: Reuse cached active trays data (eliminates duplicate query)
        const activeTrays = cachedActiveTrays;

          Object.keys(stepsByRecipe).forEach((recipeId) => {
            stepsByRecipe[Number(recipeId)].sort((a, b) => {
              const orderA = a.step_order ?? a.sequence_order ?? 0;
              const orderB = b.step_order ?? b.sequence_order ?? 0;
              return orderA - orderB;
            });
          });

          const recipeTotalDays: Record<number, number> = {};
          const recipeIdsFromActiveTrays = [...new Set((activeTrays || []).map((tray: any) => tray.recipe_id).filter(Boolean))];
          console.log('[DEBUG] Recipe IDs from activeTrays:', recipeIdsFromActiveTrays);
          const missingRecipeIds = recipeIdsFromActiveTrays.filter((id: number) => !stepsByRecipe[id]);
          if (missingRecipeIds.length > 0) {
            // ✅ OPTIMIZED: Reuse cached steps data, filter for missing recipe IDs
            const missingSteps = cachedSteps ? cachedSteps.filter((step: any) => missingRecipeIds.includes(step.recipe_id)) : null;
            if (missingSteps && missingSteps.length > 0) {
              missingSteps.forEach((step: any) => {
                if (!stepsByRecipe[step.recipe_id]) {
                  stepsByRecipe[step.recipe_id] = [];
                }
                stepsByRecipe[step.recipe_id].push(step);
              });
            }
          }

          Object.keys(stepsByRecipe).forEach((recipeId) => {
            const steps = stepsByRecipe[Number(recipeId)];
            const totalDays = steps.reduce((sum: number, step: any) => {
              const duration = step.duration || 0;
              const unit = (step.duration_unit || 'Days').toUpperCase();
              if (unit === 'DAYS') {
                return sum + duration;
              } else if (unit === 'HOURS') {
                return sum + (duration >= 12 ? 1 : 0);
              }
              return sum + duration;
            }, 0);
            recipeTotalDays[Number(recipeId)] = Math.max(1, totalDays);
            console.log('[DEBUG] recipeTotalDays calculation:', {
              recipe_id: Number(recipeId),
              stepsFound: steps?.length || 0,
              steps: steps?.map((s: any) => ({
                step_name: s.step_name,
                duration: s.duration,
                duration_unit: s.duration_unit,
              })),
              calculatedTotalDays: totalDays,
            });
            if (Number(recipeId) === 5) {
              console.log('[DEBUG] Dun Peas totalDays calculation:', {
                recipe_id: Number(recipeId),
                stepsByRecipeKeys: Object.keys(stepsByRecipe),
                hasRecipeInMap: Object.prototype.hasOwnProperty.call(stepsByRecipe, Number(recipeId)),
                stepsForRecipe: stepsByRecipe[Number(recipeId)],
                finalTotalDays: recipeTotalDays[Number(recipeId)],
              });
            }
          });

          const respectsOrderContext = !!orderFulfillmentContext && !orderFulfillmentContext.orderError;
          const activeOrderLookup = orderFulfillmentContext
            ? buildActiveOrderLookup(orderFulfillmentContext.orderDetails)
            : new Map<string, boolean>();

          const readyTrays = (activeTrays || []).reduce((acc: Array<{ tray: any; daysSinceSow: number; totalDays: number }>, tray: any) => {
            if (!tray.recipes || !tray.recipe_id || !tray.sow_date) {
              return acc;
            }
            const sowDate = parseLocalDate(tray.sow_date);
            if (!sowDate) return acc;
            const totalDays = recipeTotalDays[tray.recipe_id] || 1;
            const daysSinceSow = Math.floor((targetDate.getTime() - sowDate.getTime()) / (1000 * 60 * 60 * 24));
            const isReady = daysSinceSow >= totalDays;
            console.log('[fetchDailyTasks] Harvest readiness check:', {
              tray_id: tray.tray_id,
              recipe_name: tray.recipes?.recipe_name,
              sow_date: tray.sow_date,
              targetDate: targetDateStr,
              daysSinceSow,
              totalDays,
              isReady,
              customer_id: tray.customer_id,
            });
            if (tray.recipes?.recipe_name?.toLowerCase() === 'dun peas' || tray.recipe_id === 5) {
              console.log('[DEBUG] Dun Peas tray detailed check:', {
                tray_id: tray.tray_id,
                sow_date: tray.sow_date,
                daysSinceSow,
                totalDays,
                isReady,
                customer_id: tray.customer_id,
                recipe_id: tray.recipe_id,
              });
            }
            if (isReady) {
              acc.push({ tray, daysSinceSow, totalDays });
            }
            return acc;
          }, []);

          const trayCustomerIds = [...new Set(readyTrays.map((item: any) => item.tray.customer_id).filter(Boolean))];
          const trayCustomerMap: Record<number, string> = {};
          if (trayCustomerIds.length > 0) {
            const { data: customersData } = await getSupabaseClient()
              .from('customers')
              .select('customerid, name')
              .in('customerid', trayCustomerIds);
            if (customersData) {
              customersData.forEach((customer: any) => {
                if (customer.customerid && customer.name) {
                  trayCustomerMap[customer.customerid] = customer.name;
                }
              });
            }
          }

          const traysByCustomer = new Map<string, {
            recipeId: number;
            recipeName: string;
            varietyName?: string;
            customerId?: number;
            location?: string;
            trayIds: number[];
            batchIds: Set<number>;
            quantity: number;
            dayCurrent: number;
            dayTotal: number;
            trayInfos: Array<{ trayId: number; varietyName?: string; sowDate?: string }>;
          }>();

          readyTrays.forEach((item: any) => {
            const tray = item.tray;
            const recipeId = tray.recipe_id || 0;
            const recipeName = tray.recipes?.recipe_name || 'Unknown';
            const varietyNameFromRelation = resolveVarietyNameFromRelation((tray.recipes as any)?.varieties);
            const currentVarietyName = tray.recipes?.variety_name || varietyNameFromRelation;
            const customerId = tray.customer_id;
            const key = `${recipeId}-${customerId ?? 'unassigned'}`;
            if (!traysByCustomer.has(key)) {
              traysByCustomer.set(key, {
                recipeId,
                recipeName,
                varietyName: currentVarietyName,
                customerId,
                location: tray.location || 'Not set',
                trayIds: [],
                batchIds: new Set<number>(),
                quantity: 0,
                dayCurrent: 0,
                dayTotal: 0,
                trayInfos: [],
              });
            }
            const group = traysByCustomer.get(key)!;
            if (!group.varietyName && currentVarietyName) {
              group.varietyName = currentVarietyName;
            }
            group.trayIds.push(tray.tray_id);
            if (tray.batch_id) {
              group.batchIds.add(tray.batch_id);
            }
            group.quantity += 1;
            group.dayCurrent = Math.max(group.dayCurrent, item.daysSinceSow);
            group.dayTotal = Math.max(group.dayTotal, item.totalDays);
            group.trayInfos.push({
              trayId: tray.tray_id,
              varietyName: currentVarietyName,
              sowDate: tray.sow_date || undefined,
            });
          });

          traysByCustomer.forEach((group) => {
            if (group.trayIds.length === 0) return;
            const batchIdDisplay = group.batchIds.size > 0
              ? (group.batchIds.size === 1 ? `B-${[...group.batchIds][0]}` : `Multiple (${group.batchIds.size})`)
              : 'N/A';
            const customerName = group.customerId ? trayCustomerMap[group.customerId] : undefined;
            const normalizedCustomerName = customerName?.trim().toLowerCase();
            const orderLookupKey = `${normalizedCustomerName || ''}||${group.recipeId}`;
            const hasActiveOrder = !respectsOrderContext
              ? true
              : !!(normalizedCustomerName && activeOrderLookup.has(orderLookupKey));

            // Always preserve customerName if tray has customer_id
            // Only use hasActiveOrder to determine deliveryDate
            const task: DailyTask = {
              id: `harvest-${group.recipeName}-${group.customerId ?? 'unassigned'}-${targetDateStr}-${group.location || 'unknown'}`,
              action: `Harvest ${group.varietyName || group.recipeName}`,
              crop: group.varietyName || group.recipeName,
              batchId: batchIdDisplay,
              location: group.location || 'Not set',
              customerName: customerName || undefined, // Preserve if tray has customer_id
              customerId: group.customerId,
              deliveryDate: hasActiveOrder ? targetDateStr : undefined, // Only set if active order today
              dayCurrent: group.dayCurrent || recipeTotalDays[group.recipeId] || 0,
              dayTotal: group.dayTotal || recipeTotalDays[group.recipeId] || 0,
              trays: group.quantity,
              status: 'urgent',
              trayIds: group.trayIds,
              recipeId: group.recipeId,
              taskSource: 'tray_step',
              quantity: group.quantity,
              trayDetails: group.trayInfos,
              notes: customerName && !hasActiveOrder ? `Ready for ${customerName} but no active order today` : undefined,
            };

            harvestTasks.push(task);
            console.log('[fetchDailyTasks] Supplemental harvest task created:', {
              count: harvestTasks.length,
              customerName: task.customerName,
              customerId: task.customerId,
              hasActiveOrder,
              deliveryDate: task.deliveryDate,
              recipeId: group.recipeId,
              trays: group.quantity,
            });
          });
        }
      } catch (error) {
        console.warn('[fetchDailyTasks] Error fetching harvest tasks:', error);
      }
    }

    // Fetch watering tasks for trays currently past blackout phase
    // DYNAMIC APPROACH: Generate watering tasks based on sow_date and recipe steps,
    // NOT based on tray_steps records. This ensures trays get watering tasks every day
    // until they are actually harvested (harvest_date is set) or marked as lost.
    if (targetDate) {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const targetDateStr = formatDateString(targetDate);

        // ✅ OPTIMIZED: Reuse cached active trays data (eliminates duplicate query)
        const activeTrays = cachedActiveTrays;
        const traysError = cachedActiveTrays === null;

        if (!traysError && activeTrays && activeTrays.length > 0) {
          const traysWithRecipes = activeTrays.filter((t: any) => t.recipes && t.recipe_id && t.sow_date);
          const recipeIds = [...new Set(traysWithRecipes.map((t: any) => t.recipe_id).filter(Boolean))];

          console.log('[fetchDailyTasks] Watering tasks - Dynamic approach:', {
            totalActiveTrays: activeTrays.length,
            traysWithRecipes: traysWithRecipes.length,
            recipeIds: recipeIds.slice(0, 10),
            targetDateStr
          });

          if (recipeIds.length > 0) {
            // ✅ OPTIMIZED: Reuse cached steps data, filter for relevant recipe IDs
            const allSteps = cachedSteps ? cachedSteps.filter((step: any) => recipeIds.includes(step.recipe_id)) : null;
            const stepsError = cachedSteps === null;

            if (!stepsError && allSteps) {
              // Group steps by recipe and sort by order
              const stepsByRecipe: Record<number, any[]> = {};
              allSteps.forEach((step: any) => {
                if (!stepsByRecipe[step.recipe_id]) {
                  stepsByRecipe[step.recipe_id] = [];
                }
                stepsByRecipe[step.recipe_id].push(step);
              });

              Object.keys(stepsByRecipe).forEach((recipeId) => {
                stepsByRecipe[Number(recipeId)].sort((a, b) => {
                  const orderA = a.step_order ?? a.sequence_order ?? 0;
                  const orderB = b.step_order ?? b.sequence_order ?? 0;
                  return orderA - orderB;
                });
              });

              // Calculate blackout end day and total days for each recipe
              // Also find the Growing step's water_frequency and water_method
              const recipeInfo: Record<number, { blackoutEndDay: number; totalDays: number; waterFrequency?: string; waterMethod?: string }> = {};

              Object.keys(stepsByRecipe).forEach((recipeIdStr) => {
                const recipeId = Number(recipeIdStr);
                const steps = stepsByRecipe[recipeId];

                let cumulativeDays = 0;
                let blackoutEndDay = 0;
                let waterFrequency: string | undefined;
                let waterMethod: string | undefined;

                for (const step of steps) {
                  const duration = step.duration || 0;
                  const unit = (step.duration_unit || 'Days').toUpperCase();
                  let durationDays = duration;
                  if (unit === 'HOURS') {
                    durationDays = duration >= 12 ? 1 : 0;
                  }

                  const stepName = (step.step_name || '').toLowerCase();

                  // Track when blackout ends (end of any blackout or germination step)
                  if (stepName.includes('blackout') || stepName.includes('germination')) {
                    blackoutEndDay = cumulativeDays + durationDays;
                  }

                  // Get water info from Growing step
                  if (stepName === 'growing' || stepName.includes('grow')) {
                    waterFrequency = step.water_frequency;
                    waterMethod = step.water_method;
                  }

                  cumulativeDays += durationDays;
                }

                recipeInfo[recipeId] = {
                  blackoutEndDay,
                  totalDays: cumulativeDays,
                  waterFrequency,
                  waterMethod
                };
              });

              console.log('[fetchDailyTasks] Watering tasks - Recipe info:', {
                recipeCount: Object.keys(recipeInfo).length,
                recipes: Object.entries(recipeInfo).map(([id, info]) => ({
                  recipeId: Number(id),
                  blackoutEndDay: info.blackoutEndDay,
                  totalDays: info.totalDays,
                  waterFrequency: info.waterFrequency
                }))
              });

              // Group trays by recipe that are past blackout phase
              const traysByRecipe: Record<number, Array<{ tray_id: number; daysSinceSow: number; totalDays: number }>> = {};

              traysWithRecipes.forEach((tray: any) => {
                const recipeId = tray.recipe_id;
                const info = recipeInfo[recipeId];
                if (!info) return;

                const sowDate = parseLocalDate(tray.sow_date);
                if (!sowDate) return;

                // Calculate days since sow (0-indexed for comparison with blackoutEndDay)
                const daysSinceSow = Math.floor((today.getTime() - sowDate.getTime()) / (1000 * 60 * 60 * 24));

                // Only include trays that are past the blackout phase
                // daysSinceSow >= blackoutEndDay means the tray is in or past the Growing phase
                if (daysSinceSow >= info.blackoutEndDay) {
                  if (!traysByRecipe[recipeId]) {
                    traysByRecipe[recipeId] = [];
                  }
                  traysByRecipe[recipeId].push({
                    tray_id: tray.tray_id,
                    daysSinceSow: daysSinceSow + 1, // Convert to 1-indexed for display
                    totalDays: info.totalDays
                  });
                }
              });

              console.log('[fetchDailyTasks] Watering tasks - Trays past blackout:', {
                recipesWithTrays: Object.keys(traysByRecipe).length,
                totalTrays: Object.values(traysByRecipe).reduce((sum, trays) => sum + trays.length, 0),
                breakdown: Object.entries(traysByRecipe).map(([id, trays]) => ({
                  recipeId: Number(id),
                  trayCount: trays.length,
                  trayIds: trays.map(t => t.tray_id)
                }))
              });

              // Check for completed watering tasks in task_completions
              const { data: completedWateringTasks, error: completedWateringError } = await getSupabaseClient()
                .from('task_completions')
                .select('recipe_id')
                .eq('farm_uuid', farmUuid)
                .eq('task_type', 'watering')
                .eq('task_date', targetDateStr)
                .eq('status', 'completed');

              const completedWateringRecipeIds = new Set<number>();
              if (!completedWateringError && completedWateringTasks) {
                completedWateringTasks.forEach((ct: any) => {
                  if (ct.recipe_id) {
                    completedWateringRecipeIds.add(ct.recipe_id);
                  }
                });
              }

              console.log('[fetchDailyTasks] Watering tasks - Completed check:', {
                completedRecipeIds: Array.from(completedWateringRecipeIds),
                completedCount: completedWateringRecipeIds.size
              });

              // Create watering tasks grouped by recipe
              Object.keys(traysByRecipe).forEach((recipeIdStr) => {
                const recipeId = Number(recipeIdStr);
                const recipeTrays = traysByRecipe[recipeId];

                if (recipeTrays.length === 0) return;

                // Skip if this recipe already has a completed watering task for today
                if (completedWateringRecipeIds.has(recipeId)) {
                  console.log('[fetchDailyTasks] Skipping watering task for recipe (already completed):', {
                    recipeId,
                    recipeName: (traysWithRecipes.find((t: any) => t.recipe_id === recipeId)?.recipes as any)?.recipe_name
                  });
                  return;
                }

                // Get recipe info
                const recipeTray = traysWithRecipes.find((t: any) => t.recipe_id === recipeId);
                const recipeRecord = recipeTray?.recipes as any;
                const recipeName = recipeRecord?.recipe_name || 'Unknown';
                const varietyName = recipeRecord?.variety_name;
                const displayName = varietyName || recipeName;

                // Get water info from recipe
                const info = recipeInfo[recipeId];
                const waterFrequency = info?.waterFrequency || '';
                const waterMethod = info?.waterMethod || '';
                const notes = waterMethod
                  ? `${waterFrequency} - ${waterMethod}`
                  : waterFrequency;

                // Calculate day progress (use minimum daysSinceSow if trays vary)
                const daysSinceSowValues = recipeTrays.map(t => t.daysSinceSow);
                const dayCurrent = Math.min(...daysSinceSowValues);
                const dayTotal = info?.totalDays || 0;

                // Group by recipe and create task
                const trayIds = recipeTrays.map((t) => t.tray_id);
                const taskId = `water-${recipeId}-${displayName}-${targetDateStr}`;

                wateringTasks.push({
                  id: taskId,
                  action: 'Water',
                  crop: displayName,
                  batchId: 'N/A',
                  location: 'Not set',
                  dayCurrent: dayCurrent,
                  dayTotal: dayTotal,
                  trays: recipeTrays.length,
                  status: 'pending',
                  trayIds: trayIds,
                  recipeId: recipeId,
                  taskSource: 'tray_step',
                  quantity: recipeTrays.length,
                  notes: notes,
                });
              });
            }
          }
        }
      } catch (error) {
        console.warn('[fetchDailyTasks] Error fetching watering tasks:', error);
      }
    }

    // Fetch "At Risk" items from order fulfillment system
    // At Risk = sow_date has passed but harvest_date hasn't, and not enough trays are ready
    // NOTE: We ONLY use order_fulfillment_status for Daily Flow at-risk items
    // scheduledHarvestsWithoutTrays is NOT used here - it would create duplicates
    const atRiskTasks: DailyTask[] = [];
    const atRiskByRecipeId = new Map<string, DailyTask>(); // Deduplicate by recipe_id + customer_name + delivery_date (string key)
    
    if (targetDate) {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = formatDateString(today);
        const targetDateStr = formatDateString(targetDate);
        const orderContext = orderFulfillmentContext || {
          orderDetails: [],
          orderError: null,
          completedScheduleKeys: new Set<string>(),
        };
        const orderDetails = orderContext.orderDetails || [];
        const orderError = orderContext.orderError;
        const completedScheduleKeys = orderContext.completedScheduleKeys || new Set<string>();

        if (!orderError && orderDetails.length > 0) {
          console.log('[fetchDailyTasks] Processing', orderDetails.length, 'items from order_fulfillment_status');
          
          // Aggregate by recipe + customer + delivery_date to avoid duplicates
          const aggregatedMap = new Map<string, {
            recipe_name: string;
            customer_name: string;
            delivery_date: string;
            sow_date: string;
            harvest_date: string;
            trays_ready: number;
            trays_needed: number;
            missing: number;
            recipe_id: number;
          }>();
          
          for (const item of orderDetails) {
            const sowDateStr = item.sow_date ? formatDateString(parseLocalDate(item.sow_date) || new Date()) : '';
            const harvestDateStr = item.harvest_date ? formatDateString(parseLocalDate(item.harvest_date) || new Date()) : '';
            const deliveryDateStr = item.delivery_date ? formatDateString(parseLocalDate(item.delivery_date) || new Date()) : '';

            // Skip items whose standing order + delivery date are already marked completed
            const completionKey = item.standing_order_id
              ? `${item.standing_order_id}-${deliveryDateStr}`
              : '';
            if (completionKey && completedScheduleKeys.has(completionKey)) {
              console.log('[fetchDailyTasks] Skipping at-risk item (order already completed):', {
                recipe_name: item.recipe_name,
                recipe_id: item.recipe_id,
                customer_name: item.customer_name,
                delivery_date: deliveryDateStr,
                standing_order_id: item.standing_order_id,
              });
              continue;
            }
            
            // Verify delivery_date matches today (should already be filtered by query, but double-check)
            if (deliveryDateStr !== targetDateStr) {
              continue; // Skip items not due today
            }
            
            // Check if this item is currently "at risk" (today > sow_date AND today <= harvest_date)
            // At-risk means: sow_date has passed but harvest_date hasn't, and not enough trays
            const isCurrentlyAtRisk = 
              todayStr > sowDateStr && // Sow date has passed
              todayStr <= harvestDateStr && // Still before harvest date
              (item.trays_ready || 0) < (item.trays_needed || 0) && // Not enough trays
              (item.trays_needed || 0) > 0; // Needs trays
            
            // Only include items that are currently at risk
            if (isCurrentlyAtRisk) {
              const missing = (item.trays_needed || 0) - (item.trays_ready || 0);
              // Use recipe_id instead of recipe_name for more precise aggregation
              const key = `${item.recipe_id || item.recipe_name}-${item.customer_name}-${deliveryDateStr}`;
              
              if (aggregatedMap.has(key)) {
                // Aggregate: sum up trays
                const existing = aggregatedMap.get(key)!;
                existing.trays_needed += item.trays_needed || 0;
                existing.trays_ready += item.trays_ready || 0;
                existing.missing = existing.trays_needed - existing.trays_ready;
              } else {
                aggregatedMap.set(key, {
                  recipe_name: item.recipe_name || 'Unknown',
                  customer_name: item.customer_name || 'Unknown',
                  delivery_date: deliveryDateStr,
                  sow_date: sowDateStr,
                  harvest_date: harvestDateStr,
                  trays_ready: item.trays_ready || 0,
                  trays_needed: item.trays_needed || 0,
                  missing,
                  recipe_id: item.recipe_id || 0,
                });
              }
            }
          }
          
          console.log('[fetchDailyTasks] Aggregated map before creating at-risk tasks:', {
            aggregatedMapSize: aggregatedMap.size,
            aggregatedItems: Array.from(aggregatedMap.entries()).map(([key, value]) => ({
              key,
              recipe_name: value.recipe_name,
              customer_name: value.customer_name,
              delivery_date: value.delivery_date,
              recipe_id: value.recipe_id
            }))
          });
          
          // Show at-risk items ONLY if their delivery_date matches the selected date (today)
          // An item is "at risk" if: selected_date > sow_date AND selected_date <= harvest_date AND trays_ready < trays_needed
          // AND delivery_date === selected_date (only show items due today)
          for (const aggregated of aggregatedMap.values()) {
            // Double-check: Only show items whose delivery date matches the selected date
            if (aggregated.delivery_date !== targetDateStr) {
              continue; // Skip items not due today
            }
            
            // Ensure trays_needed > 0
            if ((aggregated.trays_needed || 0) <= 0) {
              continue; // Skip items that don't need trays
            }
            
            // Show items that are currently at risk on the selected date
            // Check if the selected date is between sow_date and harvest_date
            const sowDate = parseLocalDate(aggregated.sow_date);
            const harvestDate = parseLocalDate(aggregated.harvest_date);
            const selectedDate = parseLocalDate(targetDateStr);
            
            if (sowDate && harvestDate && selectedDate) {
              const isAtRiskOnSelectedDate = 
                selectedDate > sowDate && 
                selectedDate <= harvestDate &&
                (aggregated.trays_ready || 0) < (aggregated.trays_needed || 0);
              
              if (isAtRiskOnSelectedDate) {
                // Use recipe_id as key to deduplicate - order fulfillment takes precedence
                // Get standing_order_id from the first matching item
                const firstMatchingItem = orderDetails.find((item: any) => 
                  item.recipe_id === aggregated.recipe_id &&
                  item.customer_name === aggregated.customer_name &&
                  formatDateString(parseLocalDate(item.delivery_date) || new Date()) === aggregated.delivery_date
                );

                const atRiskStandingOrderId = firstMatchingItem?.standing_order_id || null;

                // Do not create at-risk tasks for completed schedules (defense-in-depth)
                const atRiskCompletionKey = atRiskStandingOrderId
                  ? `${atRiskStandingOrderId}-${aggregated.delivery_date}`
                  : '';
                if (atRiskCompletionKey && completedScheduleKeys.has(atRiskCompletionKey)) {
                  console.log('[fetchDailyTasks] Skipping at-risk task creation (order already completed):', {
                    atRiskKey: `${aggregated.recipe_id}-${aggregated.customer_name}-${aggregated.delivery_date}`,
                    standing_order_id: atRiskStandingOrderId,
                    delivery_date: aggregated.delivery_date,
                    recipe_id: aggregated.recipe_id,
                    recipe_name: aggregated.recipe_name,
                  });
                  continue;
                }
                
                // Debug logging for Purple Basil
                if (aggregated.recipe_name?.toLowerCase().includes('purple basil')) {
                  console.log('[fetchDailyTasks] Adding Purple Basil to at-risk (delivery_date matches selected date):', {
                    recipe_name: aggregated.recipe_name,
                    recipe_id: aggregated.recipe_id,
                    delivery_date: aggregated.delivery_date,
                    targetDate: targetDateStr,
                    standing_order_id: firstMatchingItem?.standing_order_id,
                    trays_ready: aggregated.trays_ready,
                    trays_needed: aggregated.trays_needed,
                    missing: aggregated.missing
                  });
                }
                
                // Use recipe_id + customer_name + delivery_date as key to allow same recipe for different customers
                // This ensures we show separate at-risk items for each customer
                const atRiskKey = `${aggregated.recipe_id}-${aggregated.customer_name}-${aggregated.delivery_date}`;
                
                console.log('[fetchDailyTasks] Creating at-risk task:', {
                  atRiskKey,
                  recipe_name: aggregated.recipe_name,
                  customer_name: aggregated.customer_name,
                  delivery_date: aggregated.delivery_date,
                  recipe_id: aggregated.recipe_id
                });
                
                atRiskByRecipeId.set(atRiskKey, {
                  id: `order_fulfillment-at_risk-${aggregated.recipe_id}-${aggregated.recipe_name}-${aggregated.customer_name}-${aggregated.delivery_date}`,
                  action: `At Risk: ${aggregated.recipe_name}`,
                  crop: aggregated.recipe_name,
                  batchId: 'N/A',
                  location: 'Not set',
                  dayCurrent: 0,
                  dayTotal: 0,
                  trays: aggregated.missing,
                  status: 'urgent',
                  trayIds: [],
                  recipeId: aggregated.recipe_id,
                  taskSource: 'order_fulfillment',
                  quantity: aggregated.missing,
                  customerName: aggregated.customer_name,
                  deliveryDate: aggregated.delivery_date,
                  standingOrderId: atRiskStandingOrderId,
                  traysNeeded: aggregated.trays_needed,
                  traysReady: aggregated.trays_ready,
                });
              }
            }
          }
        }
      } catch (error) {
        console.warn('[fetchDailyTasks] Error fetching at-risk tasks:', error);
      }
      
      // Convert map to array (deduplicated by recipe_id + customer_name + delivery_date)
      // Use Array.from to ensure we get a fresh array
      const atRiskTasksArray = Array.from(atRiskByRecipeId.values());
      atRiskTasks.push(...atRiskTasksArray);
      
      console.log('[fetchDailyTasks] At-risk tasks after processing (today only):', {
        targetDate: targetDateStr,
        count: atRiskTasks.length,
        atRiskByRecipeIdSize: atRiskByRecipeId.size,
        atRiskKeys: Array.from(atRiskByRecipeId.keys()),
        items: atRiskTasks.map(t => ({
          crop: t.crop,
          recipeId: t.recipeId,
          deliveryDate: t.deliveryDate,
          customerName: t.customerName,
          standingOrderId: t.standingOrderId,
          traysNeeded: t.traysNeeded,
          traysReady: t.traysReady,
          taskSource: t.taskSource,
          id: t.id
        }))
      });
    }

    // Combine tasks from view only - supplemental, harvest, and at-risk tasks will be added later
    const allTasksData = [...(tasksData || [])];
    console.log('[fetchDailyTasks] View task data snapshot before supplemental logic:', {
      tasksDataLength: tasksData?.length ?? 0,
      allTasksDataLength: allTasksData.length,
      harvestTasksCount: harvestTasks.length,
      supplementalTasksCount: supplementalTasks.length,
    });

    if (
      allTasksData.length === 0 &&
      harvestTasks.length === 0 &&
      supplementalTasks.length === 0 &&
      atRiskTasks.length === 0
    ) {
      console.log('[fetchDailyTasks] No tasks from any source, returning empty', {
        harvestTasksCount: harvestTasks.length,
        supplementalTasksCount: supplementalTasks.length,
        atRiskTasksCount: atRiskTasks.length,
      });
      return [];
    }

    // Debug: Log the structure of tray_step tasks to understand what the view returns
    const trayStepTasks = tasksData.filter((row: any) => row.task_source === 'tray_step');
    if (trayStepTasks.length > 0) {
      const sampleTask = trayStepTasks[0];
      console.log('[fetchDailyTasks] Sample tray_step task from view:', {
        task_name: sampleTask.task_name,
        all_keys: Object.keys(sampleTask),
        all_values: Object.entries(sampleTask).reduce((acc: any, [key, value]) => {
          // Only show non-null, non-undefined values for clarity
          if (value != null && value !== '') {
            acc[key] = value;
          }
          return acc;
        }, {}),
        step_id: sampleTask.step_id,
        stepId: sampleTask.stepId,
        tray_id: sampleTask.tray_id,
        tray_ids: sampleTask.tray_ids,
        recipe_id: sampleTask.recipe_id,
        recipeId: sampleTask.recipeId,
        full_row: sampleTask
      });
    }

    // For tray_step tasks missing IDs, query tray_steps directly to get the data
    const trayStepTasksNeedingIds = tasksData.filter((row: any) => 
      row.task_source === 'tray_step' && (!row.step_id && !row.stepId || (!row.tray_ids || (Array.isArray(row.tray_ids) && row.tray_ids.length === 0)) && !row.tray_id)
    );

    // Fetch missing IDs from tray_steps for these tasks
    if (trayStepTasksNeedingIds.length > 0) {
      try {
        // First, get all active trays for this farm to filter tray_steps
        const { data: farmTrays, error: traysError } = await getSupabaseClient()
          .from('trays')
          .select('tray_id, recipe_id, farm_uuid')
          .eq('farm_uuid', farmUuid)
          .is('harvest_date', null);

        if (traysError) {
          console.error('[fetchDailyTasks] Error fetching trays:', traysError);
        } else if (farmTrays && farmTrays.length > 0) {
          const farmTrayIds = farmTrays.map((t: any) => t.tray_id);
          const trayRecipeMap = new Map(farmTrays.map((t: any) => [t.tray_id, t.recipe_id]));

          // Query tray_steps for these trays (both pending and recently completed)
          // Include completed tasks in case the view is still showing them
          const { data: allTraySteps, error: trayStepsError } = await getSupabaseClient()
            .from('tray_steps')
            .select('tray_step_id, tray_id, step_id, scheduled_date, status, completed')
            .in('tray_id', farmTrayIds)
            .eq('scheduled_date', taskDate)
            .in('status', ['Pending', 'Completed'])
            .eq('skipped', false);

          if (trayStepsError) {
            console.error('[fetchDailyTasks] Error fetching tray_steps:', trayStepsError);
          } else if (allTraySteps && allTraySteps.length > 0) {
            // Get unique step_ids and fetch step details
            const stepIds = [...new Set(allTraySteps.map((ts: any) => ts.step_id))];
            const { data: stepsData, error: stepsError } = await getSupabaseClient()
              .from('steps')
              .select('step_id, step_name, description_name')
              .in('step_id', stepIds);

            if (stepsError) {
              console.error('[fetchDailyTasks] Error fetching steps:', stepsError);
            } else if (stepsData) {
              // Create a map of step_id to step details
              const stepMap = new Map(stepsData.map((s: any) => [s.step_id, s]));

              // For each task needing IDs, find matching tray_steps by step name/description
              for (const row of trayStepTasksNeedingIds) {
                const taskName = (row.task_name || '').toLowerCase();
                const targetRecipeId = row.recipe_id || row.recipeId;
                
                // Find matching steps by name/description
                const matchingSteps = allTraySteps.filter((ts: any) => {
                  const step = stepMap.get(ts.step_id);
                  if (!step) return false;
                  
                  const stepName = (step.step_name || '').toLowerCase();
                  const stepDesc = (step.description_name || '').toLowerCase();
                  const matchesName = stepName.includes(taskName) || taskName.includes(stepName);
                  const matchesDesc = stepDesc.includes(taskName) || taskName.includes(stepDesc);
                  
                  // Also filter by recipe_id if we have it
                  const trayRecipeId = trayRecipeMap.get(ts.tray_id);
                  const matchesRecipe = !targetRecipeId || trayRecipeId === targetRecipeId;
                  
                  return (matchesName || matchesDesc) && matchesRecipe;
                });

                if (matchingSteps.length > 0) {
                  // Extract step_id (should be the same for all matching steps)
                  const stepId = matchingSteps[0].step_id;
                  const recipeId = trayRecipeMap.get(matchingSteps[0].tray_id) || targetRecipeId || 0;
                  const trayIds = matchingSteps.map((ts: any) => ts.tray_id).filter((id: number) => id != null);
                  
                  // Update the row with the found IDs
                  row.step_id = stepId;
                  row.recipe_id = recipeId;
                  row.tray_ids = trayIds;
                  
                  console.log('[fetchDailyTasks] Fetched missing IDs from tray_steps:', {
                    task_name: row.task_name,
                    step_id: stepId,
                    recipe_id: recipeId,
                    tray_ids: trayIds,
                    count: trayIds.length
                  });
                } else {
                  // If no pending tasks found, check if there are completed tasks for this step
                  // This handles the case where tasks were just completed but view hasn't refreshed
                  const { data: allTrayStepsForMatching, error: allStepsError } = await getSupabaseClient()
                    .from('tray_steps')
                    .select('tray_step_id, tray_id, step_id, scheduled_date, status, completed')
                    .in('tray_id', farmTrayIds)
                    .eq('scheduled_date', taskDate)
                    .eq('skipped', false);
                  
                  if (!allStepsError && allTrayStepsForMatching && allTrayStepsForMatching.length > 0) {
                    const allStepsMap = new Map(stepsData.map((s: any) => [s.step_id, s]));
                    const completedMatchingSteps = allTrayStepsForMatching.filter((ts: any) => {
                      const step = allStepsMap.get(ts.step_id);
                      if (!step) return false;
                      
                      const stepName = (step.step_name || '').toLowerCase();
                      const stepDesc = (step.description_name || '').toLowerCase();
                      const matchesName = stepName.includes(taskName) || taskName.includes(stepName);
                      const matchesDesc = stepDesc.includes(taskName) || taskName.includes(stepDesc);
                      
                      const trayRecipeId = trayRecipeMap.get(ts.tray_id);
                      const matchesRecipe = !targetRecipeId || trayRecipeId === targetRecipeId;
                      
                      return (matchesName || matchesDesc) && matchesRecipe;
                    });
                    
                    if (completedMatchingSteps.length > 0 && completedMatchingSteps.every((ts: any) => ts.completed)) {
                      // All matching steps are completed - this task should not appear
                      // But we'll still populate IDs in case the view is slow to update
                      const stepId = completedMatchingSteps[0].step_id;
                      const recipeId = trayRecipeMap.get(completedMatchingSteps[0].tray_id) || targetRecipeId || 0;
                      const trayIds = completedMatchingSteps.map((ts: any) => ts.tray_id).filter((id: number) => id != null);
                      
                      row.step_id = stepId;
                      row.recipe_id = recipeId;
                      row.tray_ids = trayIds;
                      
                      console.log('[fetchDailyTasks] Found completed task (should be filtered by view):', {
                        task_name: row.task_name,
                        step_id: stepId,
                        recipe_id: recipeId,
                        tray_ids: trayIds
                      });
                    } else {
                      console.warn('[fetchDailyTasks] No matching tray_steps found for task:', {
                        task_name: row.task_name,
                        recipe_id: targetRecipeId,
                        available_steps: Array.from(stepMap.values()).map((s: any) => ({
                          step_name: s.step_name,
                          description: s.description_name
                        }))
                      });
                    }
                  } else {
                    console.warn('[fetchDailyTasks] No matching tray_steps found for task:', {
                      task_name: row.task_name,
                      recipe_id: targetRecipeId,
                      available_steps: Array.from(stepMap.values()).map((s: any) => ({
                        step_name: s.step_name,
                        description: s.description_name
                      }))
                    });
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('[fetchDailyTasks] Error in fallback query:', err);
      }
    }

    // Fetch completed seeding/soaking tasks for today to filter out completed seed_request tasks
    const { data: todayCompletedTasks, error: todayCompletedTasksError } = await getSupabaseClient()
      .from('task_completions')
      .select('recipe_id, task_type, task_date')
      .eq('farm_uuid', farmUuid)
      .eq('task_date', taskDate)
      .in('task_type', ['sowing', 'soaking'])
      .eq('status', 'completed');
    
    // Create a set of completed task keys for today: "task_type-recipe_id"
    const todayCompletedTaskKeys = new Set<string>();
    if (todayCompletedTasks && !todayCompletedTasksError) {
      todayCompletedTasks.forEach((ct: any) => {
        const key = `${ct.task_type}-${ct.recipe_id}`;
        todayCompletedTaskKeys.add(key);
      });
    }

    // Fetch variety_name for all recipes in tasks (needed for seed_request tasks)
    const allRecipeIdsFromTasks = allTasksData 
      ? [...new Set(allTasksData.map((r: any) => r.recipe_id).filter(Boolean))] 
      : [];
    
    // Also fetch recipe IDs from seed_request tasks (tray_creation_requests) directly
    // This ensures we get recipe IDs even if the view doesn't include them properly
    // This is critical for seed_request tasks to have weight info
    const seedRequestRecipeIds: number[] = [];
    const requestIdToRecipeIdMap: Record<number, number> = {}; // Map request_id -> recipe_id for lookup
    try {
      const { data: seedRequests, error: seedRequestsError } = await getSupabaseClient()
        .from('tray_creation_requests')
        .select('recipe_id, request_id')
        .eq('farm_uuid', farmUuid)
        .eq('seed_date', taskDate)
        .in('status', ['pending', 'approved']);
      
      if (seedRequests && !seedRequestsError) {
        seedRequests.forEach((req: any) => {
          if (req.recipe_id) {
            if (!seedRequestRecipeIds.includes(req.recipe_id)) {
              seedRequestRecipeIds.push(req.recipe_id);
            }
            // Map request_id to recipe_id for later lookup
            if (req.request_id) {
              requestIdToRecipeIdMap[req.request_id] = req.recipe_id;
            }
          }
        });
      }
    } catch (err) {
      console.warn('[fetchDailyTasks] Error fetching seed_request recipe IDs:', err);
    }
    
    // Combine recipe IDs from view and seed_request tasks
    const allRecipeIds = [...new Set([...allRecipeIdsFromTasks, ...seedRequestRecipeIds])];
    
    const { data: allRecipesData, error: allRecipesError } = allRecipeIds.length > 0 ? await getSupabaseClient()
      .from('recipes')
      .select('recipe_id, variety_name')
      .in('recipe_id', allRecipeIds)
      .eq('farm_uuid', farmUuid) : { data: null, error: null };
    
    // Create a map of recipe_id -> variety_name for all tasks
    const allVarietyNameMap: Record<number, string> = {};
    if (allRecipesData && !allRecipesError) {
      allRecipesData.forEach((recipe: any) => {
        if (recipe.recipe_id && recipe.variety_name) {
          allVarietyNameMap[recipe.recipe_id] = recipe.variety_name;
        }
      });
    }

    // Fetch germination steps for seeding tasks to get weight info
    // Include recipe IDs from BOTH:
    // 1. seed_request tasks (from tray_creation_requests) - already in allRecipeIds
    // 2. planting_schedule seeding tasks - fetch recipe IDs that have sow_date = today
    const plantingScheduleRecipeIds: number[] = [];
    try {
      // Fetch recipe IDs from planting_schedule that will have seeding tasks today
      // ✅ OPTIMIZED: Added date filter to only fetch today's schedules
      const { data: plantingSchedules, error: plantingScheduleError } = await getSupabaseClient()
        .from('planting_schedule_view')
        .select('recipe_id, sow_date')
        .eq('farm_uuid', farmUuid)
        .eq('sow_date', taskDate);
      
      if (plantingSchedules && !plantingScheduleError) {
        plantingSchedules.forEach((schedule: any) => {
          if (schedule.recipe_id && schedule.sow_date) {
            // No need to parse and compare dates - already filtered by database
            if (!plantingScheduleRecipeIds.includes(schedule.recipe_id)) {
              plantingScheduleRecipeIds.push(schedule.recipe_id);
            }
          }
        });
      }
    } catch (err) {
      console.warn('[fetchDailyTasks] Error fetching planting_schedule recipe IDs:', err);
    }
    
    // Combine recipe IDs from all sources: view tasks, seed_request tasks, and planting_schedule tasks
    const seedingRecipeIds = [...new Set([...allRecipeIds, ...plantingScheduleRecipeIds])];

    // Fetch ALL steps for these recipes (we'll filter for Germination in JavaScript)
    // This is more reliable than case-sensitive getSupabaseClient() queries
    const { data: allStepsForSeedingRecipes, error: stepsError } = seedingRecipeIds.length > 0 ? await getSupabaseClient()
      .from('steps')
      .select('recipe_id, requires_weight, weight_lbs, description_name, step_name')
      .in('recipe_id', seedingRecipeIds) : { data: null, error: null };

    // Create a map of recipe_id -> { requires_weight, weight_lbs } for germination steps
    const germinationWeightMap: Record<number, { requires_weight: boolean; weight_lbs: number | null }> = {};
    if (allStepsForSeedingRecipes && !stepsError) {
      allStepsForSeedingRecipes.forEach((step: any) => {
        if (step.recipe_id) {
          // Check if it's actually a Germination step (handle both description_name and step_name, case-insensitive)
          const descName = (step.description_name || '').toLowerCase().trim();
          const stepName = (step.step_name || '').toLowerCase().trim();
          const isGermination = descName === 'germination' || stepName === 'germination';
          
          if (isGermination) {
            // If multiple germination steps exist, prefer the one with weight set, otherwise use the first one
            if (!germinationWeightMap[step.recipe_id] || (step.requires_weight && !germinationWeightMap[step.recipe_id].requires_weight)) {
              germinationWeightMap[step.recipe_id] = {
                requires_weight: step.requires_weight || false,
                weight_lbs: step.weight_lbs || null
              };
            }
          }
        }
      });
      
      // Debug logging to help identify issues
      if (seedingRecipeIds.length > 0) {
        console.log('[fetchDailyTasks] Germination weight mapping:', {
          allRecipeIdsFromTasks: allRecipeIdsFromTasks.sort((a, b) => a - b),
          seedRequestRecipeIds: seedRequestRecipeIds.sort((a, b) => a - b),
          plantingScheduleRecipeIds: plantingScheduleRecipeIds.sort((a, b) => a - b),
          seedingRecipeIds: seedingRecipeIds.sort((a, b) => a - b),
          totalStepsFetched: allStepsForSeedingRecipes.length,
          germinationStepsFound: Object.keys(germinationWeightMap).length,
          weightMap: Object.fromEntries(
            Object.entries(germinationWeightMap).map(([k, v]) => [
              k,
              { requires_weight: v.requires_weight, weight_lbs: v.weight_lbs }
            ])
          ),
          // Show details for recipe_id 14 specifically if it's in the list
          recipe14Details: seedingRecipeIds.includes(14) 
            ? allStepsForSeedingRecipes.filter((s: any) => s.recipe_id === 14).map((s: any) => ({
                step_id: s.step_id,
                description_name: s.description_name,
                step_name: s.step_name,
                requires_weight: s.requires_weight,
                weight_lbs: s.weight_lbs,
                isGermination: (s.description_name || '').toLowerCase().trim() === 'germination' || 
                              (s.step_name || '').toLowerCase().trim() === 'germination'
              }))
            : 'Recipe 14 not in seedingRecipeIds'
        });
      }
    } else if (stepsError) {
      console.error('[fetchDailyTasks] Error fetching steps for seeding recipes:', stepsError);
    }

    // Transform view data into DailyTask objects
    // Filter out completed seed_request tasks and seeding-related tray_step tasks before mapping
    const filteredTasksData = allTasksData.filter((row: any) => {
      // Filter out seeding-related steps from tray_step tasks (seeding should only appear before trays are created)
      const taskNameLower = (row.task_name || '').toLowerCase();
      if (taskNameLower === 'harvest') {
        console.log('[fetchDailyTasks] Filtering out harvest task from view:', {
          task_name: row.task_name,
          task_source: row.task_source,
          recipe_id: row.recipe_id,
          tray_ids: row.tray_ids || row.tray_id,
        });
        return false;
      }
      
      if (row.task_source === 'tray_step') {
        const isSeedingStep = taskNameLower.includes('seed') && 
                             (taskNameLower.includes('tray') || taskNameLower === 'seed' || taskNameLower === 'seeding');
        if (isSeedingStep) {
          console.log('[fetchDailyTasks] Filtering out seeding step from tray_step tasks:', {
            task_name: row.task_name,
            recipe_id: row.recipe_id,
            reason: 'Seeding steps should only appear before trays are created'
          });
          return false; // Filter out
        }
      }
      
      // For seed_request tasks, check if they're completed
      if (row.task_source === 'seed_request') {
        // Check if task is completed based on trays_remaining or quantity_completed
        const traysRemaining = row.trays_remaining !== undefined ? row.trays_remaining : 
          (row.quantity || 0) - (row.quantity_completed || 0);
        
        // Also check if there's a completed task_completion for this recipe/date
        const completedKey = `sowing-${row.recipe_id || ''}`;
        const isCompletedInTaskCompletions = todayCompletedTaskKeys.has(completedKey);
        
        // Filter out if no trays remaining OR task is marked as completed
        if (traysRemaining <= 0 || isCompletedInTaskCompletions) {
          console.log('[fetchDailyTasks] Filtering out completed seed_request task:', {
            request_id: row.request_id,
            recipe_id: row.recipe_id,
            trays_remaining: traysRemaining,
            quantity_completed: row.quantity_completed,
            quantity: row.quantity,
            isCompletedInTaskCompletions
          });
          return false; // Filter out this task
        }
      }
      return true; // Keep this task
    });

    const tasks: DailyTask[] = filteredTasksData.map((row: any) => {
      // Determine action from task_name
      const taskName = row.task_name || '';
      let action = taskName;
      
      // Map task_source to action if needed
      if (row.task_source === 'soak_request') {
        action = 'Soak';
      } else if (row.task_source === 'seed_request') {
        action = 'Seed';
      } else if (row.task_source === 'expiring_seed') {
        action = 'Use or Discard Soaked Seed';
      } else if (row.task_source === 'planting_schedule') {
        // Harvest tasks from planting schedule - keep the task_name as-is
        action = taskName;
      } else if (row.task_source === 'order_fulfillment') {
        // At-risk tasks from order fulfillment - keep the task_name as-is
        action = taskName;
      } else {
        // For tray_step tasks, use task_name as action
        action = taskName;
      }

      // Determine status
      const isUrgent = row.task_source === 'expiring_seed' || 
                      row.task_source === 'seed_request' || 
                      row.task_source === 'planting_schedule' ||
                      row.task_source === 'order_fulfillment' ||
                      action.toLowerCase().includes('harvest') ||
                      action.toLowerCase().includes('at risk');
      
      // Create unique ID
      const taskId = `${row.task_source}-${row.request_id || row.task_name}-${row.recipe_name}-${taskDate}`;

      // Extract IDs for tray_step tasks
      let trayIds: number[] = [];
      let stepId: number | undefined = undefined;
      let recipeId: number = row.recipe_id || 0;
      
      // For seed_request tasks, ensure we have recipe_id (view might not include it)
      // Look it up from the request_id -> recipe_id map we created earlier
      if (row.task_source === 'seed_request' && !recipeId && row.request_id) {
        recipeId = requestIdToRecipeIdMap[row.request_id] || 0;
        if (recipeId) {
          console.log('[fetchDailyTasks] Found recipe_id for seed_request task from request_id:', {
            request_id: row.request_id,
            recipe_id: recipeId,
            recipe_name: row.recipe_name
          });
        }
      }

      // For tray_step tasks, extract step_id, tray_ids, and recipe_id from the view
      if (row.task_source === 'tray_step') {
        // Extract step_id (try various column name variations)
        stepId = row.step_id || row.stepId || row.step_id || undefined;
        
        // Extract tray_ids - could be an array, comma-separated string, or single value
        // Try various column name variations
        const trayIdsRaw = row.tray_ids || row.tray_id || row.trayIds || row.trayId;
        
        if (trayIdsRaw) {
          if (Array.isArray(trayIdsRaw)) {
            trayIds = trayIdsRaw.filter((id: any) => id != null && !isNaN(Number(id))).map((id: any) => Number(id));
          } else if (typeof trayIdsRaw === 'string') {
            // Handle comma-separated string or JSON string
            try {
              const parsed = JSON.parse(trayIdsRaw);
              if (Array.isArray(parsed)) {
                trayIds = parsed.filter((id: any) => id != null && !isNaN(Number(id))).map((id: any) => Number(id));
              } else {
                // Comma-separated string
                trayIds = trayIdsRaw.split(',').map((id: string) => parseInt(id.trim())).filter((id: number) => !isNaN(id));
              }
            } catch {
              // Not JSON, treat as comma-separated
              trayIds = trayIdsRaw.split(',').map((id: string) => parseInt(id.trim())).filter((id: number) => !isNaN(id));
            }
          } else if (typeof trayIdsRaw === 'number') {
            trayIds = [trayIdsRaw];
          }
        }
        
        // Ensure recipe_id is set (try various column name variations)
        recipeId = row.recipe_id || row.recipeId || row.recipe_id || 0;
        
        // Log for debugging if critical fields are missing
        if (!stepId || trayIds.length === 0 || !recipeId) {
          console.warn('[fetchDailyTasks] Missing critical fields for tray_step task:', {
            task_name: taskName,
            step_id: stepId,
            tray_ids: trayIds,
            recipe_id: recipeId,
            available_keys: Object.keys(row),
            row_sample: {
              step_id: row.step_id,
              stepId: row.stepId,
              tray_id: row.tray_id,
              tray_ids: row.tray_ids,
              recipe_id: row.recipe_id,
              recipeId: row.recipeId
            }
          });
        }
      }

      // For seeding tasks (seed_request and planting_schedule), use variety_name (growers look for variety names on seed bags)
      // For other tasks, use variety_name if available, otherwise recipe_name
      let cropName: string;
      if (row.task_source === 'seed_request' || row.task_source === 'planting_schedule') {
        // For seeding tasks, prioritize variety_name from recipes table
        cropName = allVarietyNameMap[row.recipe_id] || row.variety_name || row.recipe_name || 'Unknown';
      } else {
        // For other tasks, use variety_name if available, otherwise recipe_name
        cropName = row.variety_name || row.recipe_name || 'Unknown';
      }

      // Get germination weight info for seeding tasks
      const isSeedingTask = row.task_source === 'seed_request' || 
                           (row.task_source === 'planting_schedule' && action.toLowerCase().includes('seed'));
      const germinationWeight = isSeedingTask && recipeId ? germinationWeightMap[recipeId] : null;

      // Debug logging for seeding tasks (both with and without weight info)
      if (isSeedingTask && recipeId) {
        if (germinationWeight) {
          console.log('[fetchDailyTasks] Seeding task WITH germination weight info:', {
            recipeId,
            crop: cropName,
            taskSource: row.task_source,
            action,
            requiresWeight: germinationWeight.requires_weight,
            weightLbs: germinationWeight.weight_lbs
          });
        } else {
          console.log('[fetchDailyTasks] Seeding task WITHOUT germination weight info:', {
            recipeId,
            crop: cropName,
            taskSource: row.task_source,
            action,
            recipeIdInMap: recipeId in germinationWeightMap,
            allRecipeIdsInMap: Object.keys(germinationWeightMap).map(Number).sort((a, b) => a - b)
          });
        }
      }

      return {
        id: taskId,
        action,
        crop: cropName,
        batchId: 'N/A', // Will be selected during completion
        location: 'Not set',
        dayCurrent: 0,
        dayTotal: 0,
        trays: row.quantity || 1,
        traysRemaining: row.trays_remaining !== undefined ? row.trays_remaining : (row.quantity || 1), // Use trays_remaining from view if available
        status: isUrgent ? 'urgent' : 'pending',
        trayIds: trayIds, // Now properly extracted for tray_step tasks
        recipeId: recipeId,
        stepId: stepId, // Now properly extracted for tray_step tasks
        stepDescription: taskName,
        // New fields
        taskSource: row.task_source,
        requestId: row.request_id,
        quantity: row.quantity,
        quantityCompleted: row.quantity_completed || 0,
        stepColor: row.step_color,
        sourceType: row.source_type,
        customerName: row.customer_name,
        // Germination weight info for seeding tasks
        requiresWeight: germinationWeight?.requires_weight || false,
        weightLbs: germinationWeight?.weight_lbs || undefined,
      };
    });

    // Enrich tray_step tasks with dayCurrent and dayTotal
    // Calculate based on tray sow_date and recipe total days
    const trayStepTasksToEnrich = tasks.filter(t => t.taskSource === 'tray_step' && t.trayIds.length > 0 && t.recipeId);
    if (trayStepTasksToEnrich.length > 0) {
      try {
        // Get all unique tray IDs
        const allTrayIdsForEnrichment = [...new Set(trayStepTasksToEnrich.flatMap(t => t.trayIds))];
        const allRecipeIdsForEnrichment = [...new Set(trayStepTasksToEnrich.map(t => t.recipeId).filter(Boolean))];

        // Fetch tray data (sow_date, recipe_id, location, customer_id, batch_id)
        const { data: trayData, error: trayError } = await getSupabaseClient()
          .from('trays')
          .select('tray_id, sow_date, recipe_id, location, customer_id, batch_id')
          .in('tray_id', allTrayIdsForEnrichment);

        // Fetch recipe steps to calculate total days
        const { data: recipeSteps, error: stepsError } = await getSupabaseClient()
          .from('steps')
          .select('recipe_id, duration, duration_unit')
          .in('recipe_id', allRecipeIdsForEnrichment);

        if (!trayError && trayData && !stepsError && recipeSteps) {
          // Fetch customer names if any trays have customer_id
          const customerIds = [...new Set(trayData.map((t: any) => t.customer_id).filter(Boolean))];
          const customerMap: Record<number, string> = {};
          if (customerIds.length > 0) {
            const { data: customersData, error: customersError } = await getSupabaseClient()
              .from('customers')
              .select('customerid, name')
              .in('customerid', customerIds);
            
            if (!customersError && customersData) {
              customersData.forEach((c: any) => {
                customerMap[c.customerid] = c.name || '';
              });
            }
          }
          // Create maps for quick lookup
          const trayMap = new Map(trayData.map((t: any) => [t.tray_id, t]));
          
          // Calculate total days per recipe
          const totalDaysByRecipe: Record<number, number> = {};
          recipeSteps.forEach((step: any) => {
            if (!totalDaysByRecipe[step.recipe_id]) {
              totalDaysByRecipe[step.recipe_id] = 0;
            }
            const duration = step.duration || 0;
            const unit = (step.duration_unit || 'Days').toUpperCase();
            if (unit === 'DAYS') {
              totalDaysByRecipe[step.recipe_id] += duration;
            } else if (unit === 'HOURS') {
              totalDaysByRecipe[step.recipe_id] += (duration >= 12 ? 1 : 0);
            } else {
              totalDaysByRecipe[step.recipe_id] += duration;
            }
          });

          // Calculate days since sow for each tray
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          // Update tasks with calculated day counts, location, and customer info
          tasks.forEach(task => {
            if (task.taskSource === 'tray_step' && task.trayIds.length > 0 && task.recipeId) {
              // Get the first tray's data (for grouped tasks, use the first tray)
              const firstTrayId = task.trayIds[0];
              const tray = trayMap.get(firstTrayId);
              
              if (tray) {
                // Set location
                if (tray.location) {
                  task.location = tray.location;
                }
                
                // Set customer name if available
                if (tray.customer_id && customerMap[tray.customer_id]) {
                  task.customerName = customerMap[tray.customer_id];
                }
                
                // Set batch ID if available
                if (tray.batch_id) {
                  task.batchId = `B-${tray.batch_id}`;
                }
                
                // Calculate day counts
                if (tray.sow_date) {
                  const sowDate = parseLocalDate(tray.sow_date);
                  if (sowDate) {
                    const daysSinceSow = Math.max(1, Math.floor((today.getTime() - sowDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                    const totalDays = totalDaysByRecipe[task.recipeId] || 0;
                    
                    task.dayCurrent = daysSinceSow;
                    task.dayTotal = totalDays;
                  }
                }
              }
            }
          });
        }
      } catch (enrichError) {
        console.warn('[fetchDailyTasks] Error enriching tray_step tasks with day counts:', enrichError);
      }
    }

    // Filter out tray_step tasks where all tray_steps are completed
    // The view may still return them, but we should exclude them from the UI
    const trayStepTasksToCheck = tasks.filter(t => t.taskSource === 'tray_step' && t.stepId && t.trayIds.length > 0);
    
    if (trayStepTasksToCheck.length > 0) {
      // Collect all unique tray_id/step_id combinations to check in one query
      const trayStepCombos = new Set<string>();
      const taskToComboMap = new Map<string, string[]>();
      
      trayStepTasksToCheck.forEach(task => {
        const combos: string[] = [];
        task.trayIds.forEach(trayId => {
          const combo = `${trayId}-${task.stepId}`;
          combos.push(combo);
          trayStepCombos.add(combo);
        });
        taskToComboMap.set(task.id, combos);
      });

      // Query all tray_steps for these combinations in one go
      const allTrayIds = [...new Set(trayStepTasksToCheck.flatMap(t => t.trayIds))];
      const allStepIds = [...new Set(trayStepTasksToCheck.map(t => t.stepId!).filter(Boolean))];
      
      const { data: allTrayStepsStatus, error: statusError } = await getSupabaseClient()
        .from('tray_steps')
        .select('tray_id, step_id, completed, scheduled_date')
        .in('tray_id', allTrayIds)
        .in('step_id', allStepIds)
        .eq('scheduled_date', taskDate);

      if (!statusError && allTrayStepsStatus) {
        // Create a map of tray_id-step_id to completion status
        const completionMap = new Map<string, boolean>();
        allTrayStepsStatus.forEach((ts: any) => {
          const key = `${ts.tray_id}-${ts.step_id}`;
          completionMap.set(key, ts.completed === true);
        });

        // Filter out tasks where all tray_steps are completed
        const filteredTasks = tasks.filter(task => {
          if (task.taskSource === 'tray_step' && task.stepId && task.trayIds.length > 0) {
            const combos = taskToComboMap.get(task.id) || [];
            if (combos.length > 0) {
              const allCompleted = combos.every(combo => completionMap.get(combo) === true);
              if (allCompleted) {
                console.log('[fetchDailyTasks] Filtering out completed task:', {
                  task_name: task.action,
                  step_id: task.stepId,
                  tray_ids: task.trayIds
                });
                return false; // Filter out
              }
            }
          }
          return true; // Keep task
        });
        
        // Replace tasks with filtered tasks
        tasks.length = 0;
        tasks.push(...filteredTasks);
      }
    }

    // Add supplemental tasks, seeding, soaking, harvest tasks, and at-risk tasks
    // Deduplicate by ID to avoid duplicates
    const allTaskIds = new Set(tasks.map(t => t.id));
    const finalTasks = [...tasks];
    
    // Add seeding tasks
    for (const st of seedingTasks) {
      if (!allTaskIds.has(st.id)) {
        finalTasks.push(st);
        allTaskIds.add(st.id);
      }
    }
    
    // Add soaking tasks
    for (const sot of soakingTasks) {
      if (!allTaskIds.has(sot.id)) {
        finalTasks.push(sot);
        allTaskIds.add(sot.id);
      }
    }
    
    // Add supplemental tasks that don't already exist
    const filteredSupplementalTasks = supplementalTasks.filter((task) => {
      if (task.taskSource === 'tray_step' && task.action?.toLowerCase() === 'harvest') {
        console.log('[fetchDailyTasks] Filtering out harvest supplemental task:', {
          task_name: task.action,
          recipeId: task.recipeId,
          trayIds: task.trayIds,
          id: task.id
        });
        return false;
      }
      return true;
    });

    for (const st of filteredSupplementalTasks) {
      if (!allTaskIds.has(st.id)) {
        finalTasks.push(st);
        allTaskIds.add(st.id);
      }
    }
    
    // Add harvest tasks
    for (const ht of harvestTasks) {
      if (!allTaskIds.has(ht.id)) {
        finalTasks.push(ht);
        allTaskIds.add(ht.id);
      }
    }
    
    // Add watering tasks
    for (const wt of wateringTasks) {
      if (!allTaskIds.has(wt.id)) {
        finalTasks.push(wt);
        allTaskIds.add(wt.id);
      }
    }
    
    // Add at-risk tasks
    for (const at of atRiskTasks) {
      if (!allTaskIds.has(at.id)) {
        finalTasks.push(at);
        allTaskIds.add(at.id);
      }
    }

    // Add maintenance tasks
    for (const mt of maintenanceTasks) {
      if (!allTaskIds.has(mt.id)) {
        finalTasks.push(mt);
        allTaskIds.add(mt.id);
      }
    }

    const dedupedTasks: DailyTask[] = [];
    const seenTaskIds = new Set<string>();
    const duplicatesFound: any[] = [];
    
    for (const task of finalTasks) {
      if (!task.id) {
        dedupedTasks.push(task);
        continue;
      }
      if (seenTaskIds.has(task.id)) {
        console.log('[fetchDailyTasks] DUPLICATE DETECTED - Skipping duplicate task during dedup:', {
          id: task.id,
          action: task.action,
          crop: task.crop,
          taskSource: task.taskSource,
          trayIds: task.trayIds,
          recipeId: task.recipeId,
          stepId: task.stepId
        });
        duplicatesFound.push({
          id: task.id,
          action: task.action,
          crop: task.crop,
          taskSource: task.taskSource,
          trayIds: task.trayIds
        });
        continue;
      }
      seenTaskIds.add(task.id);
      dedupedTasks.push(task);
    }
    
    if (duplicatesFound.length > 0) {
      console.error('[fetchDailyTasks] FOUND DUPLICATES:', duplicatesFound);
    }

    console.log('[fetchDailyTasks] Final task breakdown:', {
      fromView: tasks.length,
      fromViewTasks: tasks.map(t => ({ action: t.action, crop: t.crop, taskSource: t.taskSource })),
      supplemental: filteredSupplementalTasks.length,
      seeding: seedingTasks.length,
      soaking: soakingTasks.length,
      harvest: harvestTasks.length,
      watering: wateringTasks.length,
      atRisk: atRiskTasks.length,
      maintenance: maintenanceTasks.length,
      total: dedupedTasks.length,
      seedingTasks: seedingTasks.map(t => ({ id: t.id, action: t.action, crop: t.crop, deliveryDate: t.deliveryDate })),
      soakingTasks: soakingTasks.map(t => ({ id: t.id, action: t.action, crop: t.crop, deliveryDate: t.deliveryDate })),
      wateringTasks: wateringTasks.map(t => ({ id: t.id, action: t.action, crop: t.crop, notes: t.notes })),
      atRiskTasks: atRiskTasks.map(t => ({ id: t.id, action: t.action, crop: t.crop })),
      maintenanceTasks: maintenanceTasks.map(t => ({ id: t.id, action: t.action, crop: t.crop })),
      finalTasksByType: {
        soak: finalTasks.filter(t => t.action === 'Soak').length,
        seed: finalTasks.filter(t => t.action === 'Seed').length,
        water: finalTasks.filter(t => t.action === 'Water').length,
        atRisk: finalTasks.filter(t => t.action.toLowerCase().includes('at risk')).length,
      harvest: finalTasks.filter(t => t.action.toLowerCase().startsWith('harvest')).length
      }
    });
    const harvestActions = dedupedTasks.filter(t => t.action?.toLowerCase().startsWith('harvest'));
    console.log('[fetchDailyTasks] Deduped task summary before return:', {
      total: dedupedTasks.length,
      harvest: harvestActions.length,
      harvestIds: harvestActions.slice(0, 10).map((t) => ({ id: t.id, notes: t.notes }))
    });
    
    return dedupedTasks;

  } catch (error) {
    console.error('Error fetching daily tasks:', error);
    return [];
  }
};

const checkRecipeRequiresSoak = async (recipeId?: number): Promise<boolean> => {
  if (!recipeId) return false;
  try {
    const { data, error } = await getSupabaseClient().rpc('recipe_has_soak', {
      p_recipe_id: recipeId
    });
    if (error) {
      console.error('[DailyFlow] Error checking recipe soak requirement:', error);
      return false;
    }
    return !!(data && Array.isArray(data) ? data[0]?.has_soak : data?.has_soak);
  } catch (error) {
    console.error('[DailyFlow] Unexpected error checking recipe soak requirement:', error);
    return false;
  }
};

const fetchAvailableSoakedSeedForRecipe = async (
  farmUuid: string,
  recipeId?: number,
  varietyId?: number
): Promise<any | null> => {
  if (!farmUuid || (!recipeId && !varietyId)) {
    return null;
  }

  try {
    let query = getSupabaseClient()
      .from('available_soaked_seed')
      .select('*')
      .eq('farm_uuid', farmUuid)
      .gt('quantity_remaining', 0)
      .order('expires_at', { ascending: true })
      .limit(1);

    if (recipeId && varietyId) {
      query = query.or(`recipe_id.eq.${recipeId},variety_id.eq.${varietyId}`);
    } else if (recipeId) {
      query = query.eq('recipe_id', recipeId);
    } else if (varietyId) {
      query = query.eq('variety_id', varietyId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[DailyFlow] Error fetching available soaked seed:', error);
      return null;
    }

    if (!data) return null;
    if (Array.isArray(data)) {
      return data[0] ?? null;
    }

    return data;
  } catch (error) {
    console.error('[DailyFlow] Unexpected error fetching available soaked seed:', error);
    return null;
  }
};

/**
 * Mark a task as completed by updating tray_steps
 * Uses actual schema: status='Completed', completed_date, completed_by
 * For harvest tasks, optionally records the yield
 * For Soak, Seed, and Watering tasks, records completion in task_completions
 * Watering tasks do NOT update tray_steps - they only use task_completions
 */
export const completeTask = async (task: DailyTask, yieldValue?: number, batchId?: number, taskDate?: string): Promise<boolean> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return false;

    const { farmUuid, userId } = JSON.parse(sessionData);
    const now = new Date().toISOString();
    // Use provided taskDate or default to today
    let taskDateStr: string;
    if (taskDate) {
      taskDateStr = taskDate;
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      taskDateStr = formatDateString(today); // Use formatDateString to avoid UTC timezone shift
    }

    // Handle Watering tasks - use task_completions instead of tray_steps
    if (task.action === 'Water') {
      if (!userId) {
        throw new Error('User ID not found in session');
      }

      console.log('[DailyFlow] Completing watering task:', {
        action: task.action,
        recipeId: task.recipeId,
        taskDate: taskDateStr,
        farmUuid,
        trays: task.trays
      });

      // Record completion in task_completions table
      const completionData: any = {
        farm_uuid: farmUuid,
        task_type: 'watering',
        task_date: taskDateStr,
        recipe_id: task.recipeId,
        status: 'completed',
        completed_at: now,
        completed_by: userId,
        customer_name: null,
        product_name: task.crop || null, // Save recipe name to product_name
      };

      console.log('[DailyFlow] Upserting watering completion:', completionData);

      // Try upsert with the full constraint first
      const { error: completionError } = await getSupabaseClient()
        .from('task_completions')
        .upsert(completionData, {
          onConflict: 'farm_uuid,task_type,task_date,recipe_id,customer_name,product_name'
        });

      // If that fails, try without customer_name and product_name in the conflict
      if (completionError) {
        console.log('[DailyFlow] First upsert failed, trying alternative:', completionError);
        const { error: altError } = await getSupabaseClient()
          .from('task_completions')
          .upsert(completionData, {
            onConflict: 'farm_uuid,task_type,task_date,recipe_id'
          });
        
        if (altError) {
          console.error('[DailyFlow] Error recording watering completion (both attempts failed):', altError);
          console.error('[DailyFlow] Completion data attempted:', completionData);
          throw altError;
        }
      }

      console.log('[DailyFlow] Watering task completion recorded successfully');
      return true;
    }

    // Handle Soak and Seed tasks (from planting schedule)
    if (task.action === 'Soak' || task.action === 'Seed') {
      const taskType = task.action === 'Soak' ? 'soaking' : 'sowing';
      
      console.log('[DailyFlow] Completing task:', {
        action: task.action,
        taskType,
        recipeId: task.recipeId,
        taskDate: taskDateStr,
        farmUuid,
        trays: task.trays
      });

      // For Seed tasks, create the actual trays
      if (task.action === 'Seed') {
        const { data: recipeData, error: recipeError } = await getSupabaseClient()
          .from('recipes')
          .select('recipe_id, recipe_name, variety_id, variety_name')
          .eq('recipe_id', task.recipeId)
          .eq('farm_uuid', farmUuid)
          .single();

        if (recipeError) {
          console.error('[DailyFlow] Error fetching recipe:', recipeError);
          throw recipeError;
        }

        if (!recipeData) {
          throw new Error(`Recipe ${task.recipeId} not found`);
        }

        const varietyName = recipeData.variety_name || recipeData.recipe_name || '';
        const recipeIdForSoak = task.recipeId ?? recipeData.recipe_id;
        const numberOfTrays = Math.max(1, task.trays || 1);
        let usedSoakedSeedEntry: any | null = null;

        if (recipeIdForSoak) {
          const requiresSoak = await checkRecipeRequiresSoak(recipeIdForSoak);
          if (requiresSoak) {
            const soakedSeedEntry = await fetchAvailableSoakedSeedForRecipe(
              farmUuid,
              recipeIdForSoak,
              recipeData.variety_id
            );
            if (soakedSeedEntry) {
              try {
                const traysFromSoaked = await useLeftoverSoakedSeed(
                  soakedSeedEntry.soaked_id,
                  numberOfTrays,
                  task.requestId ?? null,
                  recipeIdForSoak,
                  taskDateStr,
                  userId
                );
                if (traysFromSoaked > 0) {
                  usedSoakedSeedEntry = soakedSeedEntry;
                  console.log('[DailyFlow] Creating trays from soaked seed:', {
                    soakedId: soakedSeedEntry.soaked_id,
                    recipeId: recipeIdForSoak,
                    traysRequested: numberOfTrays,
                    traysCreated: traysFromSoaked
                  });
                } else {
                  console.warn(
                    '[DailyFlow] Soaked seed RPC returned zero trays for recipe',
                    recipeIdForSoak
                  );
                }
              } catch (error) {
                console.error('[DailyFlow] Error creating trays from soaked seed:', error);
              }
            }
          }
        }

        if (!usedSoakedSeedEntry) {
          console.log('[DailyFlow] completeTask called with batchId:', batchId);
          console.log('[DailyFlow] completeTask task object:', {
            id: task.id,
            recipeId: task.recipeId,
            requestId: task.requestId,
            taskSource: task.taskSource,
          });

          if (!batchId) {
            throw new Error('Batch ID is required for seeding tasks');
          }

          if (!userId) {
            throw new Error('User ID not found in session');
          }

          const sowDateISO = taskDateStr ? new Date(taskDateStr + 'T00:00:00').toISOString() : now;
          const requests = Array.from({ length: numberOfTrays }, () => ({
            customer_name: task.customerName ?? null,
            customer_id: task.customerId ?? null,
            standing_order_id: task.standingOrderId ?? null,
            order_schedule_id: task.orderScheduleId ?? null,
            variety_name: varietyName,
            recipe_name: recipeData.recipe_name,
            recipe_id: task.recipeId,
            farm_uuid: farmUuid,
            user_id: userId,
            requested_at: sowDateISO,
            seed_date: taskDateStr, // The intended sow_date (YYYY-MM-DD)
            batch_id: batchId,
          }));

          console.log('[DailyFlow] Using batch_id:', batchId, 'for variety:', varietyName);
          console.log('[DailyFlow] Creating tray creation requests:', {
            numberOfTrays,
            taskTrays: task.trays,
            requestsCount: requests.length,
            recipeName: recipeData.recipe_name,
            batchId
          });

          const { error: requestError } = await getSupabaseClient()
            .from('tray_creation_requests')
            .insert(requests);

          if (requestError) {
            console.error('[DailyFlow] Error creating tray requests:', requestError);
            throw requestError;
          }

          console.log('[DailyFlow] Tray creation requests created successfully:', {
            requested: requests.length
          });
        }
      }

      // Record completion in task_completions table
      // Note: customer_name and product_name are optional and may be null
      // For Soak/Seed tasks, we only need farm_uuid, task_type, task_date, recipe_id
      // For Seed tasks, batch_id is required to trigger tray creation
      const completionData: any = {
        farm_uuid: farmUuid,
        task_type: taskType,
        task_date: taskDateStr,
        recipe_id: task.recipeId,
        status: 'completed',
        completed_at: now,
        completed_by: userId,
        customer_name: null,
        product_name: null,
      };

      // Include batch_id for sowing tasks (required for tray creation trigger)
      if (task.action === 'Seed' && batchId) {
        completionData.batch_id = batchId;
      }

      console.log('[DailyFlow] Upserting completion:', completionData);

      // Try upsert with the full constraint first
      const { error: completionError } = await getSupabaseClient()
        .from('task_completions')
        .upsert(completionData, {
          onConflict: 'farm_uuid,task_type,task_date,recipe_id,customer_name,product_name'
        });

      // If that fails, try without customer_name and product_name in the conflict
      if (completionError) {
        console.log('[DailyFlow] First upsert failed, trying alternative:', completionError);
        const { error: altError } = await getSupabaseClient()
          .from('task_completions')
          .upsert(completionData, {
            onConflict: 'farm_uuid,task_type,task_date,recipe_id'
          });
        
        if (altError) {
          console.error('[DailyFlow] Error recording task completion (both attempts failed):', altError);
          console.error('[DailyFlow] Completion data attempted:', completionData);
          throw altError;
        }
      }

      console.log('[DailyFlow] Task completion recorded successfully');
      if (task.action === 'Seed') {
        try {
          await markSeedingTrayStepsCompleted({
            farmUuid,
            recipeId: task.recipeId,
            taskDateStr,
            trayIds: task.trayIds,
            completedAt: now,
          });
        } catch (seedingError) {
          console.error('[DailyFlow] Error marking seeding tray_steps complete:', seedingError);
        }
      }
      return true;
    }

    // If it's a harvest action, update the harvest_date and yield on the trays
    if (task.action === 'Harvest') {
      // Calculate yield per tray if provided
      const yieldPerTray = yieldValue && task.trays > 0 ? yieldValue / task.trays : undefined;

      const updateData: Record<string, any> = { harvest_date: now, status: 'harvested' };
      if (yieldPerTray !== undefined) {
        updateData.yield = yieldPerTray;
      }

      const { error: harvestError } = await getSupabaseClient()
        .from('trays')
        .update(updateData)
        .in('tray_id', task.trayIds)
        .eq('farm_uuid', farmUuid);

      if (harvestError) {
        console.error('Error updating harvest_date:', harvestError);
        throw harvestError;
      }
    }

    // Handle Maintenance tasks - record completion in task_completions
    if ((task as any).taskSource === 'maintenance') {
      if (!userId) {
        throw new Error('User ID not found in session');
      }

      // Extract maintenance_task_id from batchId (format: "maintenance-{id}" or "maintenance-{id}-{date}")
      let maintenanceTaskId: number | null = null;
      if (task.batchId && typeof task.batchId === 'string' && task.batchId.startsWith('maintenance-')) {
        const parts = task.batchId.split('-');
        if (parts.length >= 2) {
          const parsed = parseInt(parts[1], 10);
          if (!isNaN(parsed)) {
            maintenanceTaskId = parsed;
          }
        }
      }

      console.log('[DailyFlow] Completing maintenance task:', {
        action: task.action,
        batchId: task.batchId,
        maintenanceTaskId,
        taskDate: taskDateStr,
        farmUuid
      });

      // Record completion in task_completions table
      const completionData: any = {
        farm_uuid: farmUuid,
        task_type: 'maintenance',
        task_date: taskDateStr,
        maintenance_task_id: maintenanceTaskId,
        recipe_id: null, // Maintenance tasks don't have recipes
        status: 'completed',
        completed_at: now,
        completed_by: userId,
        customer_name: null,
        product_name: task.action || null, // Store task name in product_name
      };

      console.log('[DailyFlow] Inserting maintenance completion:', completionData);

      // Use insert instead of upsert since maintenance tasks use maintenance_task_id for uniqueness
      // First check if already completed today
      const { data: existingCompletion, error: checkError } = await getSupabaseClient()
        .from('task_completions')
        .select('completion_id')
        .eq('farm_uuid', farmUuid)
        .eq('task_type', 'maintenance')
        .eq('task_date', taskDateStr)
        .eq('maintenance_task_id', maintenanceTaskId)
        .maybeSingle();

      if (checkError) {
        console.error('[DailyFlow] Error checking existing maintenance completion:', checkError);
        throw checkError;
      }

      if (existingCompletion) {
        console.log('[DailyFlow] Maintenance task already completed today, updating:', existingCompletion.completion_id);
        const { error: updateError } = await getSupabaseClient()
          .from('task_completions')
          .update({
            status: 'completed',
            completed_at: now,
            completed_by: userId,
          })
          .eq('completion_id', existingCompletion.completion_id);

        if (updateError) {
          console.error('[DailyFlow] Error updating maintenance completion:', updateError);
          throw updateError;
        }
      } else {
        const { error: insertError } = await getSupabaseClient()
          .from('task_completions')
          .insert(completionData);

        if (insertError) {
          console.error('[DailyFlow] Error recording maintenance completion:', insertError);
          console.error('[DailyFlow] Completion data attempted:', completionData);
          throw insertError;
        }
      }

      console.log('[DailyFlow] Maintenance task completion recorded successfully');
      return true;
    }

    // Update tray_steps for all tasks (including harvest)
    // Note: Watering tasks are handled separately above and do NOT update tray_steps
    // Use the actual schema: completed (boolean), completed_at (timestamp)
    if (task.stepId && task.action !== 'Water') {
      console.log('[DailyFlow] Completing task with stepId:', {
        action: task.action,
        stepId: task.stepId,
        trayIds: task.trayIds,
        trayCount: task.trayIds.length
      });

      // First, ensure tray_steps records exist for all tray/step combinations
      // For recurring tasks (like watering), we need to track completion by scheduled_date
      for (const trayId of task.trayIds) {
        // Check if record exists using composite key (tray_id, step_id, scheduled_date)
        // For recurring tasks, scheduled_date is critical to track completion per day
        const { data: existing, error: checkError } = await getSupabaseClient()
          .from('tray_steps')
          .select('tray_id, step_id, scheduled_date')
          .eq('tray_id', trayId)
          .eq('step_id', task.stepId)
          .eq('scheduled_date', taskDateStr)
          .maybeSingle();

        if (checkError) {
          console.error('Error checking tray_steps:', checkError);
          throw checkError;
        }

        if (!existing) {
          // Insert if doesn't exist - include scheduled_date for recurring tasks
          const { error: insertError } = await getSupabaseClient()
            .from('tray_steps')
            .insert({
              tray_id: trayId,
              step_id: task.stepId,
              scheduled_date: taskDateStr,
              completed: true,
              completed_at: now,
              status: 'Completed',
            });

          if (insertError) {
            console.error('Error inserting tray_steps:', insertError);
            throw insertError;
          }
          console.log('[DailyFlow] Inserted tray_steps for tray:', trayId, 'step:', task.stepId, 'date:', taskDateStr);
        } else {
          // Update using composite key including scheduled_date
          const { error: updateError } = await getSupabaseClient()
            .from('tray_steps')
            .update({
              completed: true,
              completed_at: now,
              status: 'Completed',
            })
            .eq('tray_id', trayId)
            .eq('step_id', task.stepId)
            .eq('scheduled_date', taskDateStr);

          if (updateError) {
            console.error('Error updating tray_steps:', updateError);
            throw updateError;
          }
          console.log('[DailyFlow] Updated tray_steps for tray:', trayId, 'step:', task.stepId, 'date:', taskDateStr);
        }
      }
    } else {
      // Log warning if task doesn't have stepId (this shouldn't happen for water tasks)
      console.warn('[DailyFlow] Task completed without stepId:', {
        action: task.action,
        crop: task.crop,
        batchId: task.batchId,
        trayIds: task.trayIds,
        recipeId: task.recipeId
      });
      
      // For tasks without stepId, try to find the current step from the recipe
      // This is a fallback for edge cases where stepId might be missing
      if (task.trayIds.length > 0 && task.recipeId) {
        try {
          // Fetch the recipe steps to find the current step
          const { data: stepsData, error: stepsError } = await getSupabaseClient()
            .from('steps')
            .select('step_id, step_order, sequence_order, description_name, step_description')
            .eq('recipe_id', task.recipeId)
            .order('step_order', { ascending: true })
            .order('sequence_order', { ascending: true });

          if (!stepsError && stepsData && stepsData.length > 0) {
            // Find the step that matches the task action
            const matchingStep = stepsData.find((step: any) => {
              const desc = (step.description_name || step.step_description || '').toLowerCase();
              const actionLower = task.action.toLowerCase();
              return desc.includes(actionLower) || actionLower.includes('water');
            });

            if (matchingStep) {
              console.log('[DailyFlow] Found matching step for task without stepId:', matchingStep.step_id);
              // Update tray_steps with the found stepId
              for (const trayId of task.trayIds) {
                const { data: existing, error: checkError } = await getSupabaseClient()
                  .from('tray_steps')
                  .select('tray_id, step_id')
                  .eq('tray_id', trayId)
                  .eq('step_id', matchingStep.step_id)
                  .maybeSingle();

                if (checkError) {
                  console.error('Error checking tray_steps (fallback):', checkError);
                  continue;
                }

                if (!existing) {
                  const { error: insertError } = await getSupabaseClient()
                    .from('tray_steps')
                    .insert({
                      tray_id: trayId,
                      step_id: matchingStep.step_id,
                      completed: true,
                      completed_at: now,
                      status: 'Completed',
                    });

                  if (insertError) {
                    console.error('Error inserting tray_steps (fallback):', insertError);
                  } else {
                    console.log('[DailyFlow] Inserted tray_steps (fallback) for tray:', trayId, 'step:', matchingStep.step_id);
                  }
                } else {
                  const { error: updateError } = await getSupabaseClient()
                    .from('tray_steps')
                    .update({
                      completed: true,
                      completed_at: now,
                      status: 'Completed',
                    })
                    .eq('tray_id', trayId)
                    .eq('step_id', matchingStep.step_id);

                  if (updateError) {
                    console.error('Error updating tray_steps (fallback):', updateError);
                  } else {
                    console.log('[DailyFlow] Updated tray_steps (fallback) for tray:', trayId, 'step:', matchingStep.step_id);
                  }
                }
              }
            }
          }
        } catch (fallbackError) {
          console.error('[DailyFlow] Error in fallback stepId lookup:', fallbackError);
        }
      }
    }

    return true;
  } catch (error: any) {
    console.error('Error completing task:', error);
    // Re-throw the error so the caller can display the error message
    // The error message from getSupabaseClient() is in error.message
    throw error;
  }
};

interface MarkSeedingTrayStepsOptions {
  farmUuid: string;
  recipeId?: number;
  taskDateStr?: string;
  trayIds?: number[];
  completedAt?: string;
}

const markSeedingTrayStepsCompleted = async ({
  farmUuid,
  recipeId,
  taskDateStr,
  trayIds,
  completedAt,
}: MarkSeedingTrayStepsOptions): Promise<void> => {
  console.log('🔍 [markSeedingTrayStepsCompleted] CALLED with params:', {
    farmUuid,
    recipeId,
    taskDateStr,
    trayIds,
    completedAt,
  });

  if (!farmUuid || !recipeId) {
    console.warn('⚠️ [markSeedingTrayStepsCompleted] Missing required params - farmUuid or recipeId');
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    console.error('❌ [markSeedingTrayStepsCompleted] No Supabase client');
    return;
  }

  const targetDate = taskDateStr || formatDateString(new Date());
  const now = completedAt || new Date().toISOString();
  console.log('📅 [markSeedingTrayStepsCompleted] Using dates:', { targetDate, now });

  // ✅ FIX: Fetch BOTH seeding AND soaking steps
  const { data: allSteps, error: stepsError } = await client
    .from('steps')
    .select('step_id, step_name')
    .eq('recipe_id', recipeId)
    .or('step_name.ilike.%seed%,step_name.ilike.%soak%');

  if (stepsError) {
    console.error('❌ [markSeedingTrayStepsCompleted] Error fetching seeding/soaking steps:', stepsError);
    return;
  }

  console.log('📋 [markSeedingTrayStepsCompleted] Found steps from database:', allSteps);

  // Separate seeding and soaking steps
  const seedSteps: number[] = [];
  const soakSteps: number[] = [];
  
  (allSteps || []).forEach((step: any) => {
    const stepNameLower = (step.step_name || '').toLowerCase();
    if (stepNameLower.includes('soak')) {
      soakSteps.push(step.step_id);
    } else if (stepNameLower.includes('seed')) {
      seedSteps.push(step.step_id);
    }
  });

  console.log('🎯 [markSeedingTrayStepsCompleted] Categorized steps:', {
    seedSteps,
    soakSteps,
    seedStepCount: seedSteps.length,
    soakStepCount: soakSteps.length,
  });

  if (seedSteps.length === 0 && soakSteps.length === 0) {
    console.warn('⚠️ [markSeedingTrayStepsCompleted] No seeding or soaking steps found for recipe:', recipeId);
    return;
  }

  const allStepIds = [...seedSteps, ...soakSteps];

  // ✅ FIX: ALWAYS fetch tray_ids from trays table first to ensure farm_uuid filtering
  const { data: farmTrays, error: traysError } = await client
    .from('trays')
    .select('tray_id')
    .eq('farm_uuid', farmUuid)
    .eq('recipe_id', recipeId)
    .is('harvest_date', null); // Only active trays

  if (traysError) {
    console.error('❌ [markSeedingTrayStepsCompleted] Error fetching trays for farm:', traysError);
    return;
  }

  const farmTrayIds = (farmTrays || []).map((t: any) => t.tray_id);
  console.log('🔢 [markSeedingTrayStepsCompleted] Farm trays for this recipe:', {
    farmTrayIds,
    count: farmTrayIds.length,
  });
  
  if (farmTrayIds.length === 0) {
    console.warn('⚠️ [markSeedingTrayStepsCompleted] No active trays found for farm/recipe:', { farmUuid, recipeId });
    return;
  }

  // If trayIds provided, intersect with farm tray IDs (security: only update trays that belong to farm)
  const effectiveTrayIds = trayIds && trayIds.length > 0
    ? farmTrayIds.filter(id => trayIds.includes(id))
    : farmTrayIds;

  console.log('✅ [markSeedingTrayStepsCompleted] Effective tray IDs after filtering:', {
    providedTrayIds: trayIds,
    farmTrayIds,
    effectiveTrayIds,
    count: effectiveTrayIds.length,
  });

  if (effectiveTrayIds.length === 0) {
    console.warn('⚠️ [markSeedingTrayStepsCompleted] No matching trays after filtering:', { farmUuid, recipeId, providedTrayIds: trayIds });
    return;
  }

  // ✅ Query tray_steps with the verified tray IDs
  let trayStepsQuery = client
    .from('tray_steps')
    .select('tray_step_id, step_id, tray_id')
    .in('step_id', allStepIds)
    .eq('completed', false)
    .in('tray_id', effectiveTrayIds);

  const dateConditions = [];
  if (targetDate) {
    dateConditions.push(`scheduled_date.eq.${targetDate}`);
  }
  dateConditions.push('scheduled_date.is.null');

  if (dateConditions.length > 0) {
    trayStepsQuery = trayStepsQuery.or(dateConditions.join(','));
  }

  console.log('🔎 [markSeedingTrayStepsCompleted] Querying tray_steps with:', {
    stepIds: allStepIds,
    trayIds: effectiveTrayIds,
    completed: false,
    dateConditions: dateConditions.join(','),
  });

  const { data: trayStepsToUpdate, error: trayStepsError } = await trayStepsQuery;

  if (trayStepsError) {
    console.error('❌ [markSeedingTrayStepsCompleted] Error querying tray_steps:', trayStepsError);
    return;
  }

  console.log('📊 [markSeedingTrayStepsCompleted] Found tray_steps to update:', {
    traySteps: trayStepsToUpdate,
    count: trayStepsToUpdate?.length || 0,
  });

  if (!trayStepsToUpdate || trayStepsToUpdate.length === 0) {
    console.warn('⚠️ [markSeedingTrayStepsCompleted] No tray_steps found to update! This means:');
    console.warn('  - Either tray_steps records don\'t exist for these trays');
    console.warn('  - Or they are already marked as completed');
    console.warn('  - Or the date filter is excluding them');
    return;
  }

  // ✅ FIX: Mark seeding and soaking steps separately with different completed_at times
  // Seeding steps: completed at sow_date (today)
  // Soaking steps: completed at sow_date - 1 day (because soaking happens the day before)
  
  const seedingTrayStepIds = trayStepsToUpdate
    .filter((ts: any) => seedSteps.includes(ts.step_id))
    .map((ts: any) => ts.tray_step_id);

  const soakingTrayStepIds = trayStepsToUpdate
    .filter((ts: any) => soakSteps.includes(ts.step_id))
    .map((ts: any) => ts.tray_step_id);

  console.log('🎯 [markSeedingTrayStepsCompleted] Separated tray_steps by type:', {
    seedingTrayStepIds,
    soakingTrayStepIds,
    seedingCount: seedingTrayStepIds.length,
    soakingCount: soakingTrayStepIds.length,
  });

  // Mark seeding steps as completed with sow_date
  if (seedingTrayStepIds.length > 0) {
    console.log('🌱 [markSeedingTrayStepsCompleted] Updating SEEDING tray_steps:', {
      ids: seedingTrayStepIds,
      completedAt: now,
    });

    const { error: seedUpdateError } = await client
      .from('tray_steps')
      .update({
        completed: true,
        completed_at: now,
        status: 'Completed',
      })
      .in('tray_step_id', seedingTrayStepIds);

    if (seedUpdateError) {
      console.error('❌ [markSeedingTrayStepsCompleted] Error updating seeding tray_steps:', seedUpdateError);
    } else {
      console.log('✅ [markSeedingTrayStepsCompleted] Successfully marked seeding tray_steps as completed:', seedingTrayStepIds.length);
    }
  } else {
    console.log('ℹ️ [markSeedingTrayStepsCompleted] No seeding tray_steps to update');
  }

  // ✅ FIX: Mark soaking steps as completed with sow_date - 1 day
  if (soakingTrayStepIds.length > 0) {
    // Calculate completed_at for soak steps (1 day before seeding)
    const soakCompletedAt = new Date(now);
    soakCompletedAt.setDate(soakCompletedAt.getDate() - 1);
    const soakCompletedAtISO = soakCompletedAt.toISOString();

    console.log('💧 [markSeedingTrayStepsCompleted] Updating SOAKING tray_steps:', {
      ids: soakingTrayStepIds,
      completedAt: soakCompletedAtISO,
    });

    const { error: soakUpdateError } = await client
      .from('tray_steps')
      .update({
        completed: true,
        completed_at: soakCompletedAtISO, // ✅ 1 day before seeding
        status: 'Completed',
      })
      .in('tray_step_id', soakingTrayStepIds);

    if (soakUpdateError) {
      console.error('❌ [markSeedingTrayStepsCompleted] Error updating soaking tray_steps:', soakUpdateError);
    } else {
      console.log('✅ [markSeedingTrayStepsCompleted] Successfully marked soaking tray_steps as completed:', {
        count: soakingTrayStepIds.length,
        completedAt: soakCompletedAtISO
      });
    }
  } else {
    console.log('ℹ️ [markSeedingTrayStepsCompleted] No soaking tray_steps to update');
  }

  console.log('✅ [markSeedingTrayStepsCompleted] COMPLETED');
};

/**
 * Skip a task/step - mark it as skipped so it doesn't show up anymore
 */
export const skipTask = async (task: DailyTask): Promise<boolean> => {
  try {
    const now = new Date().toISOString();

    if (!task.stepId) return false;

    // Mark the step as skipped for all affected trays
    for (const trayId of task.trayIds) {
      // Check if record exists using composite key (tray_id, step_id)
      const { data: existing, error: checkError } = await getSupabaseClient()
        .from('tray_steps')
        .select('tray_id, step_id')
        .eq('tray_id', trayId)
        .eq('step_id', task.stepId)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking tray_steps:', checkError);
        throw checkError;
      }

      if (!existing) {
        // Insert if doesn't exist
        const { error: insertError } = await getSupabaseClient()
          .from('tray_steps')
          .insert({
            tray_id: trayId,
            step_id: task.stepId,
            skipped: true,
            skipped_at: now,
          });

        if (insertError) {
          console.error('Error inserting tray_steps:', insertError);
          throw insertError;
        }
      } else {
        // Update using composite key
        const { error: updateError } = await getSupabaseClient()
          .from('tray_steps')
          .update({
            skipped: true,
            skipped_at: now,
          })
          .eq('tray_id', trayId)
          .eq('step_id', task.stepId);

        if (updateError) {
          console.error('Error updating tray_steps:', updateError);
          throw updateError;
        }
      }
    }

    // Log activity after successful skip
    await logActivity(
      'task_canceled',
      `Skipped task: ${task.action} - ${task.crop}`,
      {
        task_type: task.action?.toLowerCase() || 'unknown',
        step_id: task.stepId,
        step_description: task.stepDescription || null,
        recipe_id: task.recipeId || null,
        recipe_name: task.crop || null,
        tray_ids: task.trayIds,
        tray_count: task.trays || task.trayIds.length,
        task_date: task.dayCurrent ? `Day ${task.dayCurrent} of ${task.dayTotal}` : null,
      }
    );

    return true;
  } catch (error) {
    console.error('Error skipping task:', error);
    return false;
  }
};

/**
 * Skip a missed step
 */
export const skipMissedStep = async (missedStep: MissedStep): Promise<boolean> => {
  try {
    const now = new Date().toISOString();

    for (const trayId of missedStep.trayIds) {
      // Check if record exists using composite key (tray_id, step_id)
      const { data: existing, error: checkError } = await getSupabaseClient()
        .from('tray_steps')
        .select('tray_id, step_id')
        .eq('tray_id', trayId)
        .eq('step_id', missedStep.stepId)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking tray_steps:', checkError);
        throw checkError;
      }

      if (!existing) {
        const { error: insertError } = await getSupabaseClient()
          .from('tray_steps')
          .insert({
            tray_id: trayId,
            step_id: missedStep.stepId,
            skipped: true,
            skipped_at: now,
          });

        if (insertError) throw insertError;
      } else {
        // Update using composite key
        const { error: updateError } = await getSupabaseClient()
          .from('tray_steps')
          .update({
            skipped: true,
            skipped_at: now,
          })
          .eq('tray_id', trayId)
          .eq('step_id', missedStep.stepId);

        if (updateError) throw updateError;
      }
    }

    // Log activity after successful skip
    await logActivity(
      'task_canceled',
      `Skipped missed step: ${missedStep.description || 'Step ' + missedStep.stepId}`,
      {
        task_type: 'missed_step',
        step_id: missedStep.stepId,
        step_description: missedStep.description || null,
        expected_day: missedStep.expectedDay || null,
        tray_ids: missedStep.trayIds,
        tray_count: missedStep.trayIds.length,
      }
    );

    return true;
  } catch (error) {
    console.error('Error skipping missed step:', error);
    return false;
  }
};

/**
 * Mark a missed step as completed (catch up)
 */
export const completeMissedStep = async (missedStep: MissedStep): Promise<boolean> => {
  try {
    const now = new Date().toISOString();

    for (const trayId of missedStep.trayIds) {
      // Check if record exists using composite key (tray_id, step_id)
      const { data: existing, error: checkError } = await getSupabaseClient()
        .from('tray_steps')
        .select('tray_id, step_id')
        .eq('tray_id', trayId)
        .eq('step_id', missedStep.stepId)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking tray_steps:', checkError);
        throw checkError;
      }

      if (!existing) {
        const { error: insertError } = await getSupabaseClient()
          .from('tray_steps')
          .insert({
            tray_id: trayId,
            step_id: missedStep.stepId,
            completed: true,
            completed_at: now,
            status: 'Completed',
          });

        if (insertError) throw insertError;
      } else {
        // Update using composite key
        const { error: updateError } = await getSupabaseClient()
          .from('tray_steps')
          .update({
            completed: true,
            completed_at: now,
            status: 'Completed',
            skipped: false,
            skipped_at: null,
          })
          .eq('tray_id', trayId)
          .eq('step_id', missedStep.stepId);

        if (updateError) throw updateError;
      }
    }

    return true;
  } catch (error) {
    console.error('Error completing missed step:', error);
    return false;
  }
};

/**
 * Bulk skip all missed steps for a task
 */
export const skipAllMissedSteps = async (missedSteps: MissedStep[]): Promise<boolean> => {
  try {
    for (const step of missedSteps) {
      await skipMissedStep(step);
    }
    return true;
  } catch (error) {
    console.error('Error bulk skipping missed steps:', error);
    return false;
  }
};

/**
 * Get total active trays count
 */
export const getActiveTraysCount = async (signal?: AbortSignal): Promise<number> => {
  try {
    // Check if already aborted
    if (signal?.aborted) {
      throw new DOMException('Request aborted', 'AbortError');
    }

    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return 0;

    const { farmUuid } = JSON.parse(sessionData);
    console.log('[getActiveTraysCount] Querying active trays', {
      farmUuid,
      filters: {
        status: 'active',
        harvest_date: 'is null'
      }
    });

    let query = getSupabaseClient()
      .from('trays')
      .select('*', { count: 'exact', head: true })
      .eq('farm_uuid', farmUuid)
      .eq('status', 'active')
      .is('harvest_date', null);

    if (signal) {
      query = query.abortSignal(signal);
    }

    const { count, error } = await query;

    console.log('[getActiveTraysCount] Supabase result', {
      count,
      errorMessage: error?.message || null
    });

    if (error) {
      if (error.name === 'AbortError' || signal?.aborted) {
        throw new DOMException('Request aborted', 'AbortError');
      }
      throw error;
    }
    return count || 0;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw error;
    }
    console.error('Error fetching active trays count:', error);
    return 0;
  }
};

/**
 * Loss reasons for failed trays
 */
export const LOSS_REASONS = [
  { value: 'disease', label: 'Disease', description: 'Fungal, bacterial, or viral infection' },
  { value: 'dried_out', label: 'Dried Out', description: 'Not watered / dehydration' },
  { value: 'bad_seed', label: 'Bad Seed', description: 'Poor germination or seed quality' },
  { value: 'mold', label: 'Mold', description: 'Mold growth on seeds or greens' },
  { value: 'pest', label: 'Pest Damage', description: 'Insects, gnats, or other pests' },
  { value: 'contamination', label: 'Contamination', description: 'Soil, water, or environmental contamination' },
  { value: 'overwatered', label: 'Overwatered', description: 'Root rot from excess water' },
  { value: 'temperature', label: 'Temperature Issue', description: 'Too hot or too cold' },
  { value: 'other', label: 'Other', description: 'Other reason (specify in notes)' },
] as const;

export type LossReason = typeof LOSS_REASONS[number]['value'];

/**
 * Mark trays as lost/failed
 */
export const markTraysAsLost = async (
  trayIds: number[],
  reason: LossReason,
  notes?: string
): Promise<boolean> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return false;

    const { farmUuid } = JSON.parse(sessionData);
    const now = new Date().toISOString();

    // Get tray details before marking as lost for activity log
    const { data: trayData } = await getSupabaseClient()
      .from('trays')
      .select('tray_id, variety_name, recipe_name, customer_name, sow_date')
      .in('tray_id', trayIds)
      .eq('farm_uuid', farmUuid);

    const { error } = await getSupabaseClient()
      .from('trays')
      .update({
        status: 'lost',
        loss_reason: reason,
        lost_at: now,
        loss_notes: notes || null,
      })
      .in('tray_id', trayIds)
      .eq('farm_uuid', farmUuid);

    if (error) {
      console.error('Error marking trays as lost:', error);
      throw error;
    }

    // Log activity after successful marking as lost
    if (trayData && trayData.length > 0) {
      const firstTray = trayData[0];
      const varietyName = firstTray.variety_name || firstTray.recipe_name || 'Unknown';
      await logActivity(
        'task_canceled',
        `Marked ${trayIds.length} tray${trayIds.length !== 1 ? 's' : ''} as lost: ${varietyName}`,
        {
          tray_ids: trayIds,
          tray_count: trayIds.length,
          variety_name: firstTray.variety_name || null,
          recipe_name: firstTray.recipe_name || null,
          customer_name: firstTray.customer_name || null,
          sow_date: firstTray.sow_date || null,
          loss_reason: reason,
          loss_notes: notes || null,
        }
      );
    }

    return true;
  } catch (error) {
    console.error('Error marking trays as lost:', error);
    return false;
  }
};

/**
 * Complete a soak task using the new seeding workflow
 * Creates a soaked_seed record and marks task as completed
 */
export const completeSoakTask = async (
  requestId: number,
  seedbatchId: number,
  quantityGrams: number,
  taskDate: string, // ✅ The soak date (when the task appears, not seeding date)
  userId?: string
): Promise<number> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) throw new Error('No session found');

    const { userId: sessionUserId } = JSON.parse(sessionData);
    const userToUse = userId || sessionUserId;

    // Get request details to find recipe_id
    const { data: requestData, error: requestError } = await getSupabaseClient()
      .from('tray_creation_requests')
      .select('recipe_id, farm_uuid')
      .eq('request_id', requestId)
      .single();

    if (requestError || !requestData) {
      throw new Error(`Request ${requestId} not found`);
    }

    // Get recipe details to find variety_id
    const { data: recipeData, error: recipeError } = await getSupabaseClient()
      .from('recipes')
      .select('variety_id, seed_quantity, seed_quantity_unit')
      .eq('recipe_id', requestData.recipe_id)
      .single();

    if (recipeError) {
      console.warn('[completeSoakTask] Error fetching recipe:', recipeError);
    }

    const varietyId = recipeData?.variety_id || null;
    let varietyName: string | null = null;
    if (varietyId) {
      const { data: varietyData } = await getSupabaseClient()
        .from('varieties')
        .select('name')
        .eq('varietyid', varietyId)
        .maybeSingle();
      varietyName = varietyData?.name || null;
    }
    const farmUuid = requestData.farm_uuid;

    // Calculate expiration (48 hours from soak date)
    // Parse date string as local date to avoid timezone issues
    const [year, month, day] = taskDate.split('-').map(Number);
    const soakDate = new Date(year, month - 1, day); // Local midnight
    const expiresAt = new Date(soakDate.getTime() + 48 * 60 * 60 * 1000);

    // Create soaked_seed record
    const { data: soakedSeedData, error: soakedSeedError } = await getSupabaseClient()
      .from('soaked_seed')
      .insert({
        farm_uuid: requestData.farm_uuid,
        variety_id: varietyId,
        seedbatch_id: seedbatchId,
        request_id: requestId,
        quantity_soaked: quantityGrams, // ✅ Fixed: quantity_soaked, not quantity_grams
        quantity_remaining: quantityGrams, // Initially, all quantity is remaining
        unit: 'g',
        soak_date: taskDate,
        expires_at: expiresAt.toISOString(),
        status: 'available',
        created_by: userToUse,
      })
      .select('soaked_id')
      .single();

    if (soakedSeedError) {
      console.error('[completeSoakTask] Error creating soaked_seed:', soakedSeedError);
      throw soakedSeedError;
    }

    const soakedId = soakedSeedData?.soaked_id;

    // Record task completion
    const { error: completionError } = await getSupabaseClient()
      .from('task_completions')
      .upsert({
        farm_uuid: requestData.farm_uuid,
        task_type: 'soaking',
        task_date: taskDate,
        recipe_id: requestData.recipe_id,
        request_id: requestId,
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: userToUse,
        notes: `Soaked ${quantityGrams}g - Soaked seed ID: ${soakedId}`,
      }, {
        onConflict: 'farm_uuid,task_type,task_date,recipe_id,customer_name,product_name'
      });

    if (completionError) {
      console.warn('[completeSoakTask] Error recording task completion:', completionError);
    }

    // Deduct seed inventory from seedbatch
    // First get current quantity, then update
    const { data: batchData, error: batchFetchError } = await getSupabaseClient()
      .from('seedbatches')
      .select('quantity, unit')
      .eq('batchid', seedbatchId)
      .single();

    if (!batchFetchError && batchData) {
      const deductionInBatchUnit =
        batchData.unit === 'lbs'
          ? quantityGrams / 453.592
          : batchData.unit === 'oz'
            ? quantityGrams / 28.3495
            : quantityGrams; // already grams
      const newQuantity = Math.max(0, (batchData.quantity || 0) - deductionInBatchUnit);
      const { error: inventoryError } = await getSupabaseClient()
        .from('seedbatches')
        .update({ quantity: newQuantity })
        .eq('batchid', seedbatchId);

      if (inventoryError) {
        console.warn('[completeSoakTask] Error updating seed inventory:', inventoryError);
        // Don't throw - soaked_seed was created successfully
      }

      await getSupabaseClient()
        .from('seed_transactions')
        .insert({
          farm_uuid: farmUuid,
          batch_id: seedbatchId,
          transaction_type: 'soak',
          quantity_grams: -quantityGrams,
          notes: `Soaked seed for ${varietyName || 'variety'}`,
        });
    }

    console.log('[completeSoakTask] Success:', {
      soakedId,
      requestId,
      seedbatchId,
      quantityGrams,
      taskDate,
      expiresAt: expiresAt.toISOString()
    });

    return soakedId || 0;
  } catch (error) {
    console.error('[completeSoakTask] Error:', error);
    throw error;
  }
};

/**
 * Complete a soak task using recipeId directly (for planting_schedule tasks without requestId)
 */
export const completeSoakTaskByRecipe = async (
  recipeId: number,
  seedbatchId: number,
  quantityGrams: number,
  taskDate: string,
  userId?: string
): Promise<number> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) throw new Error('No session found');

    const { userId: sessionUserId, farmUuid } = JSON.parse(sessionData);
    const userToUse = userId || sessionUserId;

    if (!farmUuid) {
      throw new Error('No farm UUID found in session');
    }

    // Get recipe details to find variety_id
    const { data: recipeData, error: recipeError } = await getSupabaseClient()
      .from('recipes')
      .select('variety_id, seed_quantity, seed_quantity_unit')
      .eq('recipe_id', recipeId)
      .single();

    if (recipeError) {
      console.warn('[completeSoakTaskByRecipe] Error fetching recipe:', recipeError);
    }

    const varietyId = recipeData?.variety_id || null;
    let varietyName: string | null = null;
    if (varietyId) {
      const { data: varietyData } = await getSupabaseClient()
        .from('varieties')
        .select('name')
        .eq('varietyid', varietyId)
        .maybeSingle();
      varietyName = varietyData?.name || null;
    }

    // Calculate expiration (48 hours from soak date)
    // Parse date string as local date to avoid timezone issues
    const [year, month, day] = taskDate.split('-').map(Number);
    const soakDate = new Date(year, month - 1, day); // Local midnight
    const expiresAt = new Date(soakDate.getTime() + 48 * 60 * 60 * 1000);

    // Create soaked_seed record (without request_id for planting_schedule tasks)
    const { data: soakedSeedData, error: soakedSeedError } = await getSupabaseClient()
      .from('soaked_seed')
      .insert({
        farm_uuid: farmUuid,
        variety_id: varietyId,
        seedbatch_id: seedbatchId,
        request_id: null, // No request_id for planting_schedule tasks
        quantity_soaked: quantityGrams,
        quantity_remaining: quantityGrams,
        unit: 'g',
        soak_date: taskDate,
        expires_at: expiresAt.toISOString(),
        status: 'available',
        created_by: userToUse,
      })
      .select('soaked_id')
      .single();

    if (soakedSeedError) {
      console.error('[completeSoakTaskByRecipe] Error creating soaked_seed:', soakedSeedError);
      throw soakedSeedError;
    }

    const soakedId = soakedSeedData?.soaked_id;

    // Record task completion
    const { error: completionError } = await getSupabaseClient()
      .from('task_completions')
      .upsert({
        farm_uuid: farmUuid,
        task_type: 'soaking',
        task_date: taskDate,
        recipe_id: recipeId,
        request_id: null,
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: userToUse,
        notes: `Soaked ${quantityGrams}g - Soaked seed ID: ${soakedId} (ad-hoc from planting schedule)`,
      }, {
        onConflict: 'farm_uuid,task_type,task_date,recipe_id,customer_name,product_name'
      });

    if (completionError) {
      console.warn('[completeSoakTaskByRecipe] Error recording task completion:', completionError);
    }

    // Deduct seed inventory from seedbatch
    const { data: batchData, error: batchFetchError } = await getSupabaseClient()
      .from('seedbatches')
      .select('quantity, unit')
      .eq('batchid', seedbatchId)
      .single();

    if (!batchFetchError && batchData) {
      const deductionInBatchUnit =
        batchData.unit === 'lbs'
          ? quantityGrams / 453.592
          : batchData.unit === 'oz'
            ? quantityGrams / 28.3495
            : quantityGrams; // already grams
      const newQuantity = Math.max(0, (batchData.quantity || 0) - deductionInBatchUnit);
      const { error: inventoryError } = await getSupabaseClient()
        .from('seedbatches')
        .update({ quantity: newQuantity })
        .eq('batchid', seedbatchId);

      if (inventoryError) {
        console.warn('[completeSoakTaskByRecipe] Error updating seed inventory:', inventoryError);
      }

      await getSupabaseClient()
        .from('seed_transactions')
        .insert({
          farm_uuid: farmUuid,
          batch_id: seedbatchId,
          transaction_type: 'soak',
          quantity_grams: -quantityGrams,
          notes: `Soaked seed for ${varietyName || 'variety'}`,
        });
    }

    console.log('[completeSoakTaskByRecipe] Success:', {
      soakedId,
      recipeId,
      seedbatchId,
      quantityGrams,
      taskDate,
      expiresAt: expiresAt.toISOString()
    });

    return soakedId || 0;
  } catch (error) {
    console.error('[completeSoakTaskByRecipe] Error:', error);
    throw error;
  }
};

/**
 * Complete a seed task using the new seeding workflow
 */
export const completeSeedTask = async (
  requestId: number,
  quantityCompleted: number,
  seedbatchId: number | null,
  userId?: string,
  recipeId?: number,
  taskDateStr?: string,
  trayIds?: number[]
): Promise<number> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) throw new Error('No session found');

    const { userId: sessionUserId } = JSON.parse(sessionData);
    const userToUse = userId || sessionUserId;

    const { data, error } = await getSupabaseClient().rpc('complete_seed_task', {
      p_request_id: requestId,
      p_quantity_completed: quantityCompleted,
      p_seedbatch_id: seedbatchId,
      p_user_id: userToUse || null,
    });

    if (error) throw error;

    const traysCreated = data || 0; // Returns number of trays created
    const { farmUuid } = JSON.parse(sessionData);
    if (recipeId && farmUuid) {
      try {
        await markSeedingTrayStepsCompleted({
          farmUuid,
          recipeId,
          taskDateStr,
          trayIds,
          completedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[DailyFlow] Error marking seeding tray_steps complete after seed_request:', err);
      }
    }

    return traysCreated;
  } catch (error) {
    console.error('Error completing seed task:', error);
    throw error;
  }
};

/**
 * Use leftover soaked seed to create ad-hoc trays
 */
export async function useLeftoverSoakedSeed(
  soakedId: number,
  quantityTrays: number,
  requestId: number | null,
  recipeId?: number,
  scheduledSowDate?: string,
  userId?: string
): Promise<number> {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) throw new Error('No session found');

    const { userId: sessionUserId } = JSON.parse(sessionData);
    const userToUse = userId || sessionUserId;

    const { data, error } = await getSupabaseClient().rpc('use_leftover_soaked_seed', {
      p_soaked_id: soakedId,
      p_quantity_trays: quantityTrays,
      p_request_id: requestId,
      p_recipe_id: recipeId || null,
      p_scheduled_sow_date: scheduledSowDate || null,
      p_user_id: userToUse || null,
    });

    if (error) throw error;

    return data || 0; // Returns number of trays created
  } catch (error) {
    console.error('Error using leftover soaked seed:', error);
    throw error;
  }
}

/**
 * Discard soaked seed
 */
export const discardSoakedSeed = async (
  soakedId: number,
  reason: string,
  userId?: string
): Promise<boolean> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) throw new Error('No session found');

    const { userId: sessionUserId } = JSON.parse(sessionData);
    const userToUse = userId || sessionUserId;

    // Get soaked seed details before discarding for activity log
    const { data: soakedData } = await getSupabaseClient()
      .from('soaked_seeds')
      .select('soaked_seed_id, variety_name, quantity_remaining, unit, request_id')
      .eq('soaked_seed_id', soakedId)
      .single();

    const { data, error } = await getSupabaseClient().rpc('discard_soaked_seed', {
      p_soaked_id: soakedId,
      p_reason: reason,
      p_user_id: userToUse || null,
    });

    if (error) throw error;

    // Log activity after successful discard
    if (soakedData) {
      await logActivity(
        'task_canceled',
        `Discarded soaked seed: ${soakedData.variety_name || 'Unknown'} (${soakedData.quantity_remaining || 0} ${soakedData.unit || 'g'})`,
        {
          soaked_seed_id: soakedId,
          task_type: 'soak_discard',
          variety_name: soakedData.variety_name || null,
          quantity_remaining: soakedData.quantity_remaining || null,
          unit: soakedData.unit || null,
          request_id: soakedData.request_id || null,
          reason: reason || null,
        }
      );
    }

    return data || false;
  } catch (error) {
    console.error('Error discarding soaked seed:', error);
    throw error;
  }
};

/**
 * Helper function to log activity
 */
const logActivity = async (
  activityType: string,
  description: string,
  metadata: Record<string, any>
): Promise<void> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) {
      console.warn('No session found for activity logging');
      return;
    }

    const { farmUuid } = JSON.parse(sessionData);
    
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    const userId = user?.id || null;

    await getSupabaseClient().from('activity_log').insert({
      farm_uuid: farmUuid,
      activity_type: activityType,
      description,
      metadata,
      created_by: userId,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
    // Don't throw - activity logging should not block operations
  }
};

/**
 * Cancel a seeding request
 */
export const cancelSeedingRequest = async (
  requestId: number,
  reason: string
): Promise<void> => {
  try {
    // Get request details before cancelling for activity log
    const { data: requestData } = await getSupabaseClient()
      .from('tray_creation_requests')
      .select('recipe_name, variety_name, seed_date, customer_name, farm_uuid')
      .eq('request_id', requestId)
      .single();

    const { error } = await getSupabaseClient()
      .from('tray_creation_requests')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_reason: reason,
      })
      .eq('request_id', requestId);

    if (error) throw error;

    // Log activity after successful cancellation
    if (requestData) {
      await logActivity(
        'request_canceled',
        `Canceled seeding request: ${requestData.recipe_name || requestData.variety_name || 'Unknown'}`,
        {
          original_request_id: requestId,
          request_type: 'seeding_request',
          recipe_name: requestData.recipe_name || null,
          variety_name: requestData.variety_name || null,
          customer_name: requestData.customer_name || null,
          seed_date: requestData.seed_date || null,
          reason: reason || null,
        }
      );
    }
  } catch (error) {
    console.error('Error cancelling seeding request:', error);
    throw error;
  }
};

/**
 * Passive Tray Status - for the Tray Status section in DailyFlow
 * Returns counts of trays currently in each passive phase (Germination, Blackout, Growing)
 * This queries the actual tray state, not tasks scheduled for today
 */
export interface PassiveTrayStatusItem {
  stepName: string;
  totalTrays: number;
  varieties: Array<{ recipe: string; trays: number }>;
}

export const fetchPassiveTrayStatus = async (signal?: AbortSignal): Promise<PassiveTrayStatusItem[]> => {
  try {
    // Check if already aborted
    if (signal?.aborted) {
      throw new DOMException('Request aborted', 'AbortError');
    }

    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return [];

    const { farmUuid } = JSON.parse(sessionData);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Step 1: Get active trays with sow_date and recipe info
    let traysQuery = getSupabaseClient()
      .from('trays')
      .select(`
        tray_id,
        sow_date,
        status,
        recipe_id,
        recipes(
          recipe_id,
          recipe_name,
          variety_name
        )
      `)
      .eq('farm_uuid', farmUuid)
      .is('harvest_date', null)
      .not('sow_date', 'is', null)
      .or('status.is.null,status.eq.active');

    if (signal) {
      traysQuery = traysQuery.abortSignal(signal);
    }

    const { data: activeTraysData, error: activeTraysError } = await traysQuery;

    if (activeTraysError) {
      console.error('[fetchPassiveTrayStatus] Error fetching active trays:', activeTraysError);
      return [];
    }

    if (!activeTraysData || activeTraysData.length === 0) {
      return [];
    }

    // Step 2: Get all recipe IDs and fetch their steps
    const recipeIds = [...new Set(activeTraysData.map((t: any) => t.recipe_id).filter(Boolean))];
    
    const { data: stepsData, error: stepsError } = await getSupabaseClient()
      .from('steps')
      .select('step_id, step_name, recipe_id, duration, duration_unit, sequence_order')
      .in('recipe_id', recipeIds)
      .order('recipe_id')
      .order('sequence_order', { ascending: true, nullsFirst: false });

    if (stepsError) {
      console.error('[fetchPassiveTrayStatus] Error fetching steps:', stepsError);
      return [];
    }

    // Step 3: Build step ranges for each recipe (cumulative days)
    // stepRanges[recipeId] = [{ stepName, startDay, endDay }, ...]
    const stepRangesByRecipe: Record<number, Array<{ stepName: string; startDay: number; endDay: number }>> = {};
    
    // Group steps by recipe and sort by order
    const stepsByRecipe: Record<number, any[]> = {};
    (stepsData || []).forEach((step: any) => {
      if (!stepsByRecipe[step.recipe_id]) {
        stepsByRecipe[step.recipe_id] = [];
      }
      stepsByRecipe[step.recipe_id].push(step);
    });

    // Sort and calculate cumulative ranges
    Object.keys(stepsByRecipe).forEach((recipeIdStr) => {
      const recipeId = Number(recipeIdStr);
      const steps = stepsByRecipe[recipeId];
      
      // Sort by sequence_order
      steps.sort((a, b) => {
        const orderA = a.sequence_order ?? 0;
        const orderB = b.sequence_order ?? 0;
        return orderA - orderB;
      });

      let cumulativeDays = 0;
      stepRangesByRecipe[recipeId] = [];

      for (const step of steps) {
        const duration = step.duration || 0;
        const unit = (step.duration_unit || 'Days').toUpperCase();
        
        // Convert duration to days
        let durationDays = duration;
        if (unit === 'HOURS') {
          durationDays = duration >= 12 ? 1 : 0;
        }

        const startDay = cumulativeDays;
        const endDay = cumulativeDays + durationDays;
        
        stepRangesByRecipe[recipeId].push({
          stepName: (step.step_name || '').trim(),
          startDay,
          endDay
        });

        cumulativeDays = endDay;
      }
    });

    // Step 4: For each tray, calculate current phase based on days since sow
    const passiveStepNames = ['Germination', 'Blackout', 'Growing'];
    const stepGroups: Record<string, { totalTrays: Set<number>; varieties: Record<string, Set<number>> }> = {};

    activeTraysData.forEach((tray: any) => {
      const sowDate = parseLocalDate(tray.sow_date);
      if (!sowDate) return;

      const recipeId = tray.recipe_id;
      const stepRanges = stepRangesByRecipe[recipeId];
      if (!stepRanges || stepRanges.length === 0) return;

      // Calculate days since sow (0-indexed: day 0 = sow day)
      const daysSinceSow = Math.floor((today.getTime() - sowDate.getTime()) / (1000 * 60 * 60 * 24));

      // Calculate total recipe days
      const totalRecipeDays = stepRanges.length > 0 ? stepRanges[stepRanges.length - 1].endDay : 0;

      // Find current step based on cumulative days
      let currentStepName = '';
      for (const range of stepRanges) {
        if (daysSinceSow >= range.startDay && daysSinceSow < range.endDay) {
          currentStepName = range.stepName;
          break;
        }
      }

      // Determine if tray is past blackout (need to find when blackout ends)
      let blackoutEndDay = 0;
      for (const range of stepRanges) {
        if (range.stepName.toLowerCase().includes('blackout')) {
          blackoutEndDay = range.endDay;
        }
      }

      // If past all steps OR in a non-passive step (like Harvest), treat as Growing
      // since these trays still need daily care (watering, light) until actually harvested
      if (!currentStepName || !passiveStepNames.includes(currentStepName)) {
        // Only count as Growing if past blackout phase
        if (daysSinceSow >= blackoutEndDay) {
          currentStepName = 'Growing';
        } else {
          return; // Still in an early phase we don't track
        }
      }

      const recipe = tray.recipes;
      const varietyName = recipe?.variety_name || recipe?.recipe_name || 'Unknown';

      // Add to current step group
      if (!stepGroups[currentStepName]) {
        stepGroups[currentStepName] = { totalTrays: new Set(), varieties: {} };
      }

      stepGroups[currentStepName].totalTrays.add(tray.tray_id);

      if (!stepGroups[currentStepName].varieties[varietyName]) {
        stepGroups[currentStepName].varieties[varietyName] = new Set();
      }
      stepGroups[currentStepName].varieties[varietyName].add(tray.tray_id);

      // Additionally, if tray is at or past total recipe days, add to "Ready to Harvest"
      // This is a subset of Growing trays that can be cut now
      if (daysSinceSow >= totalRecipeDays && totalRecipeDays > 0) {
        const readyStepName = 'Ready to Harvest';
        if (!stepGroups[readyStepName]) {
          stepGroups[readyStepName] = { totalTrays: new Set(), varieties: {} };
        }

        stepGroups[readyStepName].totalTrays.add(tray.tray_id);

        if (!stepGroups[readyStepName].varieties[varietyName]) {
          stepGroups[readyStepName].varieties[varietyName] = new Set();
        }
        stepGroups[readyStepName].varieties[varietyName].add(tray.tray_id);
      }
    });

    // Convert to output format
    const result: PassiveTrayStatusItem[] = Object.entries(stepGroups).map(([stepName, data]) => ({
      stepName,
      totalTrays: data.totalTrays.size,
      varieties: Object.entries(data.varieties).map(([recipe, trayIds]) => ({
        recipe,
        trays: trayIds.size
      }))
    }));

    console.log('[fetchPassiveTrayStatus] Result:', result);

    return result;
  } catch (error) {
    console.error('[fetchPassiveTrayStatus] Error:', error);
    return [];
  }
};

/**
 * Reschedule a seeding request
 */
export const rescheduleSeedingRequest = async (
  requestId: number,
  newSeedDate: string,
  originalDate: string
): Promise<void> => {
  try {
    const { error } = await getSupabaseClient()
      .from('tray_creation_requests')
      .update({
        seed_date: newSeedDate,
        rescheduled_from: originalDate,
      })
      .eq('request_id', requestId);

    if (error) throw error;
  } catch (error) {
    console.error('Error rescheduling seeding request:', error);
    throw error;
  }
};

/**
 * Fetch overdue seeding tasks (missed seedlings from past days)
 * Returns seeding tasks from the last 7 days that were not completed
 */
export const fetchOverdueSeedingTasks = async (
  daysBack: number = 7,
  signal?: AbortSignal
): Promise<DailyTask[]> => {
  // Check if already aborted
  if (signal?.aborted) {
    throw new DOMException('Request aborted', 'AbortError');
  }

  const sessionData = localStorage.getItem('sproutify_session');
  if (!sessionData) {
    console.warn('[fetchOverdueSeedingTasks] No session data available');
    return [];
  }

  let farmUuid = '';
  try {
    const parsedSession = JSON.parse(sessionData);
    farmUuid = parsedSession?.farmUuid;
  } catch (err) {
    console.warn('[fetchOverdueSeedingTasks] Failed to parse session payload', err);
  }

  if (!farmUuid) {
    console.warn('[fetchOverdueSeedingTasks] No farm UUID found in session');
    return [];
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDateString(today);

    // Calculate date range for past days
    const pastDate = new Date(today);
    pastDate.setDate(pastDate.getDate() - daysBack);
    const pastDateStr = formatDateString(pastDate);

    console.log('[fetchOverdueSeedingTasks] Fetching overdue tasks from', pastDateStr, 'to', todayStr);

    // Fetch all schedules in the date range
    let schedulesQuery = getSupabaseClient()
      .from('planting_schedule_view')
      .select('sow_date, harvest_date, recipe_name, trays_needed, recipe_id, customer_name, customer_id, standing_order_id, schedule_id, delivery_date')
      .eq('farm_uuid', farmUuid)
      .gte('sow_date', pastDateStr)
      .lt('sow_date', todayStr); // Exclude today (those are shown in regular tasks)

    if (signal) {
      schedulesQuery = schedulesQuery.abortSignal(signal);
    }

    const { data: allSchedules, error: scheduleError } = await schedulesQuery;

    if (scheduleError) {
      console.error('[fetchOverdueSeedingTasks] Error fetching schedules:', scheduleError);
      return [];
    }

    if (!allSchedules || allSchedules.length === 0) {
      console.log('[fetchOverdueSeedingTasks] No past schedules found');
      return [];
    }

    // Fetch recipe data for variety names
    const recipeIds = [...new Set(allSchedules.map((s: any) => s.recipe_id).filter(Boolean))];
    const { data: recipesData } = recipeIds.length > 0 ? await getSupabaseClient()
      .from('recipes')
      .select('recipe_id, variety_name')
      .in('recipe_id', recipeIds)
      .eq('farm_uuid', farmUuid) : { data: null };

    // Create variety name map
    const varietyNameMap: Record<number, string> = {};
    if (recipesData) {
      recipesData.forEach((recipe: any) => {
        if (recipe.recipe_id && recipe.variety_name) {
          varietyNameMap[recipe.recipe_id] = recipe.variety_name;
        }
      });
    }

    // Fetch completed tasks in the date range
    const { data: completedTasks } = await getSupabaseClient()
      .from('task_completions')
      .select('recipe_id, task_type, task_date')
      .eq('farm_uuid', farmUuid)
      .gte('task_date', pastDateStr)
      .lt('task_date', todayStr)
      .in('task_type', ['sowing', 'soaking'])
      .eq('status', 'completed');

    // Create set of completed task keys
    const completedTaskKeys = new Set<string>();
    if (completedTasks) {
      completedTasks.forEach((ct: any) => {
        // Normalize task_date to YYYY-MM-DD string format
        const taskDateStr = typeof ct.task_date === 'string'
          ? ct.task_date.split('T')[0]  // Handle ISO format
          : formatDateString(new Date(ct.task_date));
        const key = `${ct.task_type}-${ct.recipe_id}-${taskDateStr}`;
        completedTaskKeys.add(key);
      });
      console.log('[fetchOverdueSeedingTasks] Completed task keys:', Array.from(completedTaskKeys));
    }

    // Count existing trays per recipe+scheduled_sow_date (not just existence, but actual count)
    // Use scheduled_sow_date if available (new trays), fall back to sow_date for older trays
    const { data: existingTrays } = await getSupabaseClient()
      .from('trays')
      .select('recipe_id, sow_date, scheduled_sow_date')
      .eq('farm_uuid', farmUuid)
      .or(`scheduled_sow_date.gte.${pastDateStr},sow_date.gte.${pastDateStr}`)
      .or(`scheduled_sow_date.lt.${todayStr},sow_date.lt.${todayStr}`);

    const existingTrayCount = new Map<string, number>();
    if (existingTrays) {
      existingTrays.forEach((tray: any) => {
        if (tray.recipe_id) {
          // Prefer scheduled_sow_date for tracking which schedule was fulfilled
          // Fall back to sow_date for older trays without scheduled_sow_date
          const dateToUse = tray.scheduled_sow_date || tray.sow_date;
          if (dateToUse) {
            const sowDateStr = formatDateString(parseLocalDate(dateToUse) || new Date());
            // Only count if the date is in our range (past but not today)
            if (sowDateStr >= pastDateStr && sowDateStr < todayStr) {
              const key = `${tray.recipe_id}-${sowDateStr}`;
              existingTrayCount.set(key, (existingTrayCount.get(key) || 0) + 1);
            }
          }
        }
      });
    }
    console.log('[fetchOverdueSeedingTasks] Existing tray counts (by scheduled_sow_date):', Object.fromEntries(existingTrayCount));

    // Group schedules by recipe+sow_date to calculate total trays needed
    const scheduleGroups = new Map<string, {
      totalNeeded: number;
      schedules: typeof allSchedules;
      sowDate: Date;
      sowDateStr: string;
    }>();

    for (const schedule of allSchedules) {
      if (!schedule.sow_date || !schedule.recipe_id) continue;

      const sowDate = parseLocalDate(schedule.sow_date);
      if (!sowDate) continue;

      const sowDateStr = formatDateString(sowDate);
      const key = `${schedule.recipe_id}-${sowDateStr}`;

      const group = scheduleGroups.get(key) || {
        totalNeeded: 0,
        schedules: [],
        sowDate,
        sowDateStr
      };
      group.totalNeeded += schedule.trays_needed || 1;
      group.schedules.push(schedule);
      scheduleGroups.set(key, group);
    }

    // Build overdue tasks based on remaining trays needed
    const overdueTasks: DailyTask[] = [];

    for (const [key, group] of scheduleGroups) {
      const existingCount = existingTrayCount.get(key) || 0;
      const remaining = group.totalNeeded - existingCount;

      console.log('[fetchOverdueSeedingTasks] Group check:', {
        key,
        totalNeeded: group.totalNeeded,
        existingCount,
        remaining,
        scheduleCount: group.schedules.length
      });

      if (remaining <= 0) {
        console.log('[fetchOverdueSeedingTasks] Skipping group - all trays exist:', key);
        continue; // All needed trays exist
      }

      // Calculate days overdue
      const daysOverdue = Math.floor((today.getTime() - group.sowDate.getTime()) / (1000 * 60 * 60 * 24));

      // Distribute remaining across schedules (prefer keeping individual schedule context)
      let remainingToAssign = remaining;
      for (const schedule of group.schedules) {
        if (remainingToAssign <= 0) break;

        const scheduleTrays = schedule.trays_needed || 1;
        const traysForThisSchedule = Math.min(scheduleTrays, remainingToAssign);
        remainingToAssign -= traysForThisSchedule;

        const varietyName = varietyNameMap[schedule.recipe_id] || schedule.recipe_name || 'Unknown';

        // Use schedule_id if available, otherwise create unique id using array length
        const uniqueId = schedule.schedule_id || `${schedule.recipe_id}-${overdueTasks.length}`;
        overdueTasks.push({
          id: `overdue-seed-${uniqueId}-${group.sowDateStr}`,
          action: 'Seed',
          crop: varietyName,
          batchId: 'N/A',
          location: 'Not set',
          dayCurrent: 0,
          dayTotal: 0,
          trays: traysForThisSchedule,
          status: 'urgent',
          trayIds: [],
          recipeId: schedule.recipe_id,
          taskSource: 'planting_schedule',
          quantity: traysForThisSchedule,
          customerName: schedule.customer_name || null,
          customerId: schedule.customer_id ?? undefined,
          standingOrderId: schedule.standing_order_id ?? undefined,
          orderScheduleId: schedule.schedule_id ?? undefined,
          deliveryDate: schedule.delivery_date || null,
          isOverdue: true,
          daysOverdue,
          sowDate: group.sowDateStr,
        });
      }
    }

    // Sort by sow date (most recent first)
    overdueTasks.sort((a, b) => {
      const dateA = a.sowDate || '';
      const dateB = b.sowDate || '';
      return dateB.localeCompare(dateA);
    });

    console.log('[fetchOverdueSeedingTasks] Found', overdueTasks.length, 'overdue tasks');
    return overdueTasks;
  } catch (error) {
    console.error('[fetchOverdueSeedingTasks] Error:', error);
    return [];
  }
};
