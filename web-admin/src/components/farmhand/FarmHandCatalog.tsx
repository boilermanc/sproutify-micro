import { useState, useEffect, useCallback } from 'react';
import {
  Leaf,
  RefreshCw,
  AlertCircle,
  Loader2,
  Clock,
  ChevronRight,
  X,
  Droplets,
  Sun
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

interface Recipe {
  recipe_id: number;
  recipe_name: string;
  variety_name: string | null;
  description: string | null;
  notes: string | null;
  seed_quantity: number | null;
  seed_quantity_unit: string | null;
  total_days: number | null;
  is_active: boolean;
}

interface RecipeStep {
  step_id: number;
  step_order: number;
  step_name: string;
  duration: number;
  duration_unit: string;
  description: string | null;
}

const FarmHandCatalog = () => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [recipeSteps, setRecipeSteps] = useState<RecipeStep[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);

  const loadRecipes = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      setError(null);

      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) throw new Error('Session not found');
      const { farmUuid } = JSON.parse(sessionData);

      // Fetch recipes with total days from view
      const { data: recipesData, error: recipesError } = await getSupabaseClient()
        .from('recipes')
        .select(`
          recipe_id,
          recipe_name,
          variety_name,
          description,
          notes,
          seed_quantity,
          seed_quantity_unit,
          is_active
        `)
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true)
        .order('recipe_name', { ascending: true });

      if (recipesError) throw recipesError;

      // Get total days for each recipe
      const recipeIds = (recipesData || []).map((r: any) => r.recipe_id);

      let totalDaysMap = new Map<number, number>();
      if (recipeIds.length > 0) {
        const { data: daysData } = await getSupabaseClient()
          .from('recipe_total_days')
          .select('recipe_id, total_days')
          .in('recipe_id', recipeIds);

        if (daysData) {
          totalDaysMap = new Map(daysData.map((d: any) => [d.recipe_id, d.total_days]));
        }
      }

      const normalized: Recipe[] = (recipesData || []).map((r: any) => ({
        recipe_id: r.recipe_id,
        recipe_name: r.recipe_name || '',
        variety_name: r.variety_name || null,
        description: r.description || null,
        notes: r.notes || null,
        seed_quantity: r.seed_quantity || null,
        seed_quantity_unit: r.seed_quantity_unit || 'g',
        total_days: totalDaysMap.get(r.recipe_id) || null,
        is_active: r.is_active ?? true,
      }));

      setRecipes(normalized);
    } catch (err) {
      console.error('Error loading catalog:', err);
      setError('Failed to load catalog');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  const loadRecipeSteps = useCallback(async (recipeId: number) => {
    try {
      setLoadingSteps(true);
      setRecipeSteps([]);

      const { data: stepsData, error: stepsError } = await getSupabaseClient()
        .from('steps')
        .select(`
          step_id,
          sequence_order,
          duration,
          duration_unit,
          step_descriptions!inner(name, description)
        `)
        .eq('recipe_id', recipeId)
        .order('sequence_order', { ascending: true });

      if (stepsError) throw stepsError;

      const steps: RecipeStep[] = (stepsData || []).map((s: any) => ({
        step_id: s.step_id,
        step_order: s.sequence_order || 0,
        step_name: s.step_descriptions?.name || 'Step',
        duration: s.duration || 0,
        duration_unit: s.duration_unit || 'Days',
        description: s.step_descriptions?.description || null,
      }));

      setRecipeSteps(steps);
    } catch (err) {
      console.error('Error loading recipe steps:', err);
    } finally {
      setLoadingSteps(false);
    }
  }, []);

  const handleRecipeSelect = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    loadRecipeSteps(recipe.recipe_id);
  };

  const getStepIcon = (stepName: string) => {
    const name = stepName.toLowerCase();
    if (name.includes('soak')) return Droplets;
    if (name.includes('water')) return Droplets;
    if (name.includes('light') || name.includes('uncover')) return Sun;
    return Leaf;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Crop Catalog</h1>
          <p className="text-sm text-slate-500">
            {recipes.length === 0 ? 'No recipes found' : `${recipes.length} recipe${recipes.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => loadRecipes(true)}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </Card>
      )}

      {/* Recipe List */}
      {recipes.length === 0 ? (
        <Card className="p-8 text-center">
          <Leaf className="h-12 w-12 mx-auto text-slate-400 mb-3" />
          <p className="text-lg font-medium text-slate-700">No recipes in catalog</p>
          <p className="text-sm text-slate-500 mt-1">
            Recipes will appear here when added by a manager.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {recipes.map((recipe) => (
            <Card
              key={recipe.recipe_id}
              className="p-4 border-l-4 border-emerald-400 bg-emerald-50 cursor-pointer transition-all active:scale-[0.98]"
              onClick={() => handleRecipeSelect(recipe)}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-100">
                  <Leaf className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{recipe.recipe_name}</span>
                    <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
                  </div>
                  {recipe.variety_name && recipe.variety_name !== recipe.recipe_name && (
                    <p className="text-sm text-emerald-700">{recipe.variety_name}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-sm text-slate-600">
                    {recipe.total_days && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>{recipe.total_days} days</span>
                      </div>
                    )}
                    {recipe.seed_quantity && (
                      <span className="text-slate-500">
                        {recipe.seed_quantity}{recipe.seed_quantity_unit}/tray
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Recipe Detail Dialog */}
      <Dialog open={!!selectedRecipe} onOpenChange={() => setSelectedRecipe(null)}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Leaf className="h-5 w-5 text-emerald-600" />
              {selectedRecipe?.recipe_name}
            </DialogTitle>
          </DialogHeader>

          {selectedRecipe && (
            <div className="space-y-4">
              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-3">
                {selectedRecipe.total_days && (
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 uppercase">Days to Harvest</p>
                    <p className="text-lg font-semibold text-slate-900">{selectedRecipe.total_days}</p>
                  </div>
                )}
                {selectedRecipe.seed_quantity && (
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 uppercase">Seed/Tray</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {selectedRecipe.seed_quantity}{selectedRecipe.seed_quantity_unit}
                    </p>
                  </div>
                )}
              </div>

              {/* Description */}
              {selectedRecipe.description && (
                <div>
                  <p className="text-xs text-slate-500 uppercase mb-1">Description</p>
                  <p className="text-sm text-slate-700">{selectedRecipe.description}</p>
                </div>
              )}

              {/* Growing Notes */}
              {selectedRecipe.notes && (
                <div>
                  <p className="text-xs text-slate-500 uppercase mb-1">Growing Notes</p>
                  <p className="text-sm text-slate-700">{selectedRecipe.notes}</p>
                </div>
              )}

              {/* Growing Steps */}
              <div>
                <p className="text-xs text-slate-500 uppercase mb-2">Growing Steps</p>
                {loadingSteps ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                ) : recipeSteps.length === 0 ? (
                  <p className="text-sm text-slate-500">No steps defined</p>
                ) : (
                  <div className="space-y-2">
                    {recipeSteps.map((step, index) => {
                      const StepIcon = getStepIcon(step.step_name);
                      return (
                        <div
                          key={step.step_id}
                          className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg"
                        >
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 text-xs font-medium flex-shrink-0">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <StepIcon className="h-4 w-4 text-slate-500" />
                              <span className="font-medium text-slate-900">{step.step_name}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {step.duration} {step.duration_unit.toLowerCase()}
                            </p>
                            {step.description && (
                              <p className="text-xs text-slate-600 mt-1">{step.description}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Close Button */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSelectedRecipe(null)}
              >
                <X className="h-4 w-4 mr-2" />
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FarmHandCatalog;
