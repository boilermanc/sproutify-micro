import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { Edit, ClipboardList, Plus, Search, Trash2, Globe, Copy } from 'lucide-react';
import EmptyState from '../components/onboarding/EmptyState';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, X } from 'lucide-react';

const RecipesPage = () => {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState<any[]>([]);
  const [varieties, setVarieties] = useState<any[]>([]);
  const [stepDescriptions, setStepDescriptions] = useState<any[]>([]);
  const [globalRecipes, setGlobalRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [viewingRecipe, setViewingRecipe] = useState<any>(null);
  const [editingRecipe, setEditingRecipe] = useState<any>(null);
  const [recipeSteps, setRecipeSteps] = useState<any[]>([]);
  const [editableSteps, setEditableSteps] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [supplies, setSupplies] = useState<any[]>([]);
  const [selectedGlobalRecipeId, setSelectedGlobalRecipeId] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recipeToDelete, setRecipeToDelete] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteTrayCount, setDeleteTrayCount] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isStepBuilderOpen, setIsStepBuilderOpen] = useState(false);
  const [newRecipe, setNewRecipe] = useState({
    recipe_name: '',
    variety_id: '',
    type: 'Standard', // Schema only allows 'Standard' or 'Custom'
    seed_quantity: null as number | null,
    seed_quantity_unit: 'grams' as 'grams' | 'oz',
    media_supply_id: '',
    media_amount: '',
    media_unit: '',
  });
  const [newRecipeSteps, setNewRecipeSteps] = useState<any[]>([]);

  const fetchRecipes = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Fetch farm's own recipes
      const { data: farmRecipesData, error } = await getSupabaseClient()
        .from('recipes')
        .select(`
          recipe_id,
          recipe_name,
          description,
          type,
          variety_name,
          variety_id,
          seed_quantity,
          seed_quantity_unit,
          media_supply_id,
          media_amount,
          media_unit,
          farm_uuid,
          is_active,
          notes,
          created_by,
          created_at,
          varieties!inner(varietyid, name)
        `)
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true)
        .order('recipe_name', { ascending: true });

      if (error) throw error;

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

      // Process farm recipes
      const farmRecipesWithSteps = await Promise.all(
        (farmRecipesData || []).map(async (recipe) => {
          const { data: steps } = await getSupabaseClient()
            .from('steps')
            .select('*')
            .eq('recipe_id', recipe.recipe_id);
          
          // Sort steps by step_order or sequence_order
          const sortedSteps = steps ? [...steps].sort((a, b) => {
            const orderA = a.step_order ?? a.sequence_order ?? 0;
            const orderB = b.step_order ?? b.sequence_order ?? 0;
            return orderA - orderB;
          }) : null;

          // Calculate total days, accounting for duration_unit
          const totalDays = sortedSteps?.reduce((sum, step) => {
            const duration = step.duration || 0;
            const unit = (step.duration_unit || 'Days').toUpperCase();
            
            if (unit === 'DAYS') {
              return sum + duration;
            } else if (unit === 'HOURS') {
              // Hours >= 12 counts as 1 day, otherwise 0
              return sum + (duration >= 12 ? 1 : 0);
            }
            return sum + duration; // default: treat as days
          }, 0) || 0;

          // Handle varieties join - it could be an object or array
          const variety = Array.isArray(recipe.varieties) 
            ? recipe.varieties[0] 
            : recipe.varieties;
          const varietyName = variety?.name || recipe.variety_name || '';

          return {
            ...recipe,
            variety_name: varietyName,
            type: recipe.type || 'Standard',
            harvestDays: totalDays,
            stepCount: sortedSteps?.length || 0,
            is_global: false,
          };
        })
      );

      // Process global recipes
      const globalRecipesWithSteps = (enabledGlobalRecipes || [])
        .filter((item: any) => item.global_recipes?.is_active)
        .map((item: any) => {
          const globalRecipe = item.global_recipes;
          const sortedSteps = (globalRecipe.global_steps || []).sort(
            (a: any, b: any) => a.sequence_order - b.sequence_order
          );

          // Calculate total days
          const totalDays = sortedSteps.reduce((sum: number, step: any) => {
            const duration = step.duration || 0;
            const unit = (step.duration_unit || 'Days').toUpperCase();
            
            if (unit === 'DAYS') {
              return sum + duration;
            } else if (unit === 'HOURS') {
              return sum + (duration >= 12 ? 1 : 0);
            }
            return sum + duration;
          }, 0);

          return {
            recipe_id: `global_${item.global_recipe_id}`, // Prefix to distinguish
            global_recipe_id: item.global_recipe_id,
            recipe_name: globalRecipe.recipe_name,
            variety_name: globalRecipe.variety_name,
            description: globalRecipe.description,
            notes: globalRecipe.notes,
            type: 'Standard', // Global recipes are always Standard
            harvestDays: totalDays,
            stepCount: sortedSteps.length || 0,
            is_global: true,
            global_steps: sortedSteps,
          };
        });

      // Combine and sort all recipes
      const allRecipes = [...farmRecipesWithSteps, ...globalRecipesWithSteps].sort(
        (a, b) => a.recipe_name.localeCompare(b.recipe_name)
      );

      setRecipes(allRecipes);
    } catch (error) {
      console.error('Error fetching recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVarieties = async () => {
    try {
      // Fetch all varieties (no farm filtering - varieties are global)
      // DB columns: varietyid, name
      const { data, error } = await getSupabaseClient()
        .from('varieties')
        .select('*');

      if (error) {
        console.error('Error fetching varieties:', error);
        return;
      }

      // Map DB columns to expected format: varietyid -> variety_id, name -> variety_name
      // Sort in JavaScript to avoid potential column name issues
      const normalized = (data || []).map((v: any) => ({
        ...v,
        variety_id: v.varietyid ?? v.variety_id,
        variety_name: v.name ?? v.variety_name ?? '',
      })).sort((a: any, b: any) => {
        const nameA = (a.variety_name || '').toLowerCase();
        const nameB = (b.variety_name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      setVarieties(normalized);
    } catch (error) {
      console.error('Error fetching varieties:', error);
    }
  };

  const fetchSupplies = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      const { data, error } = await getSupabaseClient()
        .from('supplies')
        .select('supply_id, supply_name, unit, stock, category, low_stock_threshold')
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true)
        .order('supply_name', { ascending: true });

      if (error) {
        console.error('Error fetching supplies:', error);
        return;
      }

      setSupplies(data || []);
    } catch (error) {
      console.error('Error fetching supplies:', error);
    }
  };

  const fetchStepDescriptions = async () => {
    try {
      // Fetch all available step descriptions
      const { data, error } = await getSupabaseClient()
        .from('step_descriptions')
        .select('description_id, description_name, description_details')
        .order('description_name', { ascending: true });

      if (error) {
        console.error('Error fetching step descriptions:', error);
        return;
      }

      setStepDescriptions(data || []);
    } catch (error) {
      console.error('Error fetching step descriptions:', error);
    }
  };

  useEffect(() => {
    fetchRecipes();
    fetchVarieties();
    fetchSupplies();
    fetchStepDescriptions();
    fetchGlobalRecipes();
  }, []);

  const fetchGlobalRecipes = async () => {
    try {
      const { data, error } = await getSupabaseClient()
        .from('global_recipes')
        .select('global_recipe_id, recipe_name, variety_name')
        .eq('is_active', true)
        .order('recipe_name');

      if (error) {
        console.error('Error fetching global recipes:', error);
        return;
      }

      setGlobalRecipes(data || []);
    } catch (error) {
      console.error('Error fetching global recipes:', error);
    }
  };

  const handleViewRecipe = async (recipe: any) => {
    setViewingRecipe(recipe);
    setIsViewDialogOpen(true);
    
    if (recipe.is_global) {
      // For global recipes, use the global_steps already loaded
      const sortedSteps = (recipe.global_steps || []).sort((a: any, b: any) => {
        const orderA = a.sequence_order ?? 0;
        const orderB = b.sequence_order ?? 0;
        return orderA - orderB;
      });
      setRecipeSteps(sortedSteps);
    } else {
      // Fetch steps for farm recipe
      const { data: steps } = await getSupabaseClient()
        .from('steps')
        .select(`
          *,
          step_descriptions(description_name, description_details)
        `)
        .eq('recipe_id', recipe.recipe_id);
      
      // Sort steps by step_order or sequence_order
      const sortedSteps = steps ? [...steps].sort((a, b) => {
        const orderA = a.step_order ?? a.sequence_order ?? 0;
        const orderB = b.step_order ?? b.sequence_order ?? 0;
        return orderA - orderB;
      }) : [];
      
      setRecipeSteps(sortedSteps);
    }
  };

  const handleEditRecipe = async (recipe: any) => {
    // Navigate to builder with recipe ID
    navigate(`/recipes/builder?id=${recipe.recipe_id}`);
  };

  const addNewStep = () => {
    const newStep = {
      sequence_order: newRecipeSteps.length + 1,
      description_id: null as number | null,
      description_name: '',
      duration: 0,
      duration_unit: 'Days' as 'Days' | 'Hours',
      instructions: '',
      requires_weight: false,
      weight_lbs: null as number | null,
      misting_frequency: 'none' as 'none' | '1x daily' | '2x daily' | '3x daily' | 'custom',
      misting_start_day: 0,
      do_not_disturb_days: 0,
      water_type: null as 'water' | 'nutrients' | null,
    };
    setNewRecipeSteps([...newRecipeSteps, newStep]);
  };

  const removeNewStep = (index: number) => {
    const newSteps = newRecipeSteps.filter((_, i) => i !== index).map((step, i) => ({
      ...step,
      sequence_order: i + 1,
    }));
    setNewRecipeSteps(newSteps);
  };

  const updateNewStep = (index: number, field: string, value: any) => {
    const newSteps = [...newRecipeSteps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setNewRecipeSteps(newSteps);
  };

  const handleGlobalRecipeSelect = async (globalRecipeId: string) => {
    if (!globalRecipeId) {
      setSelectedGlobalRecipeId('');
      setNewRecipe({ recipe_name: '', variety_id: '', type: 'Custom', seed_quantity: null, seed_quantity_unit: 'grams', media_supply_id: '', media_amount: '', media_unit: '' });
      setNewRecipeSteps([]);
      return;
    }

    try {
      // Fetch the global recipe with its steps
      const { data: globalRecipe, error } = await getSupabaseClient()
        .from('global_recipes')
        .select(`
          *,
          global_steps(*)
        `)
        .eq('global_recipe_id', parseInt(globalRecipeId))
        .single();

      if (error) throw error;

      // Find matching variety by name
      const matchingVariety = varieties.find(
        v => v.variety_name?.toLowerCase() === globalRecipe.variety_name?.toLowerCase()
      );

      // Populate form with global recipe data
      setNewRecipe({
        recipe_name: `${globalRecipe.recipe_name} (Custom)`,
        variety_id: matchingVariety ? matchingVariety.variety_id.toString() : '',
        type: 'Custom',
    seed_quantity: null,
    seed_quantity_unit: 'grams',
    media_supply_id: '',
    media_amount: '',
    media_unit: '',
      });

      // Populate steps
      const sortedSteps = (globalRecipe.global_steps || []).sort(
        (a: any, b: any) => a.sequence_order - b.sequence_order
      );

      const mappedSteps = sortedSteps.map((step: any) => ({
        sequence_order: step.sequence_order,
        description_id: step.description_id || null,
        description_name: step.description_name || step.step_name || '',
        duration: step.duration || 0,
        duration_unit: step.duration_unit || 'Days',
        instructions: step.instructions || '',
        requires_weight: step.requires_weight || false,
        weight_lbs: step.weight_lbs || null,
        misting_frequency: step.misting_frequency || 'none',
        misting_start_day: step.misting_start_day || 0,
        do_not_disturb_days: step.do_not_disturb_days || 0,
        water_type: step.water_type || null,
      }));

      setNewRecipeSteps(mappedSteps);
    } catch (error) {
      console.error('Error loading global recipe:', error);
      alert('Failed to load global recipe. Please try again.');
    }
  };

  const handleAddRecipe = async () => {
    if (!newRecipe.recipe_name || !newRecipe.variety_id) return;

    setCreating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid, userId } = JSON.parse(sessionData);

      const selectedVariety = varieties.find(v => 
        (v.variety_id ?? v.varietyid)?.toString() === newRecipe.variety_id
      );

      if (!selectedVariety) {
        throw new Error('Selected variety not found');
      }

      const varietyId = selectedVariety.variety_id ?? selectedVariety.varietyid;
      const varietyName = selectedVariety.variety_name ?? selectedVariety.name ?? '';

      // Include both variety_id (FK) and variety_name (for backward compatibility)
      const payload = {
        recipe_name: newRecipe.recipe_name,
        variety_id: varietyId,
        variety_name: varietyName, // Keep for backward compatibility
        type: newRecipe.type === 'Standard' || newRecipe.type === 'Custom' 
          ? newRecipe.type 
          : 'Standard', // Schema only allows 'Standard' or 'Custom'
        seed_quantity: newRecipe.seed_quantity || null,
        seed_quantity_unit: newRecipe.seed_quantity_unit || 'grams',
        media_supply_id: newRecipe.media_supply_id ? parseInt(newRecipe.media_supply_id) : null,
        media_amount: newRecipe.media_amount ? parseFloat(newRecipe.media_amount) : null,
        media_unit: newRecipe.media_unit || null,
        farm_uuid: farmUuid,
        is_active: true
      };

      const { data: createdRecipe, error } = await getSupabaseClient()
        .from('recipes')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      // Create steps if any were added
      if (newRecipeSteps.length > 0) {
        const stepsData = newRecipeSteps.map((step) => {
          const selectedDescription = stepDescriptions.find(sd => sd.description_id === step.description_id);
          return {
            recipe_id: createdRecipe.recipe_id,
            sequence_order: step.sequence_order,
            step_name: selectedDescription?.description_name || step.description_name || 'Untitled Step', // Required field
            description_id: step.description_id || null,
            description_name: selectedDescription?.description_name || step.description_name || 'Untitled Step',
            duration: step.duration || 0,
            duration_unit: step.duration_unit || 'Days',
            instructions: step.instructions || null,
            requires_weight: step.requires_weight || false,
            weight_lbs: step.weight_lbs || null,
            misting_frequency: step.misting_frequency || 'none',
            misting_start_day: step.misting_start_day || 0,
            do_not_disturb_days: step.do_not_disturb_days || 0,
            water_type: step.water_type || null,
            water_method: step.water_method || null,
            water_frequency: step.water_frequency || null,
            farm_uuid: farmUuid, // Required field
            created_by: userId, // Required field
          };
        });

        const { error: stepsError } = await getSupabaseClient().from('steps').insert(stepsData);
        if (stepsError) throw stepsError;
      }

      setNewRecipe({ recipe_name: '', variety_id: '', type: 'Standard', seed_quantity: null, seed_quantity_unit: 'grams', media_supply_id: '', media_amount: '', media_unit: '' });
      setNewRecipeSteps([]);
      setSelectedGlobalRecipeId('');
      setIsAddDialogOpen(false);
      fetchRecipes();
    } catch (error) {
      console.error('Error creating recipe:', error);
      alert('Failed to create recipe');
    } finally {
      setCreating(false);
    }
  };

  const addStep = () => {
    const newStep = {
      step_id: null,
      sequence_order: editableSteps.length + 1,
      description_id: null as number | null,
      description_name: '',
      duration: 0,
      duration_unit: 'Days' as 'Days' | 'Hours',
      instructions: '',
      requires_weight: false,
      weight_lbs: null as number | null,
      misting_frequency: 'none' as 'none' | '1x daily' | '2x daily' | '3x daily' | 'custom',
      misting_start_day: 0,
      do_not_disturb_days: 0,
      water_type: null as 'water' | 'nutrients' | null,
      isNew: true,
    };
    setEditableSteps([...editableSteps, newStep]);
  };

  const removeStep = (index: number) => {
    const newSteps = editableSteps.filter((_, i) => i !== index).map((step, i) => ({
      ...step,
      sequence_order: i + 1,
    }));
    setEditableSteps(newSteps);
  };

  const updateStep = (index: number, field: string, value: any) => {
    const newSteps = [...editableSteps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setEditableSteps(newSteps);
  };

  const handleDeleteRecipe = async (recipe: any) => {
    // Cannot delete global recipes
    if (recipe.is_global) {
      setSuccessMessage('Global recipes cannot be deleted. You can disable them in the Global Recipes page.');
      setTimeout(() => setSuccessMessage(null), 5000);
      return;
    }

    // Check if recipe is in use (has active trays)
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Check for active trays using this recipe
      const { data: activeTrays, error: traysError } = await getSupabaseClient()
        .from('trays')
        .select('tray_id, tray_unique_id')
        .eq('farm_uuid', farmUuid)
        .eq('recipe_id', recipe.recipe_id)
        .is('harvest_date', null)
        .limit(1);

      if (traysError) throw traysError;

      if (activeTrays && activeTrays.length > 0) {
        setSuccessMessage(`Cannot delete recipe "${recipe.recipe_name}". It is currently in use by ${activeTrays.length} active tray(s). Please harvest or remove those trays first.`);
        setTimeout(() => setSuccessMessage(null), 7000);
        return;
      }

      // Check for any trays (including harvested) - optional, but good to warn
      const { data: allTrays, error: allTraysError } = await getSupabaseClient()
        .from('trays')
        .select('tray_id', { count: 'exact', head: true })
        .eq('farm_uuid', farmUuid)
        .eq('recipe_id', recipe.recipe_id);

      if (allTraysError) throw allTraysError;

      const trayCount = allTrays?.length || 0;
      setDeleteTrayCount(trayCount);
      setRecipeToDelete(recipe);
      setDeleteDialogOpen(true);
    } catch (error: any) {
      console.error('Error checking recipe usage:', error);
      setSuccessMessage(`Failed to check recipe usage: ${error.message || 'Unknown error'}`);
      setTimeout(() => setSuccessMessage(null), 7000);
    }
  };

  const confirmDeleteRecipe = async () => {
    if (!recipeToDelete) return;

    try {
      setDeleting(true);
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // First, delete all steps associated with this recipe
      const { error: stepsDeleteError } = await getSupabaseClient()
        .from('steps')
        .delete()
        .eq('recipe_id', recipeToDelete.recipe_id);

      if (stepsDeleteError) {
        console.error('Error deleting steps:', stepsDeleteError);
        // Continue anyway - some steps might not exist
      }

      // Then delete the recipe
      const { error: deleteError } = await getSupabaseClient()
        .from('recipes')
        .delete()
        .eq('recipe_id', recipeToDelete.recipe_id)
        .eq('farm_uuid', farmUuid);

      if (deleteError) throw deleteError;

      // Refresh the list
      await fetchRecipes();
      const deletedName = recipeToDelete.recipe_name;
      setDeleteDialogOpen(false);
      setRecipeToDelete(null);
      setDeleteTrayCount(0);
      
      // Show success message
      setSuccessMessage(`Recipe "${deletedName}" deleted successfully.`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error: any) {
      console.error('Error deleting recipe:', error);
      setSuccessMessage(`Failed to delete recipe: ${error.message || 'Unknown error'}`);
      setTimeout(() => setSuccessMessage(null), 7000);
    } finally {
      setDeleting(false);
    }
  };

  const handleUpdateRecipe = async () => {
    if (!editingRecipe || !editingRecipe.recipe_name) return;

    setUpdating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid, userId } = JSON.parse(sessionData);

      const selectedVariety = varieties.find(v => 
        (v.variety_id ?? v.varietyid)?.toString() === editingRecipe.variety_id?.toString()
      );

      if (!selectedVariety) {
        throw new Error('Selected variety not found');
      }

      const varietyId = selectedVariety.variety_id ?? selectedVariety.varietyid;
      const varietyName = selectedVariety.variety_name ?? selectedVariety.name ?? '';

      // Update recipe
      const payload = {
        recipe_name: editingRecipe.recipe_name,
        variety_id: varietyId,
        variety_name: varietyName,
          seed_quantity: editingRecipe.seed_quantity || null,
          seed_quantity_unit: editingRecipe.seed_quantity_unit || 'grams',
        type: editingRecipe.type === 'Standard' || editingRecipe.type === 'Custom' 
          ? editingRecipe.type 
          : 'Standard',
        description: editingRecipe.description || null,
        notes: editingRecipe.notes || null,
      };

      const { error } = await getSupabaseClient()
        .from('recipes')
        .update(payload)
        .eq('recipe_id', editingRecipe.recipe_id);

      if (error) throw error;

      // Handle steps: delete removed steps, update existing, insert new
      const existingStepIds = editableSteps.filter(s => s.step_id && !s.isNew).map(s => s.step_id);
      const allCurrentStepIds = recipeSteps.map(s => s.step_id).filter(Boolean);
      const stepsToDelete = allCurrentStepIds.filter(id => !existingStepIds.includes(id));

      // Delete removed steps
      if (stepsToDelete.length > 0) {
        const { error: deleteError } = await getSupabaseClient()
          .from('steps')
          .delete()
          .in('step_id', stepsToDelete);
        
        if (deleteError) throw deleteError;
      }

      // Update or insert steps
      for (const step of editableSteps) {
        if (step.isNew) {
          // Insert new step
          const selectedDescription = stepDescriptions.find(sd => sd.description_id === step.description_id);
          const { error: insertError } = await getSupabaseClient()
            .from('steps')
            .insert({
              recipe_id: editingRecipe.recipe_id,
              sequence_order: step.sequence_order,
              step_name: selectedDescription?.description_name || step.description_name || 'Untitled Step', // Required field
              description_id: step.description_id || null,
              description_name: selectedDescription?.description_name || step.description_name || 'Untitled Step',
              duration: step.duration || 0,
              duration_unit: step.duration_unit || 'Days',
              instructions: step.instructions || null,
              requires_weight: step.requires_weight || false,
              weight_lbs: step.weight_lbs || null,
              misting_frequency: step.misting_frequency || 'none',
              misting_start_day: step.misting_start_day || 0,
              do_not_disturb_days: step.do_not_disturb_days || 0,
              water_type: step.water_type || null,
              water_method: step.water_method || null,
              water_frequency: step.water_frequency || null,
              farm_uuid: farmUuid, // Required field
              created_by: userId, // Required field
            });
          
          if (insertError) throw insertError;
        } else if (step.step_id) {
          // Update existing step
          const selectedDescription = stepDescriptions.find(sd => sd.description_id === step.description_id);
          const { error: updateError } = await getSupabaseClient()
            .from('steps')
            .update({
              sequence_order: step.sequence_order,
              description_id: step.description_id || null,
              description_name: selectedDescription?.description_name || step.description_name || 'Untitled Step',
              instructions: step.instructions || null,
              requires_weight: step.requires_weight || false,
              weight_lbs: step.weight_lbs || null,
              misting_frequency: step.misting_frequency || 'none',
              misting_start_day: step.misting_start_day || 0,
              do_not_disturb_days: step.do_not_disturb_days || 0,
              water_type: step.water_type || null,
              water_method: step.water_method || null,
              water_frequency: step.water_frequency || null,
              duration: step.duration || 0,
              duration_unit: step.duration_unit || 'Days',
            })
            .eq('step_id', step.step_id);
          
          if (updateError) throw updateError;
        }
      }

      setIsEditDialogOpen(false);
      setEditingRecipe(null);
      setRecipeSteps([]);
      setEditableSteps([]);
      fetchRecipes();
    } catch (error) {
      console.error('Error updating recipe:', error);
      alert('Failed to update recipe');
    } finally {
      setUpdating(false);
    }
  };

  const filteredRecipes = recipes.filter(recipe => 
    recipe.recipe_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (recipe.variety_name && recipe.variety_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Recipes</h1>
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
          <h1 className="text-3xl font-bold tracking-tight">Recipes</h1>
          <p className="text-muted-foreground">Manage your growing recipes</p>
        </div>
        
        <Button onClick={() => navigate('/recipes/builder')} className="bg-green-600 hover:bg-green-700 text-white">
          <Plus className="mr-2 h-4 w-4" />
          Create New Recipe
        </Button>
        
        {/* Optional: Dialog for choosing between blank and global recipe */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(true)} className="ml-2">
              <Globe className="mr-2 h-4 w-4" />
              Copy from Global
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New Recipe</DialogTitle>
              <DialogDescription>
                Start with a blank recipe or copy from a global recipe template.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-4"
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    navigate('/recipes/builder');
                  }}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-semibold">Blank Recipe</span>
                    <span className="text-xs text-gray-500">Start from scratch</span>
                  </div>
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-500">Or</span>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="global-recipe">Copy from Global Recipe</Label>
                  <Select
                    value={selectedGlobalRecipeId}
                    onValueChange={(value) => {
                      setSelectedGlobalRecipeId(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a global recipe" />
                    </SelectTrigger>
                    <SelectContent>
                      {globalRecipes.map((gr) => (
                        <SelectItem key={gr.global_recipe_id} value={gr.global_recipe_id.toString()}>
                          {gr.recipe_name} ({gr.variety_name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={!selectedGlobalRecipeId}
                    onClick={async () => {
                      if (!selectedGlobalRecipeId) return;
                      
                      // Fetch global recipe steps
                      const { data: globalRecipe } = await getSupabaseClient()
                        .from('global_recipes')
                        .select(`
                          *,
                          global_steps(*)
                        `)
                        .eq('global_recipe_id', parseInt(selectedGlobalRecipeId))
                        .single();

                      if (globalRecipe) {
                        // Navigate with global recipe data in state
                        navigate('/recipes/builder', {
                          state: {
                            globalRecipe: globalRecipe,
                            globalSteps: globalRecipe.global_steps || []
                          }
                        });
                      }
                    }}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Globe className="mr-2 h-4 w-4" />
                    Copy & Edit
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="name">Recipe Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Standard Sunflower"
                  value={newRecipe.recipe_name}
                  onChange={(e) => setNewRecipe({ ...newRecipe, recipe_name: e.target.value })}
                  className="!border-gray-200"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="variety">Variety</Label>
                <Select 
                  value={newRecipe.variety_id || undefined} 
                  onValueChange={(value) => {
                    const selectedVariety = varieties.find(v => {
                      const vid = v.variety_id ?? v.varietyid;
                      return vid != null && vid.toString() === value;
                    });
                    setNewRecipe({ 
                      ...newRecipe, 
                      variety_id: value,
                      // Pre-fill seed quantity from variety if recipe doesn't have one yet (varieties store in grams)
                      seed_quantity: newRecipe.seed_quantity || selectedVariety?.seed_quantity_grams || null,
                      seed_quantity_unit: newRecipe.seed_quantity_unit || 'grams'
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a variety" />
                  </SelectTrigger>
                  <SelectContent>
                    {varieties.map((variety) => {
                      const vid = variety.variety_id ?? variety.varietyid;
                      if (vid == null) return null;
                      return (
                        <SelectItem key={vid} value={vid.toString()}>
                          {variety.variety_name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="seed-quantity">Seed Quantity per Tray *</Label>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input
                    id="seed-quantity"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder={newRecipe.seed_quantity_unit === 'oz' ? "e.g., 1.0" : "e.g., 28.0"}
                    value={newRecipe.seed_quantity || ''}
                    onChange={(e) => setNewRecipe({ ...newRecipe, seed_quantity: e.target.value ? parseFloat(e.target.value) : null })}
                    className="!border-gray-200"
                  />
                  <Select
                    value={newRecipe.seed_quantity_unit}
                    onValueChange={(value) => setNewRecipe({ ...newRecipe, seed_quantity_unit: value as 'grams' | 'oz' })}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grams">g</SelectItem>
                      <SelectItem value="oz">oz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-gray-500">Amount of seed needed per tray for this recipe</p>
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="medium">Growing Medium (Optional)</Label>
                  <p className="text-xs text-muted-foreground">Track how much medium each tray consumes</p>
                </div>
                <div className="grid gap-2">
                  <Select
                    value={newRecipe.media_supply_id || ''}
                    onValueChange={(value) => {
                      const selectedSupply = supplies.find((s: any) => s.supply_id?.toString() === value);
                      setNewRecipe({
                        ...newRecipe,
                        media_supply_id: value,
                        media_unit: selectedSupply?.unit || newRecipe.media_unit || 'units',
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select medium supply (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {supplies.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Add growing medium supplies first.
                        </div>
                      )}
                      {supplies.map((supply: any) => (
                        <SelectItem key={supply.supply_id} value={supply.supply_id?.toString()}>
                          {supply.supply_name} {supply.unit ? `(${supply.unit})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Input
                      id="medium-amount"
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="e.g., 0.5"
                      value={newRecipe.media_amount || ''}
                      onChange={(e) => setNewRecipe({ ...newRecipe, media_amount: e.target.value })}
                      disabled={!newRecipe.media_supply_id}
                      className="!border-gray-200"
                    />
                    <Select
                      value={newRecipe.media_unit || (supplies.find((s: any) => s.supply_id?.toString() === newRecipe.media_supply_id)?.unit) || 'units'}
                      onValueChange={(value) => setNewRecipe({ ...newRecipe, media_unit: value })}
                      disabled={!newRecipe.media_supply_id}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="grams">g</SelectItem>
                        <SelectItem value="oz">oz</SelectItem>
                        <SelectItem value="lbs">lbs</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value={supplies.find((s: any) => s.supply_id?.toString() === newRecipe.media_supply_id)?.unit || 'units'}>
                          {supplies.find((s: any) => s.supply_id?.toString() === newRecipe.media_supply_id)?.unit || 'units'}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-gray-500">
                    Optional: deduct growing medium (e.g., coco coir, soil) per tray.
                  </p>
                </div>
              </div>
              <div className="grid gap-2">
                <div>
                  <Label htmlFor="type">Type</Label>
                  <p className="text-xs text-gray-500 mt-1">
                    Standard: Common recipe template | Custom: Your own recipe variation
                  </p>
                </div>
                <Select 
                  value={newRecipe.type} 
                  onValueChange={(value) => setNewRecipe({ ...newRecipe, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Standard">Standard</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Steps (Optional)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsStepBuilderOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {newRecipeSteps.length > 0 ? `Manage Steps (${newRecipeSteps.length})` : 'Add Steps'}
                  </Button>
                </div>
                {newRecipeSteps.length > 0 && (
                  <div className="space-y-1 p-3 border rounded bg-gray-50">
                    {newRecipeSteps.map((step, index) => (
                      <div key={index} className="text-sm text-gray-700 flex items-center gap-2">
                        <span className="font-semibold text-blue-600">{step.sequence_order}.</span>
                        <span>{step.description_name || 'Untitled Step'}</span>
                        <span className="text-gray-500">
                          ({step.duration || 0} {step.duration_unit || 'Days'})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {newRecipeSteps.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Click "Add Steps" to build your recipe steps. You can also add them later.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsAddDialogOpen(false);
                setNewRecipeSteps([]);
              }}>
                Cancel
              </Button>
              <Button onClick={handleAddRecipe} disabled={creating || !newRecipe.recipe_name || !newRecipe.variety_id} className="bg-green-600 hover:bg-green-700 text-white">
                {creating ? 'Creating...' : 'Create Recipe'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Step Builder Dialog */}
        <Dialog open={isStepBuilderOpen} onOpenChange={setIsStepBuilderOpen}>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Recipe Step Builder</DialogTitle>
              <DialogDescription>
                Build your recipe steps. Steps will be executed in order.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Steps ({newRecipeSteps.length})</Label>
                <Button
                  type="button"
                  size="sm"
                  onClick={addNewStep}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Step
                </Button>
              </div>

              {newRecipeSteps.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed rounded-lg">
                  <p className="text-sm text-gray-500 mb-2">No steps added yet</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addNewStep}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Your First Step
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {newRecipeSteps.map((step, index) => (
                    <div key={index} className="p-4 border rounded-lg bg-white shadow-sm">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                          {step.sequence_order}
                        </div>
                        <div className="flex-1 space-y-4">
                          <div className="grid gap-2">
                            <Label>Step Description *</Label>
                            <Select
                              value={step.description_id?.toString() || ''}
                              onValueChange={(value) => {
                                const selectedDesc = stepDescriptions.find(sd => sd.description_id.toString() === value);
                                const newSteps = [...newRecipeSteps];
                                newSteps[index] = { 
                                  ...newSteps[index], 
                                  description_id: selectedDesc ? parseInt(value) : null,
                                  description_name: selectedDesc?.description_name || ''
                                };
                                setNewRecipeSteps(newSteps);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select step description" />
                              </SelectTrigger>
                              <SelectContent>
                                {stepDescriptions
                                  .filter(desc => {
                                    const name = desc.description_name.toLowerCase();
                                    return !name.includes('nutrient application') && 
                                           !name.includes('cleaning') && 
                                           !name.includes('resting');
                                  })
                                  .map((desc) => (
                                    <SelectItem key={desc.description_id} value={desc.description_id.toString()}>
                                      {desc.description_name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                              <Label>Duration *</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.1"
                                placeholder="0"
                                value={step.duration || 0}
                                onChange={(e) => updateNewStep(index, 'duration', parseFloat(e.target.value) || 0)}
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label>Unit *</Label>
                              <Select
                                value={step.duration_unit || 'Days'}
                                onValueChange={(value) => updateNewStep(index, 'duration_unit', value)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Days">Days</SelectItem>
                                  <SelectItem value="Hours">Hours</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="grid gap-2">
                            <Label>Instructions (Optional)</Label>
                            <Textarea
                              placeholder="Additional notes or instructions for this step"
                              value={step.instructions || ''}
                              onChange={(e) => updateNewStep(index, 'instructions', e.target.value)}
                              className="min-h-[80px]"
                            />
                          </div>

                          {/* Only show weighted dome and misting fields for Blackout steps */}
                          {(step.description_name?.toLowerCase() === 'blackout' || 
                            stepDescriptions.find(d => d.description_id === step.description_id)?.description_name?.toLowerCase() === 'blackout') && (
                            <div className="space-y-4 pt-4 border-t">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`weight-${index}`}
                                  checked={step.requires_weight || false}
                                  onChange={(e) => updateNewStep(index, 'requires_weight', e.target.checked)}
                                  className="rounded"
                                />
                                <Label htmlFor={`weight-${index}`} className="cursor-pointer">
                                  Requires Weighted Dome
                                </Label>
                              </div>
                              {step.requires_weight && (
                                <div className="grid gap-2">
                                  <Label>Weight (lbs)</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    placeholder="e.g., 5.0"
                                    value={step.weight_lbs || ''}
                                    onChange={(e) => updateNewStep(index, 'weight_lbs', e.target.value ? parseFloat(e.target.value) : null)}
                                  />
                                </div>
                              )}
                              <div className="grid gap-2">
                                <Label>Do Not Disturb (days)</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="Days at start where tray should not be disturbed"
                                  value={step.do_not_disturb_days || 0}
                                  onChange={(e) => updateNewStep(index, 'do_not_disturb_days', parseInt(e.target.value) || 0)}
                                />
                                <p className="text-xs text-gray-500">e.g., 3 days under weight before misting</p>
                              </div>
                              <div className="grid gap-2">
                                <Label>Misting Frequency</Label>
                                <Select
                                  value={step.misting_frequency || 'none'}
                                  onValueChange={(value) => updateNewStep(index, 'misting_frequency', value)}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    <SelectItem value="1x daily">1x Daily</SelectItem>
                                    <SelectItem value="2x daily">2x Daily</SelectItem>
                                    <SelectItem value="3x daily">3x Daily</SelectItem>
                                    <SelectItem value="custom">Custom</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              {(step.misting_frequency && step.misting_frequency !== 'none') && (
                                <div className="grid gap-2">
                                  <Label>Misting Start Day</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="Day within step when misting starts (0 = immediately)"
                                    value={step.misting_start_day || 0}
                                    onChange={(e) => updateNewStep(index, 'misting_start_day', parseInt(e.target.value) || 0)}
                                  />
                                  <p className="text-xs text-gray-500">0 = start immediately, 1 = start on day 2 of step</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Show water type selection for watering-related steps */}
                          {(() => {
                            const stepDescName = step.description_name?.toLowerCase() || 
                              stepDescriptions.find(d => d.description_id === step.description_id)?.description_name?.toLowerCase() || '';
                            const isWateringStep = stepDescName.includes('water') || 
                              stepDescName.includes('irrigat') || 
                              stepDescName.includes('nutrient') ||
                              stepDescName.includes('growing');
                            
                            return isWateringStep ? (
                              <div className="grid gap-2 pt-4 border-t">
                                <Label>Water Type *</Label>
                                <Select
                                  value={step.water_type || ''}
                                  onValueChange={(value) => updateNewStep(index, 'water_type', value as 'water' | 'nutrients')}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select water type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="water">Water</SelectItem>
                                    <SelectItem value="nutrients">Nutrients</SelectItem>
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-gray-500">Required for watering tasks</p>
                              </div>
                            ) : null;
                          })()}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeNewStep(index)}
                          className="text-destructive hover:text-destructive flex-shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsStepBuilderOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* View Recipe Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recipe Details</DialogTitle>
            <DialogDescription>
              View recipe information and steps
            </DialogDescription>
          </DialogHeader>
          {viewingRecipe && (
            <div className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label className="text-sm font-semibold">Recipe Name</Label>
                <p className="text-sm">{viewingRecipe.recipe_name}</p>
              </div>
              <div className="grid gap-2">
                <Label className="text-sm font-semibold">Variety</Label>
                <p className="text-sm">{viewingRecipe.variety_name || 'N/A'}</p>
              </div>
              <div className="grid gap-2">
                <Label className="text-sm font-semibold">Type</Label>
                <p className="text-sm">{viewingRecipe.type || 'Standard'}</p>
              </div>
              {viewingRecipe.description && (
                <div className="grid gap-2">
                  <Label className="text-sm font-semibold">Description</Label>
                  <p className="text-sm">{viewingRecipe.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-sm font-semibold">Harvest Days</Label>
                  <p className="text-sm">{viewingRecipe.harvestDays || 0} days</p>
                </div>
                <div className="grid gap-2">
                  <Label className="text-sm font-semibold">Total Steps</Label>
                  <p className="text-sm">{viewingRecipe.stepCount || 0}</p>
                </div>
              </div>
              {recipeSteps.length > 0 && (
                <div className="grid gap-2">
                  <Label className="text-sm font-semibold">Steps</Label>
                  <div className="space-y-2">
                    {recipeSteps.map((step, index) => {
                      const duration = step.duration || 0;
                      const unit = (step.duration_unit || 'Days').toUpperCase();
                      const durationDisplay = unit === 'HOURS' 
                        ? `${duration} ${duration === 1 ? 'hour' : 'hours'}`
                        : `${duration} ${duration === 1 ? 'day' : 'days'}`;
                      
                      // Get description from step_descriptions join or fallback to description_name
                      const stepDescription = Array.isArray(step.step_descriptions)
                        ? step.step_descriptions[0]?.description_details || step.step_descriptions[0]?.description_name
                        : step.step_descriptions?.description_details || step.step_descriptions?.description_name;
                      const displayText = stepDescription || step.description_name || 'No description';
                      
                      return (
                        <div key={step.step_id || index} className="flex items-start gap-3 p-3 border rounded">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
                            {step.sequence_order || index + 1}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{displayText}</p>
                            <p className="text-xs text-muted-foreground mt-1">Duration: {durationDisplay}</p>
                            {step.instructions && (
                              <p className="text-xs text-gray-600 mt-2 italic bg-gray-50 p-2 rounded">{step.instructions}</p>
                            )}
                            {/* Show water type selection for watering-related steps */}
                            {(() => {
                              const stepDescName = step.description_name?.toLowerCase() || 
                                stepDescriptions.find(d => d.description_id === step.description_id)?.description_name?.toLowerCase() || '';
                              const isWateringStep = stepDescName.includes('water') || 
                                stepDescName.includes('irrigat') || 
                                stepDescName.includes('nutrient') ||
                                stepDescName.includes('growing');
                              
                              return isWateringStep ? (
                                <div className="grid gap-2 pt-2 border-t">
                                  <Label className="text-xs">Water Type *</Label>
                                  <Select
                                    value={step.water_type || ''}
                                    onValueChange={(value) => updateNewStep(index, 'water_type', value as 'water' | 'nutrients')}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select water type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="water">Water</SelectItem>
                                      <SelectItem value="nutrients">Nutrients</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <p className="text-xs text-gray-500">Required for watering tasks</p>
                                </div>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {viewingRecipe.notes && (
                <div className="grid gap-2">
                  <Label className="text-sm font-semibold">Notes</Label>
                  <p className="text-sm">{viewingRecipe.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
            {viewingRecipe && (
              <Button onClick={() => {
                setIsViewDialogOpen(false);
                handleEditRecipe(viewingRecipe);
              }}>
                Edit Recipe
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Recipe Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Recipe</DialogTitle>
            <DialogDescription>
              Update recipe information
            </DialogDescription>
          </DialogHeader>
          {editingRecipe && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Recipe Name</Label>
                <Input
                  id="edit-name"
                  placeholder="e.g., Standard Sunflower"
                  value={editingRecipe.recipe_name || ''}
                  onChange={(e) => setEditingRecipe({ ...editingRecipe, recipe_name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-variety">Variety</Label>
                <Select 
                  value={editingRecipe.variety_id ? editingRecipe.variety_id.toString() : undefined} 
                  onValueChange={(value) => {
                    const selectedVariety = varieties.find(v => {
                      const vid = v.variety_id ?? v.varietyid;
                      return vid != null && vid.toString() === value;
                    });
                    setEditingRecipe({ 
                      ...editingRecipe, 
                      variety_id: value,
                      variety_name: selectedVariety?.variety_name || selectedVariety?.name || '',
                      // Pre-fill seed quantity from variety if recipe doesn't have one yet (varieties store in grams)
                      seed_quantity: editingRecipe.seed_quantity || selectedVariety?.seed_quantity_grams || null,
                      seed_quantity_unit: editingRecipe.seed_quantity_unit || 'grams'
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a variety" />
                  </SelectTrigger>
                  <SelectContent>
                    {varieties.map((variety) => {
                      const vid = variety.variety_id ?? variety.varietyid;
                      if (vid == null) return null;
                      return (
                        <SelectItem key={vid} value={vid.toString()}>
                          {variety.variety_name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-seed-quantity">Seed Quantity per Tray *</Label>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input
                    id="edit-seed-quantity"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder={editingRecipe.seed_quantity_unit === 'oz' ? "e.g., 1.0" : "e.g., 28.0"}
                    value={editingRecipe.seed_quantity || ''}
                    onChange={(e) => setEditingRecipe({ ...editingRecipe, seed_quantity: e.target.value ? parseFloat(e.target.value) : null })}
                  />
                  <Select
                    value={editingRecipe.seed_quantity_unit || 'grams'}
                    onValueChange={(value) => setEditingRecipe({ ...editingRecipe, seed_quantity_unit: value as 'grams' | 'oz' })}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grams">g</SelectItem>
                      <SelectItem value="oz">oz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-gray-500">Amount of seed needed per tray for this recipe</p>
              </div>
              <div className="grid gap-2">
                <div>
                  <Label htmlFor="edit-type">Type</Label>
                  <p className="text-xs text-gray-500 mt-1">
                    Standard: Common recipe template | Custom: Your own recipe variation
                  </p>
                </div>
                <Select 
                  value={editingRecipe.type || 'Standard'} 
                  onValueChange={(value) => setEditingRecipe({ ...editingRecipe, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Standard">Standard</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  placeholder="Recipe description"
                  value={editingRecipe.description || ''}
                  onChange={(e) => setEditingRecipe({ ...editingRecipe, description: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Input
                  id="edit-notes"
                  placeholder="Additional notes"
                  value={editingRecipe.notes || ''}
                  onChange={(e) => setEditingRecipe({ ...editingRecipe, notes: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Steps ({editableSteps.length})</Label>
                  <Button
                    type="button"
                    size="sm"
                    onClick={addStep}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Step
                  </Button>
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto p-2 border rounded">
                  {editableSteps.map((step, index) => (
                    <div key={step.step_id || `new-${index}`} className="p-3 border rounded bg-gray-50">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm mt-1">
                          {step.sequence_order}
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="grid gap-2">
                            <Label className="text-xs">Step Description</Label>
                            <Select
                              value={step.description_id?.toString() || ''}
                              onValueChange={(value) => {
                                const selectedDesc = stepDescriptions.find(sd => sd.description_id.toString() === value);
                                const newSteps = [...editableSteps];
                                newSteps[index] = { 
                                  ...newSteps[index], 
                                  description_id: selectedDesc ? parseInt(value) : null,
                                  description_name: selectedDesc?.description_name || ''
                                };
                                setEditableSteps(newSteps);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select step description" />
                              </SelectTrigger>
                              <SelectContent>
                                {stepDescriptions
                                  .filter(desc => {
                                    const name = desc.description_name.toLowerCase();
                                    return !name.includes('nutrient application') && 
                                           !name.includes('cleaning') && 
                                           !name.includes('resting');
                                  })
                                  .map((desc) => (
                                    <SelectItem key={desc.description_id} value={desc.description_id.toString()}>
                                      {desc.description_name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="grid gap-2">
                              <Label className="text-xs">Duration</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.1"
                                placeholder="0"
                                value={step.duration || 0}
                                onChange={(e) => updateStep(index, 'duration', parseFloat(e.target.value) || 0)}
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label className="text-xs">Unit</Label>
                              <Select
                                value={step.duration_unit || 'Days'}
                                onValueChange={(value) => updateStep(index, 'duration_unit', value)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Days">Days</SelectItem>
                                  <SelectItem value="Hours">Hours</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="grid gap-2">
                            <Label className="text-xs">Instructions</Label>
                            <Textarea
                              placeholder="Step instructions (optional additional notes)"
                              value={step.instructions || ''}
                              onChange={(e) => updateStep(index, 'instructions', e.target.value)}
                              className="min-h-[60px] text-sm"
                            />
                          </div>
                          {/* Only show weighted dome and misting fields for Blackout steps */}
                          {(step.description_name?.toLowerCase() === 'blackout' || 
                            stepDescriptions.find(d => d.description_id === step.description_id)?.description_name?.toLowerCase() === 'blackout') && (
                            <div className="space-y-3 pt-2 border-t">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`edit-weight-${index}`}
                                  checked={step.requires_weight || false}
                                  onChange={(e) => updateStep(index, 'requires_weight', e.target.checked)}
                                  className="rounded"
                                />
                                <Label htmlFor={`edit-weight-${index}`} className="text-xs font-normal cursor-pointer">
                                  Requires Weighted Dome
                                </Label>
                              </div>
                              {step.requires_weight && (
                                <div className="grid gap-2">
                                  <Label className="text-xs">Weight (lbs)</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    placeholder="e.g., 5.0"
                                    value={step.weight_lbs || ''}
                                    onChange={(e) => updateStep(index, 'weight_lbs', e.target.value ? parseFloat(e.target.value) : null)}
                                  />
                                </div>
                              )}
                              <div className="grid gap-2">
                                <Label className="text-xs">Do Not Disturb (days)</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="Days at start where tray should not be disturbed"
                                  value={step.do_not_disturb_days || 0}
                                  onChange={(e) => updateStep(index, 'do_not_disturb_days', parseInt(e.target.value) || 0)}
                                />
                                <p className="text-xs text-gray-500">e.g., 3 days under weight before misting</p>
                              </div>
                              <div className="grid gap-2">
                                <Label className="text-xs">Misting Frequency</Label>
                                <Select
                                  value={step.misting_frequency || 'none'}
                                  onValueChange={(value) => updateStep(index, 'misting_frequency', value)}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    <SelectItem value="1x daily">1x Daily</SelectItem>
                                    <SelectItem value="2x daily">2x Daily</SelectItem>
                                    <SelectItem value="3x daily">3x Daily</SelectItem>
                                    <SelectItem value="custom">Custom</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              {(step.misting_frequency && step.misting_frequency !== 'none') && (
                                <div className="grid gap-2">
                                  <Label className="text-xs">Misting Start Day</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="Day within step when misting starts (0 = immediately)"
                                    value={step.misting_start_day || 0}
                                    onChange={(e) => updateStep(index, 'misting_start_day', parseInt(e.target.value) || 0)}
                                  />
                                  <p className="text-xs text-gray-500">0 = start immediately, 1 = start on day 2 of step</p>
                                </div>
                              )}
                            </div>
                          )}
                          {/* Show water type selection for watering-related steps */}
                          {(() => {
                            const stepDescName = step.description_name?.toLowerCase() || 
                              stepDescriptions.find(d => d.description_id === step.description_id)?.description_name?.toLowerCase() || '';
                            const isWateringStep = stepDescName.includes('water') || 
                              stepDescName.includes('irrigat') || 
                              stepDescName.includes('nutrient') ||
                              stepDescName.includes('growing');
                            
                            return isWateringStep ? (
                              <div className="grid gap-2 pt-2 border-t">
                                <Label className="text-xs">Water Type *</Label>
                                <Select
                                  value={step.water_type || ''}
                                  onValueChange={(value) => updateStep(index, 'water_type', value as 'water' | 'nutrients')}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select water type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="water">Water</SelectItem>
                                    <SelectItem value="nutrients">Nutrients</SelectItem>
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-gray-500">Required for watering tasks</p>
                              </div>
                            ) : null;
                          })()}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeStep(index)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {editableSteps.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No steps yet. Click "Add Step" to create one.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsEditDialogOpen(false);
              setEditingRecipe(null);
              setRecipeSteps([]);
              setEditableSteps([]);
            }}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRecipe} disabled={updating || !editingRecipe?.recipe_name} className="bg-green-600 hover:bg-green-700 text-white">
              {updating ? 'Updating...' : 'Update Recipe'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success/Error Message */}
      {successMessage && (
        <Alert className={`mb-4 ${successMessage.includes('successfully') ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {successMessage.includes('successfully') ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <X className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription className={successMessage.includes('successfully') ? 'text-green-800' : 'text-red-800'}>
                {successMessage}
              </AlertDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setSuccessMessage(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Alert>
      )}

      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search recipes..."
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
              <TableHead>Name</TableHead>
              <TableHead>Variety</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Harvest (Days)</TableHead>
              <TableHead>Steps</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRecipes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-0 border-none">
                  <div className="p-8 flex flex-col items-center justify-center text-center">
                     {searchTerm ? (
                       <>
                         <p className="text-muted-foreground mb-4">No recipes found matching "{searchTerm}"</p>
                         <Button variant="outline" onClick={() => setSearchTerm('')}>Clear Search</Button>
                       </>
                     ) : (
                        <EmptyState
                          icon={<ClipboardList size={64} className="text-muted-foreground mb-4" />}
                          title="No Recipes Yet"
                          description="Recipes define how to grow each variety. Create your first recipe to get started!"
                          actionLabel="+ Create Your First Recipe"
                          onAction={() => setIsAddDialogOpen(true)}
                          showOnboardingLink={true}
                        />
                     )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredRecipes.map((recipe) => (
                <TableRow key={recipe.recipe_id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewRecipe(recipe)}
                        className="text-left hover:text-blue-600 hover:underline cursor-pointer"
                      >
                        {recipe.recipe_name}
                      </button>
                      {recipe.is_global && (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                          <Globe className="h-3 w-3 mr-1" />
                          Global
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{recipe.variety_name || 'N/A'}</TableCell>
                  <TableCell>{recipe.type || 'N/A'}</TableCell>
                  <TableCell>{recipe.harvestDays || 0}</TableCell>
                  <TableCell>{recipe.stepCount || 0}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {!recipe.is_global && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handleEditRecipe(recipe)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDeleteRecipe(recipe)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {recipe.is_global && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => {
                            // Open copy dialog by selecting this global recipe
                            setSelectedGlobalRecipeId(recipe.global_recipe_id.toString());
                            handleGlobalRecipeSelect(recipe.global_recipe_id.toString());
                            setIsAddDialogOpen(true);
                          }}
                          title="Copy to create your own version"
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Recipe</DialogTitle>
            <DialogDescription>
              {deleteTrayCount > 0
                ? `This recipe has been used in ${deleteTrayCount} tray(s) (including harvested).`
                : 'This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete <strong>"{recipeToDelete?.recipe_name}"</strong>?
            </p>
            {deleteTrayCount > 0 && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> This recipe has been used in {deleteTrayCount} tray(s). 
                  The recipe will be removed, but existing tray records will remain.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setDeleteDialogOpen(false);
                setRecipeToDelete(null);
                setDeleteTrayCount(0);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteRecipe}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Recipe'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecipesPage;
