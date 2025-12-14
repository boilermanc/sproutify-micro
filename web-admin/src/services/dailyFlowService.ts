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
  traysRemaining?: number; // Trays remaining to complete (from view)
  status: 'urgent' | 'pending';
  trayIds: number[];
  recipeId: number;
  stepId?: number;
  stepDescription?: string;
  missedSteps?: MissedStep[];
  // New fields for seeding workflow
  taskSource?: 'tray_step' | 'soak_request' | 'seed_request' | 'expiring_seed';
  requestId?: number;
  quantity?: number;
  quantityCompleted?: number;
  stepColor?: string;
  sourceType?: string;
  customerName?: string;
}

export interface MissedStep {
  stepId: number;
  stepName: string;
  description: string;
  expectedDay: number;
  trayIds: number[];
}

/**
 * Fetch daily tasks from daily_flow_aggregated view
 * This view includes tray_step tasks, soak_request tasks, seed_request tasks, and expiring_seed tasks
 */
export const fetchDailyTasks = async (selectedDate?: Date): Promise<DailyTask[]> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return [];

    const { farmUuid } = JSON.parse(sessionData);
    const today = selectedDate || new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = today.toISOString().split('T')[0];

    // Query daily_flow_aggregated view for today's tasks
    // Note: The view may not include recipe_id directly, so we'll fetch it from requests when needed
    const { data: tasksData, error: tasksError } = await supabase
      .from('daily_flow_aggregated')
      .select('*')
      .eq('farm_uuid', farmUuid)
      .eq('task_date', taskDate)
      .order('task_source', { ascending: true })
      .order('recipe_name', { ascending: true });

    if (tasksError) throw tasksError;

    if (!tasksData || tasksData.length === 0) {
      return [];
    }

    // Transform view data into DailyTask objects
    const tasks: DailyTask[] = tasksData.map((row: any) => {
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
      } else {
        // For tray_step tasks, use task_name as action
        action = taskName;
      }

      // Determine status
      const isUrgent = row.task_source === 'expiring_seed' || 
                      row.task_source === 'seed_request' || 
                      action === 'Harvest';
      
      // Create unique ID
      const taskId = `${row.task_source}-${row.request_id || row.task_name}-${row.recipe_name}-${taskDate}`;

      return {
        id: taskId,
        action,
        crop: row.variety_name || row.recipe_name || 'Unknown',
        batchId: 'N/A', // Will be selected during completion
        location: 'Not set',
        dayCurrent: 0,
        dayTotal: 0,
        trays: row.quantity || 1,
        traysRemaining: row.trays_remaining !== undefined ? row.trays_remaining : (row.quantity || 1), // Use trays_remaining from view if available
        status: isUrgent ? 'urgent' : 'pending',
        trayIds: [], // Not applicable for seeding requests
        recipeId: row.recipe_id || 0, // May be null for some task sources, will fetch from request if needed
        stepDescription: taskName,
        // New fields
        taskSource: row.task_source,
        requestId: row.request_id,
        quantity: row.quantity,
        quantityCompleted: row.quantity_completed || 0,
        stepColor: row.step_color,
        sourceType: row.source_type,
        customerName: row.customer_name,
      };
    });

    return tasks;

  } catch (error) {
    console.error('Error fetching daily tasks:', error);
    return [];
  }
};

