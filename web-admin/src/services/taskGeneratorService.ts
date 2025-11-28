import { supabase } from '../lib/supabaseClient';

export interface WeeklyTask {
  task_id?: number;
  task_type: 'soaking' | 'sowing' | 'uncovering' | 'harvesting';
  recipe_id: number;
  recipe_name?: string;
  week_start_date: Date;
  week_number: number;
  task_date: Date;
  quantity: number;
  status: 'pending' | 'in-progress' | 'completed' | 'skipped';
  notes?: string;
}

/**
 * Map step descriptions to task types
 */
const mapStepToTaskType = (stepDescription: string): 'soaking' | 'sowing' | 'uncovering' | 'harvesting' | null => {
  const desc = stepDescription.toLowerCase();
  if (desc.includes('soak') || desc.includes('soaking')) return 'soaking';
  if (desc.includes('sow') || desc.includes('sowing') || desc.includes('seed')) return 'sowing';
  if (desc.includes('uncover') || desc.includes('uncovering') || desc.includes('remove cover')) return 'uncovering';
  if (desc.includes('harvest') || desc.includes('harvesting') || desc.includes('cut')) return 'harvesting';
  return null;
};

/**
 * Generate weekly tasks from recipes and orders
 */
export const generateWeeklyTasks = async (
  weekStart: Date,
  farmUuid: string
): Promise<WeeklyTask[]> => {
  const tasks: WeeklyTask[] = [];
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // Get week number
  const weekNumber = getWeekNumber(weekStart);

  try {
    // Fetch active recipes with steps
    const { data: recipes, error: recipesError } = await supabase
      .from('recipes')
      .select('recipe_id, recipe_name')
      .eq('farm_uuid', farmUuid)
      .eq('is_active', true);

    if (recipesError) throw recipesError;

    // Fetch steps for all recipes
    const recipeIds = (recipes || []).map(r => r.recipe_id);
    if (recipeIds.length === 0) return tasks;

    const { data: steps, error: stepsError } = await supabase
      .from('steps')
      .select('*')
      .in('recipe_id', recipeIds);
    
    // Sort steps by step_order or sequence_order
    const sortedSteps = steps ? [...steps].sort((a, b) => {
      const orderA = a.step_order ?? a.sequence_order ?? 0;
      const orderB = b.step_order ?? b.sequence_order ?? 0;
      return orderA - orderB;
    }) : null;

    if (stepsError) throw stepsError;

    // Fetch active trays to determine quantities
    const { data: trays, error: traysError } = await supabase
      .from('trays')
      .select('tray_id, recipe_id, sow_date')
      .eq('farm_uuid', farmUuid)
      .is('harvest_date', null)
      .not('sow_date', 'is', null);

    if (traysError) throw traysError;

    // Group trays by recipe
    const traysByRecipe = new Map<number, any[]>();
    (trays || []).forEach((tray: any) => {
      if (!traysByRecipe.has(tray.recipe_id)) {
        traysByRecipe.set(tray.recipe_id, []);
      }
      traysByRecipe.get(tray.recipe_id)!.push(tray);
    });

    // Generate tasks for each recipe
    for (const recipe of recipes || []) {
      const recipeSteps = (sortedSteps || []).filter(s => s.recipe_id === recipe.recipe_id);
      const recipeTrays = traysByRecipe.get(recipe.recipe_id) || [];

      // For each tray, calculate task dates
      for (const tray of recipeTrays) {
        const sowDate = new Date(tray.sow_date);
        let daysFromSow = 0;

        for (const step of recipeSteps) {
          const taskDate = new Date(sowDate);
          taskDate.setDate(taskDate.getDate() + daysFromSow);

          // Check if task date falls within the week
          if (taskDate >= weekStart && taskDate <= weekEnd) {
            const taskType = mapStepToTaskType(step.step_description);
            if (taskType) {
              tasks.push({
                task_type: taskType,
                recipe_id: recipe.recipe_id,
                recipe_name: recipe.recipe_name,
                week_start_date: weekStart,
                week_number: weekNumber,
                task_date: taskDate,
                quantity: 1, // One tray
                status: 'pending',
              });
            }
          }

          daysFromSow += step.duration_days || 0;
        }
      }
    }

    // Group tasks by date and type, then aggregate quantities
    const taskMap = new Map<string, WeeklyTask>();
    tasks.forEach(task => {
      const key = `${task.task_date.toISOString().split('T')[0]}-${task.task_type}-${task.recipe_id}`;
      if (taskMap.has(key)) {
        const existing = taskMap.get(key)!;
        existing.quantity += task.quantity;
      } else {
        taskMap.set(key, { ...task });
      }
    });

    return Array.from(taskMap.values()).sort((a, b) => 
      a.task_date.getTime() - b.task_date.getTime()
    );
  } catch (error) {
    console.error('Error generating weekly tasks:', error);
    return [];
  }
};

/**
 * Get week number in the year
 */
const getWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

/**
 * Save weekly tasks to database
 */
export const saveWeeklyTasks = async (
  tasks: WeeklyTask[],
  farmUuid: string
): Promise<boolean> => {
  try {
    const payload = tasks.map(task => ({
      farm_uuid: farmUuid,
      task_type: task.task_type,
      recipe_id: task.recipe_id,
      week_start_date: task.week_start_date.toISOString().split('T')[0],
      week_number: task.week_number,
      task_date: task.task_date.toISOString().split('T')[0],
      quantity: task.quantity,
      status: task.status,
      notes: task.notes || null,
    }));

    const { error } = await supabase
      .from('weekly_tasks')
      .insert(payload);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error saving weekly tasks:', error);
    return false;
  }
};

/**
 * Fetch weekly tasks from database
 */
export const fetchWeeklyTasks = async (
  weekStart: Date,
  farmUuid: string
): Promise<WeeklyTask[]> => {
  try {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const { data, error } = await supabase
      .from('weekly_tasks')
      .select(`
        *,
        recipes(recipe_id, recipe_name)
      `)
      .eq('farm_uuid', farmUuid)
      .gte('task_date', weekStart.toISOString().split('T')[0])
      .lte('task_date', weekEnd.toISOString().split('T')[0])
      .order('task_date', { ascending: true });

    if (error) throw error;

    return (data || []).map((task: any) => ({
      task_id: task.task_id,
      task_type: task.task_type,
      recipe_id: task.recipe_id,
      recipe_name: task.recipes?.recipe_name || '',
      week_start_date: new Date(task.week_start_date),
      week_number: task.week_number,
      task_date: new Date(task.task_date),
      quantity: task.quantity,
      status: task.status,
      notes: task.notes,
    }));
  } catch (error) {
    console.error('Error fetching weekly tasks:', error);
    return [];
  }
};

/**
 * Update task status
 */
export const updateTaskStatus = async (
  taskId: number,
  status: 'pending' | 'in-progress' | 'completed' | 'skipped',
  farmUuid: string
): Promise<boolean> => {
  try {
    const updateData: any = { status };
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('weekly_tasks')
      .update(updateData)
      .eq('task_id', taskId)
      .eq('farm_uuid', farmUuid);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating task status:', error);
    return false;
  }
};

