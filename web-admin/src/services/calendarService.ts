import { getSupabaseClient } from '../lib/supabaseClient';

export interface CalendarDaySummary {
  farm_uuid: string;
  task_date: string; // YYYY-MM-DD
  harvest_count: number;
  seed_count: number;
  prep_count: number;
  water_count: number;
  warning_count: number;
}

export interface CalendarDayTask {
  task_date: string;
  task_name?: string | null;
  task_source?: string | null;
  step_type?: string | null;
  recipe_name?: string | null;
  variety_name?: string | null;
  quantity?: number | null;
  customer_name?: string | null;
  standing_order_id?: number | null;
  // Additional fields for at-risk items
  sow_date?: string | null;
  harvest_date?: string | null;
  delivery_date?: string | null;
  trays_ready?: number | null;
  trays_needed?: number | null;
}

/**
 * Parse a date string (YYYY-MM-DD) as a local date, not UTC
 * This prevents timezone shifts that cause dates to display as the previous day
 */
const parseLocalDate = (dateStr: string | Date | null | undefined): Date | null => {
  if (!dateStr) return null;

  // If it's already a Date object, return it
  if (dateStr instanceof Date) return dateStr;
  
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

export async function fetchCalendarMonth(
  farmUuid: string,
  year: number,
  month: number
): Promise<CalendarDaySummary[]> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  // Fetch base calendar data from view
  const { data: baseData, error: baseError } = await getSupabaseClient()
    .from('calendar_day_pivoted')
    .select('*')
    .eq('farm_uuid', farmUuid)
    .gte('task_date', startDate)
    .lte('task_date', endDate)
    .order('task_date', { ascending: true });

  if (baseError) {
    throw new Error(baseError.message);
  }

  // Also fetch harvest counts from planting_schedule_view
  const { data: schedules, error: scheduleError } = await getSupabaseClient()
    .from('planting_schedule_view')
    .select('harvest_date, trays_needed')
    .eq('farm_uuid', farmUuid)
    .gte('harvest_date', startDate)
    .lte('harvest_date', endDate);

  if (scheduleError) {
    // If we can't fetch schedules, just return the base data
    console.warn('Error fetching planting schedules for calendar month:', scheduleError);
    return baseData || [];
  }

  // Create a map of harvest counts by date
  const harvestCountsByDate: Record<string, number> = {};
  if (schedules) {
    for (const schedule of schedules) {
      if (!schedule.harvest_date) continue;
      
      const harvestDate = parseLocalDate(schedule.harvest_date);
      if (!harvestDate) continue;
      
      const harvestDateStr = formatDateString(harvestDate);
      
      if (harvestDateStr >= startDate && harvestDateStr <= endDate) {
        if (!harvestCountsByDate[harvestDateStr]) {
          harvestCountsByDate[harvestDateStr] = 0;
        }
        // Count each schedule entry as a harvest task
        harvestCountsByDate[harvestDateStr] += 1;
      }
    }
  }

  // Also fetch at-risk counts - count items that are currently at risk on their delivery date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatDateString(today);
  const warningCountsByDate: Record<string, number> = {};
  
  try {
    // Get a wider range to find all at-risk items
    const startDateObj = parseLocalDate(startDate) || new Date();
    const endDateObj = parseLocalDate(endDate) || new Date();
    const queryStartDate = new Date(startDateObj);
    queryStartDate.setDate(queryStartDate.getDate() - 30); // Look back 30 days for sow dates
    const queryEndDate = new Date(endDateObj);
    queryEndDate.setDate(queryEndDate.getDate() + 30); // Look forward 30 days for harvest dates
    
    const { data: orderDetails } = await getSupabaseClient()
      .from('order_fulfillment_status')
      .select('sow_date, harvest_date, delivery_date, recipe_name, customer_name, recipe_id, trays_ready, trays_needed')
      .eq('farm_uuid', farmUuid)
      .gte('harvest_date', formatDateString(queryStartDate))
      .lte('harvest_date', formatDateString(queryEndDate));

    if (orderDetails) {
      // Aggregate by recipe_id + customer + delivery_date (more precise than recipe_name)
      // This matches the detail view aggregation logic
      const aggregatedMap = new Map<string, {
        recipe_id: number;
        recipe_name: string;
        customer_name: string;
        delivery_date: string;
      }>();
      
      for (const item of orderDetails) {
        const sowDateStr = item.sow_date ? formatDateString(parseLocalDate(item.sow_date) || new Date()) : '';
        const harvestDateStr = item.harvest_date ? formatDateString(parseLocalDate(item.harvest_date) || new Date()) : '';
        const deliveryDateStr = item.delivery_date ? formatDateString(parseLocalDate(item.delivery_date) || new Date()) : '';
        
        // Only count items that are currently at risk (today > sow_date AND today <= harvest_date)
        const isCurrentlyAtRisk = 
          todayStr > sowDateStr && 
          todayStr <= harvestDateStr && 
          (item.trays_ready || 0) < (item.trays_needed || 0);
        
        // Count them on their delivery date if it's in the month range
        if (isCurrentlyAtRisk && deliveryDateStr >= startDate && deliveryDateStr <= endDate) {
          // Use recipe_id instead of recipe_name for more precise aggregation
          const key = `${item.recipe_id || item.recipe_name}-${item.customer_name}-${deliveryDateStr}`;
          
          if (!aggregatedMap.has(key)) {
            aggregatedMap.set(key, {
              recipe_id: item.recipe_id || 0,
              recipe_name: item.recipe_name || 'Unknown',
              customer_name: item.customer_name || 'Unknown',
              delivery_date: deliveryDateStr,
            });
            
            if (!warningCountsByDate[deliveryDateStr]) {
              warningCountsByDate[deliveryDateStr] = 0;
            }
            warningCountsByDate[deliveryDateStr] += 1;
          }
        }
      }
    }
  } catch (error) {
    console.warn('Error fetching at-risk counts for calendar month:', error);
  }

  // Merge harvest counts and warning counts into base data
  // Replace warning_count with our calculated value (don't add to avoid double-counting)
  const result = (baseData || []).map((day) => {
    const additionalHarvests = harvestCountsByDate[day.task_date] || 0;
    const calculatedWarnings = warningCountsByDate[day.task_date] || 0;
    return {
      ...day,
      harvest_count: (day.harvest_count || 0) + additionalHarvests,
      // Use our calculated warning count (from order_fulfillment_status) instead of adding to the view's count
      // This ensures consistency with the detail view
      warning_count: calculatedWarnings,
    };
  });

  // Add entries for dates that have harvests or warnings but no other tasks
  const allDates = new Set([
    ...Object.keys(harvestCountsByDate),
    ...Object.keys(warningCountsByDate),
  ]);
  
  for (const dateStr of allDates) {
    const existing = result.find((d) => d.task_date === dateStr);
    if (!existing) {
      result.push({
        farm_uuid: farmUuid,
        task_date: dateStr,
        harvest_count: harvestCountsByDate[dateStr] || 0,
        seed_count: 0,
        prep_count: 0,
        water_count: 0,
        warning_count: warningCountsByDate[dateStr] || 0,
      });
    }
  }

  // Sort by date
  return result.sort((a, b) => a.task_date.localeCompare(b.task_date));
}