/**
 * Mark a task as completed by updating tray_steps
 * Uses actual schema: status='Completed', completed_date, completed_by
 * For harvest tasks, optionally records the yield
 * For Soak and Seed tasks, records completion in task_completions
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
      taskDateStr = today.toISOString().split('T')[0];
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
        // batchId is required for Seed tasks to trigger tray creation
        if (!batchId) {
          throw new Error('Batch ID is required for seeding tasks');
        }

        // Get recipe to find variety
        const { data: recipeData, error: recipeError } = await supabase
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

        // Get variety name
        const varietyName = recipeData.variety_name || recipeData.recipe_name || '';

        console.log('[DailyFlow] Using batch_id:', batchId, 'for variety:', varietyName);

        if (!userId) {
          throw new Error('User ID not found in session');
        }

        // Create tray creation requests (one per tray)
        // Use the selected taskDate (seeding date) for requested_at, which becomes the sow_date
        // Convert taskDateStr to ISO string at midnight for consistent date handling
        const sowDateISO = taskDateStr ? new Date(taskDateStr + 'T00:00:00').toISOString() : now;
        
        // Ensure we only create the number of trays specified (should be 1 for daily flow seeding)
        const numberOfTrays = Math.max(1, task.trays || 1);
        const requests = Array.from({ length: numberOfTrays }, () => ({
          customer_name: null,
          variety_name: varietyName,
          recipe_name: recipeData.recipe_name,
          farm_uuid: farmUuid,
          user_id: userId,
          requested_at: sowDateISO, // Use selected seeding date, not current time
          batch_id: batchId, // Required for tray creation trigger
        }));

        console.log('[DailyFlow] Creating tray creation requests:', {
          numberOfTrays,
          taskTrays: task.trays,
          requestsCount: requests.length,
          recipeName: recipeData.recipe_name,
          batchId
        });

        const { error: requestError } = await supabase
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
      const { error: completionError } = await supabase
        .from('task_completions')
        .upsert(completionData, {
          onConflict: 'farm_uuid,task_type,task_date,recipe_id,customer_name,product_name'
        });

      // If that fails, try without customer_name and product_name in the conflict
      if (completionError) {
        console.log('[DailyFlow] First upsert failed, trying alternative:', completionError);
        const { error: altError } = await supabase
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
      return true;
    }

    // If it's a harvest action, update the harvest_date and yield on the trays
    if (task.action === 'Harvest') {
      // Calculate yield per tray if provided
      const yieldPerTray = yieldValue && task.trays > 0 ? yieldValue / task.trays : undefined;

      const updateData: Record<string, any> = { harvest_date: now };
      if (yieldPerTray !== undefined) {
        updateData.yield = yieldPerTray;
      }

      const { error: harvestError } = await supabase
        .from('trays')
        .update(updateData)
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
      console.log('[DailyFlow] Completing task with stepId:', {
        action: task.action,
        stepId: task.stepId,
        trayIds: task.trayIds,
        trayCount: task.trayIds.length
      });

      // First, ensure tray_steps records exist for all tray/step combinations
      for (const trayId of task.trayIds) {
        // Check if record exists using composite key (tray_id, step_id)
        const { data: existing, error: checkError } = await supabase
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
          console.log('[DailyFlow] Inserted tray_steps for tray:', trayId, 'step:', task.stepId);
        } else {
          // Update using composite key
          const { error: updateError } = await supabase
            .from('tray_steps')
            .update({
              completed: true,
              completed_at: now,
            })
            .eq('tray_id', trayId)
            .eq('step_id', task.stepId);

          if (updateError) {
            console.error('Error updating tray_steps:', updateError);
            throw updateError;
          }
          console.log('[DailyFlow] Updated tray_steps for tray:', trayId, 'step:', task.stepId);
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
          const { data: stepsData, error: stepsError } = await supabase
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
                const { data: existing, error: checkError } = await supabase
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
                  const { error: insertError } = await supabase
                    .from('tray_steps')
                    .insert({
                      tray_id: trayId,
                      step_id: matchingStep.step_id,
                      completed: true,
                      completed_at: now,
                    });

                  if (insertError) {
                    console.error('Error inserting tray_steps (fallback):', insertError);
                  } else {
                    console.log('[DailyFlow] Inserted tray_steps (fallback) for tray:', trayId, 'step:', matchingStep.step_id);
                  }
                } else {
                  const { error: updateError } = await supabase
                    .from('tray_steps')
                    .update({
                      completed: true,
                      completed_at: now,
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
    // The error message from Supabase is in error.message
    throw error;
  }
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
      const { data: existing, error: checkError } = await supabase
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
        const { error: insertError } = await supabase
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
        const { error: updateError } = await supabase
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
      const { data: existing, error: checkError } = await supabase
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
        const { error: insertError } = await supabase
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
        const { error: updateError } = await supabase
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
      const { data: existing, error: checkError } = await supabase
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
        const { error: insertError } = await supabase
          .from('tray_steps')
          .insert({
            tray_id: trayId,
            step_id: missedStep.stepId,
            completed: true,
            completed_at: now,
          });

        if (insertError) throw insertError;
      } else {
        // Update using composite key
        const { error: updateError } = await supabase
          .from('tray_steps')
          .update({
            completed: true,
            completed_at: now,
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
    const { data: trayData } = await supabase
      .from('trays')
      .select('tray_id, variety_name, recipe_name, customer_name, sow_date')
      .in('tray_id', trayIds)
      .eq('farm_uuid', farmUuid);

    const { error } = await supabase
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
 */
