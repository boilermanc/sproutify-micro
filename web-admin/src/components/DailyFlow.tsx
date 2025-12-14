import { useState, useEffect, useRef } from 'react';
import {
  Check,
  Droplets,
  Sun,
  Scissors,
  Clock,
  MoreVertical,
  ArrowRight,
  Sprout,
  Eye,
  ExternalLink,
  SkipForward,
  AlertTriangle,
  FastForward,
  ChevronDown,
  ChevronUp,
  Scale,
  Package,
  Trash2,
  XCircle,
  Calendar,
  Beaker,
  MapPin
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabaseClient';
import {
  fetchDailyTasks,
  completeTask,
  getActiveTraysCount,
  skipTask,
  skipMissedStep,
  completeMissedStep,
  skipAllMissedSteps,
  markTraysAsLost,
  LOSS_REASONS,
  completeSoakTask,
  completeSeedTask,
  useLeftoverSoakedSeed,
  discardSoakedSeed,
  cancelSeedingRequest,
  rescheduleSeedingRequest
} from '../services/dailyFlowService';
import type { DailyTask, MissedStep, LossReason } from '../services/dailyFlowService';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export default function DailyFlow() {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [activeTraysCount, setActiveTraysCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [viewingTask, setViewingTask] = useState<DailyTask | null>(null);
  const [harvestingTask, setHarvestingTask] = useState<DailyTask | null>(null);
  const [harvestYield, setHarvestYield] = useState<string>('');
  const [seedingTask, setSeedingTask] = useState<DailyTask | null>(null);
  const [soakTask, setSoakTask] = useState<DailyTask | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [availableBatches, setAvailableBatches] = useState<any[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [soakQuantityGrams, setSoakQuantityGrams] = useState<string>('');
  const [seedQuantityPerTray, setSeedQuantityPerTray] = useState<number>(0);
  const [seedQuantityCompleted, setSeedQuantityCompleted] = useState<string>('');
  const [isSoakVariety, setIsSoakVariety] = useState<boolean>(false);
  const [availableSoakedSeed, setAvailableSoakedSeed] = useState<any>(null);
  const [allAvailableSoakedSeed, setAllAvailableSoakedSeed] = useState<any[]>([]);
  const [useSoakedSeedDialog, setUseSoakedSeedDialog] = useState<any>(null);
  const [useSoakedSeedQuantity, setUseSoakedSeedQuantity] = useState<string>('');
  const [discardSoakedSeedDialog, setDiscardSoakedSeedDialog] = useState<any>(null);
  const [discardReason, setDiscardReason] = useState<string>('expired');
  const [missedStepForSeeding, setMissedStepForSeeding] = useState<{ task: DailyTask; step: MissedStep } | null>(null);
  const [skipAllTask, setSkipAllTask] = useState<DailyTask | null>(null);
  const [lostTask, setLostTask] = useState<DailyTask | null>(null);
  const [lossReason, setLossReason] = useState<LossReason | ''>('');
  const [lossNotes, setLossNotes] = useState<string>('');
  const [cancelRequestDialog, setCancelRequestDialog] = useState<{ task: DailyTask; reason: string } | null>(null);
  const [isCancellingRequest, setIsCancellingRequest] = useState(false);
  const [rescheduleRequestDialog, setRescheduleRequestDialog] = useState<{ task: DailyTask; newDate: string } | null>(null);
  const [passiveStepDetails, setPassiveStepDetails] = useState<{ stepName: string; varieties: Array<{ recipe: string; trays: number }>; totalTrays: number } | null>(null);
  
  // Ref to prevent duplicate submissions (more reliable than state for this)
  const isSubmittingSeeding = useRef(false);
  
  // Track tasks that are animating out
  const [animatingOut, setAnimatingOut] = useState<Set<string>>(new Set());

  // Autofill seeding quantity based on remaining trays and batch inventory
  useEffect(() => {
    if (!seedingTask || isSoakVariety) return;
    if (!seedQuantityPerTray || seedQuantityPerTray <= 0) return;
    const batch = availableBatches.find((b) => b.batchid === selectedBatchId);
    if (!batch) return;
    const remaining = Math.max(0, (seedingTask.quantity || 0) - (seedingTask.quantityCompleted || 0));
    const availableGrams = parseFloat(batch.quantity || 0);
    const needed = remaining * seedQuantityPerTray;
    const maxTrays = seedQuantityPerTray > 0 ? Math.floor(availableGrams / seedQuantityPerTray) : 0;
    if (!seedQuantityCompleted) {
      if (needed <= availableGrams) {
        setSeedQuantityCompleted(remaining.toString());
      } else if (maxTrays > 0) {
        setSeedQuantityCompleted(maxTrays.toString());
      }
    }
  }, [seedingTask, isSoakVariety, availableBatches, selectedBatchId, seedQuantityPerTray, seedQuantityCompleted]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      const farmUuid = sessionData ? JSON.parse(sessionData).farmUuid : null;

      const [tasksData, count] = await Promise.all([
        fetchDailyTasks(),
        getActiveTraysCount()
      ]);
      console.log('[DailyFlow Component] Loaded tasks:', {
        total: tasksData.length,
        prep: tasksData.filter(t => t.action === 'Soak' || t.action === 'Seed').length,
        harvest: tasksData.filter(t => t.action === 'Harvest').length,
        workflow: tasksData.filter(t => t.action !== 'Harvest' && t.action !== 'Soak' && t.action !== 'Seed').length,
        allTasks: tasksData
      });
      setTasks(tasksData);
      setActiveTraysCount(count);

      // Load available soaked seed
      // Note: available_soaked_seed view already filters by status='available', so we don't need to filter again
      if (farmUuid) {
        const { data: soakedSeedData, error } = await supabase
          .from('available_soaked_seed')
          .select('*')
          .eq('farm_uuid', farmUuid)
          .order('expires_at', { ascending: true });

        if (error) {
          console.error('[DailyFlow] Error fetching available soaked seed:', error);
        } else if (soakedSeedData) {
          setAllAvailableSoakedSeed(soakedSeedData);
        }
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
    // Refresh every 5 minutes
    const interval = setInterval(loadTasks, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
    show: boolean;
  }>({ type: 'success', message: '', show: false });

  const [errorDialog, setErrorDialog] = useState<{
    show: boolean;
    message: string;
    title: string;
  }>({ show: false, message: '', title: 'Error' });

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message, show: true });
    setTimeout(() => setNotification({ type, message, show: false }), 5000);
  };

  const showErrorDialog = (title: string, message: string) => {
    setErrorDialog({ show: true, message, title });
  };

  const handleComplete = async (task: DailyTask, yieldValue?: number, batchId?: number, taskDate?: string) => {
    // For harvest tasks, open the harvest dialog instead of completing directly
    if (task.action === 'Harvest' && yieldValue === undefined) {
      setHarvestingTask(task);
      setHarvestYield('');
      return;
    }

    // For soak tasks, open the soak dialog instead of completing directly
    if (task.action === 'Soak' && task.taskSource === 'soak_request') {
      setSoakTask(task);
      setSelectedBatchId(null);
      setAvailableBatches([]);
      setSoakQuantityGrams('');
      
      // Fetch available batches for this recipe
      // fetchAvailableBatchesForRecipe will handle fetching recipe_id from request if needed
      await fetchAvailableBatchesForRecipe(task);
      return;
    }

    // For seed tasks, open the seeding dialog instead of completing directly
    if (task.action === 'Seed' && task.taskSource === 'seed_request') {
      setSeedingTask(task);
      setSelectedBatchId(null);
      setAvailableBatches([]);
      setSeedQuantityCompleted('');
      // Clear missed step reference for regular tasks
      setMissedStepForSeeding(null);
      setIsSoakVariety(false);
      setAvailableSoakedSeed(null);
      
      // Check if this is a soak variety and fetch relevant data
      if (task.requestId) {
        const { data: requestData } = await supabase
          .from('tray_creation_requests')
          .select('recipe_id')
          .eq('request_id', task.requestId)
          .single();
        
        if (requestData) {
          // Check if recipe has soak step
          const { data: hasSoakData } = await supabase.rpc('recipe_has_soak', {
            p_recipe_id: requestData.recipe_id
          });
          
          const hasSoak = hasSoakData && hasSoakData[0]?.has_soak;
          setIsSoakVariety(hasSoak || false);
          
          if (hasSoak) {
            // Soak variety - fetch available soaked seed
            // Note: available_soaked_seed view already filters by status='available'
            const sessionData = localStorage.getItem('sproutify_session');
            if (sessionData) {
              const { farmUuid } = JSON.parse(sessionData);
              const { data: soakedSeedData } = await supabase
                .from('available_soaked_seed')
                .select('*')
                .eq('farm_uuid', farmUuid)
                .eq('request_id', task.requestId)
                .order('soak_date', { ascending: true })
                .limit(1);
              
              if (soakedSeedData && soakedSeedData.length > 0) {
                setAvailableSoakedSeed(soakedSeedData[0]);
              }
            }
          } else {
            // Non-soak variety - need batch selection
            await fetchAvailableBatchesForRecipe(task);
          }
        }
      }
      return;
    }

    // Only add to completingIds if not already there (prevent duplicate calls)
    // Note: handleSeedingConfirm already adds it, so this is a safeguard for direct calls
    // Check current state first (synchronous check)
    if (completingIds.has(task.id)) {
      console.log('[DailyFlow] Task already in completingIds, skipping duplicate handleComplete call');
      return;
    }
    
    // Add to completingIds
    setCompletingIds(prev => new Set(prev).add(task.id));
    
    try {
      const success = await completeTask(task, yieldValue, batchId, taskDate);
      if (success) {
        // Start exit animation
        setAnimatingOut(prev => new Set(prev).add(task.id));
        
        // Show formatted success notification
        const yieldText = yieldValue ? ` - ${yieldValue}g yield` : '';
        showNotification('success', `${task.action} completed for ${task.trays} ${task.trays === 1 ? 'tray' : 'trays'} (${task.batchId})${yieldText}`);

        // Wait for animation to complete, then remove task
        setTimeout(() => {
          setTasks(prev => prev.filter(t => t.id !== task.id));
          setAnimatingOut(prev => {
            const next = new Set(prev);
            next.delete(task.id);
            return next;
          });
          
          // Only reload for tasks that might affect other tasks or counts
          // (Harvest changes active tray count, Seed creates new trays)
          // For simple tasks like Water, just remove from state
          const needsReload = task.action === 'Harvest' || task.action === 'Seed' || task.action === 'Soak';
          if (needsReload) {
            // Reload tasks after animation to get updated counts and new tasks
            setTimeout(async () => {
              await loadTasks();
            }, 100);
          }
        }, 300); // Animation duration
      } else {
        showNotification('error', 'Failed to complete task. Please try again.');
      }
    } catch (error: any) {
      console.error('Error completing task:', error);
      const errorMessage = error?.message || 'Failed to complete task. Please try again.';
      
      // Show error dialog for critical errors (like insufficient seed)
      if (error?.code === 'P0001' || errorMessage.includes('Not enough seed') || errorMessage.includes('insufficient')) {
        showErrorDialog('Insufficient Seed', errorMessage);
      } else {
        showNotification('error', errorMessage);
      }
    } finally {
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const handleHarvestConfirm = async () => {
    if (!harvestingTask) return;

    const yieldValue = harvestYield ? parseFloat(harvestYield) : undefined;
    setHarvestingTask(null);
    await handleComplete(harvestingTask, yieldValue);
  };

  const fetchAvailableBatchesForRecipe = async (task: DailyTask) => {
    setLoadingBatches(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        setAvailableBatches([]);
        return;
      }

      const { farmUuid } = JSON.parse(sessionData);

      // Get recipe_id and variety_name from request if task has requestId, otherwise use task.recipeId
      let recipeId = task.recipeId;
      let requestRecipeName: string | null = null;
      let requestVarietyName: string | null = null;
      
      if (task.requestId && (!recipeId || recipeId === 0)) {
        const { data: requestData, error: requestError } = await supabase
          .from('tray_creation_requests')
          .select('recipe_id, recipe_name, variety_name')
          .eq('request_id', task.requestId)
          .maybeSingle();
        
        if (requestError) {
          console.error('[DailyFlow] Error fetching request:', requestError);
          setAvailableBatches([]);
          return;
        } else if (requestData) {
          if (requestData.recipe_id) {
            recipeId = requestData.recipe_id;
            console.log('[DailyFlow] Fetched recipe_id from request:', recipeId);
          }
          if (requestData.recipe_name) {
            requestRecipeName = requestData.recipe_name;
          }
          if (requestData.variety_name) {
            requestVarietyName = requestData.variety_name;
          }
        } else {
          console.error('[DailyFlow] Request found but no recipe_id:', { requestId: task.requestId, requestData });
          setAvailableBatches([]);
          return;
        }
      }

      console.log('[DailyFlow] Fetching recipe:', { recipeId, farmUuid, requestVarietyName });

      // Fetch recipe to get variety_id and seed_quantity
      // First try with is_active filter (active recipes)
      let { data: recipeData, error: recipeError } = await supabase
        .from('recipes')
        .select('recipe_id, recipe_name, variety_id, variety_name, seed_quantity, seed_quantity_unit, is_active')
        .eq('recipe_id', recipeId)
        .eq('farm_uuid', farmUuid)
        .maybeSingle();

      // If not found, try without is_active filter (in case recipe is inactive)
      if (!recipeData && !recipeError) {
        console.log('[DailyFlow] Recipe not found as active, checking if it exists as inactive...');
        const { data: inactiveRecipe, error: inactiveError } = await supabase
          .from('recipes')
          .select('recipe_id, recipe_name, variety_id, variety_name, seed_quantity, seed_quantity_unit, is_active')
          .eq('recipe_id', recipeId)
          .eq('farm_uuid', farmUuid)
          .maybeSingle();
        
        if (inactiveRecipe) {
          console.warn('[DailyFlow] Recipe found but is inactive:', inactiveRecipe);
          recipeData = inactiveRecipe;
          recipeError = null;
        } else if (inactiveError) {
          recipeError = inactiveError;
        }
      }

      // If recipe not found, try to find variety by name from request and fetch batches directly
      let varietyId: number | null = null;
      let varietyName: string = '';
      let seedQuantityPerTray = 0;
      let totalSeedNeeded = 0;

      if (recipeData) {
        // Recipe found - use its data
        varietyId = recipeData.variety_id;
        varietyName = recipeData.variety_name || '';
        
        // Calculate seed quantity needed per tray (convert to grams)
        if (recipeData.seed_quantity) {
          const unit = recipeData.seed_quantity_unit || 'grams';
          seedQuantityPerTray = unit === 'oz' ? recipeData.seed_quantity * 28.35 : recipeData.seed_quantity;
        }
        totalSeedNeeded = seedQuantityPerTray * task.trays;
      } else if (requestVarietyName) {
        // Recipe not found, but we have variety_name from request - try to find variety by name
        console.log('[DailyFlow] Recipe not found, trying to find variety by name:', requestVarietyName);
        const { data: varietyData, error: varietyError } = await supabase
          .from('varieties')
          .select('varietyid, name, seed_quantity_grams')
          .ilike('name', requestVarietyName)
          .maybeSingle();
        
        if (varietyData) {
          varietyId = varietyData.varietyid;
          varietyName = varietyData.name || requestVarietyName;
          // Get seed_quantity_grams from variety
          seedQuantityPerTray = varietyData.seed_quantity_grams || 0;
          console.log('[DailyFlow] Found variety by name:', { varietyId, varietyName, seedQuantityPerTray });
        } else {
          console.error('[DailyFlow] Variety not found by name:', { varietyName: requestVarietyName, error: varietyError });
          const recipeName = requestRecipeName || `Recipe ID ${recipeId}`;
          showNotification('error', `Recipe "${recipeName}" not found and variety "${requestVarietyName}" not found. Please check your data.`);
          setAvailableBatches([]);
          return;
        }
      } else {
        // No recipe and no variety_name - can't proceed
        const recipeName = requestRecipeName || `Recipe ID ${recipeId}`;
        console.error('[DailyFlow] Recipe not found and no variety_name available:', { recipeId, farmUuid, task, requestRecipeName });
        showNotification('error', `Recipe "${recipeName}" (ID: ${recipeId}) not found for your farm. The recipe may have been deleted.`);
        setAvailableBatches([]);
        return;
      }

      if (!varietyId) {
        console.error('[DailyFlow] No variety_id found');
        showNotification('error', 'Could not determine variety for this recipe. Please check your recipe configuration.');
        setAvailableBatches([]);
        return;
      }

      // Query available batches by variety_id (not recipe_id)
      // This is the correct approach - batches are linked to varieties, not recipes
      console.log('[DailyFlow] Fetching batches for variety_id:', varietyId);
      
      let query = supabase
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
        .eq('varietyid', varietyId)
        .eq('is_active', true)
        .gt('quantity', 0); // Only batches with quantity > 0

      // Only filter by quantity if we have a seed requirement
      if (totalSeedNeeded > 0) {
        query = query.gte('quantity', totalSeedNeeded);
      }

      const { data: batchesData, error: batchesError } = await query
        .order('purchasedate', { ascending: true });

      // Fetch variety name and seed_quantity_grams if we don't have them yet
      // Always fetch seed_quantity_grams from variety if we don't have it from recipe
      if (varietyId) {
        const { data: varietyData } = await supabase
          .from('varieties')
          .select('name, seed_quantity_grams')
          .eq('varietyid', varietyId)
          .maybeSingle();
        if (varietyData) {
          if (!varietyName) {
            varietyName = varietyData.name || varietyName;
          }
          // Use variety's seed_quantity_grams if recipe didn't provide one or if it's 0
          if (seedQuantityPerTray === 0 && varietyData.seed_quantity_grams) {
            seedQuantityPerTray = varietyData.seed_quantity_grams;
          }
        }
      }

      if (batchesError) {
        console.error('[DailyFlow] Error fetching batches:', batchesError);
        setAvailableBatches([]);
        return;
      }

      console.log('[DailyFlow] Found batches:', { 
        count: batchesData?.length || 0, 
        varietyId, 
        varietyName,
        batches: batchesData 
      });

      // Format batches for display
      const formattedBatches = (batchesData || []).map((batch: any) => ({
        batchid: batch.batchid,
        quantity: batch.quantity,
        unit: batch.unit || 'grams', // Default to grams if unit is not set
        lot_number: batch.lot_number || null,
        purchasedate: batch.purchasedate,
        variety_name: varietyName,
      }));

      if (formattedBatches.length === 0) {
        console.warn('[DailyFlow] No batches found for variety:', { varietyId, varietyName, farmUuid });
        showNotification('error', `No seed batches found for variety "${varietyName}". Please add a batch first.`);
      }

      setAvailableBatches(formattedBatches);
      setSeedQuantityPerTray(seedQuantityPerTray); // Store for use in modal
    } catch (error) {
      console.error('[DailyFlow] Error in fetchAvailableBatchesForRecipe:', error);
      setAvailableBatches([]);
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleSoakConfirm = async () => {
    if (!soakTask || !selectedBatchId) {
      showNotification('error', 'Please select a seed batch');
      return;
    }

    if (!soakQuantityGrams || parseFloat(soakQuantityGrams) <= 0) {
      showNotification('error', 'Please enter a valid quantity in grams');
      return;
    }

    if (!soakTask.requestId) {
      showNotification('error', 'Invalid soak task - missing request ID');
      return;
    }

    // Prevent double-clicks
    if (isSubmittingSeeding.current) {
      return;
    }

    isSubmittingSeeding.current = true;
    setCompletingIds(prev => new Set(prev).add(soakTask!.id));

    try {
      const quantityGrams = parseFloat(soakQuantityGrams);
      const soakedSeedId = await completeSoakTask(
        soakTask.requestId,
        selectedBatchId,
        quantityGrams
      );

      showNotification('success', `Soak task completed! Soaked seed ID: ${soakedSeedId}`);
      
      // Close dialog and reload tasks
      setSoakTask(null);
      setSelectedBatchId(null);
      setAvailableBatches([]);
      setSoakQuantityGrams('');
      
      // Reload tasks to show updated status
      setTimeout(async () => {
        await loadTasks();
      }, 100);
    } catch (error: any) {
      console.error('Error completing soak task:', error);
      const errorMessage = error?.message || 'Failed to complete soak task';
      showNotification('error', errorMessage);
    } finally {
      isSubmittingSeeding.current = false;
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(soakTask?.id || '');
        return next;
      });
    }
  };

  const handleCancelRequest = async () => {
    if (!cancelRequestDialog || isCancellingRequest) return;

    setIsCancellingRequest(true);
    try {
      await cancelSeedingRequest(
        cancelRequestDialog.task.requestId!,
        cancelRequestDialog.reason
      );
      showNotification('success', 'Request cancelled successfully');
      setCancelRequestDialog(null);
      setTimeout(loadTasks, 100);
    } catch (error: any) {
      console.error('Error cancelling request:', error);
      showNotification('error', error?.message || 'Failed to cancel request');
    } finally {
      setIsCancellingRequest(false);
    }
  };

  const handleRescheduleRequest = async () => {
    if (!rescheduleRequestDialog) return;

    try {
      // Get original date from request
      const { data: requestData } = await supabase
        .from('tray_creation_requests')
        .select('seed_date')
        .eq('request_id', rescheduleRequestDialog.task.requestId!)
        .single();

      const originalDate = requestData?.seed_date || new Date().toISOString();

      await rescheduleSeedingRequest(
        rescheduleRequestDialog.task.requestId!,
        rescheduleRequestDialog.newDate,
        originalDate
      );
      showNotification('success', 'Request rescheduled successfully');
      setRescheduleRequestDialog(null);
      setTimeout(loadTasks, 100);
    } catch (error: any) {
      console.error('Error rescheduling request:', error);
      showNotification('error', error?.message || 'Failed to reschedule request');
    }
  };

  const handleSeedingConfirm = async () => {
    if (!seedingTask) {
      showNotification('error', 'Invalid seeding task');
      return;
    }

    if (!seedQuantityCompleted || parseInt(seedQuantityCompleted) <= 0) {
      showNotification('error', 'Please enter a valid quantity of trays to seed');
      return;
    }

    if (!seedingTask.requestId) {
      showNotification('error', 'Invalid seed task - missing request ID');
      return;
    }

    // Prevent double-clicks and duplicate submissions using ref (synchronous check)
    if (isSubmittingSeeding.current) {
      console.log('[DailyFlow] Seeding already in progress, ignoring duplicate call');
      return;
    }

    // Also check completingIds as a secondary safeguard
    if (completingIds.has(seedingTask.id)) {
      console.log('[DailyFlow] Task already in completingIds, ignoring duplicate call');
      return;
    }

    // Prevent double-clicks
    if (isSubmittingSeeding.current) {
      return;
    }

    // Check if batch is required (for non-soak varieties)
    // For soak varieties, batch_id should be null
    let batchIdToUse: number | null = null;
    if (selectedBatchId) {
      batchIdToUse = selectedBatchId;
    }

    // Check if this is a soak variety by checking the request
    let isSoakVariety = false;
    if (seedingTask.requestId) {
      const { data: requestData } = await supabase
        .from('tray_creation_requests')
        .select('recipe_id')
        .eq('request_id', seedingTask.requestId)
        .single();
      
      if (requestData) {
        const { data: hasSoak } = await supabase.rpc('recipe_has_soak', {
          p_recipe_id: requestData.recipe_id
        });
        
        isSoakVariety = hasSoak && hasSoak[0]?.has_soak;
        
        // For soak varieties, batch_id should be null
        if (isSoakVariety) {
          batchIdToUse = null;
        } else if (!batchIdToUse) {
          // For non-soak varieties, batch_id is required
          showNotification('error', 'Please select a seed batch for non-soak varieties');
          return;
        }
      }
    }

    isSubmittingSeeding.current = true;
    setCompletingIds(prev => new Set(prev).add(seedingTask.id));

    const missedStepRef = missedStepForSeeding;
    const quantityToComplete = parseInt(seedQuantityCompleted);
    
    try {
      const traysCreated = await completeSeedTask(
        seedingTask.requestId!,
        quantityToComplete,
        batchIdToUse
      );

      showNotification('success', `Seeding completed! Created ${traysCreated} ${traysCreated === 1 ? 'tray' : 'trays'}`);
      
      // Only close dialog and clear state on success
      setSeedingTask(null);
      setMissedStepForSeeding(null);
      setSelectedBatchId(null);
      setAvailableBatches([]);
      setSeedQuantityCompleted('');
      
      // If this was triggered from a missed step, mark it as completed
      if (missedStepRef) {
        const success = await completeMissedStep(missedStepRef.step);
        if (success) {
          console.log('[DailyFlow] Marked missed seeding step as completed');
        }
      }

      // Reload tasks to show updated status
      setTimeout(async () => {
        await loadTasks();
      }, 100);
    } catch (error: any) {
      console.error('[DailyFlow] Error in handleSeedingConfirm:', error);
      const errorMessage = error?.message || 'Failed to complete seeding task';
      showNotification('error', errorMessage);
      if (missedStepRef) {
        setMissedStepForSeeding(missedStepRef);
      }
    } finally {
      isSubmittingSeeding.current = false;
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(seedingTask?.id || '');
        return next;
      });
    }
  };

  const handleViewDetails = (task: DailyTask) => {
    setViewingTask(task);
  };

  const handleMarkAsLost = (task: DailyTask) => {
    setLostTask(task);
    setLossReason('');
    setLossNotes('');
  };

  const handleLostConfirm = async () => {
    if (!lostTask || !lossReason) return;

    setCompletingIds(prev => new Set(prev).add(lostTask.id));
    try {
      const success = await markTraysAsLost(lostTask.trayIds, lossReason, lossNotes);
      if (success) {
        setTasks(prev => prev.filter(t => t.id !== lostTask.id));
        const reasonLabel = LOSS_REASONS.find(r => r.value === lossReason)?.label || lossReason;
        showNotification('success', `Marked ${lostTask.trays} ${lostTask.trays === 1 ? 'tray' : 'trays'} as lost (${reasonLabel})`);
        setLostTask(null);
        setTimeout(loadTasks, 500);
      } else {
        showNotification('error', 'Failed to mark trays as lost. Please try again.');
      }
    } catch (error) {
      console.error('Error marking trays as lost:', error);
      showNotification('error', 'Failed to mark trays as lost. Please try again.');
    } finally {
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(lostTask.id);
        return next;
      });
    }
  };

  const handleUseSoakedSeed = async () => {
    if (!useSoakedSeedDialog || !useSoakedSeedQuantity || parseInt(useSoakedSeedQuantity) <= 0) {
      showNotification('error', 'Please enter a valid quantity of trays');
      return;
    }

    try {
      const quantityTrays = parseInt(useSoakedSeedQuantity);
      // eslint-disable-next-line react-hooks/rules-of-hooks -- This is a service function, not a React hook
      const traysCreated = await useLeftoverSoakedSeed(
        useSoakedSeedDialog.soaked_id,
        quantityTrays,
        useSoakedSeedDialog.request_id || null
      );

      showNotification('success', `Created ${traysCreated} ${traysCreated === 1 ? 'tray' : 'trays'} from leftover soaked seed`);
      setUseSoakedSeedDialog(null);
      setUseSoakedSeedQuantity('');
      setTimeout(loadTasks, 500);
    } catch (error: any) {
      console.error('Error using soaked seed:', error);
      const errorMessage = error?.message || 'Failed to use soaked seed';
      showNotification('error', errorMessage);
    }
  };

  const handleDiscardSoakedSeed = async () => {
    if (!discardSoakedSeedDialog) return;

    try {
      const success = await discardSoakedSeed(
        discardSoakedSeedDialog.soaked_id,
        discardReason
      );

      if (success) {
        showNotification('success', 'Soaked seed discarded successfully');
        setDiscardSoakedSeedDialog(null);
        setDiscardReason('expired');
        setTimeout(loadTasks, 500);
      } else {
        showNotification('error', 'Failed to discard soaked seed');
      }
    } catch (error: any) {
      console.error('Error discarding soaked seed:', error);
      const errorMessage = error?.message || 'Failed to discard soaked seed';
      showNotification('error', errorMessage);
    }
  };

  const handleSkip = async (task: DailyTask) => {
    if (!confirm(`Skip this ${task.action} task for ${task.trays} tray(s)? This will mark it as skipped and move to the next step.`)) {
      return;
    }

    setCompletingIds(prev => new Set(prev).add(task.id));
    try {
      const success = await skipTask(task);
      if (success) {
        // Start exit animation
        setAnimatingOut(prev => new Set(prev).add(task.id));
        showNotification('success', `Skipped ${task.action} for ${task.trays} ${task.trays === 1 ? 'tray' : 'trays'}`);
        
        // Wait for animation, then remove and reload
        setTimeout(() => {
          setTasks(prev => prev.filter(t => t.id !== task.id));
          setAnimatingOut(prev => {
            const next = new Set(prev);
            next.delete(task.id);
            return next;
          });
          setTimeout(loadTasks, 100);
        }, 300);
      } else {
        showNotification('error', 'Failed to skip task. Please try again.');
      }
    } catch (error) {
      console.error('Error skipping task:', error);
      showNotification('error', 'Failed to skip task. Please try again.');
    } finally {
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const handleSkipMissed = async (_task: DailyTask, missedStep: MissedStep) => {
    try {
      const success = await skipMissedStep(missedStep);
      if (success) {
        showNotification('success', `Skipped "${missedStep.description}" (Day ${missedStep.expectedDay})`);
        await loadTasks();
      } else {
        showNotification('error', 'Failed to skip step. Please try again.');
      }
    } catch {
      showNotification('error', 'Failed to skip step. Please try again.');
    }
  };

  const handleCompleteMissed = async (task: DailyTask, missedStep: MissedStep) => {
    // Check if this is a seeding step - if so, always open seeding dialog
    const isSeedingStep = (missedStep.description || missedStep.stepName || '').toLowerCase().includes('seed');
    
    if (isSeedingStep) {
      // For missed seeding steps, always open the seeding dialog
      // Create a temporary task object for the seeding dialog
      const seedingTask: DailyTask = {
        id: `missed-seeding-${missedStep.stepId}`,
        action: 'Seed',
        crop: task.crop,
        batchId: 'New',
        location: task.location || 'Growing Area',
        dayCurrent: 0,
        dayTotal: 0,
        trays: 1, // Default to 1 tray, user can adjust if needed
        status: 'urgent',
        trayIds: [],
        recipeId: task.recipeId,
        stepDescription: missedStep.description || missedStep.stepName,
      };
      
      setSeedingTask(seedingTask);
      setSelectedBatchId(null);
      setAvailableBatches([]);
      // Set default quantity to remaining
      const remaining = (seedingTask.quantity || 0) - (seedingTask.quantityCompleted || 0);
      setSeedQuantityCompleted(remaining.toString());
      // Track the missed step so we can mark it as completed after seeding
      setMissedStepForSeeding({ task, step: missedStep });
      setIsSoakVariety(false);
      setAvailableSoakedSeed(null);
      // Check if soak variety and fetch data
      if (seedingTask.requestId) {
        const { data: requestData } = await supabase
          .from('tray_creation_requests')
          .select('recipe_id')
          .eq('request_id', seedingTask.requestId)
          .single();
        
        if (requestData) {
          const { data: hasSoakData } = await supabase.rpc('recipe_has_soak', {
            p_recipe_id: requestData.recipe_id
          });
          
          const hasSoak = hasSoakData && hasSoakData[0]?.has_soak;
          setIsSoakVariety(hasSoak || false);
          
          if (!hasSoak) {
            await fetchAvailableBatchesForRecipe(seedingTask);
          }
        }
      }
    } else {
      // For other missed steps, just mark as completed normally
      try {
        const success = await completeMissedStep(missedStep);
        if (success) {
          showNotification('success', `Completed "${missedStep.description}" (Day ${missedStep.expectedDay})`);
          await loadTasks();
        } else {
          showNotification('error', 'Failed to complete step. Please try again.');
        }
      } catch {
        showNotification('error', 'Failed to complete step. Please try again.');
      }
    }
  };

  const handleSkipAllMissed = async (task: DailyTask) => {
    if (!task.missedSteps || task.missedSteps.length === 0) return;
    // Open confirmation dialog instead of browser confirm
    setSkipAllTask(task);
  };

  const handleSkipAllConfirm = async () => {
    if (!skipAllTask || !skipAllTask.missedSteps || skipAllTask.missedSteps.length === 0) return;

    // Store values before clearing state
    const task = skipAllTask;
    const missedSteps = task.missedSteps;
    const cropName = task.crop;
    
    // TypeScript guard - we know missedSteps is defined from the check above
    if (!missedSteps) return;
    
    setSkipAllTask(null);

    try {
      const success = await skipAllMissedSteps(missedSteps);
      if (success) {
        showNotification('success', `Skipped ${missedSteps.length} missed steps for ${cropName}`);
        await loadTasks();
      } else {
        showNotification('error', 'Failed to skip steps. Please try again.');
      }
    } catch {
      showNotification('error', 'Failed to skip steps. Please try again.');
    }
  };

  // Grouping Logic: Group by action type
  const harvestTasks = tasks.filter(t => t.action === 'Harvest');
  const prepTasks = tasks.filter(t => t.action === 'Soak' || t.action === 'Seed');
  
  // Identify passive steps (informational only - no action required)
  // These are typically: Germination, Blackout, Growing, etc.
  const passiveStepNames = ['Germination', 'Blackout', 'Growing', 'Growing Phase'];
  const passiveTasks = tasks.filter(t => 
    t.action !== 'Harvest' && 
    t.action !== 'Soak' && 
    t.action !== 'Seed' &&
    (passiveStepNames.includes(t.action) || passiveStepNames.some(name => t.stepDescription?.includes(name)))
  );
  
  // Active workflow tasks (exclude passive)
  const workflowTasks = tasks.filter(t => 
    t.action !== 'Harvest' && 
    t.action !== 'Soak' && 
    t.action !== 'Seed' &&
    !passiveStepNames.includes(t.action) &&
    !passiveStepNames.some(name => t.stepDescription?.includes(name))
  );

  // Aggregate passive tasks by step_name (use stepDescription or action as step name)
  const passiveSummary = passiveTasks.reduce((acc, task) => {
    const stepName = task.stepDescription || task.action;
    if (!acc[stepName]) {
      acc[stepName] = { totalTrays: 0, varieties: [] };
    }
    const trayCount = task.traysRemaining ?? task.trays;
    acc[stepName].totalTrays += trayCount;
    
    // Check if this variety already exists for this step
    const existingVariety = acc[stepName].varieties.find(v => v.recipe === task.crop);
    if (existingVariety) {
      existingVariety.trays += trayCount;
    } else {
      acc[stepName].varieties.push({
        recipe: task.crop, // Using crop name as recipe identifier
        trays: trayCount
      });
    }
    return acc;
  }, {} as Record<string, { totalTrays: number; varieties: Array<{ recipe: string; trays: number }> }>);
  
  const passiveStepSummaries = Object.entries(passiveSummary).map(([stepName, data]) => ({
    stepName,
    ...data
  }));

  // Tasks that have missed steps (need catch-up)
  const tasksWithMissedSteps = tasks.filter(t => t.missedSteps && t.missedSteps.length > 0);

  // Get day name and date for header
  const getToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const today = getToday();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const formattedDate = formatDate(today);

  if (loading) {
    return (
      <div className="min-h-screen bg-white p-4 md:p-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-slate-500">Loading flow...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-4 md:p-8">
      
      {/* 1. TOP HEADER: High Level Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-lg bg-emerald-100">
              <Calendar className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">{formattedDate}</h2>
              <p className="text-sm text-slate-500">Today - {dayName}'s Flow</p>
            </div>
          </div>
          <p className="text-slate-600 flex items-center gap-2 mt-2">
            <Clock size={16} /> {tasks.length} {tasks.length === 1 ? 'Batch' : 'Batches'} require attention
          </p>
        </div>
        
        {/* Progress Summary Widget */}
        <div className="bg-white border border-slate-200 shadow-sm p-3 rounded-xl flex items-center gap-4 min-w-[200px]">
          <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
            <Sprout size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase">Active Trays</p>
            <p className="text-xl font-bold text-slate-900">{activeTraysCount.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="space-y-8">

        {/* SECTION 0: MISSED STEPS CATCH-UP */}
        {tasksWithMissedSteps.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="h-8 w-1 bg-amber-500 rounded-full"></span>
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h3 className="text-xl font-semibold text-slate-900">Catch Up Required</h3>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 ml-2">
                {tasksWithMissedSteps.reduce((acc, t) => acc + (t.missedSteps?.length || 0), 0)} missed steps
              </Badge>
            </div>

            <div className="space-y-4">
              {tasksWithMissedSteps.map(task => (
                <MissedStepsCard
                  key={`missed-${task.id}`}
                  task={task}
                  onSkipMissed={handleSkipMissed}
                  onCompleteMissed={handleCompleteMissed}
                  onSkipAll={handleSkipAllMissed}
                  isAnimatingOut={animatingOut.has(task.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* SECTION 1: THE HARVEST (Priority #1) */}
        {harvestTasks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="h-8 w-1 bg-emerald-500 rounded-full"></span>
              <h3 className="text-xl font-semibold text-slate-900">Ready for Harvest</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {harvestTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  variant="harvest"
                  onComplete={handleComplete}
                  isCompleting={completingIds.has(task.id)}
                  isAnimatingOut={animatingOut.has(task.id)}
                  onViewDetails={handleViewDetails}
                  onMarkAsLost={handleMarkAsLost}
                />
              ))}
            </div>
          </section>
        )}

        {/* Available Soaked Seed Panel */}
        {allAvailableSoakedSeed.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-8 w-1 bg-amber-500 rounded-full"></span>
              <h3 className="text-xl font-semibold text-slate-900">Available Soaked Seed</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allAvailableSoakedSeed.map((soaked: any) => {
                const urgency = soaked.urgency || 'available';
                const isUrgent = urgency === 'expires_tomorrow' || urgency === 'expired';
                
                // Calculate approximate trays from remaining quantity (assuming ~340g per tray)
                const approxTrays = Math.floor((soaked.quantity_remaining || 0) / 340);
                
                return (
                  <Card key={soaked.soaked_id} className={cn(
                    "relative overflow-hidden border-2",
                    urgency === 'expired' ? "border-red-300 bg-red-50" :
                    urgency === 'expires_tomorrow' ? "border-amber-300 bg-amber-50" :
                    "border-slate-200 bg-white"
                  )}>
                    <div className={cn("absolute top-0 left-0 w-full h-1", {
                      'bg-red-500': urgency === 'expired',
                      'bg-amber-500': urgency === 'expires_tomorrow',
                      'bg-green-500': urgency === 'available'
                    })}></div>
                    <div className="p-5">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-bold text-lg text-slate-900">{soaked.variety_name}</h4>
                          <p className="text-xs text-slate-500 font-medium tracking-wide uppercase mt-1">
                            {soaked.quantity_remaining} {soaked.unit || 'g'} SOAKED
                          </p>
                        </div>
                        {isUrgent && (
                          <Badge variant="secondary" className={cn(
                            "font-mono",
                            urgency === 'expired' ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                          )}>
                            {urgency === 'expired' ? 'Expired' : 'Expires Tomorrow'}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="mb-4 space-y-1 text-sm text-slate-600">
                        <p>Soaked: {new Date(soaked.soak_date).toLocaleDateString()}</p>
                        <p>Expires: {new Date(soaked.expires_at).toLocaleDateString()}</p>
                        {approxTrays > 0 && (
                          <p className="text-slate-500">~{approxTrays} {approxTrays === 1 ? 'tray' : 'trays'} worth</p>
                        )}
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setUseSoakedSeedDialog(soaked);
                            setUseSoakedSeedQuantity(approxTrays > 0 ? approxTrays.toString() : '1');
                          }}
                          className="flex-1"
                        >
                          <Package className="h-4 w-4 mr-2" />
                          Use
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDiscardSoakedSeedDialog(soaked);
                            setDiscardReason('expired');
                          }}
                          className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Discard
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* SECTION 1.5: PREP TASKS (Soak & Seed) */}
        {prepTasks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="h-8 w-1 bg-purple-500 rounded-full"></span>
              <h3 className="text-xl font-semibold text-slate-900">Preparation Tasks</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {prepTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  variant={task.action === 'Soak' ? 'prep' : 'seed'}
                  onComplete={handleComplete}
                  isCompleting={completingIds.has(task.id)}
                  isAnimatingOut={animatingOut.has(task.id)}
                  onViewDetails={handleViewDetails}
                />
              ))}
            </div>
          </section>
        )}

        {/* SECTION 2: WORKFLOW TASKS */}
        {workflowTasks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="h-8 w-1 bg-blue-500 rounded-full"></span>
              <h3 className="text-xl font-semibold text-slate-900">Tasks & Maintenance</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {workflowTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  variant={
                    task.action.toLowerCase().includes('water') || task.action.toLowerCase().includes('mist') 
                      ? 'water' 
                      : task.action.toLowerCase() === 'uncover' 
                      ? 'warning' 
                      : 'default'
                  }
                  onComplete={handleComplete}
                  isCompleting={completingIds.has(task.id)}
                  isAnimatingOut={animatingOut.has(task.id)}
                  onViewDetails={handleViewDetails}
                  onSkip={handleSkip}
                  onMarkAsLost={handleMarkAsLost}
                />
              ))}
            </div>
          </section>
        )}

        {/* SECTION 3: TRAY STATUS (Passive Steps) */}
        {passiveStepSummaries.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="h-8 w-1 bg-slate-400 rounded-full"></span>
              <h3 className="text-xl font-semibold text-slate-900">Tray Status</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {passiveStepSummaries.map((summary) => (
                <PassiveStepCard
                  key={summary.stepName}
                  stepName={summary.stepName}
                  totalTrays={summary.totalTrays}
                  onViewDetails={() => setPassiveStepDetails(summary)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Sprout size={64} className="text-slate-300 mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No flow today</h3>
            <p className="text-slate-500 max-w-md">
              All caught up! No batches require attention right now. Check back later or create new trays to get started.
            </p>
          </div>
        )}

      </div>

      {/* Notification Toast */}
      {notification.show && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5">
          <Card className={cn(
            "p-4 shadow-lg border-2 min-w-[300px]",
            notification.type === 'success' 
              ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
              : "bg-red-50 border-red-200 text-red-900"
          )}>
            <div className="flex items-start gap-3">
              <div className={cn(
                "h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                notification.type === 'success' ? "bg-emerald-500" : "bg-red-500"
              )}>
                {notification.type === 'success' ? (
                  <Check className="h-3 w-3 text-white" />
                ) : (
                  <span className="text-white text-xs font-bold">×</span>
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">
                  {notification.type === 'success' ? 'Success' : 'Error'}
                </p>
                <p className="text-sm mt-1">{notification.message}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-500 hover:text-slate-900"
                onClick={() => setNotification({ ...notification, show: false })}
              >
                <span className="text-lg">×</span>
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Task Details Modal */}
      <Dialog open={!!viewingTask} onOpenChange={(open) => !open && setViewingTask(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingTask && (
                <>
                  {viewingTask.action === 'Harvest' && <Scissors className="h-5 w-5 text-emerald-600" />}
                  {viewingTask.action === 'Uncover' && <Sun className="h-5 w-5 text-amber-600" />}
                  {viewingTask.action === 'Soak' && <Beaker className="h-5 w-5 text-purple-600" />}
                  {viewingTask.action === 'Seed' && <Sprout className="h-5 w-5 text-indigo-600" />}
                  {(viewingTask.action === 'Water' || viewingTask.action === 'Blackout') && <Droplets className="h-5 w-5 text-blue-600" />}
                  Task Details
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Detailed information about this task
            </DialogDescription>
          </DialogHeader>
          {viewingTask && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Action</p>
                  <p className="text-base font-semibold text-slate-900">{viewingTask.action}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Crop</p>
                  <p className="text-base font-semibold text-slate-900">{viewingTask.crop}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Batch ID</p>
                  <p className="text-base font-mono text-slate-900">{viewingTask.batchId}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Number of Trays</p>
                  <p className="text-base font-semibold text-slate-900">{viewingTask.trays} {viewingTask.trays === 1 ? 'Tray' : 'Trays'}</p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-500">Growth Progress</p>
                <div className="flex items-center gap-2">
                  <Progress 
                    value={(viewingTask.dayCurrent / viewingTask.dayTotal) * 100} 
                    className="flex-1 h-2"
                  />
                  <span className="text-sm font-semibold text-slate-700">
                    Day {viewingTask.dayCurrent} of {viewingTask.dayTotal}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Location</p>
                  <p className="text-base text-slate-900">{viewingTask.location}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Status</p>
                  <Badge 
                    variant={viewingTask.status === 'urgent' ? 'destructive' : 'secondary'}
                    className="mt-1"
                  >
                    {viewingTask.status === 'urgent' ? 'Urgent' : 'Pending'}
                  </Badge>
                </div>
              </div>

              {viewingTask.stepDescription && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Current Step</p>
                  <p className="text-base text-slate-900 italic">{viewingTask.stepDescription}</p>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setViewingTask(null)}
                    className="flex-1"
                  >
                    Close
                  </Button>
                  {viewingTask.action !== 'Harvest' && (
                    <Button
                      onClick={() => {
                        setViewingTask(null);
                        handleComplete(viewingTask);
                      }}
                      className="flex-1"
                      disabled={completingIds.has(viewingTask.id)}
                    >
                      {completingIds.has(viewingTask.id) ? 'Processing...' : 'Mark as Done'}
                    </Button>
                  )}
                </div>
                {viewingTask.action === 'Harvest' && (
                  <p className="text-xs text-slate-500 mt-2">
                    Harvest completion is managed from tray details; no inline action here.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Harvest Dialog - with instructions and yield recording */}
      <Dialog open={!!harvestingTask} onOpenChange={(open) => !open && setHarvestingTask(null)}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Scissors className="h-5 w-5" />
              </div>
              Time to Harvest!
            </DialogTitle>
            <DialogDescription>
              Your {harvestingTask?.crop} is ready for harvest
            </DialogDescription>
          </DialogHeader>

          {harvestingTask && (
            <div className="space-y-6 py-4">
              {/* Summary Card */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-emerald-600 font-medium uppercase">Crop</p>
                    <p className="text-lg font-bold text-emerald-900">{harvestingTask.crop}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 font-medium uppercase">Trays</p>
                    <p className="text-lg font-bold text-emerald-900">{harvestingTask.trays} {harvestingTask.trays === 1 ? 'tray' : 'trays'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 font-medium uppercase">Batch</p>
                    <p className="text-base font-mono text-emerald-800">{harvestingTask.batchId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 font-medium uppercase">Location</p>
                    <p className="text-base text-emerald-800">{harvestingTask.location}</p>
                  </div>
                </div>
              </div>

              {/* Harvest Instructions */}
              <div className="space-y-3">
                <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Package className="h-4 w-4 text-slate-500" />
                  Harvest Checklist
                </h4>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">1</span>
                    <span>Cut microgreens just above the soil level using clean, sharp scissors or a knife</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">2</span>
                    <span>Rinse gently if needed and shake off excess water</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">3</span>
                    <span>Weigh your harvest and record the yield below</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">4</span>
                    <span>Store in a container with a paper towel to absorb moisture</span>
                  </li>
                </ul>
              </div>

              {/* Yield Recording */}
              <div className="space-y-2">
                <Label htmlFor="yield" className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-slate-500" />
                  Record Yield (optional)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="yield"
                    type="number"
                    placeholder="e.g., 150"
                    value={harvestYield}
                    onChange={(e) => setHarvestYield(e.target.value)}
                    className="flex-1"
                    min="0"
                    step="0.1"
                  />
                  <span className="text-sm text-slate-500 font-medium">grams</span>
                </div>
                <p className="text-xs text-slate-400">
                  Recording yield helps track productivity over time
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setHarvestingTask(null)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleHarvestConfirm}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              disabled={completingIds.has(harvestingTask?.id || '')}
            >
              {completingIds.has(harvestingTask?.id || '') ? (
                'Processing...'
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Complete Harvest
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Seeding Dialog - with batch selection */}
      {/* Soak Task Completion Dialog */}
      <Dialog open={!!soakTask} onOpenChange={(open) => {
        if (!open) {
          setSoakTask(null);
          setSelectedBatchId(null);
          setAvailableBatches([]);
          setSoakQuantityGrams('');
          setSeedQuantityPerTray(0);
        }
      }}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Beaker className="h-5 w-5" />
              </div>
              Complete Soak Task
            </DialogTitle>
            <DialogDescription>
              Select a seed batch and enter the amount to soak
            </DialogDescription>
          </DialogHeader>

          {soakTask && (() => {
            const traysRemainingToSeed = (soakTask.quantity || 0) - (soakTask.quantityCompleted || 0);
            const seedPerTray = seedQuantityPerTray || 0;
            
            // Calculate trays with soaked seed available for this request
            // Find available soaked seed for this request_id
            const soakedSeedForRequest = allAvailableSoakedSeed.find(
              (soaked: any) => soaked.request_id === soakTask.requestId
            );
            const traysWithSoakedSeed = soakedSeedForRequest && seedPerTray > 0
              ? Math.floor((soakedSeedForRequest.quantity_remaining || 0) / seedPerTray)
              : 0;
            
            // Soak task quantity = trays remaining to seed - trays with soaked seed available
            const remaining = Math.max(0, traysRemainingToSeed - traysWithSoakedSeed);
            const gramsNeeded = remaining * seedPerTray; // Recommended amount
            const selectedBatch = availableBatches.find(b => b.batchid === selectedBatchId);
            const availableGrams = selectedBatch ? parseFloat(selectedBatch.quantity) : 0;
            const requestedQuantity = parseFloat(soakQuantityGrams) || 0;
            const hasShortage = selectedBatch && seedPerTray > 0 && gramsNeeded > availableGrams;
            const isInsufficient = selectedBatch && requestedQuantity > 0 && requestedQuantity > availableGrams;
            const totalAvailable = availableBatches.reduce((sum, b) => sum + parseFloat(b.quantity || 0), 0);
            const shortage = hasShortage ? gramsNeeded - availableGrams : (isInsufficient ? requestedQuantity - availableGrams : 0);
            const maxTraysPossible = seedPerTray > 0 ? Math.floor(availableGrams / seedPerTray) : 0;
            const canSoakPartial = maxTraysPossible > 0;

            return (
              <div className="space-y-6 py-4">
                {/* Summary Card */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-blue-600 font-medium uppercase">Variety</p>
                      <p className="text-lg font-bold text-blue-900">{soakTask.crop}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 font-medium uppercase">Quantity</p>
                      <p className="text-lg font-bold text-blue-900">
                        {remaining} tray{remaining !== 1 ? 's' : ''} to soak
                        {traysWithSoakedSeed > 0 && (
                          <span className="text-xs font-normal text-blue-600 ml-2">
                            ({traysRemainingToSeed} remaining - {traysWithSoakedSeed} soaked = {remaining} to soak)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Inventory Warning */}
                {hasShortage && selectedBatch && (
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h4 className="font-semibold text-amber-900 mb-1">Insufficient Inventory</h4>
                        <p className="text-sm text-amber-800">
                          Recommended amount is <strong>{gramsNeeded.toFixed(2)}g</strong>, but only{' '}
                          <strong>{availableGrams.toFixed(2)}g</strong> is available in the selected batch.
                        </p>
                        <p className="text-sm text-amber-800 mt-2">
                          <strong>Shortage:</strong> {shortage.toFixed(2)}g
                        </p>
                        {selectedBatch && (
                          <div className="mt-2 p-2 bg-amber-100 rounded text-xs">
                            <p className="font-medium text-amber-900">Available Batch Info:</p>
                            <p className="text-amber-800">
                              Batch #{selectedBatch.batchid}: {availableGrams.toFixed(2)}g
                              {selectedBatch.lot_number && ` • Lot: ${selectedBatch.lot_number}`}
                            </p>
                            {totalAvailable > availableGrams && (
                              <p className="text-amber-800 mt-1">
                                Total available across all batches: {totalAvailable.toFixed(2)}g
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 pt-2 border-t border-amber-200">
                      <p className="text-sm font-medium text-amber-900">Options:</p>
                      <div className="flex flex-col gap-2">
                        {canSoakPartial && (() => {
                          const partialGrams = maxTraysPossible * seedPerTray; // Calculate exact amount for max trays
                          return (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Set quantity to the exact amount needed for max complete trays
                                setSoakQuantityGrams(partialGrams.toString());
                              }}
                              className="w-full justify-start text-amber-800 border-amber-300 hover:bg-amber-100"
                            >
                              <Droplets className="h-4 w-4 mr-2" />
                              Soak Partial ({maxTraysPossible} tray{maxTraysPossible !== 1 ? 's' : ''} - {partialGrams.toFixed(2)}g)
                            </Button>
                          );
                        })()}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRescheduleRequestDialog({
                              task: soakTask,
                              newDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                            });
                          }}
                          className="w-full justify-start text-amber-800 border-amber-300 hover:bg-amber-100"
                        >
                          <Calendar className="h-4 w-4 mr-2" />
                          Reschedule Request
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCancelRequestDialog({
                              task: soakTask,
                              reason: 'insufficient_inventory'
                            });
                          }}
                          className="w-full justify-start text-red-600 border-red-300 hover:bg-red-50"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Cancel Request
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Batch Selection */}
                <div className="space-y-3">
                  <Label htmlFor="soak-batch-select" className="text-sm font-medium">
                    Seed Batch <span className="text-red-500">*</span>
                  </Label>
                  {loadingBatches ? (
                    <div className="text-sm text-slate-500">Loading available batches...</div>
                  ) : availableBatches.length === 0 ? (
                    <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      No available batches found for this variety.
                    </div>
                  ) : (
                    <Select
                      value={selectedBatchId?.toString() || ''}
                      onValueChange={(value) => {
                        setSelectedBatchId(parseInt(value, 10));
                        setSoakQuantityGrams(''); // Reset quantity when batch changes
                      }}
                    >
                      <SelectTrigger id="soak-batch-select" className="w-full">
                        <SelectValue placeholder="Select a seed batch" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableBatches.map((batch) => (
                          <SelectItem key={batch.batchid} value={batch.batchid.toString()}>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {batch.variety_name} - Batch #{batch.batchid}
                              </span>
                              <span className="text-xs text-slate-500">
                                {batch.quantity} {batch.unit || 'grams'} available
                                {batch.lot_number && ` • Lot: ${batch.lot_number}`}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Quantity to Soak */}
                {selectedBatch && !canSoakPartial ? (
                  <div className="space-y-2">
                    <Label htmlFor="soak-quantity" className="text-sm font-medium text-slate-400">
                      Amount to Soak (grams) <span className="text-red-500">*</span>
                    </Label>
                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                      <p className="text-sm text-slate-600">
                        <strong>Insufficient inventory:</strong> Only {availableGrams.toFixed(2)}g available, but {seedPerTray}g is needed per tray. 
                        Not enough for even 1 tray. Please reschedule or cancel this request.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="soak-quantity" className="text-sm font-medium">
                      Amount to Soak (grams) <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="soak-quantity"
                      type="number"
                      min="0"
                      step="0.01"
                      max={selectedBatch ? availableGrams : undefined}
                      placeholder="Enter amount in grams"
                      value={soakQuantityGrams}
                      onChange={(e) => setSoakQuantityGrams(e.target.value)}
                      className={cn("w-full", (hasShortage || isInsufficient) && "border-amber-500")}
                      disabled={selectedBatch && !canSoakPartial}
                      required
                    />
                    {seedPerTray > 0 && remaining > 0 && (
                      <p className="text-xs text-slate-500">
                        {remaining} trays × {seedPerTray}g = {gramsNeeded.toFixed(2)}g recommended
                      </p>
                    )}
                    {selectedBatch && (
                      <p className="text-xs text-slate-500">
                        Maximum available: {availableGrams.toFixed(2)}g
                        {!canSoakPartial && seedPerTray > 0 && (
                          <span className="text-amber-600 ml-2">
                            (Not enough for 1 tray - need {seedPerTray}g, have {availableGrams.toFixed(2)}g)
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSoakTask(null);
                setSelectedBatchId(null);
                setAvailableBatches([]);
                setSoakQuantityGrams('');
                setSeedQuantityPerTray(0);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSoakConfirm}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              disabled={(() => {
                if (!soakTask) return true;
                const selectedBatch = availableBatches.find(b => b.batchid === selectedBatchId);
                if (!selectedBatch) return !selectedBatchId || !soakQuantityGrams || isSubmittingSeeding.current || completingIds.has(soakTask?.id || '') || availableBatches.length === 0;
                const availableGrams = parseFloat(selectedBatch.quantity) || 0;
                const seedPerTray = seedQuantityPerTray || 0;
                const canSoakPartial = seedPerTray > 0 ? Math.floor(availableGrams / seedPerTray) > 0 : false;
                return !selectedBatchId || !soakQuantityGrams || isSubmittingSeeding.current || completingIds.has(soakTask?.id || '') || availableBatches.length === 0 || !canSoakPartial;
              })()}
            >
              {isSubmittingSeeding.current || completingIds.has(soakTask?.id || '') ? (
                'Processing...'
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Complete Soak
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Seed Task Completion Dialog */}
      <Dialog open={!!seedingTask} onOpenChange={(open) => {
        if (!open) {
          setSeedingTask(null);
          setSelectedBatchId(null);
          setAvailableBatches([]);
          setSeedQuantityCompleted('');
          setMissedStepForSeeding(null);
          setIsSoakVariety(false);
          setAvailableSoakedSeed(null);
        }
      }}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <Sprout className="h-5 w-5" />
              </div>
              Time to Seed!
            </DialogTitle>
            <DialogDescription>
              Select a seed batch to complete seeding and create trays
            </DialogDescription>
          </DialogHeader>

          {seedingTask && (() => {
            const remainingTrays = Math.max(0, (seedingTask.quantity || 0) - (seedingTask.quantityCompleted || 0));
            const selectedBatch = availableBatches.find((b) => b.batchid === selectedBatchId);
            const seedPerTray = seedQuantityPerTray || 0;
            const traysInput = parseInt(seedQuantityCompleted || '0', 10) || 0;
            const traysToSeed = traysInput > 0 ? traysInput : remainingTrays;
            const gramsNeeded = seedPerTray > 0 ? traysToSeed * seedPerTray : 0;
            const totalNeeded = seedPerTray > 0 ? remainingTrays * seedPerTray : 0;
            const availableGrams = selectedBatch ? parseFloat(selectedBatch.quantity || 0) : 0;
            const maxTraysPossible = seedPerTray > 0 ? Math.floor(availableGrams / seedPerTray) : 0;
            const hasShortage = seedPerTray > 0 && totalNeeded > availableGrams;
            const shortage = hasShortage ? totalNeeded - availableGrams : 0;
            const canSeedPartial = hasShortage && maxTraysPossible > 0;

            return (
              <div className="space-y-6 py-4">
                {/* Summary Card */}
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-indigo-600 font-medium uppercase">Variety</p>
                      <p className="text-lg font-bold text-indigo-900">{seedingTask.crop}</p>
                    </div>
                    <div>
                      <p className="text-xs text-indigo-600 font-medium uppercase">Remaining</p>
                      <p className="text-lg font-bold text-indigo-900">
                        {remainingTrays} tray{remainingTrays !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Soak Variety: Show available soaked seed */}
                {isSoakVariety && (
                  <div className="space-y-3">
                    {availableSoakedSeed ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <p className="text-sm font-medium text-green-900 mb-2">Soaked Seed Available</p>
                        <p className="text-base text-green-800">
                          {availableSoakedSeed.quantity_remaining} {availableSoakedSeed.unit || 'g'} READY TO SEED
                        </p>
                        <p className="text-xs text-green-600 mt-1">
                          Soaked: {new Date(availableSoakedSeed.soak_date).toLocaleDateString()} | 
                          Expires: {new Date(availableSoakedSeed.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <p className="text-sm text-amber-800">No soaked seed available. Please complete the soak task first.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Non-Soak Variety: Batch Selection */}
                {!isSoakVariety && (
                  <div className="space-y-3">
                    <Label htmlFor="batch-select" className="text-sm font-medium">
                      Seed Batch <span className="text-red-500">*</span>
                    </Label>
                    {loadingBatches ? (
                      <div className="text-sm text-slate-500">Loading available batches...</div>
                    ) : availableBatches.length === 0 ? (
                      <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        No available batches found for this variety.
                      </div>
                    ) : (
                      <Select
                        value={selectedBatchId?.toString() || ''}
                        onValueChange={(value) => setSelectedBatchId(parseInt(value, 10))}
                      >
                        <SelectTrigger id="batch-select" className="w-full">
                          <SelectValue placeholder="Select a seed batch" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableBatches.map((batch) => (
                            <SelectItem key={batch.batchid} value={batch.batchid.toString()}>
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {batch.variety_name} - Batch #{batch.batchid}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {batch.quantity} {batch.unit || 'grams'} available
                                  {batch.lot_number && ` • Lot: ${batch.lot_number}`}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Calculation helper */}
                    {seedPerTray > 0 && (
                      <div className="text-xs text-slate-600">
                        {traysToSeed || remainingTrays} tray{(traysToSeed || remainingTrays) !== 1 ? 's' : ''} × {seedPerTray}g ={' '}
                        {gramsNeeded.toFixed(2)}g needed
                      </div>
                    )}
                    {selectedBatch && seedPerTray > 0 && (
                      <div className="text-xs text-slate-600">
                        Available: {availableGrams.toFixed(2)}g{' '}
                        {hasShortage ? (
                          <span className="text-amber-700 font-medium">⚠ Insufficient</span>
                        ) : (
                          <span className="text-green-700 font-medium">✓ Sufficient</span>
                        )}
                        {hasShortage && maxTraysPossible > 0 && (
                          <span className="text-amber-700 ml-2">(can seed {maxTraysPossible} tray{maxTraysPossible !== 1 ? 's' : ''})</span>
                        )}
                      </div>
                    )}

                    {/* Shortage options */}
                    {hasShortage && selectedBatch && (
                      <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-amber-900">Insufficient Inventory</p>
                            <p className="text-xs text-amber-800">
                              Need {totalNeeded.toFixed(2)}g for {remainingTrays} trays; available {availableGrams.toFixed(2)}g (short {shortage.toFixed(2)}g).
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 pt-2 border-t border-amber-200">
                          {canSeedPartial && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSeedQuantityCompleted(maxTraysPossible.toString())}
                              className="justify-start text-amber-800 border-amber-300 hover:bg-amber-100"
                            >
                              Seed Partial ({maxTraysPossible} tray{maxTraysPossible !== 1 ? 's' : ''})
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setRescheduleRequestDialog({
                                task: seedingTask,
                                newDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                              })
                            }
                            className="justify-start text-amber-800 border-amber-300 hover:bg-amber-100"
                          >
                            <Calendar className="h-4 w-4 mr-2" />
                            Reschedule Request
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setCancelRequestDialog({
                                task: seedingTask,
                                reason: 'insufficient_inventory',
                              })
                            }
                            className="justify-start text-red-600 border-red-300 hover:bg-red-50"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Cancel Request
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Quantity to Seed */}
                <div className="space-y-2">
                  <Label htmlFor="seed-quantity" className="text-sm font-medium">
                    Trays to Seed <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="seed-quantity"
                    type="number"
                    min="1"
                    max={remainingTrays}
                    placeholder="Enter number of trays"
                    value={seedQuantityCompleted}
                    onChange={(e) => setSeedQuantityCompleted(e.target.value)}
                    className="w-full"
                    required
                  />
                  <p className="text-xs text-slate-500">
                    Remaining: {remainingTrays} trays
                  </p>
                  {!isSoakVariety && selectedBatch && seedPerTray > 0 && (
                    <p className="text-xs text-slate-500">
                      {seedQuantityCompleted ? seedQuantityCompleted : traysToSeed} tray{(seedQuantityCompleted || traysToSeed) !== 1 ? 's' : ''} × {seedPerTray}g = {gramsNeeded.toFixed(2)}g
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSeedingTask(null);
                setSelectedBatchId(null);
                setAvailableBatches([]);
                setSeedQuantityCompleted('');
                setMissedStepForSeeding(null);
                setIsSoakVariety(false);
                setAvailableSoakedSeed(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSeedingConfirm}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              disabled={(!isSoakVariety && !selectedBatchId) || !seedQuantityCompleted || isSubmittingSeeding.current || completingIds.has(seedingTask?.id || '') || (availableBatches.length === 0 && !isSoakVariety)}
            >
              {isSubmittingSeeding.current || completingIds.has(seedingTask?.id || '') ? (
                'Processing...'
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Complete Seeding
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Use Soaked Seed Dialog */}
      <Dialog open={!!useSoakedSeedDialog} onOpenChange={(open) => !open && setUseSoakedSeedDialog(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Use Soaked Seed</DialogTitle>
            <DialogDescription>
              Create ad-hoc trays from leftover soaked seed
            </DialogDescription>
          </DialogHeader>
          {useSoakedSeedDialog && (
            <div className="space-y-4 py-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p className="text-sm font-medium text-slate-900 mb-1">{useSoakedSeedDialog.variety_name}</p>
                <p className="text-xs text-slate-600">
                  {useSoakedSeedDialog.quantity_remaining} {useSoakedSeedDialog.unit || 'g'} available
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="use-quantity">Number of Trays</Label>
                <Input
                  id="use-quantity"
                  type="number"
                  min="1"
                  value={useSoakedSeedQuantity}
                  onChange={(e) => setUseSoakedSeedQuantity(e.target.value)}
                  placeholder="Enter number of trays"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUseSoakedSeedDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUseSoakedSeed}
              disabled={!useSoakedSeedQuantity || parseInt(useSoakedSeedQuantity) <= 0}
            >
              <Package className="h-4 w-4 mr-2" />
              Create Trays
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard Soaked Seed Dialog */}
      <Dialog open={!!discardSoakedSeedDialog} onOpenChange={(open) => !open && setDiscardSoakedSeedDialog(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Discard Soaked Seed</DialogTitle>
            <DialogDescription>
              Mark soaked seed as waste
            </DialogDescription>
          </DialogHeader>
          {discardSoakedSeedDialog && (
            <div className="space-y-4 py-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm font-medium text-red-900 mb-1">{discardSoakedSeedDialog.variety_name}</p>
                <p className="text-xs text-red-700">
                  {discardSoakedSeedDialog.quantity_remaining} {discardSoakedSeedDialog.unit || 'g'} will be discarded
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="discard-reason">Reason</Label>
                <Select value={discardReason} onValueChange={setDiscardReason}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="contaminated">Contaminated</SelectItem>
                    <SelectItem value="over-soaked">Over-soaked</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardSoakedSeedDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleDiscardSoakedSeed}
              variant="destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Request Dialog */}
      <Dialog open={!!cancelRequestDialog} onOpenChange={(open) => !open && setCancelRequestDialog(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cancel Seeding Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this request?
            </DialogDescription>
          </DialogHeader>
          {cancelRequestDialog && (
            <div className="space-y-4 py-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm font-medium text-red-900 mb-1">
                  {cancelRequestDialog.task.crop}
                </p>
                <p className="text-xs text-red-700">
                  {(() => {
                    const remaining = (cancelRequestDialog.task.quantity || 0) - (cancelRequestDialog.task.quantityCompleted || 0);
                    return `${remaining} tray${remaining !== 1 ? 's' : ''} remaining`;
                  })()}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cancel-reason">Cancellation Reason</Label>
                <Select 
                  value={cancelRequestDialog.reason} 
                  onValueChange={(value) => setCancelRequestDialog({ ...cancelRequestDialog, reason: value })}
                >
                  <SelectTrigger id="cancel-reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="insufficient_inventory">Insufficient Inventory</SelectItem>
                    <SelectItem value="changed_plans">Changed Plans</SelectItem>
                    <SelectItem value="quality_issues">Quality Issues</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelRequestDialog(null)}>
              Keep Request
            </Button>
            <Button
              onClick={handleCancelRequest}
              variant="destructive"
              disabled={!cancelRequestDialog?.reason || isCancellingRequest}
            >
              {isCancellingRequest ? 'Cancelling...' : 'Cancel Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Request Dialog */}
      <Dialog open={!!rescheduleRequestDialog} onOpenChange={(open) => !open && setRescheduleRequestDialog(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Reschedule Seeding Request</DialogTitle>
            <DialogDescription>
              Choose a new date for this seeding request
            </DialogDescription>
          </DialogHeader>
          {rescheduleRequestDialog && (
            <div className="space-y-4 py-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  {rescheduleRequestDialog.task.crop}
                </p>
                <p className="text-xs text-blue-700">
                  {(() => {
                    const remaining = (rescheduleRequestDialog.task.quantity || 0) - (rescheduleRequestDialog.task.quantityCompleted || 0);
                    return `${remaining} tray${remaining !== 1 ? 's' : ''} remaining`;
                  })()}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reschedule-date">New Seed Date</Label>
                <Input
                  id="reschedule-date"
                  type="date"
                  value={rescheduleRequestDialog.newDate}
                  onChange={(e) => setRescheduleRequestDialog({ ...rescheduleRequestDialog, newDate: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full"
                  required
                />
                <p className="text-xs text-slate-500">
                  Select a future date for this seeding request
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleRequestDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleRescheduleRequest}
              disabled={!rescheduleRequestDialog?.newDate}
            >
              Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Passive Step Details Dialog */}
      <Dialog open={!!passiveStepDetails} onOpenChange={(open) => !open && setPassiveStepDetails(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-700">
              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                {passiveStepDetails && (() => {
                  const name = passiveStepDetails.stepName.toLowerCase();
                  if (name.includes('germination')) return <Sprout className="h-5 w-5 text-slate-600" />;
                  if (name.includes('blackout')) return <Sun className="h-5 w-5 text-slate-600" />;
                  if (name.includes('growing')) return <Droplets className="h-5 w-5 text-slate-600" />;
                  return <Clock className="h-5 w-5 text-slate-600" />;
                })()}
              </div>
              {passiveStepDetails?.stepName} - {passiveStepDetails?.totalTrays} {passiveStepDetails?.totalTrays === 1 ? 'Tray' : 'Trays'}
            </DialogTitle>
            <DialogDescription>
              Breakdown by variety
            </DialogDescription>
          </DialogHeader>
          {passiveStepDetails && (
            <div className="space-y-4 py-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="space-y-3">
                  {passiveStepDetails.varieties.map((variety, index) => (
                    <div 
                      key={index}
                      className={cn(
                        "flex items-center justify-between py-2",
                        index < passiveStepDetails.varieties.length - 1 && "border-b border-slate-200"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-slate-400"></div>
                        <span className="text-sm font-medium text-slate-900">{variety.recipe}</span>
                      </div>
                      <span className="text-sm text-slate-600 font-mono">
                        {variety.trays} {variety.trays === 1 ? 'tray' : 'trays'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPassiveStepDetails(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Dialog for Critical Errors */}
      <Dialog open={errorDialog.show} onOpenChange={(open) => !open && setErrorDialog({ show: false, message: '', title: '' })}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5" />
              </div>
              {errorDialog.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-900">{errorDialog.message}</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setErrorDialog({ show: false, message: '', title: '' })}
              className="w-full bg-red-600 hover:bg-red-700"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Skip All Confirmation Dialog */}
      <Dialog open={!!skipAllTask} onOpenChange={(open) => !open && setSkipAllTask(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                <FastForward className="h-5 w-5" />
              </div>
              Skip All Missed Steps?
            </DialogTitle>
            <DialogDescription>
              This will skip all missed steps for this crop
            </DialogDescription>
          </DialogHeader>

          {skipAllTask && skipAllTask.missedSteps && (
            <div className="space-y-4 py-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-amber-600 font-medium uppercase">Crop</p>
                    <p className="text-lg font-bold text-amber-900">{skipAllTask.crop}</p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-600 font-medium uppercase">Missed Steps</p>
                    <p className="text-base font-semibold text-amber-900">
                      {skipAllTask.missedSteps.length} {skipAllTask.missedSteps.length === 1 ? 'step' : 'steps'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-slate-700">
                  Are you sure you want to skip all {skipAllTask.missedSteps.length} missed {skipAllTask.missedSteps.length === 1 ? 'step' : 'steps'} for <strong>{skipAllTask.crop}</strong>?
                </p>
                <p className="text-xs text-slate-500">
                  This will clear your backlog and mark all missed steps as skipped. You can still complete them later if needed.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setSkipAllTask(null)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSkipAllConfirm}
              className="flex-1 bg-amber-600 hover:bg-amber-700"
            >
              <FastForward className="h-4 w-4 mr-2" />
              Skip All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lost Tray Dialog - for marking trays as lost/failed */}
      <Dialog open={!!lostTask} onOpenChange={(open) => !open && setLostTask(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="h-5 w-5" />
              </div>
              Mark Trays as Lost
            </DialogTitle>
            <DialogDescription>
              Record why these trays failed to complete their growth cycle
            </DialogDescription>
          </DialogHeader>

          {lostTask && (
            <div className="space-y-6 py-4">
              {/* Summary Card */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-red-600 font-medium uppercase">Crop</p>
                    <p className="text-lg font-bold text-red-900">{lostTask.crop}</p>
                  </div>
                  <div>
                    <p className="text-xs text-red-600 font-medium uppercase">Trays Affected</p>
                    <p className="text-lg font-bold text-red-900">{lostTask.trays} {lostTask.trays === 1 ? 'tray' : 'trays'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-red-600 font-medium uppercase">Current Day</p>
                    <p className="text-base text-red-800">Day {lostTask.dayCurrent} of {lostTask.dayTotal}</p>
                  </div>
                  <div>
                    <p className="text-xs text-red-600 font-medium uppercase">Location</p>
                    <p className="text-base text-red-800">{lostTask.location}</p>
                  </div>
                </div>
              </div>

              {/* Loss Reason Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">What went wrong? <span className="text-red-500">*</span></Label>
                <div className="grid grid-cols-2 gap-2">
                  {LOSS_REASONS.map((reason) => (
                    <button
                      key={reason.value}
                      type="button"
                      onClick={() => setLossReason(reason.value)}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all",
                        lossReason === reason.value
                          ? "border-red-500 bg-red-50 ring-2 ring-red-500/20"
                          : "border-slate-200 hover:border-red-300 hover:bg-red-50/50"
                      )}
                    >
                      <p className="font-medium text-sm text-slate-900">{reason.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{reason.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="loss-notes">Additional Notes (optional)</Label>
                <Textarea
                  id="loss-notes"
                  placeholder="Any additional details about what happened..."
                  value={lossNotes}
                  onChange={(e) => setLossNotes(e.target.value)}
                  className="resize-none"
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setLostTask(null)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleLostConfirm}
              className="flex-1 bg-red-600 hover:bg-red-700"
              disabled={!lossReason || completingIds.has(lostTask?.id || '')}
            >
              {completingIds.has(lostTask?.id || '') ? (
                'Processing...'
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Mark as Lost
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- SUB-COMPONENT: Passive Step Card ---
interface PassiveStepCardProps {
  stepName: string;
  totalTrays: number;
  onViewDetails: () => void;
}

const PassiveStepCard = ({ stepName, totalTrays, onViewDetails }: PassiveStepCardProps) => {
  // Get icon based on step name
  const getIcon = () => {
    const name = stepName.toLowerCase();
    if (name.includes('germination')) return <Sprout className="h-6 w-6 text-slate-500" />;
    if (name.includes('blackout')) return <Sun className="h-6 w-6 text-slate-500" />;
    if (name.includes('growing')) return <Droplets className="h-6 w-6 text-slate-500" />;
    return <Clock className="h-6 w-6 text-slate-500" />;
  };

  return (
    <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-md border-slate-200 bg-slate-50/50">
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-lg bg-slate-100 flex items-center justify-center">
            {getIcon()}
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-lg text-slate-900">{stepName}</h4>
            <p className="text-2xl font-bold text-slate-700 mt-1">
              {totalTrays} {totalTrays === 1 ? 'Tray' : 'Trays'}
            </p>
          </div>
        </div>
        
        <Button
          variant="outline"
          className="w-full border-slate-300 text-slate-700 hover:bg-slate-100"
          onClick={onViewDetails}
        >
          <Eye className="h-4 w-4 mr-2" />
          View Details
        </Button>
      </div>
    </Card>
  );
};

// --- SUB-COMPONENT: The Modern Task Card ---
interface TaskCardProps {
  task: DailyTask;
  variant: 'harvest' | 'warning' | 'default' | 'prep' | 'seed' | 'water';
  onComplete: (task: DailyTask) => void;
  isCompleting: boolean;
  isAnimatingOut?: boolean;
  onViewDetails?: (task: DailyTask) => void;
  onSkip?: (task: DailyTask) => void;
  onMarkAsLost?: (task: DailyTask) => void;
}

const TaskCard = ({ 
  task, 
  variant, 
  onComplete, 
  isCompleting, 
  isAnimatingOut = false, 
  onViewDetails, 
  onSkip, 
  onMarkAsLost 
}: TaskCardProps) => {

  // Enhanced Color Schemes (Soft Backgrounds + Strong Accents)
  const styles = {
    harvest: {
      softBg: 'bg-emerald-50',
      softText: 'text-emerald-700',
      iconColor: 'text-emerald-600',
      border: 'border-emerald-100 hover:border-emerald-300',
      icon: <Scissors size={18} />,
      btn: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200',
      progressColor: '#059669', // emerald-600
      badge: 'bg-emerald-100 text-emerald-800'
    },
    warning: {
      softBg: 'bg-amber-50',
      softText: 'text-amber-700',
      iconColor: 'text-amber-600',
      border: 'border-amber-100 hover:border-amber-300',
      icon: <Sun size={18} />,
      btn: 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200',
      progressColor: '#d97706', // amber-600
      badge: 'bg-amber-100 text-amber-800'
    },
    prep: {
      softBg: 'bg-purple-50',
      softText: 'text-purple-700',
      iconColor: 'text-purple-600',
      border: 'border-purple-100 hover:border-purple-300',
      icon: <Beaker size={18} />,
      btn: 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-200',
      progressColor: '#7c3aed', // purple-600
      badge: 'bg-purple-100 text-purple-800'
    },
    seed: {
      softBg: 'bg-indigo-50',
      softText: 'text-indigo-700',
      iconColor: 'text-indigo-600',
      border: 'border-indigo-100 hover:border-indigo-300',
      icon: <Sprout size={18} />,
      btn: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200',
      progressColor: '#4f46e5', // indigo-600
      badge: 'bg-indigo-100 text-indigo-800'
    },
    water: {
      softBg: 'bg-cyan-50',
      softText: 'text-cyan-700',
      iconColor: 'text-cyan-600',
      border: 'border-cyan-100 hover:border-cyan-300',
      icon: <Droplets size={18} />,
      btn: 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-200',
      progressColor: '#0891b2', // cyan-600
      badge: 'bg-cyan-100 text-cyan-800'
    },
    default: {
      softBg: 'bg-slate-50',
      softText: 'text-slate-700',
      iconColor: 'text-slate-600',
      border: 'border-slate-200 hover:border-slate-300',
      icon: <Droplets size={18} />,
      btn: 'bg-slate-800 hover:bg-slate-900 text-white shadow-slate-200',
      progressColor: '#475569', // slate-600
      badge: 'bg-slate-100 text-slate-800'
    }
  };

  const style = styles[variant] || styles.default;
  const progressPercent = Math.min((task.dayCurrent / task.dayTotal) * 100, 100);
  const trayCount = task.traysRemaining ?? task.trays;

  return (
    <Card className={cn(
      "group relative flex flex-col justify-between overflow-hidden transition-all duration-300 bg-white border",
      "hover:shadow-lg hover:-translate-y-1", 
      style.border,
      isAnimatingOut && "opacity-0 translate-x-10 scale-95 transition-all duration-300"
    )}>
      
      {/* 1. Header Section: Icon & Batch ID */}
      <div className="p-4 pb-2">
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-3">
            {/* Soft Icon Circle */}
            <div className={cn(
              "h-10 w-10 rounded-full flex items-center justify-center transition-colors",
              style.softBg,
              style.iconColor
            )}>
              {style.icon}
            </div>
            
            <div className="flex flex-col">
              <span className={cn(
                "text-xs font-bold uppercase tracking-wider",
                style.softText
              )}>
                {task.action}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {task.batchId}
              </span>
            </div>
          </div>

          <Badge variant="outline" className={cn("border-0 font-medium px-2", style.badge)}>
            {trayCount} {trayCount === 1 ? 'Tray' : 'Trays'}
          </Badge>
        </div>

        {/* 2. Hero Section: Crop Name */}
        <h3 className="text-lg font-bold text-slate-900 leading-tight mb-4 truncate pr-2">
          {task.crop}
        </h3>

        {/* 3. Info Grid: Stats */}
        <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs text-slate-500 mb-3">
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="text-slate-400" />
            <span>Day <span className="text-slate-900 font-semibold">{task.dayCurrent}</span>/{task.dayTotal}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin size={14} className="text-slate-400" />
            <span className="truncate">{task.location}</span>
          </div>
        </div>

        {/* Progress Bar (Subtle) */}
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
          <div 
            className="h-full rounded-full transition-all duration-500" 
            style={{ 
              width: `${progressPercent}%`, 
              backgroundColor: style.progressColor 
            }} 
          />
        </div>

        {task.stepDescription && (
          <p className="mt-3 text-[11px] text-slate-500 leading-relaxed line-clamp-2 bg-slate-50 p-2 rounded-md border border-slate-100">
            {task.stepDescription}
          </p>
        )}
      </div>

      {/* 4. Action Footer */}
      {variant === 'harvest' ? (
        <div className="p-3 bg-white border-t border-slate-50 mt-auto text-xs text-slate-500">
          Harvest actions are recorded from the tray details page; no inline action here.
        </div>
      ) : (
        <div className="p-3 bg-white border-t border-slate-50 mt-auto">
          <div className="flex gap-2">
            <Button
              onClick={() => onComplete(task)}
              disabled={isCompleting}
              className={cn(
                "flex-1 shadow-sm transition-all active:scale-95 font-semibold text-xs h-9",
                style.btn
              )}
            >
              {isCompleting ? 'Processing...' : (
                <span className="flex items-center gap-2">
                  {variant === 'seed' ? 'Start Seeding' : 
                   variant === 'prep' ? 'Begin Soak' : 'Mark Done'} 
                  <ArrowRight size={14} />
                </span>
              )}
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 bg-transparent"
                >
                  <MoreVertical size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onViewDetails?.(task)}>
                  <Eye className="mr-2 h-4 w-4 text-slate-500" /> Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.location.href = `/trays?recipe=${task.recipeId}`}>
                  <ExternalLink className="mr-2 h-4 w-4 text-slate-500" /> View Trays
                </DropdownMenuItem>
                {(onSkip || onMarkAsLost) && <DropdownMenuSeparator />}
                {onSkip && (
                  <DropdownMenuItem onClick={() => onSkip(task)} className="text-amber-600">
                    <SkipForward className="mr-2 h-4 w-4" /> Skip Task
                  </DropdownMenuItem>
                )}
                {onMarkAsLost && (
                  <DropdownMenuItem onClick={() => onMarkAsLost(task)} className="text-red-600">
                    <Trash2 className="mr-2 h-4 w-4" /> Mark as Lost
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </Card>
  );
};

// --- SUB-COMPONENT: Missed Steps Card for Catch-Up ---
interface MissedStepsCardProps {
  task: DailyTask;
  onSkipMissed: (task: DailyTask, missedStep: MissedStep) => void;
  onCompleteMissed: (task: DailyTask, missedStep: MissedStep) => void;
  onSkipAll: (task: DailyTask) => void;
  isAnimatingOut?: boolean;
}

const MissedStepsCard = ({ task, onSkipMissed, onCompleteMissed, onSkipAll, isAnimatingOut = false }: MissedStepsCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const missedSteps = task.missedSteps || [];

  if (missedSteps.length === 0) return null;

  return (
    <Card className={cn(
      "border-amber-200 bg-amber-50/50",
      isAnimatingOut && "opacity-0 translate-x-full transition-all duration-300 ease-in-out"
    )}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h4 className="font-bold text-slate-900">{task.crop}</h4>
              <p className="text-xs text-slate-500">
                {missedSteps.length} missed {missedSteps.length === 1 ? 'step' : 'steps'} - Day {task.dayCurrent} of {task.dayTotal}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSkipAll(task)}
              className="text-amber-600 border-amber-300 hover:bg-amber-100"
            >
              <FastForward className="h-4 w-4 mr-1" />
              Skip All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-slate-500"
            >
              {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </Button>
          </div>
        </div>

        {/* Summary when collapsed */}
        {!expanded && (
          <div className="text-sm text-slate-600 bg-white/60 rounded-lg p-3 border border-amber-200/50">
            <p>
              You missed: {missedSteps.map(s => s.description || s.stepName).join(', ')}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Click to expand and handle each step individually, or "Skip All" to clear them.
            </p>
          </div>
        )}

        {/* Expanded view with individual steps */}
        {expanded && (
          <div className="space-y-2 mt-3">
            {missedSteps.map((step) => (
              <div
                key={step.stepId}
                className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-200/50"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-sm font-medium">
                    {step.expectedDay}
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">{step.description || step.stepName}</p>
                    <p className="text-xs text-slate-500">Expected on Day {step.expectedDay}</p>
                    {(step.description || step.stepName || '').toLowerCase().includes('seed') && (
                      <p className="text-xs text-indigo-600 mt-1 italic">
                        Click "Seed" to select batch and create trays
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCompleteMissed(task, step)}
                    className={cn(
                      (step.description || step.stepName || '').toLowerCase().includes('seed')
                        ? "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600"
                        : "text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                    )}
                  >
                    {(step.description || step.stepName || '').toLowerCase().includes('seed') ? (
                      <>
                        <Sprout className="h-4 w-4 mr-1" />
                        Seed
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Done
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSkipMissed(task, step)}
                    className="text-slate-500 hover:text-amber-600"
                    title="Skip this step - we decided not to seed this week"
                  >
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

