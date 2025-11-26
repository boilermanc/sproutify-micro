import { supabase } from '../lib/supabaseClient';

export interface DailyTask {
  id: string;
  action: string;
  crop: string;
  batchId: string;
  location: string;
  dayCurrent: number;
  dayTotal: number;
  trays: number;
  status: 'urgent' | 'pending';
  trayIds: number[];
  recipeId: number;
  stepId?: number;
  stepDescription?: string;
}

/**
 * Fetch active trays with their recipe steps and calculate daily tasks
 */
export const fetchDailyTasks = async (): Promise<DailyTask[]> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return [];

    const { farmUuid } = JSON.parse(sessionData);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch active trays (not harvested) with recipes
    const { data: trays, error: traysError } = await supabase
      .from('trays')
      .select(`
        tray_id,
        tray_unique_id,
        recipe_id,
        sow_date,
        batch_id,
        recipes!inner(
          recipe_id,
          recipe_name,
          variety_name
        )
      `)
      .eq('farm_uuid', farmUuid)
      .is('harvest_date', null)
      .not('sow_date', 'is', null);

    if (traysError) throw traysError;
    if (!trays || trays.length === 0) return [];

    // Fetch all recipe steps for the recipes we have
    const recipeIds = [...new Set(trays.map((t: any) => t.recipe_id))];
    const { data: allSteps, error: stepsError } = await supabase
      .from('steps')
      .select('*')
      .in('recipe_id', recipeIds)
      .order('recipe_id, step_order');

    if (stepsError) throw stepsError;

    // Group steps by recipe_id
    const stepsByRecipe: Record<number, any[]> = {};
    (allSteps || []).forEach((step: any) => {
      if (!stepsByRecipe[step.recipe_id]) {
        stepsByRecipe[step.recipe_id] = [];
      }
      stepsByRecipe[step.recipe_id].push(step);
    });

    // Fetch tray_steps to see which steps are completed
    const trayIds = trays.map((t: any) => t.tray_id);
    const { data: traySteps, error: trayStepsError } = await supabase
      .from('tray_steps')
      .select('*')
      .in('tray_id', trayIds);

    if (trayStepsError) throw trayStepsError;

    // Create a map of completed steps per tray
    const completedStepsMap: Record<number, Set<number>> = {};
    (traySteps || []).forEach((ts: any) => {
      if (ts.completed) {
        if (!completedStepsMap[ts.tray_id]) {
          completedStepsMap[ts.tray_id] = new Set();
        }
        completedStepsMap[ts.tray_id].add(ts.step_id);
      }
    });

    // Fetch batches for batch IDs
    const batchIds = [...new Set(trays.map((t: any) => t.batch_id).filter(Boolean))];
    let batchesMap: Record<number, any> = {};
    if (batchIds.length > 0) {
      const { data: batches } = await supabase
        .from('seedbatches')
        .select('batchid')
        .in('batchid', batchIds);
      
      batchesMap = (batches || []).reduce((acc, b) => {
        acc[b.batchid] = b;
        return acc;
      }, {} as Record<number, any>);
    }

    // Transform trays into tasks
    const tasks: DailyTask[] = [];
    const taskMap: Record<string, DailyTask> = {};

    trays.forEach((tray: any) => {
      const recipe = tray.recipes;
      const steps = stepsByRecipe[recipe.recipe_id] || [];
      if (steps.length === 0) return;

      const sowDate = new Date(tray.sow_date);
      const daysSinceSow = Math.max(0, Math.floor((today.getTime() - sowDate.getTime()) / (1000 * 60 * 60 * 24)));
      
      // Calculate total days for the recipe
      const totalDays = steps.reduce((sum: number, step: any) => sum + (step.duration_days || 0), 0);
      const dayCurrent = Math.min(Math.max(0, daysSinceSow), totalDays);

      // Find the current step based on days elapsed
      let currentStep: any = null;
      let daysIntoRecipe = 0;
      
      for (const step of steps) {
        if (daysSinceSow >= daysIntoRecipe && daysSinceSow < daysIntoRecipe + (step.duration_days || 0)) {
          currentStep = step;
          break;
        }
        daysIntoRecipe += step.duration_days || 0;
      }

      // If past all steps, the task is harvest
      if (!currentStep && daysSinceSow >= totalDays) {
        currentStep = steps[steps.length - 1]; // Last step is usually harvest
      }

      // If no current step found, use first step
      if (!currentStep) {
        currentStep = steps[0];
      }

      // Determine action from step description
      const stepDesc = currentStep.step_description.toLowerCase();
      let action = 'Water'; // Default
      
      if (stepDesc.includes('harvest')) {
        action = 'Harvest';
      } else if (stepDesc.includes('uncover') || stepDesc.includes('light')) {
        action = 'Uncover';
      } else if (stepDesc.includes('water') || stepDesc.includes('irrigat')) {
        action = 'Water';
      } else if (stepDesc.includes('blackout')) {
        action = 'Blackout';
      }

      // Check if step is completed
      const completedSteps = completedStepsMap[tray.tray_id] || new Set();
      const isStepCompleted = completedSteps.has(currentStep.step_id);

      // Skip if this step is already completed
      if (isStepCompleted && action !== 'Harvest') {
        // Move to next incomplete step
        const stepIndex = steps.findIndex((s: any) => s.step_id === currentStep.step_id);
        if (stepIndex < steps.length - 1) {
          currentStep = steps[stepIndex + 1];
          const nextStepDesc = currentStep.step_description.toLowerCase();
          if (nextStepDesc.includes('harvest')) {
            action = 'Harvest';
          } else if (nextStepDesc.includes('uncover') || nextStepDesc.includes('light')) {
            action = 'Uncover';
          } else if (nextStepDesc.includes('water') || nextStepDesc.includes('irrigat')) {
            action = 'Water';
          }
        }
      }

      // Create a task key for grouping
      const taskKey = `${action}-${recipe.variety_name}-${currentStep.step_id}`;
      const batchId = tray.batch_id ? `B-${tray.batch_id}` : 'N/A';
      const location = 'Rack A • Shelf 1'; // TODO: Add location tracking

      if (taskMap[taskKey]) {
        // Group similar tasks
        taskMap[taskKey].trays += 1;
        taskMap[taskKey].trayIds.push(tray.tray_id);
      } else {
        taskMap[taskKey] = {
          id: taskKey,
          action,
          crop: recipe.variety_name,
          batchId,
          location,
          dayCurrent,
          dayTotal: totalDays,
          trays: 1,
          status: action === 'Harvest' || dayCurrent >= totalDays - 1 ? 'urgent' : 'pending',
          trayIds: [tray.tray_id],
          recipeId: recipe.recipe_id,
          stepId: currentStep.step_id,
          stepDescription: currentStep.step_description,
        };
      }
    });

    return Object.values(taskMap);
  } catch (error) {
    console.error('Error fetching daily tasks:', error);
    return [];
  }
};

