import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Edit, ClipboardList, Plus, Search, Trash2 } from 'lucide-react';
import EmptyState from '../components/onboarding/EmptyState';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const RecipesPage = () => {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [varieties, setVarieties] = useState<any[]>([]);
  const [stepDescriptions, setStepDescriptions] = useState<any[]>([]);
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
  const [newRecipe, setNewRecipe] = useState({
    recipe_name: '',
    variety_id: '',
    type: 'Standard', // Schema only allows 'Standard' or 'Custom'
  });
  const [newRecipeSteps, setNewRecipeSteps] = useState<any[]>([]);

  const fetchRecipes = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Join with varieties table to get variety name from foreign key
      // Explicitly select type to ensure it's included
      const { data, error } = await supabase
        .from('recipes')
        .select(`
          recipe_id,
          recipe_name,
          description,
          type,
          variety_name,
          variety_id,
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

      // Get step information for each recipe
      const recipesWithSteps = await Promise.all(
        (data || []).map(async (recipe) => {
          const { data: steps } = await supabase
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
            type: recipe.type || 'Standard', // Default to 'Standard' if type is null/undefined
            harvestDays: totalDays,
            stepCount: sortedSteps?.length || 0,
          };
        })
      );

      setRecipes(recipesWithSteps);
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
      const { data, error } = await supabase
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

  const fetchStepDescriptions = async () => {
    try {
      // Fetch all available step descriptions
      const { data, error } = await supabase
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
    fetchStepDescriptions();
  }, []);

  const handleViewRecipe = async (recipe: any) => {
    setViewingRecipe(recipe);
    setIsViewDialogOpen(true);
    
    // Fetch steps for this recipe with step_descriptions join (left join in case some steps don't have descriptions)
    const { data: steps } = await supabase
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
  };

  const handleEditRecipe = async (recipe: any) => {
    setEditingRecipe(recipe);
    setIsEditDialogOpen(true);
    
    // Fetch steps for this recipe with step_descriptions join (left join in case some steps don't have descriptions)
    const { data: steps } = await supabase
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
    
    // Initialize editable steps with current step data
    const editable = sortedSteps.map((step: any) => {
      const stepDescription = Array.isArray(step.step_descriptions)
        ? step.step_descriptions[0]
        : step.step_descriptions;
      
      return {
        step_id: step.step_id,
        sequence_order: step.sequence_order || 0,
        description_name: step.description_name || stepDescription?.description_name || '',
        description_id: step.description_id || null,
        duration: step.duration || 0,
        duration_unit: step.duration_unit || 'Days',
        isNew: false,
      };
    });
    setEditableSteps(editable);
  };

  const addNewStep = () => {
    const newStep = {
      sequence_order: newRecipeSteps.length + 1,
      description_id: null as number | null,
      description_name: '',
      duration: 0,
      duration_unit: 'Days' as 'Days' | 'Hours',
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

  const handleAddRecipe = async () => {
    if (!newRecipe.recipe_name || !newRecipe.variety_id) return;

    setCreating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

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
        farm_uuid: farmUuid,
        is_active: true
      };

      const { data: createdRecipe, error } = await supabase
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
            description_id: step.description_id || null,
            description_name: selectedDescription?.description_name || step.description_name || 'Untitled Step',
            duration: step.duration || 0,
            duration_unit: step.duration_unit || 'Days',
          };
        });

        const { error: stepsError } = await supabase.from('steps').insert(stepsData);
        if (stepsError) throw stepsError;
      }

      setNewRecipe({ recipe_name: '', variety_id: '', type: 'Standard' });
      setNewRecipeSteps([]);
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

  const handleUpdateRecipe = async () => {
    if (!editingRecipe || !editingRecipe.recipe_name) return;

    setUpdating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

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
        type: editingRecipe.type === 'Standard' || editingRecipe.type === 'Custom' 
          ? editingRecipe.type 
          : 'Standard',
        description: editingRecipe.description || null,
        notes: editingRecipe.notes || null,
      };

      const { error } = await supabase
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
        const { error: deleteError } = await supabase
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
          const { error: insertError } = await supabase
            .from('steps')
            .insert({
              recipe_id: editingRecipe.recipe_id,
              sequence_order: step.sequence_order,
              description_id: step.description_id || null,
              description_name: selectedDescription?.description_name || step.description_name || 'Untitled Step',
              duration: step.duration || 0,
              duration_unit: step.duration_unit || 'Days',
            });
          
          if (insertError) throw insertError;
        } else if (step.step_id) {
          // Update existing step
          const selectedDescription = stepDescriptions.find(sd => sd.description_id === step.description_id);
          const { error: updateError } = await supabase
            .from('steps')
            .update({
              sequence_order: step.sequence_order,
              description_id: step.description_id || null,
              description_name: selectedDescription?.description_name || step.description_name || 'Untitled Step',
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
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Recipe
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New Recipe</DialogTitle>
              <DialogDescription>
                Define how to grow a specific variety.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Recipe Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Standard Sunflower"
                  value={newRecipe.recipe_name}
                  onChange={(e) => setNewRecipe({ ...newRecipe, recipe_name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="variety">Variety</Label>
                <Select 
                  value={newRecipe.variety_id} 
                  onValueChange={(value) => setNewRecipe({ ...newRecipe, variety_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a variety" />
                  </SelectTrigger>
                  <SelectContent>
                    {varieties.map((variety) => (
                      <SelectItem key={variety.variety_id} value={variety.variety_id.toString()}>
                        {variety.variety_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="type">Type</Label>
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
                    onClick={addNewStep}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Step
                  </Button>
                </div>
                {newRecipeSteps.length > 0 && (
                  <div className="space-y-2 max-h-60 overflow-y-auto p-2 border rounded">
                    {newRecipeSteps.map((step, index) => (
                      <div key={index} className="p-2 border rounded bg-gray-50">
                        <div className="flex items-start gap-2">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs mt-1">
                            {step.sequence_order}
                          </div>
                          <div className="flex-1 space-y-2">
                            <Select
                              value={step.description_id?.toString() || ''}
                              onValueChange={(value) => {
                                const selectedDesc = stepDescriptions.find(sd => sd.description_id.toString() === value);
                                updateNewStep(index, 'description_id', selectedDesc ? parseInt(value) : null);
                                updateNewStep(index, 'description_name', selectedDesc?.description_name || '');
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select step description" />
                              </SelectTrigger>
                              <SelectContent>
                                {stepDescriptions.map((desc) => (
                                  <SelectItem key={desc.description_id} value={desc.description_id.toString()}>
                                    {desc.description_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                type="number"
                                min="0"
                                step="0.1"
                                placeholder="Duration"
                                value={step.duration || 0}
                                onChange={(e) => updateNewStep(index, 'duration', parseFloat(e.target.value) || 0)}
                              />
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
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeNewStep(index)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {newRecipeSteps.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    You can add steps now or edit the recipe later to add them.
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
              <Button onClick={handleAddRecipe} disabled={creating || !newRecipe.recipe_name || !newRecipe.variety_id}>
                {creating ? 'Creating...' : 'Create Recipe'}
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
                  value={editingRecipe.variety_id?.toString() || ''} 
                  onValueChange={(value) => {
                    const selectedVariety = varieties.find(v => 
                      (v.variety_id ?? v.varietyid)?.toString() === value
                    );
                    setEditingRecipe({ 
                      ...editingRecipe, 
                      variety_id: value,
                      variety_name: selectedVariety?.variety_name || selectedVariety?.name || ''
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a variety" />
                  </SelectTrigger>
                  <SelectContent>
                    {varieties.map((variety) => (
                      <SelectItem key={variety.variety_id} value={variety.variety_id.toString()}>
                        {variety.variety_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-type">Type</Label>
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
                    variant="outline"
                    size="sm"
                    onClick={addStep}
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
                                updateStep(index, 'description_id', selectedDesc ? parseInt(value) : null);
                                updateStep(index, 'description_name', selectedDesc?.description_name || '');
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select step description" />
                              </SelectTrigger>
                              <SelectContent>
                                {stepDescriptions.map((desc) => (
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
            <Button onClick={handleUpdateRecipe} disabled={updating || !editingRecipe?.recipe_name}>
              {updating ? 'Updating...' : 'Update Recipe'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    <button
                      onClick={() => handleViewRecipe(recipe)}
                      className="text-left hover:text-blue-600 hover:underline cursor-pointer"
                    >
                      {recipe.recipe_name}
                    </button>
                  </TableCell>
                  <TableCell>{recipe.variety_name || 'N/A'}</TableCell>
                  <TableCell>{recipe.type || 'N/A'}</TableCell>
                  <TableCell>{recipe.harvestDays || 0}</TableCell>
                  <TableCell>{recipe.stepCount || 0}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEditRecipe(recipe)}>
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
    </div>
  );
};

export default RecipesPage;
