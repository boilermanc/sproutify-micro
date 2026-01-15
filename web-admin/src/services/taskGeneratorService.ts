import { getSupabaseClient } from '../lib/supabaseClient';

export interface WeeklyTask {
  task_type: 'soaking' | 'sowing' | 'harvesting' | 'delivery' | 'maintenance';
  task_date: Date;
  recipe_id: number | null;
  recipe_name?: string;
  quantity: number;
  status: 'pending' | 'completed' | 'skipped';
  task_description?: string;
  customer_name?: string;
  product_name?: string;
  maintenance_task_id?: number;
}

const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
 * Fetch weekly tasks directly from views — no generation needed
 */
export const fetchWeeklyTasks = async (
  weekStart: Date,
  farmUuid: string
): Promise<WeeklyTask[]> => {
  const tasks: WeeklyTask[] = [];
  
  const weekStartDate = new Date(weekStart);
  weekStartDate.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStartDate);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  const weekStartStr = formatDateString(weekStartDate);
  const weekEndStr = formatDateString(weekEnd);

  try {
    // 0. Fetch actual seeding tasks (view splits soak/seed and computes remaining)
    const { data: seedingTasks, error: seedingError } = await getSupabaseClient()
      .from('seeding_request_daily_tasks')
      .select('*')
      .eq('farm_uuid', farmUuid)
      .gte('task_date', weekStartStr)
      .lte('task_date', weekEndStr)
      .order('task_date');

    if (seedingError) throw seedingError;

    // 1. Fetch planting schedules (still used for harvest/delivery projections)
    const { data: allSchedules, error: scheduleError } = await getSupabaseClient()
      .from('planting_schedule_view')
      .select('*')
      .eq('farm_uuid', farmUuid);

    if (scheduleError) throw scheduleError;

    // 1.5. Filter out schedules where trays have already been created
    // Fetch all trays and task_completions for these recipes to check if they're already seeded
    let schedules = allSchedules || [];
    const recipeIds = [...new Set(schedules.map((s: any) => s.recipe_id).filter((id: any) => id !== null))];
    
    if (recipeIds.length > 0) {
      // Fetch all existing trays for these recipes
      const { data: existingTrays } = await getSupabaseClient()
        .from('trays')
        .select('recipe_id, sow_date')
        .eq('farm_uuid', farmUuid)
        .eq('status', 'active') // only consider active trays
        .in('recipe_id', recipeIds);
      
      // Fetch all completed sowing tasks for these recipes
      const { data: completedSowingTasks } = await getSupabaseClient()
        .from('task_completions')
        .select('recipe_id, task_date')
        .eq('farm_uuid', farmUuid)
        .in('recipe_id', recipeIds)
        .eq('task_type', 'sowing')
        .eq('status', 'completed');
      
      // Create a map of recipe_id -> set of seeded dates (for flexible matching)
      const seededDatesByRecipe = new Map<number, Set<string>>();
      
      // Add dates for existing trays
      if (existingTrays && existingTrays.length > 0) {
        existingTrays.forEach((tray: any) => {
          if (tray.sow_date) {
            const recipeId = tray.recipe_id;
            const traySowDate = parseLocalDate(tray.sow_date);
            if (traySowDate) {
              const traySowDateStr = formatDateString(traySowDate);
              if (!seededDatesByRecipe.has(recipeId)) {
                seededDatesByRecipe.set(recipeId, new Set<string>());
              }
              seededDatesByRecipe.get(recipeId)!.add(traySowDateStr);
            }
          }
        });
      }
      
      // Add dates for completed tasks
      if (completedSowingTasks && completedSowingTasks.length > 0) {
        completedSowingTasks.forEach((task: any) => {
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
      
      // Filter schedules: remove any that have trays or task_completions for that recipe
      // on the scheduled date OR within ±1 day (handles same-day or next-day seeding)
      const DATE_TOLERANCE_DAYS = 1;
      schedules = schedules.filter((schedule: any) => {
        if (!schedule.recipe_id) return true; // Keep schedules without recipe_id (e.g., delivery tasks)
        
        const sowDate = parseLocalDate(schedule.sow_date) || new Date();
        sowDate.setHours(0, 0, 0, 0);
        const sowDateMs = sowDate.getTime();
        
        const seededDates = seededDatesByRecipe.get(schedule.recipe_id);
        if (!seededDates || seededDates.size === 0) {
          // No trays/tasks for this recipe, keep the schedule
          return true;
        }
        
        // Check if any seeded date is within tolerance of the schedule date
        for (const seededDateStr of seededDates) {
          const seededDate = parseLocalDate(seededDateStr) || new Date();
          seededDate.setHours(0, 0, 0, 0);
          const seededDateMs = seededDate.getTime();
          const daysDiff = Math.abs(seededDateMs - sowDateMs) / (1000 * 60 * 60 * 24);
          
          // If seeded within tolerance days of the scheduled date, filter out the schedule
          if (daysDiff <= DATE_TOLERANCE_DAYS) {
            return false; // Filter out this schedule
          }
        }
        
        return true; // Keep the schedule
      });
    }

    // 2. Fetch completions for this week
    const { data: completions } = await getSupabaseClient()
      .from('task_completions')
      .select('*')
      .eq('farm_uuid', farmUuid)
      .gte('task_date', weekStartStr)
      .lte('task_date', weekEndStr);

    const completionSet = new Set(
      (completions || []).map((c: any) => {
        // Normalize task_date to YYYY-MM-DD format (remove time if present)
        const taskDate = c.task_date ? (c.task_date.includes('T') ? c.task_date.split('T')[0] : c.task_date) : '';
        return `${c.task_type}-${taskDate}-${c.recipe_id || ''}-${c.customer_name || ''}-${c.product_name || ''}`;
      })
    );

    const isCompleted = (type: string, date: string, recipeId?: number, customer?: string, product?: string) => {
      // Normalize null/undefined to empty string for consistent key matching
      const key = `${type}-${date}-${recipeId || ''}-${customer || ''}-${product || ''}`;
      return completionSet.has(key);
    };

    // 3. Build task lists with grouping
    const taskMap = new Map<string, WeeklyTask>();

    // 3a. Fetch variety_name for seeding tasks (growers look for variety names on seed bags)
    const seedingRecipeIds = seedingTasks 
      ? [...new Set(seedingTasks.map((t: any) => t.recipe_id).filter(Boolean))] 
      : [];
    
    const { data: seedingRecipesData, error: seedingRecipesError } = seedingRecipeIds.length > 0 ? await getSupabaseClient()
      .from('recipes')
      .select('recipe_id, variety_name')
      .in('recipe_id', seedingRecipeIds)
      .eq('farm_uuid', farmUuid) : { data: null, error: null };
    
    // Create a map of recipe_id -> variety_name for seeding tasks
    const seedingVarietyNameMap: Record<number, string> = {};
    if (seedingRecipesData && !seedingRecipesError) {
      seedingRecipesData.forEach((recipe: any) => {
        if (recipe.recipe_id && recipe.variety_name) {
          seedingVarietyNameMap[recipe.recipe_id] = recipe.variety_name;
        }
      });
    }

    // 3b. Soak/Seed tasks from actual requests (authoritative)
    for (const task of seedingTasks || []) {
      const dateStr = task.task_date?.includes('T') ? task.task_date.split('T')[0] : task.task_date;
      if (!dateStr) continue;
      const taskDate = parseLocalDate(dateStr);
      if (!taskDate) continue;
      taskDate.setHours(0, 0, 0, 0);
      const type = task.task_type === 'soak' ? 'soaking' : 'sowing';
      const remaining =
        typeof task.trays_remaining === 'number'
          ? task.trays_remaining
          : Math.max(
              0,
              (task.trays || task.quantity || 0) - (task.quantity_completed || 0 || 0)
            );
      const status =
        remaining <= 0 || isCompleted(type, dateStr, task.recipe_id)
          ? 'completed'
          : 'pending';
      const key = `${type}-${dateStr}-${task.recipe_id || ''}-${task.request_id || ''}`;
      if (!taskMap.has(key)) {
        // Use variety_name for seeding tasks (growers look for variety names on seed bags)
        const varietyName = seedingVarietyNameMap[task.recipe_id] || task.variety_name || task.recipe_name || 'Unknown';
        taskMap.set(key, {
          task_type: type as 'soaking' | 'sowing',
          task_date: taskDate,
          recipe_id: task.recipe_id || null,
          recipe_name: varietyName,
          quantity: remaining || 0,
          status,
          task_description: task.task_type === 'soak'
            ? `Soak ${varietyName}`
            : `Seed ${varietyName}`,
        });
      }
    }

    // 3b. Projected harvest/delivery (from planting_schedule_view)
    for (const schedule of (schedules || [])) {
      const sowDate = parseLocalDate(schedule.sow_date) || new Date();
      sowDate.setHours(0, 0, 0, 0);
      const harvestDate = parseLocalDate(schedule.harvest_date) || new Date();
      harvestDate.setHours(0, 0, 0, 0);
      const harvestDateStr = formatDateString(harvestDate);
      const deliveryDate = parseLocalDate(schedule.delivery_date) || new Date();
      deliveryDate.setHours(0, 0, 0, 0);
      const deliveryDateStr = formatDateString(deliveryDate);
      
      const recipeName = schedule.recipe_name || 'Unknown';
      const trays = schedule.trays_needed || 1;

      // HARVESTING
      if (harvestDateStr >= weekStartStr && harvestDateStr <= weekEndStr) {
        const key = `harvesting-${harvestDateStr}-${schedule.recipe_id}`;
        if (taskMap.has(key)) {
          taskMap.get(key)!.quantity += trays;
        } else {
          taskMap.set(key, {
            task_type: 'harvesting',
            task_date: harvestDate,
            recipe_id: schedule.recipe_id,
            recipe_name: recipeName,
            quantity: trays,
            status: isCompleted('harvesting', harvestDateStr, schedule.recipe_id) ? 'completed' : 'pending',
            task_description: `Harvest ${recipeName}`,
          });
        }
      }

      // DELIVERY (group by date + customer + product)
      if (deliveryDateStr >= weekStartStr && deliveryDateStr <= weekEndStr) {
        const key = `delivery-${deliveryDateStr}-${schedule.customer_name}-${schedule.product_name}`;
        if (!taskMap.has(key)) {
          taskMap.set(key, {
            task_type: 'delivery',
            task_date: deliveryDate,
            recipe_id: null,
            quantity: schedule.product_quantity || 1,
            status: isCompleted('delivery', deliveryDateStr, undefined, schedule.customer_name, schedule.product_name) ? 'completed' : 'pending',
            task_description: `Deliver ${schedule.product_name} to ${schedule.customer_name}`,
            customer_name: schedule.customer_name,
            product_name: schedule.product_name,
          });
        }
      }
    }

    tasks.push(...taskMap.values());

    // 5. Fetch maintenance tasks
    const { data: maintenanceTasks, error: mtError } = await getSupabaseClient()
      .from('maintenance_tasks')
      .select('*')
      .eq('farm_uuid', farmUuid)
      .eq('is_active', true);

    // DEBUG: Log maintenance task fetching
    console.log('=== MAINTENANCE TASK DEBUG ===');
    console.log('Farm UUID:', farmUuid);
    console.log('Week range:', weekStartStr, 'to', weekEndStr);
    console.log('Maintenance tasks fetched:', maintenanceTasks?.length || 0);
    console.log('Maintenance tasks error:', mtError);
    console.log('Raw maintenance tasks:', JSON.stringify(maintenanceTasks, null, 2));

    for (const mt of (maintenanceTasks || [])) {
      console.log(`Processing task: "${mt.task_name}" | day_of_week: ${mt.day_of_week} (type: ${typeof mt.day_of_week}) | frequency: ${mt.frequency}`);

      if (mt.day_of_week !== null) {
        const targetDay = mt.day_of_week;
        const weekStartDay = weekStartDate.getDay();
        const daysToAdd = (targetDay - weekStartDay + 7) % 7;

        const taskDate = new Date(weekStartDate);
        taskDate.setDate(taskDate.getDate() + daysToAdd);
        const taskDateStr = formatDateString(taskDate);

        console.log(`  -> targetDay: ${targetDay}, weekStartDay: ${weekStartDay}, daysToAdd: ${daysToAdd}`);
        console.log(`  -> taskDateStr: ${taskDateStr}, in range: ${taskDateStr >= weekStartStr && taskDateStr <= weekEndStr}`);

        if (taskDateStr >= weekStartStr && taskDateStr <= weekEndStr) {
          // Store task_name in product_name so completion check matches what's saved
          const taskName = mt.task_name;
          tasks.push({
            task_type: 'maintenance',
            task_date: taskDate,
            recipe_id: null,
            quantity: mt.quantity || 1,
            status: isCompleted('maintenance', taskDateStr, undefined, undefined, taskName) ? 'completed' : 'pending',
            task_description: taskName,
            product_name: taskName, // Store in product_name for completion matching
            maintenance_task_id: mt.maintenance_task_id,
          });
        }
      }
    }

    return tasks.sort((a, b) => a.task_date.getTime() - b.task_date.getTime());

  } catch (error) {
    console.error('Error fetching weekly tasks:', error);
    return [];
  }
};

/**
 * Mark a task as completed/skipped/pending
 */
export const updateTaskStatus = async (
  task: WeeklyTask,
  status: 'completed' | 'skipped' | 'pending',
  farmUuid: string
): Promise<boolean> => {
  try {
    const taskDateStr = formatDateString(task.task_date);
    
    if (status === 'pending') {
      // Remove completion record
      await getSupabaseClient()
        .from('task_completions')
        .delete()
        .eq('farm_uuid', farmUuid)
        .eq('task_type', task.task_type)
        .eq('task_date', taskDateStr);

    } else {
      // Upsert completion record
      const completionData: any = {
        farm_uuid: farmUuid,
        task_type: task.task_type,
        task_date: taskDateStr,
        recipe_id: task.recipe_id,
        customer_name: task.customer_name || null,
        product_name: task.product_name || null,
        status: status,
        completed_at: new Date().toISOString(),
      };
      
      // Add maintenance_task_id if this is a maintenance task
      if (task.task_type === 'maintenance' && task.maintenance_task_id) {
        completionData.maintenance_task_id = task.maintenance_task_id;
      }
      
      await getSupabaseClient()
        .from('task_completions')
        .upsert(completionData, {
          onConflict: 'farm_uuid,task_type,task_date,recipe_id,customer_name,product_name'
        });
    }

    return true;
  } catch (error) {
    console.error('Error updating task status:', error);
    return false;
  }
};