/**
 * Mark a task as completed by updating tray_steps
 */
export const completeTask = async (task: DailyTask): Promise<boolean> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return false;

    if (!task.stepId) return false;

    // Mark the step as completed for all trays in this task
    const updates = task.trayIds.map(trayId => ({
      tray_id: trayId,
      step_id: task.stepId!,
      completed: true,
      completed_at: new Date().toISOString(),
    }));

    // Check if tray_steps already exist, if not create them
    for (const update of updates) {
      const { data: existing } = await supabase
        .from('tray_steps')
        .select('id')
        .eq('tray_id', update.tray_id)
        .eq('step_id', update.step_id)
        .single();

      if (existing) {
        // Update existing
        await supabase
          .from('tray_steps')
          .update({
            completed: true,
            completed_at: update.completed_at,
          })
          .eq('id', existing.id);
      } else {
        // Insert new
        await supabase
          .from('tray_steps')
          .insert([update]);
      }
    }

    // If it's a harvest action, also update the harvest_date on the tray
    if (task.action === 'Harvest') {
      for (const trayId of task.trayIds) {
        await supabase
          .from('trays')
          .update({ harvest_date: new Date().toISOString() })
          .eq('tray_id', trayId);
      }
    }

    return true;
  } catch (error) {
    console.error('Error completing task:', error);
    return false;
  }
};

/**
 * Get total active trays count
 */
export const getActiveTraysCount = async (): Promise<number> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return 0;

    const { farmUuid } = JSON.parse(sessionData);

    const { count, error } = await supabase
      .from('trays')
      .select('*', { count: 'exact', head: true })
      .eq('farm_uuid', farmUuid)
      .is('harvest_date', null);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error fetching active trays count:', error);
    return 0;
  }
};