export async function fetchDayTasks(farmUuid: string, date: string): Promise<CalendarDayTask[]> {
  // Fetch tasks from daily_flow_aggregated (tray steps, seeding requests, etc.)
  const { data: flowTasks, error: flowError } = await getSupabaseClient()
    .from('daily_flow_aggregated')
    .select('*')
    .eq('farm_uuid', farmUuid)
    .eq('task_date', date)
    .order('task_name', { ascending: true });

  if (flowError) {
    throw new Error(flowError.message);
  }

  // Parse the date to ensure we're comparing correctly
  const targetDate = parseLocalDate(date);
  if (!targetDate) {
    return flowTasks || [];
  }

  const targetDateStr = formatDateString(targetDate);
  const todayStr = formatDateString(new Date());

  // Supplemental tray queries to catch tasks missed by daily_flow_aggregated view (aligned with daily flow)
  const supplementalTasks: CalendarDayTask[] = [];
  try {
    // Fetch active trays directly
    const { data: activeTrays, error: traysError } = await getSupabaseClient()
      .from('trays')
      .select(`
        tray_id,
        recipe_id,
        sow_date,
        batch_id,
        location,
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

    if (!traysError && activeTrays && activeTrays.length > 0) {
      const traysWithRecipes = activeTrays.filter((t: any) => t.recipes && t.recipe_id);
      const recipeIds = [...new Set(traysWithRecipes.map((t: any) => t.recipe_id).filter(Boolean))];
      
      if (recipeIds.length > 0) {
        // Fetch steps for these recipes
        const { data: allSteps, error: stepsError } = await getSupabaseClient()
          .from('steps')
          .select('*')
          .in('recipe_id', recipeIds);

        if (!stepsError && allSteps) {
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
            .eq('scheduled_date', targetDateStr);

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

            // Check if this step is scheduled for target date
            const stepStartDay = daysIntoRecipe + 1;
            const stepEndDay = daysIntoRecipe + (currentStep.duration || 0);
            const isOnTargetDate = daysSinceSow >= stepStartDay && daysSinceSow <= stepEndDay;

            // Determine action from step
            const stepName = currentStep.step_name || currentStep.description_name || 'Unknown Step';
            const stepNameLower = stepName?.toLowerCase() || '';
            const isSeedingStep = stepNameLower.includes('seed') && 
                                 (stepNameLower.includes('tray') || stepNameLower === 'seed' || stepNameLower === 'seeding');
            
            // Only add if it's scheduled for target date and not already in flowTasks
            if (isOnTargetDate && currentStep && !isStepCompleted && !isStepSkipped) {
              if (stepName && 
                  stepNameLower !== 'water' && 
                  !stepNameLower.includes('mist') && 
                  !isSeedingStep) {
                // Check if this task already exists in flowTasks
                const existsInView = flowTasks?.some((t: any) => {
                  const tRecipeId = t.recipe_id || t.recipeId;
                  const tStepId = t.step_id || t.stepId;
                  const tAction = t.task_name || t.action;
                  const tTrayIds = Array.isArray(t.tray_ids) ? t.tray_ids : (t.tray_id ? [t.tray_id] : []);
                  return tRecipeId === recipeId && 
                         tStepId === currentStep.step_id && 
                         tAction === stepName &&
                         t.task_source === 'tray_step' &&
                         (tTrayIds.includes(tray.tray_id) || tTrayIds.length > 0);
                });
                
                if (!existsInView) {
                  // Check if we already have this task in supplementalTasks
                  const existingTask = supplementalTasks.find(t => 
                    t.recipe_name === recipe.recipe_name && 
                    t.task_name === stepName
                  );

                  if (existingTask) {
                    // Task already exists, skip
                    continue;
                  } else {
                    // Create new task
                    supplementalTasks.push({
                      task_date: targetDateStr,
                      task_name: stepName,
                      task_source: 'tray_step',
                      recipe_name: recipe.recipe_name || null,
                      variety_name: recipe.variety_name || null,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (supplementError) {
    console.warn('Error supplementing with direct tray queries for calendar:', supplementError);
  }

  // Fetch watering tasks (simplified version aligned with daily flow)
  const wateringTasks: CalendarDayTask[] = [];
  try {
    // Fetch active trays with recipes
    const { data: activeTrays, error: traysError } = await getSupabaseClient()
      .from('trays')
      .select(`
        tray_id,
        recipe_id,
        recipes(
          recipe_id,
          recipe_name
        )
      `)
      .eq('farm_uuid', farmUuid)
      .eq('status', 'active')
      .is('harvest_date', null);

    if (!traysError && activeTrays && activeTrays.length > 0) {
      const traysWithRecipes = activeTrays.filter((t: any) => t.recipes && t.recipe_id);
      const trayIds = traysWithRecipes.map((t: any) => t.tray_id);
      const recipeIds = [...new Set(traysWithRecipes.map((t: any) => t.recipe_id).filter(Boolean))];

      if (trayIds.length > 0 && recipeIds.length > 0) {
        // Fetch tray_steps with water_frequency
        const { data: trayStepsRaw, error: trayStepsError } = await getSupabaseClient()
          .from('tray_steps')
          .select(`
            tray_id,
            step_id,
            scheduled_date,
            steps!fk_step_id(
              step_id,
              step_name,
              recipe_id,
              water_frequency,
              water_method
            )
          `)
          .in('tray_id', trayIds);

        const traySteps = trayStepsRaw?.filter((ts: any) => 
          ts.steps && ts.steps.water_frequency != null
        ) || [];

        if (!trayStepsError && traySteps && traySteps.length > 0) {
          // Fetch all steps to find harvest steps
          const { data: allRecipeSteps, error: stepsError } = await getSupabaseClient()
            .from('steps')
            .select('step_id, step_name, recipe_id, sequence_order')
            .in('recipe_id', recipeIds);

          if (!stepsError && allRecipeSteps) {
            // Group steps by recipe
            const stepsByRecipe: Record<number, any[]> = {};
            allRecipeSteps.forEach((step: any) => {
              if (!stepsByRecipe[step.recipe_id]) {
                stepsByRecipe[step.recipe_id] = [];
              }
              stepsByRecipe[step.recipe_id].push(step);
            });

            // Group trays by recipe for watering
            const traysByRecipe: Record<number, Array<{ tray_id: number; step: any }>> = {};
            traySteps.forEach((ts: any) => {
              const step = ts.steps;
              if (!step) return;

              const stepName = (step.step_name || '').trim();
              if (stepName !== 'Growing') return;

              const scheduledDate = parseLocalDate(ts.scheduled_date);
              if (!scheduledDate) return;
              const scheduledDateStr = formatDateString(scheduledDate);
              if (scheduledDateStr > todayStr) return;

              const tray = traysWithRecipes.find((t: any) => t.tray_id === ts.tray_id);
              if (!tray || !tray.recipe_id) return;

              const recipeId = tray.recipe_id;
              const recipeSteps = stepsByRecipe[recipeId] || [];
              const hasHarvestStep = recipeSteps.some((s: any) => {
                const name = (s.step_name || '').trim().toLowerCase();
                return name.includes('harvest');
              });

              if (!hasHarvestStep) return;

              if (!traysByRecipe[recipeId]) {
                traysByRecipe[recipeId] = [];
              }
              
              if (!traysByRecipe[recipeId].some((rt: any) => rt.tray_id === ts.tray_id)) {
                traysByRecipe[recipeId].push({
                  tray_id: ts.tray_id,
                  step: step
                });
              }
            });

            // Check for completed watering tasks
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

            // Create watering tasks grouped by recipe
            Object.keys(traysByRecipe).forEach((recipeIdStr) => {
              const recipeId = Number(recipeIdStr);
              const recipeTrays = traysByRecipe[recipeId];
              
              if (recipeTrays.length === 0) return;
              if (completedWateringRecipeIds.has(recipeId)) return;

              const recipeTray = traysWithRecipes.find((t: any) => t.recipe_id === recipeId);
              const recipeName = (recipeTray?.recipes as any)?.recipe_name || 'Unknown';

              wateringTasks.push({
                task_date: targetDateStr,
                task_name: `Water ${recipeName}`,
                task_source: 'tray_step',
                recipe_name: recipeName,
                quantity: recipeTrays.length,
              });
            });
          }
        }
      }
    }
  } catch (error) {
    console.warn('Error fetching watering tasks for calendar:', error);
  }

  // Fetch seeding/soaking tasks from planting_schedule_view (aligned with daily flow)
  const seedingTasks: CalendarDayTask[] = [];
  const soakingTasks: CalendarDayTask[] = [];
  
  // Fetch projected harvest tasks from planting_schedule_view with validation
  const harvestTasks: CalendarDayTask[] = [];
  
  if (targetDate) {
    try {
      // Fetch schedules for seeding (sow_date = targetDate) and soaking (sow_date - soak_duration = targetDate)
      const { data: allSchedules, error: scheduleError } = await getSupabaseClient()
        .from('planting_schedule_view')
        .select('sow_date, harvest_date, recipe_name, trays_needed, recipe_id, customer_name, delivery_date')
        .eq('farm_uuid', farmUuid);
      
      // Fetch recipe steps to calculate soak duration and total days
      const recipeIds = allSchedules ? [...new Set(allSchedules.map((s: any) => s.recipe_id).filter(Boolean))] : [];
      
      const { data: allSteps, error: stepsError } = recipeIds.length > 0 ? await getSupabaseClient()
        .from('steps')
        .select('*')
        .in('recipe_id', recipeIds) : { data: null, error: null };
      
      // Group steps by recipe and find soak duration
      const stepsByRecipe: Record<number, any[]> = {};
      const soakDurationByRecipe: Record<number, number> = {};
      if (allSteps && !stepsError) {
        allSteps.forEach((step: any) => {
          if (!stepsByRecipe[step.recipe_id]) {
            stepsByRecipe[step.recipe_id] = [];
          }
          stepsByRecipe[step.recipe_id].push(step);
          
          // Find soak step and calculate duration
          if (step.step_name?.toLowerCase().includes('soak') || step.action?.toLowerCase().includes('soak')) {
            const duration = step.duration || 0;
            const unit = (step.duration_unit || 'Days').toUpperCase();
            let days = duration;
            if (unit === 'HOURS') {
              days = duration >= 12 ? 1 : 0;
            }
            soakDurationByRecipe[step.recipe_id] = days;
          }
        });
        
        // Sort steps by order
        Object.keys(stepsByRecipe).forEach((recipeId) => {
          stepsByRecipe[Number(recipeId)].sort((a, b) => {
            const orderA = a.step_order ?? a.sequence_order ?? 0;
            const orderB = b.step_order ?? b.sequence_order ?? 0;
            return orderA - orderB;
          });
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
      
      const completedTaskKeys = new Set<string>();
      if (completedTasks && !completedTasksError) {
        completedTasks.forEach((ct: any) => {
          const key = `${ct.task_type}-${ct.recipe_id}`;
          completedTaskKeys.add(key);
        });
      }
      
      // Fetch existing tray_creation_requests to avoid duplicates
      const { data: existingRequests, error: requestsError } = await getSupabaseClient()
        .from('tray_creation_requests')
        .select('recipe_id, seed_date, requested_at, farm_uuid')
        .eq('farm_uuid', farmUuid)
        .in('status', ['pending', 'approved']);
      
      const existingRequestKeys = new Set<string>();
      if (existingRequests && !requestsError) {
        existingRequests.forEach((req: any) => {
          if (req.seed_date) {
            const seedDate = parseLocalDate(req.seed_date);
            if (seedDate) {
              const seedDateStr = formatDateString(seedDate);
              const key = `${req.recipe_id}-${seedDateStr}`;
              existingRequestKeys.add(key);
            }
          }
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
          
          // Check for seeding tasks (sow_date = targetDate)
          if (sowDateStr === targetDateStr) {
            const requestKey = `${schedule.recipe_id}-${sowDateStr}`;
            if (existingRequestKeys.has(requestKey)) {
              continue; // Skip - will show from seed_request tasks
            }
            
            const seedingKey = `sowing-${schedule.recipe_id}`;
            if (!completedTaskKeys.has(seedingKey)) {
              seedingTasks.push({
                task_date: targetDateStr,
                task_name: `Seed ${schedule.recipe_name || 'Unknown'}`,
                task_source: 'seed_request',
                recipe_name: schedule.recipe_name || null,
                quantity: schedule.trays_needed || null,
                customer_name: schedule.customer_name || null,
              });
            }
          }
          
          // Check for soaking tasks (sow_date - soak_duration = targetDate)
          if (soakDateStr === targetDateStr && soakDuration > 0) {
            const soakingKey = `soaking-${schedule.recipe_id}`;
            if (!completedTaskKeys.has(soakingKey)) {
              soakingTasks.push({
                task_date: targetDateStr,
                task_name: `Soak ${schedule.recipe_name || 'Unknown'}`,
                task_source: 'soak_request',
                recipe_name: schedule.recipe_name || null,
                quantity: schedule.trays_needed || null,
                customer_name: schedule.customer_name || null,
              });
            }
          }
        }
        
        // Process harvest tasks with validation
        const harvestSchedules = allSchedules.filter((s: any) => {
          if (!s.harvest_date) return false;
          const harvestDate = parseLocalDate(s.harvest_date);
          if (!harvestDate) return false;
          return formatDateString(harvestDate) === targetDateStr;
        });
        
        if (harvestSchedules && harvestSchedules.length > 0) {
          // Fetch active trays to validate harvest
          const { data: activeTrays } = await getSupabaseClient()
            .from('trays')
            .select(`
              tray_id,
              recipe_id,
              sow_date,
              recipes(
                recipe_id,
                recipe_name
              )
            `)
            .eq('farm_uuid', farmUuid)
            .is('harvest_date', null)
            .not('sow_date', 'is', null)
            .or('status.is.null,status.eq.active');
          
          for (const schedule of harvestSchedules) {
            if (!schedule.harvest_date || !schedule.recipe_id) continue;
            
            // Check if there are actual trays ready to harvest for this recipe
            const recipeSteps = stepsByRecipe[schedule.recipe_id] || [];
            const totalDays = recipeSteps.reduce((sum: number, step: any) => {
              const duration = step.duration || 0;
              const unit = (step.duration_unit || 'Days').toUpperCase();
              if (unit === 'DAYS') {
                return sum + duration;
              } else if (unit === 'HOURS') {
                return sum + (duration >= 12 ? 1 : 0);
              }
              return sum + duration;
            }, 0);
            
            // Find trays for this recipe that are ready to harvest
            const readyTrays = (activeTrays || []).filter((tray: any) => {
              if (!tray.recipes || tray.recipe_id !== schedule.recipe_id || !tray.sow_date) {
                return false;
              }
              
              const sowDate = parseLocalDate(tray.sow_date);
              if (!sowDate) return false;
              
              const daysSinceSow = Math.floor((targetDate.getTime() - sowDate.getTime()) / (1000 * 60 * 60 * 24));
              return daysSinceSow >= totalDays;
            });
            
            // Only show harvest if there are actual trays ready
            if (readyTrays.length > 0) {
              harvestTasks.push({
                task_date: targetDateStr,
                task_name: `Harvest ${schedule.recipe_name || 'Unknown'}`,
                task_source: 'planting_schedule',
                recipe_name: schedule.recipe_name || null,
                quantity: readyTrays.length,
              });
            }
          }
        }
      }
    } catch (error) {
      console.warn('Error fetching seeding/soaking/harvest tasks for calendar:', error);
    }
  }

  // Fetch "At Risk" items from order fulfillment system
  // Aligned with daily flow: only show items where delivery_date === selectedDate
  // At Risk = sow_date has passed but harvest_date hasn't, and not enough trays are ready
  const atRiskTasks: CalendarDayTask[] = [];
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDateString(today);
    
    // Get orders ONLY for the selected date's delivery date (aligned with daily flow)
    const { data: orderDetails, error: orderError } = await getSupabaseClient()
      .from('order_fulfillment_status')
      .select('*')
      .eq('farm_uuid', farmUuid)
      .eq('delivery_date', targetDateStr) // Only items due on selected date
      .gt('trays_needed', 0); // Only items that need trays

    if (!orderError && orderDetails) {
      // Aggregate by recipe_id + customer + delivery_date to avoid duplicates
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
        
        // Verify delivery_date matches selected date (should already be filtered by query, but double-check)
        if (deliveryDateStr !== targetDateStr) {
          continue; // Skip items not due on selected date
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
      
      // Show at-risk items ONLY if their delivery_date matches the selected date
      for (const aggregated of aggregatedMap.values()) {
        // Double-check: Only show items whose delivery date matches the selected date
        if (aggregated.delivery_date !== targetDateStr) {
          continue; // Skip items not due on selected date
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
            atRiskTasks.push({
              task_date: targetDateStr,
              task_name: `At Risk: ${aggregated.recipe_name}`,
              task_source: 'order_fulfillment',
              recipe_name: aggregated.recipe_name,
              quantity: aggregated.missing,
              customer_name: aggregated.customer_name,
              sow_date: aggregated.sow_date,
              harvest_date: aggregated.harvest_date,
              delivery_date: aggregated.delivery_date,
              trays_ready: aggregated.trays_ready,
              trays_needed: aggregated.trays_needed,
            });
          }
        }
      }
    }
  } catch (error) {
    console.warn('Error fetching at-risk items for calendar:', error);
  }

  // Combine all tasks (aligned with daily flow)
  const allTasks = [
    ...(flowTasks || []), 
    ...supplementalTasks, 
    ...seedingTasks, 
    ...soakingTasks, 
    ...harvestTasks, 
    ...wateringTasks, 
    ...atRiskTasks
  ];
  
  // Remove duplicates based on task_name + recipe_name + task_source
  const seenTasks = new Set<string>();
  const uniqueTasks = allTasks.filter((task) => {
    const key = `${task.task_name || ''}-${task.recipe_name || ''}-${task.task_source || ''}`;
    if (seenTasks.has(key)) {
      return false;
    }
    seenTasks.add(key);
    return true;
  });
  
  // Sort by task name
  return uniqueTasks.sort((a, b) => {
    const nameA = (a.task_name || a.recipe_name || '').toLowerCase();
    const nameB = (b.task_name || b.recipe_name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
}





