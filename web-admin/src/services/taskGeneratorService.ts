import { supabase } from '../lib/supabaseClient';

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
}

const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
    // 1. Fetch planting schedules
    const { data: schedules, error: scheduleError } = await supabase
      .from('planting_schedule_view')
      .select('*')
      .eq('farm_uuid', farmUuid);

    if (scheduleError) throw scheduleError;

    // 2. Fetch soak requirements
    const { data: globalRecipes } = await supabase
      .from('global_recipes')
      .select('recipe_name, requires_soak, soak_hours');

    const soakMap = new Map<string, { requires_soak: boolean; soak_hours: number }>();
    (globalRecipes || []).forEach((gr: any) => {
      soakMap.set(gr.recipe_name?.toLowerCase(), {
        requires_soak: gr.requires_soak || false,
        soak_hours: gr.soak_hours || 0,
      });
    });

    // 3. Fetch completions for this week
    const { data: completions } = await supabase
      .from('task_completions')
      .select('*')
      .eq('farm_uuid', farmUuid)
      .gte('task_date', weekStartStr)
      .lte('task_date', weekEndStr);

    const completionSet = new Set(
      (completions || []).map((c: any) => 
        `${c.task_type}-${c.task_date}-${c.recipe_id || ''}-${c.customer_name || ''}-${c.product_name || ''}`
      )
    );

    const isCompleted = (type: string, date: string, recipeId?: number, customer?: string, product?: string) => {
      const key = `${type}-${date}-${recipeId || ''}-${customer || ''}-${product || ''}`;
      return completionSet.has(key);
    };

    // 4. Build task lists with grouping
    const taskMap = new Map<string, WeeklyTask>();

    for (const schedule of (schedules || [])) {
      const sowDate = new Date(schedule.sow_date);
      const sowDateStr = formatDateString(sowDate);
      const harvestDate = new Date(schedule.harvest_date);
      const harvestDateStr = formatDateString(harvestDate);
      const deliveryDate = new Date(schedule.delivery_date);
      const deliveryDateStr = formatDateString(deliveryDate);
      
      const recipeName = schedule.recipe_name || 'Unknown';
      const trays = schedule.trays_needed || 1;
      const soakInfo = soakMap.get(recipeName.toLowerCase());

      // SOAKING
      if (soakInfo?.requires_soak) {
        const soakDate = new Date(sowDate);
        soakDate.setDate(soakDate.getDate() - 1);
        const soakDateStr = formatDateString(soakDate);
        
        if (soakDateStr >= weekStartStr && soakDateStr <= weekEndStr) {
          const key = `soaking-${soakDateStr}-${schedule.recipe_id}`;
          if (taskMap.has(key)) {
            taskMap.get(key)!.quantity += trays;
          } else {
            taskMap.set(key, {
              task_type: 'soaking',
              task_date: soakDate,
              recipe_id: schedule.recipe_id,
              recipe_name: recipeName,
              quantity: trays,
              status: isCompleted('soaking', soakDateStr, schedule.recipe_id) ? 'completed' : 'pending',
              task_description: `Soak ${recipeName} (${soakInfo.soak_hours}h)`,
            });
          }
        }
      }

      // SOWING
      if (sowDateStr >= weekStartStr && sowDateStr <= weekEndStr) {
        const key = `sowing-${sowDateStr}-${schedule.recipe_id}`;
        if (taskMap.has(key)) {
          taskMap.get(key)!.quantity += trays;
        } else {
          taskMap.set(key, {
            task_type: 'sowing',
            task_date: sowDate,
            recipe_id: schedule.recipe_id,
            recipe_name: recipeName,
            quantity: trays,
            status: isCompleted('sowing', sowDateStr, schedule.recipe_id) ? 'completed' : 'pending',
            task_description: `Seed ${recipeName}`,
          });
        }
      }

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
    const { data: maintenanceTasks } = await supabase
      .from('maintenance_tasks')
      .select('*')
      .eq('farm_uuid', farmUuid)
      .eq('is_active', true);

    for (const mt of (maintenanceTasks || [])) {
      if (mt.day_of_week !== null) {
        const targetDay = mt.day_of_week;
        const weekStartDay = weekStartDate.getDay();
        const daysToAdd = (targetDay - weekStartDay + 7) % 7;
        
        const taskDate = new Date(weekStartDate);
        taskDate.setDate(taskDate.getDate() + daysToAdd);
        const taskDateStr = formatDateString(taskDate);
        
        if (taskDateStr >= weekStartStr && taskDateStr <= weekEndStr) {
          tasks.push({
            task_type: 'maintenance',
            task_date: taskDate,
            recipe_id: null,
            quantity: mt.quantity || 1,
            status: isCompleted('maintenance', taskDateStr, undefined, mt.task_name) ? 'completed' : 'pending',
            task_description: mt.task_name,
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
      await supabase
        .from('task_completions')
        .delete()
        .eq('farm_uuid', farmUuid)
        .eq('task_type', task.task_type)
        .eq('task_date', taskDateStr);

    } else {
      // Upsert completion record
      await supabase
        .from('task_completions')
        .upsert({
          farm_uuid: farmUuid,
          task_type: task.task_type,
          task_date: taskDateStr,
          recipe_id: task.recipe_id,
          customer_name: task.customer_name || null,
          product_name: task.product_name || null,
          status: status,
          completed_at: new Date().toISOString(),
        }, {
          onConflict: 'farm_uuid,task_type,task_date,recipe_id,customer_name,product_name'
        });
    }

    return true;
  } catch (error) {
    console.error('Error updating task status:', error);
    return false;
  }
};