export const completeSoakTask = async (
  requestId: number,
  seedbatchId: number,
  quantityGrams: number,
  userId?: string
): Promise<number> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) throw new Error('No session found');

    const { userId: sessionUserId } = JSON.parse(sessionData);
    const userToUse = userId || sessionUserId;

    const { data, error } = await supabase.rpc('complete_soak_task', {
      p_request_id: requestId,
      p_seedbatch_id: seedbatchId,
      p_quantity_grams: quantityGrams,
      p_user_id: userToUse || null,
    });

    if (error) throw error;

    return data || 0; // Returns soaked_seed_id
  } catch (error) {
    console.error('Error completing soak task:', error);
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
  userId?: string
): Promise<number> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) throw new Error('No session found');

    const { userId: sessionUserId } = JSON.parse(sessionData);
    const userToUse = userId || sessionUserId;

    const { data, error } = await supabase.rpc('complete_seed_task', {
      p_request_id: requestId,
      p_quantity_completed: quantityCompleted,
      p_seedbatch_id: seedbatchId,
      p_user_id: userToUse || null,
    });

    if (error) throw error;

    return data || 0; // Returns number of trays created
  } catch (error) {
    console.error('Error completing seed task:', error);
    throw error;
  }
};

/**
 * Use leftover soaked seed to create ad-hoc trays
 */
export const useLeftoverSoakedSeed = async (
  soakedId: number,
  quantityTrays: number,
  requestId: number | null,
  userId?: string
): Promise<number> => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) throw new Error('No session found');

    const { userId: sessionUserId } = JSON.parse(sessionData);
    const userToUse = userId || sessionUserId;

    const { data, error } = await supabase.rpc('use_leftover_soaked_seed', {
      p_soaked_id: soakedId,
      p_quantity_trays: quantityTrays,
      p_request_id: requestId,
      p_user_id: userToUse || null,
    });

    if (error) throw error;

    return data || 0; // Returns number of trays created
  } catch (error) {
    console.error('Error using leftover soaked seed:', error);
    throw error;
  }
};

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
    const { data: soakedData } = await supabase
      .from('soaked_seeds')
      .select('soaked_seed_id, variety_name, quantity_remaining, unit, request_id')
      .eq('soaked_seed_id', soakedId)
      .single();

    const { data, error } = await supabase.rpc('discard_soaked_seed', {
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
    
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;

    await supabase.from('activity_log').insert({
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
    const { data: requestData } = await supabase
      .from('tray_creation_requests')
      .select('recipe_name, variety_name, seed_date, customer_name, farm_uuid')
      .eq('request_id', requestId)
      .single();

    const { error } = await supabase
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
 * Reschedule a seeding request
 */
export const rescheduleSeedingRequest = async (
  requestId: number,
  newSeedDate: string,
  originalDate: string
): Promise<void> => {
  try {
    const { error } = await supabase
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

