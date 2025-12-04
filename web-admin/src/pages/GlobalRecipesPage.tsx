import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Globe, Copy, Check, Search, Clock, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface GlobalRecipe {
  global_recipe_id: number;
  recipe_name: string;
  variety_name: string;
  description: string;
  notes: string;
  is_active: boolean;
  global_steps: GlobalStep[];
}

interface GlobalStep {
  global_step_id: number;
  step_name: string;
  description_id: number;
  description_name: string;
  sequence_order: number;
  duration: number;
  duration_unit: string;
  instructions: string;
  step_color: string;
}

interface FarmGlobalRecipe {
  global_recipe_id: number;
  is_active: boolean;
}

const GlobalRecipesPage = () => {
  const [globalRecipes, setGlobalRecipes] = useState<GlobalRecipe[]>([]);
  const [farmEnabledRecipes, setFarmEnabledRecipes] = useState<Map<number, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortEnabledFirst, setSortEnabledFirst] = useState(true);
  const [expandedRecipe, setExpandedRecipe] = useState<number | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<GlobalRecipe | null>(null);
  const [newRecipeName, setNewRecipeName] = useState('');
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [togglingRecipe, setTogglingRecipe] = useState<number | null>(null);

  const fetchGlobalRecipes = async () => {
    try {
      const { data, error } = await supabase
        .from('global_recipes')
        .select(`
          *,
          global_steps(*)
        `)
        .eq('is_active', true)
        .order('recipe_name');

      if (error) throw error;

      // Sort steps within each recipe
      const recipesWithSortedSteps = (data || []).map(recipe => ({
        ...recipe,
        global_steps: (recipe.global_steps || []).sort(
          (a: GlobalStep, b: GlobalStep) => a.sequence_order - b.sequence_order
        )
      }));

      setGlobalRecipes(recipesWithSortedSteps);
    } catch (error) {
      console.error('Error fetching global recipes:', error);
    }
  };

  const fetchFarmEnabledRecipes = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      const { data, error } = await supabase
        .from('farm_global_recipes')
        .select('global_recipe_id, is_active')
        .eq('farm_uuid', farmUuid);

      if (error) throw error;

      const enabledMap = new Map<number, boolean>();
      (data || []).forEach((item: FarmGlobalRecipe) => {
        enabledMap.set(item.global_recipe_id, item.is_active);
      });
      setFarmEnabledRecipes(enabledMap);
    } catch (error) {
      console.error('Error fetching farm enabled recipes:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchGlobalRecipes(), fetchFarmEnabledRecipes()]);
      setLoading(false);
    };
    loadData();
  }, []);

  const toggleRecipeEnabled = async (globalRecipeId: number) => {
    try {
      setTogglingRecipe(globalRecipeId);
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);
      const currentlyEnabled = farmEnabledRecipes.get(globalRecipeId) || false;

      if (currentlyEnabled) {
        // Disable: Update existing record
        const { error } = await supabase
          .from('farm_global_recipes')
          .update({ is_active: false })
          .eq('farm_uuid', farmUuid)
          .eq('global_recipe_id', globalRecipeId);

        if (error) throw error;
      } else {
        // Enable: Upsert record
        const { error } = await supabase
          .from('farm_global_recipes')
          .upsert({
            farm_uuid: farmUuid,
            global_recipe_id: globalRecipeId,
            is_active: true
          }, {
            onConflict: 'farm_uuid,global_recipe_id'
          });

        if (error) throw error;
      }

      // Update local state
      setFarmEnabledRecipes(prev => {
        const newMap = new Map(prev);
        newMap.set(globalRecipeId, !currentlyEnabled);
        return newMap;
      });
    } catch (error) {
      console.error('Error toggling recipe:', error);
    } finally {
      setTogglingRecipe(null);
    }
  };

  const openCopyDialog = (recipe: GlobalRecipe) => {
    setSelectedRecipe(recipe);
    setNewRecipeName(recipe.recipe_name);
    setCopyError('');
    setCopyDialogOpen(true);
  };

  const handleCopyRecipe = async () => {
    if (!selectedRecipe || !newRecipeName.trim()) {
      setCopyError('Please enter a recipe name');
      return;
    }

    if (newRecipeName.trim() === selectedRecipe.recipe_name) {
      setCopyError('Please choose a different name for your custom recipe');
      return;
    }

    try {
      setCopying(true);
      setCopyError('');

      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid, userId } = JSON.parse(sessionData);

      const { error } = await supabase.rpc('copy_global_recipe_to_farm', {
        p_global_recipe_id: selectedRecipe.global_recipe_id,
        p_farm_uuid: farmUuid,
        p_created_by: userId,
        p_new_recipe_name: newRecipeName.trim()
      });

      if (error) throw error;

      // Success - close dialog and show message
      setCopyDialogOpen(false);
      setSelectedRecipe(null);
      setNewRecipeName('');

      // Could add a toast notification here
      alert(`Recipe "${newRecipeName}" created successfully! You can find it in your Recipes page.`);
    } catch (error: any) {
      console.error('Error copying recipe:', error);
      setCopyError(error.message || 'Failed to copy recipe');
    } finally {
      setCopying(false);
    }
  };

  const calculateTotalDays = (steps: GlobalStep[]) => {
    return steps.reduce((sum, step) => {
      const duration = step.duration || 0;
      const unit = (step.duration_unit || 'Days').toUpperCase();

      if (unit === 'DAYS') {
        return sum + duration;
      } else if (unit === 'HOURS') {
        return sum + (duration >= 12 ? 1 : 0);
      }
      return sum + duration;
    }, 0);
  };

  const filteredRecipes = globalRecipes
    .filter(recipe =>
      recipe.recipe_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      recipe.variety_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      recipe.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (sortEnabledFirst) {
        const aEnabled = farmEnabledRecipes.get(a.global_recipe_id) || false;
        const bEnabled = farmEnabledRecipes.get(b.global_recipe_id) || false;
        if (aEnabled && !bEnabled) return -1;
        if (!aEnabled && bEnabled) return 1;
      }
      return a.recipe_name.localeCompare(b.recipe_name);
    });

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/4"></div>
          <div className="h-12 bg-slate-200 rounded w-full"></div>
          <div className="grid gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-slate-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Globe className="h-6 w-6 text-emerald-600" />
            Global Recipes
          </h1>
          <p className="text-slate-600 mt-1">
            Browse and enable pre-made growing recipes for your farm
          </p>
        </div>
      </div>

      {/* Info Banner */}
      <Alert className="bg-blue-50 border-blue-200">
        <AlertDescription className="text-blue-800">
          <strong>How it works:</strong> Enable a global recipe to use it when creating trays.
          To customize a recipe, click "Copy & Customize" to create your own editable version.
        </AlertDescription>
      </Alert>

      {/* Search and Sort */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search recipes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="sort-enabled"
            checked={sortEnabledFirst}
            onCheckedChange={setSortEnabledFirst}
          />
          <Label htmlFor="sort-enabled" className="text-sm text-slate-600 cursor-pointer">
            Show enabled first
          </Label>
        </div>
      </div>

      {/* Recipe Cards */}
      <div className="grid gap-4">
        {filteredRecipes.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-slate-500">
              {searchTerm ? 'No recipes match your search' : 'No global recipes available'}
            </CardContent>
          </Card>
        ) : (
          filteredRecipes.map((recipe) => {
            const isEnabled = farmEnabledRecipes.get(recipe.global_recipe_id) || false;
            const isExpanded = expandedRecipe === recipe.global_recipe_id;
            const totalDays = calculateTotalDays(recipe.global_steps);
            const isMucilaginous = recipe.notes?.toLowerCase().includes('mucilaginous') ||
                                   recipe.notes?.toLowerCase().includes('do not soak');

            return (
              <Card key={recipe.global_recipe_id} className={`transition-all ${isEnabled ? 'ring-2 ring-emerald-500 ring-opacity-50' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg">{recipe.recipe_name}</CardTitle>
                        {isMucilaginous && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Mucilaginous
                          </Badge>
                        )}
                        {isEnabled && (
                          <Badge className="bg-emerald-100 text-emerald-700">
                            <Check className="h-3 w-3 mr-1" />
                            Enabled
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="mt-1">
                        <span className="font-medium">{recipe.variety_name}</span>
                        <span className="mx-2">•</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {totalDays} days
                        </span>
                        <span className="mx-2">•</span>
                        <span>{recipe.global_steps.length} steps</span>
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`toggle-${recipe.global_recipe_id}`} className="text-sm text-slate-600">
                          {isEnabled ? 'Enabled' : 'Enable'}
                        </Label>
                        <Switch
                          id={`toggle-${recipe.global_recipe_id}`}
                          checked={isEnabled}
                          onCheckedChange={() => toggleRecipeEnabled(recipe.global_recipe_id)}
                          disabled={togglingRecipe === recipe.global_recipe_id}
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCopyDialog(recipe)}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy & Customize
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <p className="text-sm text-slate-600 mb-3">{recipe.description}</p>

                  {recipe.notes && (
                    <p className="text-sm text-slate-500 italic mb-3">
                      <strong>Note:</strong> {recipe.notes}
                    </p>
                  )}

                  {/* Expand/Collapse Steps */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-center text-slate-600 hover:text-slate-900"
                    onClick={() => setExpandedRecipe(isExpanded ? null : recipe.global_recipe_id)}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-4 w-4 mr-1" />
                        Hide Steps
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4 mr-1" />
                        Show Steps ({recipe.global_steps.length})
                      </>
                    )}
                  </Button>

                  {/* Steps List */}
                  {isExpanded && (
                    <div className="mt-4 space-y-2">
                      {recipe.global_steps.map((step, index) => (
                        <div
                          key={step.global_step_id}
                          className="flex items-start gap-3 p-3 rounded-lg bg-slate-50"
                        >
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0"
                            style={{ backgroundColor: step.step_color || '#6b7280' }}
                          >
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-slate-900">{step.step_name}</span>
                              <Badge variant="secondary" className="text-xs">
                                {step.description_name}
                              </Badge>
                              <span className="text-sm text-slate-500">
                                {step.duration} {step.duration_unit}
                              </span>
                            </div>
                            {step.instructions && (
                              <p className="text-sm text-slate-600 mt-1">{step.instructions}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Copy Dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy & Customize Recipe</DialogTitle>
            <DialogDescription>
              Create your own editable copy of "{selectedRecipe?.recipe_name}".
              You'll be able to modify the steps, durations, and instructions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-recipe-name">New Recipe Name</Label>
              <Input
                id="new-recipe-name"
                value={newRecipeName}
                onChange={(e) => setNewRecipeName(e.target.value)}
                placeholder="Enter a name for your recipe"
              />
              <p className="text-xs text-slate-500">
                Choose a unique name to distinguish this from the original
              </p>
            </div>

            {copyError && (
              <Alert variant="destructive">
                <AlertDescription>{copyError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCopyRecipe} disabled={copying}>
              {copying ? 'Creating...' : 'Create My Recipe'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GlobalRecipesPage;
