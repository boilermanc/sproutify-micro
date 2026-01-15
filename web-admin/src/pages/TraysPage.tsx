import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { useParams } from 'react-router-dom';
import { checkHarvestReminders } from '../services/notificationService';
import { markTraysAsLost, LOSS_REASONS, type LossReason } from '../services/dailyFlowService';
import { Edit, Layers, Plus, Search, Calendar, Package, Sprout, Globe, MoreHorizontal, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import EmptyState from '../components/onboarding/EmptyState';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';

type TrayStatusFilter = 'all' | 'active' | 'harvested' | 'lost';
type SortKey =
  | 'trayId'
  | 'batchId'
  | 'variety'
  | 'seeding_date_raw'
  | 'customer'
  | 'harvest_date_raw'
  | 'status';
type SortConfig = {
  key: SortKey;
  direction: 'asc' | 'desc';
};

const formatBatchQuantity = (quantity?: number | string | null): string => {
  if (quantity === null || quantity === undefined || quantity === '') return '0.00';
  const parsed = typeof quantity === 'string' ? parseFloat(quantity) : Number(quantity);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00';
};

const TraysPage = () => {
  const stageColors: Record<string, string> = {
    Germination: 'bg-yellow-500 hover:bg-yellow-600',
    Blackout: 'bg-purple-500 hover:bg-purple-600',
    Grow: 'bg-green-500 hover:bg-green-600',
    Growing: 'bg-green-500 hover:bg-green-600',
    Harvest: 'bg-blue-500 hover:bg-blue-600',
    Harvesting: 'bg-blue-500 hover:bg-blue-600',
  };
  const [trays, setTrays] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<TrayStatusFilter>('active');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 20;
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [viewingTray, setViewingTray] = useState<any>(null);
  const [editingTray, setEditingTray] = useState<any>(null);
  const [trayDetails, setTrayDetails] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const { trayId: routeTrayId } = useParams<{ trayId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [hasOpenedTrayFromParam, setHasOpenedTrayFromParam] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [newTray, setNewTray] = useState<{
    recipe_id: string;
    quantity: number;
    seed_date: string;
    location: string;
    batch_id?: string;
  }>({
    recipe_id: '',
    quantity: 1,
    seed_date: new Date().toISOString().split('T')[0],
    location: '',
    batch_id: '',
  });
  // Batch selection helpers (setter-only to avoid unused state)
  const [, setAvailableBatches] = useState<any[]>([]);
  const [, setBatchWarning] = useState('');

  // Lost Tray Dialog state
  const [isLostDialogOpen, setIsLostDialogOpen] = useState(false);
  const [lostTray, setLostTray] = useState<any>(null);
  const [lossReason, setLossReason] = useState<LossReason | ''>('');
  const [lossNotes, setLossNotes] = useState('');
  const [markingAsLost, setMarkingAsLost] = useState(false);

  const fetchTrays = useCallback(async () => {
    setLoading(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);
      const offset = page * ITEMS_PER_PAGE;
      const to = offset + ITEMS_PER_PAGE - 1;

      // Fetch trays with recipes join, and join varieties to get variety name
      // Note: seedbatches join removed - will fetch separately to avoid column name issues
      let query = getSupabaseClient()
        .from('trays')
        .select(`
          *,
          recipes!inner(
            recipe_name,
            variety_id,
            varieties!inner(varietyid, name)
          )
        `, { count: 'exact' })
        .eq('farm_uuid', farmUuid);

      // Apply status filter
      if (statusFilter === 'active') {
        query = query.is('harvest_date', null).or('status.is.null,status.eq.active');
      } else if (statusFilter === 'harvested') {
        query = query
          .not('harvest_date', 'is', null) // harvested trays have a harvest_date
          .neq('status', 'lost'); // exclude lost even if they somehow have a harvest_date
      } else if (statusFilter === 'lost') {
        query = query.eq('status', 'lost');
      }
      // 'all' shows everything, so no additional filter

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, to);

      if (error) throw error;
      if (typeof count === 'number') {
        setTotalCount(count);
      }

      // Fetch seedbatches separately to get batch info
      // Actual DB column: batchid (not batch_id)
      const batchIds = (data || [])
        .map(tray => tray.batch_id)
        .filter(id => id !== null && id !== undefined);
      
      let batchesMap: Record<number, any> = {};
      if (batchIds.length > 0) {
        const { data: batchesData } = await getSupabaseClient()
          .from('seedbatches')
          .select('batchid, varietyid')
          .in('batchid', batchIds);
        
        // Fetch variety names for batches
        const varietyIds = (batchesData || [])
          .map(b => b.varietyid)
          .filter(id => id !== null && id !== undefined);
        
        let varietiesMap: Record<number, any> = {};
        if (varietyIds.length > 0) {
          const { data: varietiesData } = await getSupabaseClient()
            .from('varieties')
            .select('varietyid, name')
            .in('varietyid', varietyIds);
          
          varietiesMap = (varietiesData || []).reduce((acc, v) => {
            acc[v.varietyid] = v.name;
            return acc;
          }, {} as Record<number, string>);
        }
        
        // Map batches with variety names
        batchesMap = (batchesData || []).reduce((acc, b) => {
          acc[b.batchid] = {
            batchid: b.batchid,
            variety_name: varietiesMap[b.varietyid] || ''
          };
          return acc;
        }, {} as Record<number, any>);
      }

      // Fetch customers separately - first from direct customer_id on trays
      const customerIds = (data || [])
        .map(tray => tray.customer_id)
        .filter(id => id !== null && id !== undefined);
      
      let customersMap: Record<number, string> = {};
      if (customerIds.length > 0) {
        const { data: customersData } = await getSupabaseClient()
          .from('customers')
          .select('customerid, name')
          .in('customerid', customerIds);
        
        customersMap = (customersData || []).reduce((acc, c) => {
          acc[c.customerid] = c.name || '';
          return acc;
        }, {} as Record<number, string>);
      }

      // For trays without customer_id, try to find customer from standing orders
      // This handles trays created from standing orders that didn't get customer_id set
      const traysWithoutCustomer = (data || []).filter((t: any) => !t.customer_id && t.sow_date && t.recipe_id);
      
      if (traysWithoutCustomer.length > 0) {
        // Calculate grow times first (we'll need this to match delivery dates)
        const recipeGrowTimesForMatching: Record<number, number> = {};
        const recipeIdsForMatching = [...new Set(traysWithoutCustomer.map((t: any) => t.recipe_id))];
        
        if (recipeIdsForMatching.length > 0) {
          const { data: stepsForMatching } = await getSupabaseClient()
            .from('steps')
            .select('recipe_id, duration, duration_unit, sequence_order')
            .in('recipe_id', recipeIdsForMatching);
          
          if (stepsForMatching) {
            const sortedSteps = [...stepsForMatching].sort((a: any, b: any) => {
              const orderA = a.sequence_order ?? 0;
              const orderB = b.sequence_order ?? 0;
              return orderA - orderB;
            });
            
            const stepsByRecipe: Record<number, any[]> = {};
            sortedSteps.forEach((step: any) => {
              if (!stepsByRecipe[step.recipe_id]) {
                stepsByRecipe[step.recipe_id] = [];
              }
              stepsByRecipe[step.recipe_id].push(step);
            });
            
            Object.keys(stepsByRecipe).forEach((recipeIdStr) => {
              const recipeId = parseInt(recipeIdStr);
              const steps = stepsByRecipe[recipeId];
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
              recipeGrowTimesForMatching[recipeId] = totalDays;
            });
          }
        }
        
        // Fetch active standing orders with their customers
        const { data: standingOrdersData } = await getSupabaseClient()
          .from('standing_orders')
          .select(`
            standing_order_id,
            customer_id,
            customers!inner(customerid, name)
          `)
          .eq('farm_uuid', farmUuid)
          .eq('is_active', true);
        
        if (standingOrdersData && standingOrdersData.length > 0) {
          // Fetch product_recipe_mapping to link recipes to products
          const { data: productMappings } = await getSupabaseClient()
            .from('product_recipe_mapping')
            .select('product_id, recipe_id')
            .in('recipe_id', recipeIdsForMatching);
          
          // Fetch standing_order_items to get products
          const standingOrderIds = standingOrdersData.map((so: any) => so.standing_order_id);
          const { data: standingOrderItems } = await getSupabaseClient()
            .from('standing_order_items')
            .select('standing_order_id, product_id')
            .in('standing_order_id', standingOrderIds);
          
          // Build a map: recipe_id -> [customer_ids]
          const recipeToCustomers: Record<number, Set<number>> = {};
          
          if (productMappings && standingOrderItems) {
            // Create product_id -> recipe_id map
            const productToRecipe: Record<number, number[]> = {};
            productMappings.forEach((pm: any) => {
              if (!productToRecipe[pm.product_id]) {
                productToRecipe[pm.product_id] = [];
              }
              productToRecipe[pm.product_id].push(pm.recipe_id);
            });
            
            // For each standing order item, find matching recipes
            standingOrderItems.forEach((item: any) => {
              const recipes = productToRecipe[item.product_id] || [];
              const standingOrder = standingOrdersData.find((so: any) => so.standing_order_id === item.standing_order_id);
              
              if (standingOrder && standingOrder.customer_id) {
                recipes.forEach((recipeId: number) => {
                  if (!recipeToCustomers[recipeId]) {
                    recipeToCustomers[recipeId] = new Set();
                  }
                  recipeToCustomers[recipeId].add(standingOrder.customer_id);
                });
              }
            });
          }
          
          // For each tray without customer, try to match by recipe and date
          traysWithoutCustomer.forEach((tray: any) => {
            const recipeId = tray.recipe_id;
            const possibleCustomers = recipeToCustomers[recipeId];
            
            if (possibleCustomers && possibleCustomers.size > 0) {
              // If there's only one customer for this recipe, use it
              // Otherwise, we could try to match by delivery date, but for now use the first one
              const customerId = Array.from(possibleCustomers)[0];
              
              // Add to customersMap if not already there
              if (!customersMap[customerId]) {
                const standingOrder = standingOrdersData.find((so: any) => so.customer_id === customerId);
                if (standingOrder && standingOrder.customers) {
                  const customer = Array.isArray(standingOrder.customers) 
                    ? standingOrder.customers[0] 
                    : standingOrder.customers;
                  if (customer) {
                    customersMap[customerId] = customer.name || '';
                  }
                }
              }
              
              // Set customer_id on the tray data for later use
              tray.customer_id = customerId;
            }
          });
        }
      }

      // Fetch recipe steps to calculate grow time and projected harvest dates
      const recipeIds = [...new Set((data || []).map((tray: any) => tray.recipe_id).filter((id: any) => id !== null && id !== undefined))];
      const recipeGrowTimes: Record<number, number> = {};
      
      if (recipeIds.length > 0) {
        const { data: allSteps, error: stepsError } = await getSupabaseClient()
          .from('steps')
          .select('*')
          .in('recipe_id', recipeIds);

        if (stepsError) {
          console.error('Error fetching steps:', stepsError);
        }

        // Calculate total grow time per recipe
        if (allSteps) {
          // Sort steps by step_order or sequence_order
          const sortedSteps = [...allSteps].sort((a: any, b: any) => {
            const orderA = a.step_order ?? a.sequence_order ?? 0;
            const orderB = b.step_order ?? b.sequence_order ?? 0;
            return orderA - orderB;
          });
          
          const stepsByRecipe: Record<number, any[]> = {};
          sortedSteps.forEach((step: any) => {
            if (!stepsByRecipe[step.recipe_id]) {
              stepsByRecipe[step.recipe_id] = [];
            }
            stepsByRecipe[step.recipe_id].push(step);
          });

          // Calculate total days for each recipe
          Object.keys(stepsByRecipe).forEach((recipeIdStr) => {
            const recipeId = parseInt(recipeIdStr);
            const steps = stepsByRecipe[recipeId];
            const totalDays = steps.reduce((sum: number, step: any) => {
              // Handle both schema versions:
              // New schema: duration + duration_unit (preferred)
              // Old schema: duration_days (fallback for backwards compatibility)
              const duration = step.duration || step.duration_days || 0;
              const unit = (step.duration_unit || 'Days').toUpperCase();
              if (unit === 'DAYS') {
                return sum + duration;
              } else if (unit === 'HOURS') {
                // Hours >= 12 counts as 1 day, otherwise 0
                return sum + (duration >= 12 ? 1 : 0);
              }
              return sum + duration; // default: treat as days
            }, 0);
            recipeGrowTimes[recipeId] = totalDays;
          });
        }
      }

      // Fetch current pending step per active tray to show stage
      const currentStepByTray: Record<number, string> = {};
      const activeTrayIds = (data || [])
        .filter((t: any) => t.status !== 'lost' && t.status !== 'harvested' && !t.harvest_date)
        .map((t: any) => t.tray_id);

    console.log('Active tray IDs:', activeTrayIds);

      if (activeTrayIds.length > 0) {
        const { data: currentSteps, error: stepsError } = await getSupabaseClient()
          .from('tray_steps')
          .select('tray_id, step_id, scheduled_date, status')
          .in('tray_id', activeTrayIds)
          .eq('status', 'Pending')
          .order('scheduled_date', { ascending: true });

        console.log('Steps query error:', stepsError);
        console.log('Current steps raw:', currentSteps);

        if (currentSteps && currentSteps.length > 0) {
          const stepIds = [...new Set(currentSteps.map((cs: any) => cs.step_id))];
          const { data: stepsData } = await getSupabaseClient()
            .from('steps')
            .select('step_id, step_name')
            .in('step_id', stepIds);

          const stepNameMap: Record<number, string> = {};
          (stepsData || []).forEach((s: any) => {
            stepNameMap[s.step_id] = s.step_name;
          });

          (currentSteps || []).forEach((cs: any) => {
            if (!currentStepByTray[cs.tray_id]) {
              currentStepByTray[cs.tray_id] = stepNameMap[cs.step_id] || 'Growing';
            }
          });
        }

        console.log('Current step by tray:', currentStepByTray);
      }

      const formattedTrays = (data || []).map(tray => {
        const batch = tray.batch_id ? batchesMap[tray.batch_id] : null;
        const customerName = tray.customer_id ? customersMap[tray.customer_id] : null;
        
      // Calculate projected harvest date
        let projectedHarvestDate = 'Not set';
        if (tray.sow_date) {
          const sowDate = new Date(tray.sow_date);
          const growTime = recipeGrowTimes[tray.recipe_id] || 0;
          if (growTime > 0) {
            const harvestDate = new Date(sowDate);
            harvestDate.setDate(harvestDate.getDate() + growTime);
            projectedHarvestDate = harvestDate.toLocaleDateString();
          }
        }
        
        // Determine status based on tray.status field (new) or legacy logic
        const currentStage = currentStepByTray[tray.tray_id];
        let status = 'Growing';
        if (tray.status === 'lost') {
          status = 'Lost';
        } else if (tray.status === 'harvested' || tray.harvest_date) {
          status = 'Harvested';
        } else if (currentStage) {
          status = currentStage;
        }

      console.log(`Tray ${tray.tray_id}: currentStage=${currentStage}, status=${status}`);

        return {
          id: tray.tray_id,
          trayId: tray.tray_unique_id || tray.tray_id,
          batchId: batch ? `B-${batch.batchid}` : 'N/A',
          variety: tray.recipes?.varieties?.name || tray.recipes?.variety_name || 'Unknown',
          recipe: tray.recipes?.recipe_name || 'Unknown',
          customer: customerName || 'Unassigned',
          customer_id: tray.customer_id || null,
          location: tray.location || 'Not set',
          status,
          loss_reason: tray.loss_reason || null,
          harvest_date: tray.harvest_date ? new Date(tray.harvest_date).toLocaleDateString() : projectedHarvestDate,
          harvest_date_raw: tray.harvest_date || '',
          seeding_date: tray.sow_date ? new Date(tray.sow_date).toLocaleDateString() : 'Not set',
          seeding_date_raw: tray.sow_date || '',
          created_at: new Date(tray.created_at).toLocaleDateString()
        };
      });

    setTrays(formattedTrays);
    console.log('[Trays] Sample tray customer_ids:', formattedTrays.slice(0, 5).map((t) => ({
      tray_id: t.id,
      customer_id: t.customer_id,
      isAssigned: isTrayAssigned(t),
    })));
    console.log('[Trays] Unassigned count:', formattedTrays.filter((t) => !isTrayAssigned(t)).length);
      const pageHasMore = (count === null || count === undefined)
        ? ((data?.length || 0) === ITEMS_PER_PAGE)
        : ((offset + (data?.length || 0)) < count);
      setHasMore(pageHasMore);
    } catch (error) {
      console.error('Error fetching trays:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  const fetchFormData = useCallback(async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      // Fetch farm's own recipes
      const { data: farmRecipesData, error: recipesError } = await getSupabaseClient()
        .from('recipes')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true)
        .order('recipe_name', { ascending: true });

      if (recipesError) {
        console.error('Error fetching recipes:', recipesError);
        return;
      }

      // Fetch enabled global recipes for this farm
      const { data: enabledGlobalRecipes, error: globalError } = await getSupabaseClient()
        .from('farm_global_recipes')
        .select(`
          global_recipe_id,
          global_recipes!inner(
            global_recipe_id,
            recipe_name,
            variety_name,
            description,
            notes,
            is_active,
            global_steps(*)
          )
        `)
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true);

      if (globalError) {
        console.error('Error fetching enabled global recipes:', globalError);
      }

      // Transform global recipes to match farm recipe format for dropdown
      const globalRecipesForDropdown = (enabledGlobalRecipes || [])
        .filter((item: any) => item.global_recipes?.is_active)
        .map((item: any) => ({
          recipe_id: `global_${item.global_recipe_id}`, // Prefix to distinguish from farm recipes
          recipe_name: item.global_recipes.recipe_name,
          variety_name: item.global_recipes.variety_name,
          description: item.global_recipes.description,
          notes: item.global_recipes.notes,
          is_global: true, // Flag to identify global recipes
          global_recipe_id: item.global_recipe_id,
          global_steps: item.global_recipes.global_steps || [],
        }));

      // Combine farm recipes and enabled global recipes
      const allRecipesData = [
        ...(farmRecipesData || []).map((r: any) => ({ ...r, is_global: false })),
        ...globalRecipesForDropdown
      ];

      if (!allRecipesData || allRecipesData.length === 0) {
        console.log('No recipes found for farm:', farmUuid);
        setRecipes([]);
        setBatches([]);
        return;
      }

      console.log('Found recipes:', allRecipesData.length);

      // Fetch varieties separately to avoid join issues
      const recipeVarietyIds = [...new Set(
        allRecipesData
          .map((r: any) => r.variety_id)
          .filter((id: any) => id !== null && id !== undefined)
      )];

      let recipeVarietiesMap: Record<number, any> = {};
      if (recipeVarietyIds.length > 0) {
        const { data: varietiesData, error: varietiesError } = await getSupabaseClient()
          .from('varieties')
          .select('varietyid, name, seed_quantity_grams')
          .in('varietyid', recipeVarietyIds);

        if (varietiesError) {
          console.error('Error fetching varieties:', varietiesError);
        } else if (varietiesData) {
          recipeVarietiesMap = (varietiesData || []).reduce((acc: Record<number, any>, v: any) => {
            acc[v.varietyid] = v;
            return acc;
          }, {} as Record<number, any>);
        }
      }

      // Attach variety data to recipes
      const recipesWithVarieties = allRecipesData.map((recipe: any) => {
        const varietyId = recipe.variety_id;
        const variety = varietyId ? recipeVarietiesMap[varietyId] : null;
        return {
          ...recipe,
          varieties: variety ? {
            varietyid: variety.varietyid,
            name: variety.name,
            seed_quantity_grams: variety.seed_quantity_grams
          } : null
        };
      });

      // Fetch all seedbatches with quantity
      const { data: batchesData, error: batchesError } = await getSupabaseClient()
        .from('seedbatches')
        .select('batchid, varietyid, quantity, lot_number, purchasedate, status')
        .eq('farm_uuid', farmUuid)
        .gte('quantity', 0) // Only batches with available quantity
        .order('purchasedate', { ascending: false });

      if (batchesError) {
        console.error('Error fetching batches:', batchesError);
      }

      console.log('Found batches:', batchesData?.length || 0);

      // Fetch varieties to get names for batches (merge with recipe varieties if needed)
      const batchVarietyIds = (batchesData || [])
        .map(b => b.varietyid)
        .filter(id => id !== null && id !== undefined);
      
      // If we need to fetch additional varieties for batches, do it
      if (batchVarietyIds.length > 0) {
        const missingVarietyIds = batchVarietyIds.filter(id => !recipeVarietiesMap[id]);
        if (missingVarietyIds.length > 0) {
          const { data: batchVarietiesData } = await getSupabaseClient()
            .from('varieties')
            .select('varietyid, name, seed_quantity_grams')
            .in('varietyid', missingVarietyIds);
          
          if (batchVarietiesData) {
            batchVarietiesData.forEach((v: any) => {
              recipeVarietiesMap[v.varietyid] = v;
            });
          }
        }
      }
      
      // Use the merged varieties map for batches
      const batchVarietiesMap = recipeVarietiesMap;

      // Filter recipes to only include those with available inventory
      // But if no recipes have inventory, show all recipes anyway (user can see what's missing)
      const recipesWithInventory = recipesWithVarieties.filter((recipe: any) => {
        const varietyId = recipe.variety_id || recipe.varieties?.varietyid;
        // Use recipe seed_quantity if available, fallback to variety seed_quantity_grams
        // Convert to grams for comparison (batches are stored in grams)
        let seedQuantityNeeded = 0;
        if (recipe.seed_quantity) {
          const unit = recipe.seed_quantity_unit || 'grams';
          seedQuantityNeeded = unit === 'oz' ? recipe.seed_quantity * 28.35 : recipe.seed_quantity; // Convert oz to grams
        } else {
          seedQuantityNeeded = recipe.varieties?.seed_quantity_grams || 0;
        }
        
        if (!varietyId) {
          console.log('Recipe filtered out - missing variety_id:', {
            recipe_id: recipe.recipe_id,
            recipe_name: recipe.recipe_name,
            variety_id: recipe.variety_id
          });
          return false;
        }

        if (!seedQuantityNeeded || seedQuantityNeeded === 0) {
          console.log('Recipe filtered out - missing or zero seed_quantity_grams:', {
            recipe_id: recipe.recipe_id,
            recipe_name: recipe.recipe_name,
            seed_quantity_grams: recipe.varieties?.seed_quantity_grams
          });
          return false;
        }

        // Check if there's at least one batch for this variety with sufficient quantity
        const batchesForVariety = (batchesData || []).filter((b: any) => b.varietyid === varietyId);
        const hasAvailableBatch = batchesForVariety.some((batch: any) => {
          const batchQuantity = parseFloat(batch.quantity) || 0;
          return batchQuantity >= seedQuantityNeeded;
        });

        if (!hasAvailableBatch) {
          console.log('Recipe filtered out - no available batch:', {
            recipe_id: recipe.recipe_id,
            recipe_name: recipe.recipe_name,
            varietyId,
            seedQuantityNeeded,
            availableBatches: batchesForVariety.map((b: any) => ({ 
              batchid: b.batchid, 
              quantity: b.quantity,
              quantityParsed: parseFloat(b.quantity) || 0,
              meetsRequirement: (parseFloat(b.quantity) || 0) >= seedQuantityNeeded
            }))
          });
        }

        return hasAvailableBatch;
      });

      console.log('Recipes with inventory:', recipesWithInventory.length, 'out of', recipesWithVarieties.length);
      console.log('All recipes:', recipesWithVarieties.map(r => ({ 
        id: r.recipe_id, 
        name: r.recipe_name, 
        variety_id: r.variety_id, 
        hasVariety: !!r.varieties,
        varietyName: r.varieties?.name,
        seedQuantity: (() => {
          if (r.seed_quantity) {
            const unit = r.seed_quantity_unit || 'grams';
            return unit === 'oz' ? r.seed_quantity * 28.35 : r.seed_quantity; // Convert to grams for display
          }
          return r.varieties?.seed_quantity_grams || 0;
        })()
      })));
      console.log('Recipes with inventory:', recipesWithInventory.map(r => ({ id: r.recipe_id, name: r.recipe_name })));
      console.log('Batches data:', (batchesData || []).map(b => ({ batchid: b.batchid, varietyid: b.varietyid, quantity: b.quantity })));

      // Normalize batches with variety names
      const normalizedBatches = (batchesData || []).map((batch: any) => ({
        ...batch,
        batch_id: batch.batchid, // Map for code compatibility
        variety_name: batchVarietiesMap[batch.varietyid]?.name || ''
      }));

      // If no recipes have inventory, show all recipes anyway (user needs to see what's available)
      // They'll get an error when trying to create a tray without inventory
      const recipesToShow = recipesWithInventory.length > 0 ? recipesWithInventory : recipesWithVarieties;
      
      console.log('Setting recipes state:', recipesToShow.length, 'recipes');
      setRecipes(recipesToShow);
      setBatches(normalizedBatches);

      // Fetch customers
      const { data: customersData, error: customersError } = await getSupabaseClient()
        .from('customers')
        .select('customerid, name')
        .eq('farm_uuid', farmUuid)
        .order('name', { ascending: true });

      if (customersError) {
        console.error('Error fetching customers:', customersError);
      } else {
        // Normalize customer data
        const normalizedCustomers = (customersData || []).map((c: any) => ({
          customer_id: c.customerid,
          customer_name: c.name || '',
        }));
        setCustomers(normalizedCustomers);
      }
    } catch (error) {
      console.error('Error fetching form data:', error);
    }
  }, []);

  useEffect(() => {
    fetchTrays();
    fetchFormData();
  }, [fetchFormData, fetchTrays]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, searchTerm]);

  // Update available batches when recipe is selected
  useEffect(() => {
    const updateAvailableBatches = () => {
      setBatchWarning('');

      if (!newTray.recipe_id) {
        setAvailableBatches([]);
        return;
      }

      // Handle both regular recipe IDs (numbers) and global recipe IDs (strings like "global_1")
      const selectedRecipe = recipes.find(
        (r) => r.recipe_id.toString() === newTray.recipe_id
      );

      if (!selectedRecipe) {
        setAvailableBatches([]);
        return;
      }

      // For global recipes, we need to match by variety_name since they don't have variety_id
      const varietyId = selectedRecipe.variety_id || selectedRecipe.varieties?.varietyid;
      // Use recipe seed_quantity if available, fallback to variety seed_quantity_grams
      // Convert to grams for comparison (batches are stored in grams)
      let seedQuantityNeeded = 0;
      if (selectedRecipe.seed_quantity) {
        const unit = selectedRecipe.seed_quantity_unit || 'grams';
        seedQuantityNeeded = unit === 'oz' ? selectedRecipe.seed_quantity * 28.35 : selectedRecipe.seed_quantity; // Convert oz to grams
      } else {
        seedQuantityNeeded = selectedRecipe.varieties?.seed_quantity_grams || 0;
      }
      const varietyName = selectedRecipe.varieties?.name || selectedRecipe.variety_name || 'this variety';

      // For global recipes without variety_id, show all batches for now
      // (they'll need to select a batch that matches the variety name)
      if (selectedRecipe.is_global && !varietyId) {
        // For global recipes, filter batches by variety_name match
        const globalVarietyName = selectedRecipe.variety_name?.toLowerCase() || '';
        const filtered = batches.filter((batch: any) => {
          const batchVarietyName = batch.variety_name?.toLowerCase() || '';
          return batchVarietyName.includes(globalVarietyName) || globalVarietyName.includes(batchVarietyName);
        });
        if (filtered.length === 0) {
          setBatchWarning(`No seed batches found matching "${selectedRecipe.variety_name}". You may need to add a batch for this variety first.`);
        }
        setAvailableBatches(filtered.length > 0 ? filtered : batches);
        return;
      }

      if (!varietyId) {
        setBatchWarning('This recipe is not linked to a variety. Please edit the recipe to assign a variety.');
        setAvailableBatches([]);
        return;
      }

      if (!seedQuantityNeeded) {
        setBatchWarning(`The variety "${varietyName}" doesn't have a seed quantity defined. Please update the variety settings.`);
        setAvailableBatches([]);
        return;
      }

      // Find batches for this variety (regardless of quantity) to give helpful messages
      const batchesForVariety = batches.filter((batch: any) => batch.varietyid === varietyId);

      if (batchesForVariety.length === 0) {
        setBatchWarning(`No seed batches found for "${varietyName}". Please add a batch first.`);
        setAvailableBatches([]);
        return;
      }

      // Filter batches for this variety with sufficient quantity
      const filtered = batchesForVariety.filter((batch: any) => {
        const batchQuantity = parseFloat(batch.quantity) || 0;
        return batchQuantity >= seedQuantityNeeded;
      });

      console.log('Available batches for recipe:', {
        recipe_id: selectedRecipe.recipe_id,
        recipe_name: selectedRecipe.recipe_name,
        varietyId,
        seedQuantityNeeded,
        batchesForVariety: batchesForVariety.length,
        availableBatches: filtered.length,
        batches: filtered.map(b => ({ batchid: b.batchid || b.batch_id, quantity: b.quantity }))
      });

      // If we have batches for this variety but none with sufficient quantity, show a helpful message
      if (filtered.length === 0 && batchesForVariety.length > 0) {
        const maxAvailable = Math.max(...batchesForVariety.map((b: any) => parseFloat(b.quantity) || 0));
        setBatchWarning(
          `Insufficient seed inventory. Recipe requires ${seedQuantityNeeded}g but your largest batch only has ${maxAvailable}g. ` +
          `Please add more seeds to a batch or reduce the seed quantity requirement for "${varietyName}".`
        );
      }

      setAvailableBatches(filtered);

      // Clear batch selection if current selection is not available
      if (newTray.batch_id && !filtered.some(b => (b.batch_id || b.batchid)?.toString() === newTray.batch_id)) {
        setNewTray(prev => ({ ...prev, batch_id: '' }));
      }
    };

    updateAvailableBatches();
  }, [newTray.batch_id, newTray.recipe_id, recipes, batches]);

  const handleAddTray = async () => {
    if (!newTray.recipe_id) {
      alert('Please select a recipe');
      return;
    }

    if (!newTray.seed_date) {
      alert('Please select a seed date');
      return;
    }

    const quantity = Math.max(1, newTray.quantity || 1);
    setCreating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid, userId } = JSON.parse(sessionData);

      // Find the selected recipe to get recipe_name and variety_name
      const isGlobalRecipe = newTray.recipe_id.startsWith('global_');
      const selectedRecipe = recipes.find(
        (r) => r.recipe_id.toString() === newTray.recipe_id
      );

      if (!selectedRecipe) {
        throw new Error('Selected recipe not found');
      }

      // If it's a global recipe, auto-copy it to create a farm recipe first
      let actualRecipeId: number;
      let recipeName: string;

      if (isGlobalRecipe && selectedRecipe.global_recipe_id) {
        // Copy the global recipe to create a farm recipe
        const { data: newRecipeId, error: copyError } = await getSupabaseClient().rpc('copy_global_recipe_to_farm', {
          p_global_recipe_id: selectedRecipe.global_recipe_id,
          p_farm_uuid: farmUuid,
          p_created_by: userId,
          p_new_recipe_name: selectedRecipe.recipe_name // Keep the same name for auto-copy
        });

        if (copyError) {
          console.error('Error copying global recipe:', copyError);
          throw new Error('Failed to copy global recipe: ' + copyError.message);
        }

        actualRecipeId = newRecipeId;
        recipeName = selectedRecipe.recipe_name;

        // Refresh form data to include the new recipe
        fetchFormData();
      } else {
        actualRecipeId = parseInt(newTray.recipe_id);
        recipeName = selectedRecipe.recipe_name;
      }

      // Get variety name from join or fallback to text field
      const varietyName = selectedRecipe.varieties?.name || selectedRecipe.variety_name || '';

      // Create seeding request (new workflow - creates a plan, not trays immediately)
      const { error: requestError } = await getSupabaseClient()
        .from('tray_creation_requests')
        .insert({
          farm_uuid: farmUuid,
          recipe_id: actualRecipeId,
          recipe_name: recipeName,
          variety_name: varietyName,
          quantity: quantity,
          seed_date: newTray.seed_date, // Date when seeding should happen
          status: 'pending',
          source_type: 'manual',
          user_id: userId,
        });

      if (requestError) throw requestError;

      // Reset form
      setNewTray({ 
        recipe_id: '', 
        quantity: 1, 
        seed_date: new Date().toISOString().split('T')[0],
        location: '' 
      });
      setIsAddDialogOpen(false);
      fetchTrays();

      // Check for notifications
      checkHarvestReminders();

      // Show success message
      if (quantity === 1) {
        alert('Seeding request created successfully');
      } else {
        alert(`Successfully created seeding request for ${quantity} trays`);
      }
    } catch (error) {
      console.error('Error creating seeding request:', error);
      alert(`Failed to create seeding request`);
    } finally {
      setCreating(false);
    }
  };

  const handleEditTray = async (tray: any) => {
    setEditingTray(tray);
    setIsEditDialogOpen(true);
    
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      // Fetch full tray details for editing
      const { data: trayData, error } = await getSupabaseClient()
        .from('trays')
        .select(`
          *,
          recipes!inner(
            recipe_id,
            recipe_name,
            variety_name,
            variety_id
          )
        `)
        .eq('tray_id', tray.id)
        .eq('farm_uuid', farmUuid)
        .single();

      if (error) {
        console.error('Error fetching tray for editing:', error);
        return;
      }

      setEditingTray({
        ...tray,
        ...trayData,
        id: tray.id, // Preserve the id from the formatted tray
        sow_date: trayData.sow_date ? new Date(trayData.sow_date).toISOString().split('T')[0] : '',
        harvest_date: trayData.harvest_date ? new Date(trayData.harvest_date).toISOString().split('T')[0] : '',
        customer_id: trayData.customer_id ? trayData.customer_id.toString() : 'none',
        location: trayData.location || '',
      });
    } catch (error) {
      console.error('Error loading tray for editing:', error);
    }
  };

  const handleUpdateTray = async () => {
    if (!editingTray) return;

    setUpdating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      const updatePayload: any = {};
      
      if (editingTray.sow_date) {
        updatePayload.sow_date = new Date(editingTray.sow_date).toISOString();
      }
      
      if (editingTray.harvest_date) {
        updatePayload.harvest_date = new Date(editingTray.harvest_date).toISOString();
      } else {
        updatePayload.harvest_date = null;
      }
      
      if (editingTray.yield !== undefined && editingTray.yield !== '') {
        updatePayload.yield = parseFloat(editingTray.yield) || null;
      }

      // Handle customer_id
      if (editingTray.customer_id && editingTray.customer_id !== 'none') {
        updatePayload.customer_id = parseInt(editingTray.customer_id);
      } else {
        updatePayload.customer_id = null;
      }

      // Handle location
      if (editingTray.location !== undefined) {
        updatePayload.location = editingTray.location.trim() || null;
      }

      const { error } = await getSupabaseClient()
        .from('trays')
        .update(updatePayload)
        .eq('tray_id', editingTray.id)
        .eq('farm_uuid', farmUuid);

      if (error) throw error;

      setIsEditDialogOpen(false);
      setEditingTray(null);
      fetchTrays();
    } catch (error) {
      console.error('Error updating tray:', error);
      alert('Failed to update tray');
    } finally {
      setUpdating(false);
    }
  };

  const handleViewTray = useCallback(async (tray: any) => {
    setViewingTray(tray);
    setIsViewDialogOpen(true);
    
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      // Fetch full tray details with recipe and steps
      const { data: trayData, error } = await getSupabaseClient()
        .from('trays')
        .select(`
          *,
          recipes!inner(
            recipe_id,
            recipe_name,
            variety_name,
            variety_id,
            varieties!inner(varietyid, name, seed_quantity_grams),
            seed_quantity,
            seed_quantity_unit
          )
        `)
        .eq('tray_id', tray.id)
        .eq('farm_uuid', farmUuid)
        .single();

      if (error) {
        console.error('Error fetching tray details:', error);
        return;
      }

      // Fetch steps for the recipe
      // Try with step_descriptions join first, fall back to simple query if it fails
      let stepsData: any[] | null = null;
      const { data: stepsWithDescriptions, error: stepsJoinError } = await getSupabaseClient()
        .from('steps')
        .select('*, step_descriptions!left(description_name, description_details)')
        .eq('recipe_id', trayData.recipes.recipe_id);

      if (stepsJoinError) {
        console.warn('Could not join step_descriptions, falling back to simple query:', stepsJoinError);
        // Fall back to simple query without join
        const { data: simpleSteps, error: simpleStepsError } = await getSupabaseClient()
          .from('steps')
          .select('*')
          .eq('recipe_id', trayData.recipes.recipe_id);

        if (simpleStepsError) {
          console.error('Error fetching steps:', simpleStepsError);
        }
        stepsData = simpleSteps;
      } else {
        stepsData = stepsWithDescriptions;
      }

      // Sort steps by step_order or sequence_order
      const sortedStepsData = stepsData ? [...stepsData].sort((a, b) => {
        const orderA = a.step_order ?? a.sequence_order ?? 0;
        const orderB = b.step_order ?? b.sequence_order ?? 0;
        return orderA - orderB;
      }) : null;

      // Fetch tray_steps to see which steps are completed
      const { data: trayStepsData, error: trayStepsError } = await getSupabaseClient()
        .from('tray_steps')
        .select('*')
        .eq('tray_id', tray.id)
        .order('scheduled_date', { ascending: true });

      if (trayStepsError) {
        console.error('Error fetching tray_steps:', trayStepsError);
      }

      // Fetch batch details if batch_id exists
      let batchDetails = null;
      if (trayData.batch_id) {
        const { data: batchData } = await getSupabaseClient()
          .from('seedbatches')
          .select('batchid, varietyid, quantity, lot_number, purchasedate')
          .eq('batchid', trayData.batch_id)
          .single();
        
        if (batchData) {
          batchDetails = batchData;
        }
      }

      setTrayDetails({
        ...trayData,
        steps: sortedStepsData || [],
        traySteps: trayStepsData || [],
        batch: batchDetails,
      });
    } catch (error) {
      console.error('Error loading tray details:', error);
    }
  }, []);

  const routeMode = searchParams.get('mode');

  useEffect(() => {
    if (!routeTrayId) {
      setHasOpenedTrayFromParam(false);
      return;
    }

    if (hasOpenedTrayFromParam) return;

    const trayIdNumber = Number(routeTrayId);
    if (Number.isNaN(trayIdNumber)) return;

    const matchedTray = trays.find((tray) => tray.id === trayIdNumber);

    if (routeMode === 'edit') {
      handleEditTray(matchedTray ? { ...matchedTray, id: matchedTray.id } : { id: trayIdNumber, trayId: routeTrayId });
    } else if (matchedTray) {
      handleViewTray(matchedTray);
    } else {
      handleViewTray({ id: trayIdNumber, trayId: routeTrayId });
    }

    setHasOpenedTrayFromParam(true);

    if (routeMode) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('mode');
      setSearchParams(nextParams);
    }
  }, [routeTrayId, trays, hasOpenedTrayFromParam, handleViewTray, handleEditTray, routeMode, searchParams, setSearchParams]);

  // Handle opening lost tray dialog
  const handleMarkAsLost = (tray: any) => {
    setLostTray(tray);
    setLossReason('');
    setLossNotes('');
    setIsLostDialogOpen(true);
  };

  // Handle confirming the lost tray
  const handleLostConfirm = async () => {
    if (!lostTray || !lossReason) return;

    setMarkingAsLost(true);
    try {
      const success = await markTraysAsLost([lostTray.id], lossReason, lossNotes || undefined);
      if (success) {
        setIsLostDialogOpen(false);
        setLostTray(null);
        setLossReason('');
        setLossNotes('');
        fetchTrays(); // Refresh the list
      } else {
        alert('Failed to mark tray as lost');
      }
    } catch (error) {
      console.error('Error marking tray as lost:', error);
      alert('Failed to mark tray as lost');
    } finally {
      setMarkingAsLost(false);
    }
  };

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { key, direction: 'asc' };
    });
  };

  const SortableHeaderCell = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <TableHead>
      <button
        type="button"
        onClick={() => handleSort(sortKey)}
        className="flex w-full items-center gap-1 text-left text-sm font-semibold text-foreground"
      >
        <span>{label}</span>
        {sortConfig?.key === sortKey && (
          <span className="text-[10px] text-muted-foreground">
            {sortConfig.direction === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </button>
    </TableHead>
  );

  const isTrayAssigned = (tray: any) => {
    const id = typeof tray.customer_id === 'string' ? parseInt(tray.customer_id, 10) : tray.customer_id;
    return Number.isFinite(id) && id > 0;
  };

  const unassignedTraysCount = useMemo(() => {
    return trays.filter((tray) => !isTrayAssigned(tray)).length;
  }, [trays]);

  const filteredTrays = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const matchesTerm = (value?: string | number | null) =>
      value?.toString().toLowerCase().includes(normalizedSearch) ?? false;

    return trays.filter((tray) => {
      if (showUnassignedOnly && isTrayAssigned(tray)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return (
        matchesTerm(tray.variety) ||
        matchesTerm(tray.trayId) ||
        matchesTerm(tray.recipe) ||
        matchesTerm(tray.customer) ||
        matchesTerm(tray.batchId) ||
        matchesTerm(tray.seeding_date) ||
        matchesTerm(tray.harvest_date)
      );
    });
  }, [trays, searchTerm, showUnassignedOnly]);

  const sortedTrays = useMemo(() => {
    if (!sortConfig) {
      return filteredTrays;
    }

    const multiplier = sortConfig.direction === 'asc' ? 1 : -1;
    const sorted = [...filteredTrays];

    sorted.sort((a: any, b: any) => {
      if (sortConfig.key === 'seeding_date_raw' || sortConfig.key === 'harvest_date_raw') {
        const parseDate = (value?: string | null) => {
          const timestamp = value ? Date.parse(value) : NaN;
          return Number.isNaN(timestamp) ? 0 : timestamp;
        };
        const difference = parseDate(a[sortConfig.key]) - parseDate(b[sortConfig.key]);
        return difference === 0 ? 0 : difference * multiplier;
      }

      const left = (a[sortConfig.key] ?? '').toString().toLowerCase();
      const right = (b[sortConfig.key] ?? '').toString().toLowerCase();

      if (left < right) return -1 * multiplier;
      if (left > right) return 1 * multiplier;
      return 0;
    });

    return sorted;
  }, [filteredTrays, sortConfig]);

  const traysToDisplay = sortedTrays;
  const totalPages = totalCount ? Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE)) : Math.max(1, page + 1);

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Trays</h1>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trays</h1>
          <p className="text-muted-foreground">Manage your growing trays</p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (open) {
            // Refresh recipes when dialog opens
            fetchFormData();
            // Reset form to defaults
            setNewTray({
              recipe_id: '',
              batch_id: '',
              quantity: 1,
              seed_date: new Date().toISOString().split('T')[0],
              location: '',
            });
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Tray
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Tray(s)</DialogTitle>
              <DialogDescription>
                Start growing trays for inventory or speculative purposes. For customer orders, use the Orders page.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="recipe">Recipe *</Label>
                <Select 
                  value={newTray.recipe_id} 
                  onValueChange={(value) => setNewTray({ ...newTray, recipe_id: value, batch_id: '' })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a recipe" />
                  </SelectTrigger>
                  <SelectContent>
                    {recipes.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No recipes available. Please create a recipe first, enable global recipes, or ensure recipes have available seed inventory.
                      </div>
                    ) : (
                      recipes.map((recipe) => {
                        const varietyName = recipe.varieties?.name || recipe.variety_name || 'N/A';
                        const isGlobal = recipe.is_global;
                        return (
                          <SelectItem key={recipe.recipe_id} value={recipe.recipe_id.toString()}>
                            <span className="flex items-center gap-2">
                              {isGlobal && <Globe className="h-3 w-3 text-blue-500" />}
                              {recipe.recipe_name} ({varietyName})
                              {isGlobal && <span className="text-xs text-blue-500 ml-1">Global</span>}
                            </span>
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  placeholder="1"
                  value={newTray.quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    setNewTray({ ...newTray, quantity: Math.max(1, val) });
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Number of trays to create
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="seed_date">Seed Date *</Label>
                <div className="flex gap-2">
                  <Input
                    id="seed_date"
                    type="date"
                    value={newTray.seed_date}
                    onChange={(e) => setNewTray({ ...newTray, seed_date: e.target.value })}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setNewTray({ ...newTray, seed_date: new Date().toISOString().split('T')[0] })}
                  >
                    Today
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="location">Location (Optional)</Label>
                <Input
                  id="location"
                  placeholder="e.g., Rack A • Shelf 1"
                  value={newTray.location}
                  onChange={(e) => setNewTray({ ...newTray, location: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddTray} 
                disabled={creating || !newTray.recipe_id || !newTray.seed_date}
              >
                {creating ? 'Creating...' : newTray.quantity === 1 ? 'Create Seeding Request' : `Create ${newTray.quantity} Seeding Requests`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search trays..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          size="sm"
          variant={showUnassignedOnly ? 'default' : 'outline'}
          className="text-xs uppercase tracking-wide"
          onClick={() => setShowUnassignedOnly((prev) => !prev)}
          disabled={unassignedTraysCount === 0}
        >
          {showUnassignedOnly ? 'Unassigned only' : 'Show unassigned'}
          <span className="ml-2 text-[10px] text-muted-foreground">({unassignedTraysCount})</span>
        </Button>
        <div className="flex items-center gap-2">
          {(['all', 'active', 'harvested', 'lost'] as TrayStatusFilter[]).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status)}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-md border bg-card text-card-foreground shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeaderCell label="Tray ID" sortKey="trayId" />
              <SortableHeaderCell label="Batch ID" sortKey="batchId" />
              <SortableHeaderCell label="Variety" sortKey="variety" />
              <SortableHeaderCell label="Seeding Date" sortKey="seeding_date_raw" />
              <SortableHeaderCell label="Customer" sortKey="customer" />
              <SortableHeaderCell label="Harvest Date" sortKey="harvest_date_raw" />
              <SortableHeaderCell label="Status" sortKey="status" />
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {traysToDisplay.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0 border-none">
                  <div className="p-8 flex flex-col items-center justify-center text-center">
                     {searchTerm ? (
                       <>
                         <p className="text-muted-foreground mb-4">No trays found matching "{searchTerm}"</p>
                         <Button variant="outline" onClick={() => setSearchTerm('')}>Clear Search</Button>
                       </>
                     ) : (
                        <EmptyState
                          icon={<Layers size={64} className="text-muted-foreground mb-4" />}
                          title="No Trays Yet"
                          description="Trays are your active growing containers. Create your first tray to get started!"
                          actionLabel="+ Create Your First Tray"
                          onAction={() => setIsAddDialogOpen(true)}
                          showOnboardingLink={true}
                        />
                     )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              traysToDisplay.map((tray) => (
                <TableRow key={tray.id}>
                  <TableCell className="font-medium">
                    <button
                      onClick={() => handleViewTray(tray)}
                      className="text-primary hover:underline cursor-pointer font-semibold"
                    >
                      {tray.trayId}
                    </button>
                  </TableCell>
                  <TableCell>{tray.batchId}</TableCell>
                  <TableCell>{tray.variety}</TableCell>
                  <TableCell>{tray.seeding_date}</TableCell>
                  <TableCell>{tray.customer}</TableCell>
                  <TableCell>{tray.harvest_date}</TableCell>
                  <TableCell>
                  <Badge
                    variant={tray.status === 'Lost' ? 'destructive' : tray.status === 'Harvested' ? 'secondary' : 'default'}
                    className={stageColors[tray.status] || (tray.status === 'Lost' ? '' : tray.status === 'Harvested' ? '' : 'bg-green-500 hover:bg-green-600')}
                  >
                    {tray.status}
                  </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditTray(tray)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        {tray.status === 'Growing' && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleMarkAsLost(tray)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Mark as Lost
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
          disabled={page === 0 || loading}
          className="gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page + 1}{totalPages ? ` of ${totalPages}` : ''}
        </span>
        <Button
          variant="outline"
          onClick={() => setPage((prev) => prev + 1)}
          disabled={!hasMore || loading}
          className="gap-2"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* View Tray Details Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              Tray Details
            </DialogTitle>
            <DialogDescription>
              View detailed information about this tray
            </DialogDescription>
          </DialogHeader>
          {viewingTray && trayDetails && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground">Tray ID</Label>
                  <p className="text-base font-semibold">{viewingTray.trayId}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground">Status</Label>
                  <Badge
                    variant={viewingTray.status === 'Lost' ? 'destructive' : viewingTray.status === 'Harvested' ? 'secondary' : 'default'}
                    className={stageColors[viewingTray.status] || (viewingTray.status === 'Lost' ? '' : viewingTray.status === 'Harvested' ? '' : 'bg-green-500 hover:bg-green-600')}
                  >
                    {viewingTray.status}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground">Recipe</Label>
                  <p className="text-base">{trayDetails.recipes?.recipe_name || viewingTray.recipe}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground">Variety</Label>
                  <p className="text-base">{trayDetails.recipes?.varieties?.name || trayDetails.recipes?.variety_name || viewingTray.variety}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground">Batch ID</Label>
                  <p className="text-base font-mono">{viewingTray.batchId}</p>
                </div>
                {trayDetails.batch && (
                  <div className="space-y-1">
                    <Label className="text-sm font-semibold text-muted-foreground">Batch Quantity</Label>
                    <p className="text-base">{formatBatchQuantity(trayDetails.batch.quantity)}g available</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Sow Date
                  </Label>
                  <p className="text-base">
                    {trayDetails.sow_date 
                      ? new Date(trayDetails.sow_date).toLocaleDateString() 
                      : 'Not set'}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <Sprout className="h-4 w-4" />
                    Harvest Date
                  </Label>
                  <p className="text-base">
                    {trayDetails.harvest_date 
                      ? new Date(trayDetails.harvest_date).toLocaleDateString() 
                      : 'Not harvested'}
                  </p>
                </div>
              </div>

              {trayDetails.yield && (
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-muted-foreground">Yield</Label>
                  <p className="text-base">{trayDetails.yield} {trayDetails.yield_unit || 'grams'}</p>
                </div>
              )}

              {trayDetails.steps && trayDetails.steps.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Recipe Steps</Label>
                  <div className="space-y-2 max-h-60 overflow-y-auto border rounded p-3">
                    {trayDetails.steps.map((step: any, index: number) => {
                      const trayStep = trayDetails.traySteps?.find((ts: any) => ts.step_id === step.step_id);
                      const stepDescription = Array.isArray(step.step_descriptions)
                        ? step.step_descriptions[0]?.description_details || step.step_descriptions[0]?.description_name
                        : step.step_descriptions?.description_details || step.step_descriptions?.description_name;
                      const displayText = stepDescription || step.description_name || 'No description';
                      
                      return (
                        <div key={step.step_id} className="flex items-start gap-3 p-2 border rounded bg-gray-50">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs mt-0.5">
                            {step.sequence_order || index + 1}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{displayText}</p>
                            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                              <span>Duration: {step.duration || 0} {step.duration_unit || 'Days'}</span>
                              {trayStep && (
                                <Badge variant={trayStep.status === 'Completed' ? 'default' : 'secondary'} className="text-xs">
                                  {trayStep.status || 'Pending'}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Tray Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingTray ? (
                <>
                  {editingTray.variety || editingTray.recipes?.varieties?.name || editingTray.recipes?.variety_name || 'Unknown Variety'} - Tray {editingTray.trayId || editingTray.tray_unique_id || editingTray.id}
                </>
              ) : (
                'Edit Tray'
              )}
            </DialogTitle>
            <DialogDescription>
              Update tray information
            </DialogDescription>
          </DialogHeader>
          {editingTray && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-tray-id">Tray ID</Label>
                <Input
                  id="edit-tray-id"
                  value={editingTray.trayId || editingTray.tray_unique_id || ''}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-recipe">Recipe</Label>
                <Input
                  id="edit-recipe"
                  value={editingTray.recipe || editingTray.recipes?.recipe_name || ''}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-sow-date">Sow Date</Label>
                  <Input
                    id="edit-sow-date"
                    type="date"
                    value={editingTray.sow_date || ''}
                    onChange={(e) => setEditingTray({ ...editingTray, sow_date: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-harvest-date">Harvest Date</Label>
                  <Input
                    id="edit-harvest-date"
                    type="date"
                    value={editingTray.harvest_date || ''}
                    onChange={(e) => setEditingTray({ ...editingTray, harvest_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-yield">Yield (grams)</Label>
                <Input
                  id="edit-yield"
                  type="number"
                  step="0.1"
                  placeholder="0.0"
                  value={editingTray.yield || ''}
                  onChange={(e) => setEditingTray({ ...editingTray, yield: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-customer">Customer</Label>
                <Select 
                  value={editingTray.customer_id || 'none'} 
                  onValueChange={(value) => setEditingTray({ ...editingTray, customer_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {customers.map((customer) => (
                      <SelectItem key={customer.customer_id} value={customer.customer_id.toString()}>
                        {customer.customer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-location">Location</Label>
                <Input
                  id="edit-location"
                  placeholder="e.g., Rack A • Shelf 1"
                  value={editingTray.location || ''}
                  onChange={(e) => setEditingTray({ ...editingTray, location: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateTray} disabled={updating}>
              {updating ? 'Updating...' : 'Update Tray'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lost Tray Dialog */}
      <Dialog open={isLostDialogOpen} onOpenChange={setIsLostDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Mark Tray as Lost
            </DialogTitle>
            <DialogDescription>
              {lostTray && (
                <>
                  Recording loss for tray <strong>{lostTray.trayId}</strong> ({lostTray.variety})
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for Loss *</Label>
              <div className="grid grid-cols-3 gap-2">
                {LOSS_REASONS.map((reason) => (
                  <button
                    key={reason.value}
                    type="button"
                    onClick={() => setLossReason(reason.value)}
                    className={`p-3 text-left rounded-lg border transition-all ${
                      lossReason === reason.value
                        ? 'border-red-500 bg-red-50 text-red-900'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="font-medium text-sm">{reason.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{reason.description}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="loss-notes">Notes (Optional)</Label>
              <Textarea
                id="loss-notes"
                placeholder="Add any additional details about the loss..."
                value={lossNotes}
                onChange={(e) => setLossNotes(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsLostDialogOpen(false);
                setLostTray(null);
                setLossReason('');
                setLossNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleLostConfirm}
              disabled={!lossReason || markingAsLost}
            >
              {markingAsLost ? 'Saving...' : 'Confirm Loss'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TraysPage;
