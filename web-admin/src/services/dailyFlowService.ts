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
        location,
        recipes(
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

    // Filter out trays without recipes
    const traysWithRecipes = trays.filter((t: any) => t.recipes && t.recipe_id);
    if (traysWithRecipes.length === 0) return [];

    // Fetch all recipe steps for the recipes we have
    const recipeIds = [...new Set(traysWithRecipes.map((t: any) => t.recipe_id).filter(Boolean))];
    if (recipeIds.length === 0) return [];
    
    const { data: allSteps, error: stepsError } = await supabase
      .from('steps')
      .select('*')
      .in('recipe_id', recipeIds);

    if (stepsError) throw stepsError;

    // Group steps by recipe_id and sort by step_order
    const stepsByRecipe: Record<number, any[]> = {};
    (allSteps || []).forEach((step: any) => {
      if (!stepsByRecipe[step.recipe_id]) {
        stepsByRecipe[step.recipe_id] = [];
      }
      stepsByRecipe[step.recipe_id].push(step);
    });
    
    // Sort steps by step_order or sequence_order within each recipe
    Object.keys(stepsByRecipe).forEach((recipeId) => {
      stepsByRecipe[Number(recipeId)].sort((a, b) => {
        const orderA = a.step_order ?? a.sequence_order ?? 0;
        const orderB = b.step_order ?? b.sequence_order ?? 0;
        return orderA - orderB;
      });
    });

    // Fetch tray_steps to see which steps are completed
    const trayIds = traysWithRecipes.map((t: any) => t.tray_id);
    const { data: traySteps, error: trayStepsError } = await supabase
      .from('tray_steps')
      .select('*')
      .in('tray_id', trayIds);

    if (trayStepsError) throw trayStepsError;

    // Create a map of completed steps per tray
    // Use 'completed' boolean and 'completed_at' timestamp
    const completedStepsMap: Record<number, Set<number>> = {};
    (traySteps || []).forEach((ts: any) => {
      if (ts.completed || ts.completed_at) {
        if (!completedStepsMap[ts.tray_id]) {
          completedStepsMap[ts.tray_id] = new Set();
        }
        completedStepsMap[ts.tray_id].add(ts.step_id);
      }
    });

    // Fetch batches for batch IDs (commented out - not currently used)
    // const batchIds = [...new Set(traysWithRecipes.map((t: any) => t.batch_id).filter(Boolean))];
    // let batchesMap: Record<number, any> = {};
    // if (batchIds.length > 0) {
    //   const { data: batches } = await supabase
    //     .from('seedbatches')
    //     .select('batchid')
    //     .in('batchid', batchIds);
    //   
    //   batchesMap = (batches || []).reduce((acc, b) => {
    //     acc[b.batchid] = b;
    //     return acc;
    //   }, {} as Record<number, any>);
    // }

    // Transform trays into tasks
    const taskMap: Record<string, DailyTask> = {};

    for (const tray of traysWithRecipes) {
      const recipe = tray.recipes as any;
      if (!recipe || !recipe.recipe_id) continue; // Skip trays without valid recipes
      const recipeId = recipe.recipe_id;
      const steps = stepsByRecipe[recipeId] || [];
      if (steps.length === 0) continue; // Skip trays without steps

      const sowDate = new Date(tray.sow_date);
      sowDate.setHours(0, 0, 0, 0); // Normalize sow date to midnight for accurate day calculation
      // Calculate days since sow - if sown today, it's day 1, not day 0
      const daysSinceSow = Math.max(1, Math.floor((today.getTime() - sowDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      
      // Calculate total days for the recipe, accounting for duration_unit
      const totalDays = steps.reduce((sum: number, step: any) => {
        const duration = step.duration || 0;
        const unit = (step.duration_unit || 'Days').toUpperCase();
        if (unit === 'DAYS') {
          return sum + duration;
        } else if (unit === 'HOURS') {
          // Hours >= 12 counts as 1 day, otherwise 0
          return sum + (duration >= 12 ? 1 : 0);
        }
        return sum + duration; // default: treat as days
      }, 0);
      const dayCurrent = Math.min(Math.max(1, daysSinceSow), totalDays);

      // Find the current step based on days elapsed
      // Note: daysSinceSow is 1-based (day 1 = sown today), so we subtract 1 for step range comparison
      let currentStep: any = null;
      let daysIntoRecipe = 0;
      const daysForStepComparison = daysSinceSow - 1; // Convert to 0-based for step range logic
      
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

      // If past all steps, the task is harvest
      if (!currentStep && daysSinceSow >= totalDays) {
        currentStep = steps[steps.length - 1]; // Last step is usually harvest
      }

      // If no current step found, use first step
      if (!currentStep) {
        currentStep = steps[0];
      }

      // Determine action from step description
      const stepDesc = (currentStep.description_name || currentStep.step_description || '').toLowerCase();
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

      // If current step is completed, try to find next incomplete step
      if (isStepCompleted) {
        let foundNextIncomplete = false;
        const stepIndex = steps.findIndex((s: any) => s.step_id === currentStep.step_id);
        
        // Look for next incomplete step
        for (let i = stepIndex + 1; i < steps.length; i++) {
          if (!completedSteps.has(steps[i].step_id)) {
            currentStep = steps[i];
            foundNextIncomplete = true;
            const nextStepDesc = (currentStep.description_name || currentStep.step_description || '').toLowerCase();
            if (nextStepDesc.includes('harvest')) {
              action = 'Harvest';
            } else if (nextStepDesc.includes('uncover') || nextStepDesc.includes('light')) {
              action = 'Uncover';
            } else if (nextStepDesc.includes('water') || nextStepDesc.includes('irrigat')) {
              action = 'Water';
            } else if (nextStepDesc.includes('blackout')) {
              action = 'Blackout';
            }
            break;
          }
        }
        
        // If all remaining steps are completed (including harvest), skip this tray
        // The tray should be harvested and will be filtered out by harvest_date check
        if (!foundNextIncomplete) {
          continue; // Skip this tray - all steps are done
        }
      }

      // Create a task key for grouping
      const varietyName = (recipe as any).variety_name || recipe.recipe_name || 'Unknown';
      const taskKey = `${action}-${varietyName}-${currentStep.step_id}`;
      const batchId = tray.batch_id ? `B-${tray.batch_id}` : 'N/A';
      const location = tray.location || 'Not set';

      if (taskMap[taskKey]) {
        // Group similar tasks
        taskMap[taskKey].trays += 1;
        taskMap[taskKey].trayIds.push(tray.tray_id);
      } else {
        taskMap[taskKey] = {
          id: taskKey,
          action,
          crop: (recipe as any).variety_name || recipe.recipe_name || 'Unknown',
          batchId,
          location,
          dayCurrent,
          dayTotal: totalDays,
          trays: 1,
          status: action === 'Harvest' || dayCurrent >= totalDays - 1 ? 'urgent' : 'pending',
          trayIds: [tray.tray_id],
          recipeId: recipeId,
          stepId: currentStep.step_id,
          stepDescription: currentStep.description_name || currentStep.step_description || '',
        };
      }
    }

    return Object.values(taskMap);
  } catch (error) {
    console.error('Error fetching daily tasks:', error);
    return [];
  }
};

/**
 * Mark a task as completed by updating tray_steps
 * Uses actual schema: status='Completed', completed_date, completed_by
 */
export const completeTask = async (task: DailyTask): Promise<boolean> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return false;

    const { farmUuid } = JSON.parse(sessionData);
    const now = new Date().toISOString();

    // If it's a harvest action, update the harvest_date on the trays
    // The trigger will also handle this, but we do it explicitly too
    if (task.action === 'Harvest') {
      const { error: harvestError } = await supabase
        .from('trays')
        .update({ harvest_date: now })
        .in('tray_id', task.trayIds)
        .eq('farm_uuid', farmUuid);

      if (harvestError) {
        console.error('Error updating harvest_date:', harvestError);
        throw harvestError;
      }
    }

    // Update tray_steps for all tasks (including harvest)
    // Use the actual schema: completed (boolean), completed_at (timestamp)
    if (task.stepId) {
      // First, ensure tray_steps records exist for all tray/step combinations
      for (const trayId of task.trayIds) {
        // Check if record exists
        const { data: existing, error: checkError } = await supabase
          .from('tray_steps')
          .select('id')
          .eq('tray_id', trayId)
          .eq('step_id', task.stepId)
          .maybeSingle();
        
        if (checkError) {
          console.error('Error checking tray_steps:', checkError);
          throw checkError;
        }
        
        if (!existing) {
          // Insert if doesn't exist
          const { error: insertError } = await supabase
            .from('tray_steps')
            .insert({
              tray_id: trayId,
              step_id: task.stepId,
              completed: true,
              completed_at: now,
            });
          
          if (insertError) {
            console.error('Error inserting tray_steps:', insertError);
            throw insertError;
          }
        } else {
          // Update if exists
          const { error: updateError } = await supabase
            .from('tray_steps')
            .update({
              completed: true,
              completed_at: now,
            })
            .eq('id', existing.id);
          
          if (updateError) {
            console.error('Error updating tray_steps:', updateError);
            throw updateError;
          }
        }
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

