import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { notifyNewOrder, checkHarvestReminders } from '../services/notificationService';
import { Edit, ShoppingBasket, Plus, Search, Calendar, Package, Sprout } from 'lucide-react';
import EmptyState from '../components/onboarding/EmptyState';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TraysPage = () => {
  const [trays, setTrays] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [viewingTray, setViewingTray] = useState<any>(null);
  const [editingTray, setEditingTray] = useState<any>(null);
  const [trayDetails, setTrayDetails] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [newTray, setNewTray] = useState({
    recipe_id: '',
    batch_id: '',
    customer_id: '',
    location: '',
  });
  const [availableBatches, setAvailableBatches] = useState<any[]>([]);

  const fetchTrays = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Fetch trays with recipes join, and join varieties to get variety name
      // Note: seedbatches join removed - will fetch separately to avoid column name issues
      const { data, error } = await supabase
        .from('trays')
        .select(`
          *,
          recipes!inner(
            recipe_name,
            variety_id,
            varieties!inner(varietyid, name)
          )
        `)
        .eq('farm_uuid', farmUuid)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch seedbatches separately to get batch info
      // Actual DB column: batchid (not batch_id)
      const batchIds = (data || [])
        .map(tray => tray.batch_id)
        .filter(id => id !== null && id !== undefined);
      
      let batchesMap: Record<number, any> = {};
      if (batchIds.length > 0) {
        const { data: batchesData } = await supabase
          .from('seedbatches')
          .select('batchid, varietyid')
          .in('batchid', batchIds);
        
        // Fetch variety names for batches
        const varietyIds = (batchesData || [])
          .map(b => b.varietyid)
          .filter(id => id !== null && id !== undefined);
        
        let varietiesMap: Record<number, any> = {};
        if (varietyIds.length > 0) {
          const { data: varietiesData } = await supabase
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

      // Fetch customers separately
      const customerIds = (data || [])
        .map(tray => tray.customer_id)
        .filter(id => id !== null && id !== undefined);
      
      let customersMap: Record<number, string> = {};
      if (customerIds.length > 0) {
        const { data: customersData } = await supabase
          .from('customers')
          .select('customerid, name')
          .in('customerid', customerIds);
        
        customersMap = (customersData || []).reduce((acc, c) => {
          acc[c.customerid] = c.name || '';
          return acc;
        }, {} as Record<number, string>);
      }

      // Fetch recipe steps to calculate grow time and projected harvest dates
      const recipeIds = [...new Set((data || []).map((tray: any) => tray.recipe_id).filter((id: any) => id !== null && id !== undefined))];
      let recipeGrowTimes: Record<number, number> = {};
      
      if (recipeIds.length > 0) {
        const { data: allSteps } = await supabase
          .from('steps')
          .select('recipe_id, duration, duration_unit')
          .in('recipe_id', recipeIds)
          .order('recipe_id, sequence_order');

        // Calculate total grow time per recipe
        if (allSteps) {
          const stepsByRecipe: Record<number, any[]> = {};
          (allSteps || []).forEach((step: any) => {
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
            recipeGrowTimes[recipeId] = totalDays;
          });
        }
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
        
        return {
          id: tray.tray_id,
          trayId: tray.tray_unique_id || tray.tray_id,
          batchId: batch ? `B-${batch.batchid}` : 'N/A',
          variety: tray.recipes?.varieties?.name || tray.recipes?.variety_name || 'Unknown',
          recipe: tray.recipes?.recipe_name || 'Unknown',
          customer: customerName || 'Unassigned',
          customer_id: tray.customer_id || null,
          location: tray.location || 'Not set',
          status: tray.harvest_date ? 'Harvested' : 'Growing',
          harvest_date: tray.harvest_date ? new Date(tray.harvest_date).toLocaleDateString() : projectedHarvestDate,
          created_at: new Date(tray.created_at).toLocaleDateString()
        };
      });

      setTrays(formattedTrays);
    } catch (error) {
      console.error('Error fetching trays:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFormData = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      // Fetch all recipes
      const { data: allRecipesData, error: recipesError } = await supabase
        .from('recipes')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true)
        .order('recipe_name', { ascending: true });

      if (recipesError) {
        console.error('Error fetching recipes:', recipesError);
        return;
      }

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
        const { data: varietiesData, error: varietiesError } = await supabase
          .from('varieties')
          .select('varietyid, name, seed_quantity_grams')
          .in('varietyid', recipeVarietyIds);

        if (varietiesError) {
          console.error('Error fetching varieties:', varietiesError);
        } else if (varietiesData) {
          recipeVarietiesMap = (varietiesData || []).reduce((acc, v) => {
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
      const { data: batchesData, error: batchesError } = await supabase
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
          const { data: batchVarietiesData } = await supabase
            .from('varieties')
            .select('varietyid, name, seed_quantity_grams')
            .in('varietyid', missingVarietyIds);
          
          if (batchVarietiesData) {
            batchVarietiesData.forEach(v => {
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
        const seedQuantityNeeded = recipe.varieties?.seed_quantity_grams || 0;
        
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
        const hasAvailableBatch = (batchesData || []).some((batch: any) => {
          return batch.varietyid === varietyId && 
                 batch.quantity >= seedQuantityNeeded;
        });

        if (!hasAvailableBatch) {
          console.log('Recipe filtered out - no available batch:', {
            recipe_id: recipe.recipe_id,
            recipe_name: recipe.recipe_name,
            varietyId,
            seedQuantityNeeded,
            availableBatches: (batchesData || []).filter((b: any) => b.varietyid === varietyId).map((b: any) => ({ batchid: b.batchid, quantity: b.quantity }))
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
        seedQuantity: r.varieties?.seed_quantity_grams
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
      const { data: customersData, error: customersError } = await supabase
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
  };

  useEffect(() => {
    fetchTrays();
    fetchFormData();
  }, []);

  // Update available batches when recipe is selected
  useEffect(() => {
    const updateAvailableBatches = () => {
      if (!newTray.recipe_id) {
        setAvailableBatches([]);
        return;
      }

      const selectedRecipe = recipes.find(
        (r) => r.recipe_id === parseInt(newTray.recipe_id)
      );

      if (!selectedRecipe) {
        setAvailableBatches([]);
        return;
      }

      const varietyId = selectedRecipe.variety_id || selectedRecipe.varieties?.varietyid;
      const seedQuantityNeeded = selectedRecipe.varieties?.seed_quantity_grams || 0;

      if (!varietyId || !seedQuantityNeeded) {
        setAvailableBatches([]);
        return;
      }

      // Filter batches for this variety with sufficient quantity
      const filtered = batches.filter((batch: any) => {
        const batchVarietyId = batch.varietyid;
        const batchQuantity = batch.quantity || 0;
        const matches = batchVarietyId === varietyId && batchQuantity >= seedQuantityNeeded;
        
        if (!matches) {
          console.log('Batch filtered out:', {
            batchid: batch.batchid || batch.batch_id,
            batchVarietyId,
            targetVarietyId: varietyId,
            batchQuantity,
            neededQuantity: seedQuantityNeeded
          });
        }
        
        return matches;
      });

      console.log('Available batches for recipe:', {
        recipe_id: selectedRecipe.recipe_id,
        recipe_name: selectedRecipe.recipe_name,
        varietyId,
        seedQuantityNeeded,
        availableBatches: filtered.length,
        batches: filtered.map(b => ({ batchid: b.batchid || b.batch_id, quantity: b.quantity }))
      });

      setAvailableBatches(filtered);
      
      // Clear batch selection if current selection is not available
      if (newTray.batch_id && !filtered.some(b => (b.batch_id || b.batchid)?.toString() === newTray.batch_id)) {
        setNewTray(prev => ({ ...prev, batch_id: '' }));
      }
    };

    updateAvailableBatches();
  }, [newTray.recipe_id, recipes, batches]);

  const handleAddTray = async () => {
    if (!newTray.recipe_id) {
      alert('Please select a recipe');
      return;
    }

    if (!newTray.batch_id) {
      alert('Please select a seed batch');
      return;
    }

    setCreating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid, userId } = JSON.parse(sessionData);

      // Find the selected recipe to get recipe_name and variety_name
      const selectedRecipe = recipes.find(
        (r) => r.recipe_id === parseInt(newTray.recipe_id)
      );

      if (!selectedRecipe) {
        throw new Error('Selected recipe not found');
      }

      // Get variety name from join or fallback to text field
      const varietyName = selectedRecipe.varieties?.name || selectedRecipe.variety_name || '';

      // Insert into tray_creation_requests - trigger will create the tray
      const { error: requestError } = await supabase
        .from('tray_creation_requests')
        .insert({
          customer_name: null,
          variety_name: varietyName,
          recipe_name: selectedRecipe.recipe_name,
          farm_uuid: farmUuid,
          user_id: userId,
          requested_at: new Date().toISOString(),
          batch_id: parseInt(newTray.batch_id), // Now required
        });

      // If customer_id or location is provided, update the created tray
      if (newTray.customer_id || newTray.location) {
        // Wait a bit for the trigger to create the tray
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Find the newly created tray and update it
        const { data: createdTray } = await supabase
          .from('trays')
          .select('tray_id')
          .eq('farm_uuid', farmUuid)
          .eq('created_by', userId)
          .eq('recipe_id', parseInt(newTray.recipe_id))
          .eq('batch_id', parseInt(newTray.batch_id))
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (createdTray) {
          const updateData: any = {};
          if (newTray.customer_id) {
            updateData.customer_id = parseInt(newTray.customer_id);
          }
          if (newTray.location) {
            updateData.location = newTray.location.trim();
          }
          
          if (Object.keys(updateData).length > 0) {
            await supabase
              .from('trays')
              .update(updateData)
              .eq('tray_id', createdTray.tray_id)
              .eq('farm_uuid', farmUuid);
          }
        }
      }

      if (requestError) throw requestError;

      // Query for the newly created tray (trigger creates it)
      let query = supabase
        .from('trays')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .eq('created_by', userId)
        .eq('recipe_id', parseInt(newTray.recipe_id));

      // Add batch_id filter
      const batchId = parseInt(newTray.batch_id);
      query = query.eq('batch_id', batchId);

      const { data: insertedTray, error: trayError } = await query
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (trayError) throw trayError;

      setNewTray({ recipe_id: '', batch_id: '', customer_id: '', location: '' });
      setIsAddDialogOpen(false);
      fetchTrays();

      // Check for notifications
      if (insertedTray) {
        // If tray has a customer_id, notify about new order
        if ((insertedTray as { customer_id?: number }).customer_id) {
          notifyNewOrder(insertedTray.tray_id);
        }
        // Check if harvest is coming up soon
        checkHarvestReminders();
      }
    } catch (error) {
      console.error('Error creating tray:', error);
      alert('Failed to create tray');
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
      const { data: trayData, error } = await supabase
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

      const { error } = await supabase
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

  const handleViewTray = async (tray: any) => {
    setViewingTray(tray);
    setIsViewDialogOpen(true);
    
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      // Fetch full tray details with recipe and steps
      const { data: trayData, error } = await supabase
        .from('trays')
        .select(`
          *,
          recipes!inner(
            recipe_id,
            recipe_name,
            variety_name,
            variety_id,
            varieties!inner(varietyid, name, seed_quantity_grams)
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
      const { data: stepsData } = await supabase
        .from('steps')
        .select('*, step_descriptions!left(description_name, description_details)')
        .eq('recipe_id', trayData.recipes.recipe_id)
        .order('sequence_order', { ascending: true });

      // Fetch tray_steps to see which steps are completed
      const { data: trayStepsData } = await supabase
        .from('tray_steps')
        .select('*')
        .eq('tray_id', tray.id)
        .order('scheduled_date', { ascending: true });

      // Fetch batch details if batch_id exists
      let batchDetails = null;
      if (trayData.batch_id) {
        const { data: batchData } = await supabase
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
        steps: stepsData || [],
        traySteps: trayStepsData || [],
        batch: batchDetails,
      });
    } catch (error) {
      console.error('Error loading tray details:', error);
    }
  };

  const filteredTrays = trays.filter(tray => 
    tray.variety.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tray.trayId.toString().toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              <DialogTitle>Add New Tray</DialogTitle>
              <DialogDescription>
                Start a new tray from a recipe.
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
                        No recipes available. {recipes.length === 0 ? 'Please create a recipe first or ensure recipes have available seed inventory.' : ''}
                      </div>
                    ) : (
                      recipes.map((recipe) => {
                        const varietyName = recipe.varieties?.name || recipe.variety_name || 'N/A';
                        return (
                          <SelectItem key={recipe.recipe_id} value={recipe.recipe_id.toString()}>
                            {recipe.recipe_name} ({varietyName})
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>
              {newTray.recipe_id && (
                <div className="grid gap-2">
                  <Label htmlFor="batch">Seed Batch *</Label>
                  {availableBatches.length === 0 ? (
                    <div className="text-sm text-muted-foreground p-2 border rounded">
                      No batches available with sufficient inventory for this variety. 
                      Please add a seed batch first.
                    </div>
                  ) : (
                    <Select 
                      value={newTray.batch_id} 
                      onValueChange={(value) => setNewTray({ ...newTray, batch_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a batch" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableBatches.map((batch) => {
                          const batchId = batch.batch_id || batch.batchid;
                          return (
                            <SelectItem key={batchId} value={batchId.toString()}>
                              B-{batchId} - {batch.quantity}g available
                              {batch.lot_number ? ` (Lot: ${batch.lot_number})` : ''}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="customer">Customer (Optional)</Label>
                <Select 
                  value={newTray.customer_id || ''} 
                  onValueChange={(value) => setNewTray({ ...newTray, customer_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a customer (optional)" />
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
                disabled={creating || !newTray.recipe_id || !newTray.batch_id}
              >
                {creating ? 'Creating...' : 'Create Tray'}
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
      </div>

      <div className="rounded-md border bg-card text-card-foreground shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tray ID</TableHead>
              <TableHead>Recipe</TableHead>
              <TableHead>Batch ID</TableHead>
              <TableHead>Variety</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Harvest Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTrays.length === 0 ? (
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
                          icon={<ShoppingBasket size={64} className="text-muted-foreground mb-4" />}
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
              filteredTrays.map((tray) => (
                <TableRow key={tray.id}>
                  <TableCell className="font-medium">
                    <button
                      onClick={() => handleViewTray(tray)}
                      className="text-primary hover:underline cursor-pointer font-semibold"
                    >
                      {tray.trayId}
                    </button>
                  </TableCell>
                  <TableCell>{tray.recipe}</TableCell>
                  <TableCell>{tray.batchId}</TableCell>
                  <TableCell>{tray.variety}</TableCell>
                  <TableCell>{tray.customer}</TableCell>
                  <TableCell>{tray.harvest_date}</TableCell>
                  <TableCell>
                    <Badge variant={tray.status.toLowerCase() === 'growing' ? 'default' : 'secondary'} className={tray.status.toLowerCase() === 'growing' ? 'bg-green-500 hover:bg-green-600' : ''}>
                      {tray.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleEditTray(tray)}
                        type="button"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
                  <Badge variant={viewingTray.status.toLowerCase() === 'growing' ? 'default' : 'secondary'} className={viewingTray.status.toLowerCase() === 'growing' ? 'bg-green-500 hover:bg-green-600' : ''}>
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
                    <p className="text-base">{trayDetails.batch.quantity}g available</p>
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
            <DialogTitle>Edit Tray</DialogTitle>
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
    </div>
  );
};

export default TraysPage;
