import { useState, useEffect, useCallback } from 'react';
import {
  Sprout,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  AlertCircle,
  Plus,
  Minus
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

interface Recipe {
  recipe_id: string | number;
  recipe_name: string;
  variety_id?: number;
  variety_name?: string;
  is_global?: boolean;
  global_recipe_id?: number;
  varieties?: {
    varietyid: number;
    name: string;
    seed_quantity_grams?: number;
  } | null;
}

type Step = 'variety' | 'recipe' | 'quantity' | 'confirm';

const FarmHandSeed = () => {
  const [step, setStep] = useState<Step>('variety');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; trayCount: number } | null>(null);

  // Data
  const [varieties, setVarieties] = useState<{ id: number; name: string }[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<Recipe[]>([]);

  // Selection
  const [selectedVariety, setSelectedVariety] = useState<{ id: number; name: string } | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [quantity, setQuantity] = useState(1);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) throw new Error('Session not found');
      const { farmUuid } = JSON.parse(sessionData);

      // Fetch farm recipes
      const { data: farmRecipesData, error: recipesError } = await getSupabaseClient()
        .from('recipes')
        .select('recipe_id, recipe_name, variety_id, variety_name')
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true)
        .order('recipe_name', { ascending: true });

      if (recipesError) throw recipesError;

      // Fetch enabled global recipes
      const { data: enabledGlobalRecipes } = await getSupabaseClient()
        .from('farm_global_recipes')
        .select(`
          global_recipe_id,
          global_recipes!inner(
            global_recipe_id,
            recipe_name,
            variety_name
          )
        `)
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true);

      // Transform global recipes
      const globalRecipesFormatted = (enabledGlobalRecipes || [])
        .filter((item: any) => item.global_recipes)
        .map((item: any) => ({
          recipe_id: `global_${item.global_recipe_id}`,
          recipe_name: item.global_recipes.recipe_name,
          variety_name: item.global_recipes.variety_name,
          is_global: true,
          global_recipe_id: item.global_recipe_id,
        }));

      const allRecipes = [
        ...(farmRecipesData || []).map((r: any) => ({ ...r, is_global: false })),
        ...globalRecipesFormatted
      ];

      setRecipes(allRecipes);

      // Extract unique varieties from recipes
      const varietyMap = new Map<number, string>();
      const varietyNameMap = new Map<string, number>();

      // Get variety IDs that need to be fetched
      const varietyIds = allRecipes
        .map((r: Recipe) => r.variety_id)
        .filter((id): id is number => id !== undefined && id !== null);

      if (varietyIds.length > 0) {
        const { data: varietiesData } = await getSupabaseClient()
          .from('varieties')
          .select('varietyid, name')
          .in('varietyid', varietyIds);

        if (varietiesData) {
          varietiesData.forEach((v: any) => {
            varietyMap.set(v.varietyid, v.name);
          });
        }
      }

      // Also handle recipes that only have variety_name (global recipes)
      allRecipes.forEach((r: Recipe) => {
        if (r.variety_name && !r.variety_id) {
          // For global recipes, create a pseudo-ID based on name
          const existingId = Array.from(varietyMap.entries()).find(([_, name]) => name === r.variety_name)?.[0];
          if (!existingId && !varietyNameMap.has(r.variety_name)) {
            // Use negative IDs for name-based varieties to distinguish them
            const pseudoId = -(varietyNameMap.size + 1);
            varietyNameMap.set(r.variety_name, pseudoId);
            varietyMap.set(pseudoId, r.variety_name);
          }
        }
      });

      const uniqueVarieties = Array.from(varietyMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setVarieties(uniqueVarieties);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load varieties and recipes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter recipes when variety is selected
  useEffect(() => {
    if (!selectedVariety) {
      setFilteredRecipes([]);
      return;
    }

    const filtered = recipes.filter(r => {
      // Match by variety_id
      if (r.variety_id === selectedVariety.id) return true;
      // Match by variety_name for global recipes
      if (r.variety_name && r.variety_name.toLowerCase() === selectedVariety.name.toLowerCase()) return true;
      return false;
    });

    setFilteredRecipes(filtered);

    // Auto-select if only one recipe
    if (filtered.length === 1) {
      setSelectedRecipe(filtered[0]);
    }
  }, [selectedVariety, recipes]);

  const handleVarietySelect = (variety: { id: number; name: string }) => {
    setSelectedVariety(variety);
    setSelectedRecipe(null);
    setStep('recipe');
  };

  const handleRecipeSelect = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setStep('quantity');
  };

  const handleQuantityConfirm = () => {
    if (quantity > 0) {
      setStep('confirm');
    }
  };

  const handleBack = () => {
    if (step === 'recipe') {
      setSelectedRecipe(null);
      setStep('variety');
    } else if (step === 'quantity') {
      setStep('recipe');
    } else if (step === 'confirm') {
      setStep('quantity');
    }
  };

  const handleCreate = async () => {
    if (!selectedRecipe || quantity <= 0) return;

    try {
      setCreating(true);
      setError(null);

      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) throw new Error('Session not found');
      const { farmUuid, userId } = JSON.parse(sessionData);

      let actualRecipeId: number;
      let recipeName = selectedRecipe.recipe_name;

      // Handle global recipes - copy to farm first
      if (selectedRecipe.is_global && selectedRecipe.global_recipe_id) {
        const { data: copyResult, error: copyError } = await getSupabaseClient()
          .rpc('copy_global_recipe_to_farm', {
            p_global_recipe_id: selectedRecipe.global_recipe_id,
            p_farm_uuid: farmUuid
          });

        if (copyError) throw new Error('Failed to copy recipe: ' + copyError.message);
        actualRecipeId = copyResult as number;
      } else {
        actualRecipeId = typeof selectedRecipe.recipe_id === 'string'
          ? parseInt(selectedRecipe.recipe_id)
          : selectedRecipe.recipe_id;
      }

      const varietyName = selectedRecipe.varieties?.name || selectedRecipe.variety_name || selectedVariety?.name || '';

      // Create seeding request
      const { error: requestError } = await getSupabaseClient()
        .from('tray_creation_requests')
        .insert({
          farm_uuid: farmUuid,
          recipe_id: actualRecipeId,
          recipe_name: recipeName,
          variety_name: varietyName,
          quantity: quantity,
          seed_date: new Date().toISOString().split('T')[0],
          status: 'pending',
          source_type: 'manual',
          user_id: userId,
        });

      if (requestError) throw requestError;

      // Show success
      setSuccess({
        message: `Created seeding request for ${quantity} tray${quantity !== 1 ? 's' : ''} of ${recipeName}`,
        trayCount: quantity
      });

      // Reset after delay
      setTimeout(() => {
        setSuccess(null);
        setSelectedVariety(null);
        setSelectedRecipe(null);
        setQuantity(1);
        setStep('variety');
      }, 3000);

    } catch (err) {
      console.error('Error creating trays:', err);
      setError('Failed to create seeding request');
    } finally {
      setCreating(false);
    }
  };

  const resetAll = () => {
    setSuccess(null);
    setSelectedVariety(null);
    setSelectedRecipe(null);
    setQuantity(1);
    setStep('variety');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[60vh]">
        <Card className="p-8 text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Success!</h2>
          <p className="text-slate-600 mb-4">{success.message}</p>
          <Button onClick={resetAll} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Seed More Trays
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Quick Seed</h1>
          <p className="text-sm text-slate-500">
            {step === 'variety' && 'Step 1: Select variety'}
            {step === 'recipe' && 'Step 2: Select recipe'}
            {step === 'quantity' && 'Step 3: How many trays?'}
            {step === 'confirm' && 'Step 4: Confirm'}
          </p>
        </div>
        {step !== 'variety' && (
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        )}
      </div>

      {/* Progress */}
      <div className="flex items-center gap-1">
        {['variety', 'recipe', 'quantity', 'confirm'].map((s, i) => (
          <div
            key={s}
            className={cn(
              "flex-1 h-1.5 rounded-full transition-colors",
              i <= ['variety', 'recipe', 'quantity', 'confirm'].indexOf(step)
                ? 'bg-emerald-500'
                : 'bg-slate-200'
            )}
          />
        ))}
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

      {/* Step 1: Variety Selection */}
      {step === 'variety' && (
        <div className="space-y-2">
          {varieties.length === 0 ? (
            <Card className="p-8 text-center">
              <Sprout className="h-12 w-12 mx-auto text-slate-400 mb-3" />
              <p className="text-lg font-medium text-slate-700">No varieties available</p>
              <p className="text-sm text-slate-500 mt-1">Add recipes with varieties to start seeding.</p>
            </Card>
          ) : (
            varieties.map((variety) => (
              <Card
                key={variety.id}
                className="p-4 cursor-pointer transition-all active:scale-[0.98] hover:border-emerald-300"
                onClick={() => handleVarietySelect(variety)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-100">
                      <Sprout className="h-5 w-5 text-emerald-600" />
                    </div>
                    <span className="font-medium text-slate-900">{variety.name}</span>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400" />
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Step 2: Recipe Selection */}
      {step === 'recipe' && (
        <div className="space-y-2">
          {filteredRecipes.length === 0 ? (
            <Card className="p-8 text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-amber-400 mb-3" />
              <p className="text-lg font-medium text-slate-700">No recipes found</p>
              <p className="text-sm text-slate-500 mt-1">
                No recipes available for {selectedVariety?.name}.
              </p>
            </Card>
          ) : (
            filteredRecipes.map((recipe) => (
              <Card
                key={recipe.recipe_id}
                className={cn(
                  "p-4 cursor-pointer transition-all active:scale-[0.98]",
                  selectedRecipe?.recipe_id === recipe.recipe_id
                    ? "border-emerald-500 bg-emerald-50"
                    : "hover:border-emerald-300"
                )}
                onClick={() => handleRecipeSelect(recipe)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-slate-900">{recipe.recipe_name}</span>
                    {recipe.is_global && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                        Global
                      </span>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400" />
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Step 3: Quantity */}
      {step === 'quantity' && (
        <Card className="p-6">
          <div className="text-center mb-6">
            <p className="text-sm text-slate-500 mb-1">{selectedVariety?.name}</p>
            <p className="text-lg font-medium text-slate-900">{selectedRecipe?.recipe_name}</p>
          </div>

          <div className="flex items-center justify-center gap-4 mb-6">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-24 text-center text-2xl font-bold"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQuantity(quantity + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-center text-sm text-slate-500 mb-6">
            {quantity} tray{quantity !== 1 ? 's' : ''} to seed
          </p>

          <Button
            onClick={handleQuantityConfirm}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
          >
            Continue
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Card>
      )}

      {/* Step 4: Confirm */}
      {step === 'confirm' && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Confirm Seeding</h3>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Variety</span>
              <span className="font-medium text-slate-900">{selectedVariety?.name}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Recipe</span>
              <span className="font-medium text-slate-900">{selectedRecipe?.recipe_name}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Quantity</span>
              <span className="font-medium text-slate-900">{quantity} tray{quantity !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-500">Seed Date</span>
              <span className="font-medium text-slate-900">Today</span>
            </div>
          </div>

          <Button
            onClick={handleCreate}
            disabled={creating}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Create {quantity} Tray{quantity !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </Card>
      )}
    </div>
  );
};

export default FarmHandSeed;
