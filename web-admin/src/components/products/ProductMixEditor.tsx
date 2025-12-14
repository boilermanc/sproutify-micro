import { useState, useEffect, useCallback } from 'react';
import { Save, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Product {
  product_id: number;
  product_name: string;
}

interface Recipe {
  recipe_id: number | string; // Can be number for farm recipes or string like "global_123" for global recipes
  recipe_name: string;
  variety_name: string;
  variety_id?: number | null;
  is_global?: boolean;
  global_recipe_id?: number;
}

interface Variety {
  variety_id: number;
  variety_name: string;
}

interface MixMapping {
  recipe_id: number;
  variety_id: number;
  ratio: number;
  recipe_name?: string;
  variety_name?: string;
}

interface ProductMixEditorProps {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

const ProductMixEditor = ({ product, open, onOpenChange, onUpdate }: ProductMixEditorProps) => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [varieties, setVarieties] = useState<Variety[]>([]);
  const [mappings, setMappings] = useState<MixMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newMapping, setNewMapping] = useState({
    variety_id: '',
    recipe_id: '',
    ratio: '1.0',
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Fetch existing mappings
      const { data: mappingsData, error: mappingsError } = await supabase
        .from('product_recipe_mapping')
        .select(`
          *,
          recipes!inner(recipe_id, recipe_name, variety_name),
          varieties!inner(varietyid, name)
        `)
        .eq('product_id', product.product_id);

      if (mappingsError) throw mappingsError;

      // Normalize mappings
      const normalizedMappings = (mappingsData || []).map((m: any) => ({
        recipe_id: m.recipe_id,
        variety_id: m.variety_id, // This comes from product_recipe_mapping table
        ratio: m.ratio || 1.0,
        recipe_name: m.recipes?.recipe_name || '',
        variety_name: m.varieties?.variety_name || m.varieties?.name || '',
      }));

      setMappings(normalizedMappings);

      // Fetch farm's own recipes
      const { data: farmRecipesData, error: recipesError } = await supabase
        .from('recipes')
        .select('recipe_id, recipe_name, variety_name, variety_id')
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true)
        .order('recipe_name', { ascending: true });

      if (recipesError) throw recipesError;

      // Fetch enabled global recipes for this farm
      const { data: enabledGlobalRecipes, error: globalError } = await supabase
        .from('farm_global_recipes')
        .select(`
          global_recipe_id,
          global_recipes!inner(
            global_recipe_id,
            recipe_name,
            variety_name,
            description,
            notes,
            is_active
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
          variety_id: null, // Global recipes don't have variety_id, only variety_name
          is_global: true, // Flag to identify global recipes
          global_recipe_id: item.global_recipe_id,
        }));

      // Combine farm recipes and enabled global recipes
      // Filter out global recipes that have already been copied to the farm (by matching variety_name and recipe_name)
      const farmRecipeKeys = new Set(
        (farmRecipesData || []).map((r: any) => 
          `${(r.recipe_name || '').toLowerCase().trim()}_${(r.variety_name || '').toLowerCase().trim()}`
        )
      );
      const uniqueGlobalRecipes = globalRecipesForDropdown.filter(
        (gr: any) => {
          const globalKey = `${(gr.recipe_name || '').toLowerCase().trim()}_${(gr.variety_name || '').toLowerCase().trim()}`;
          return !farmRecipeKeys.has(globalKey);
        }
      );
      
      const allRecipes = [
        ...(farmRecipesData || []).map((r: any) => ({ ...r, is_global: false })),
        ...uniqueGlobalRecipes,
      ];

      // Debug: Log what we fetched
      console.log('Fetched recipes:', {
        farmRecipes: farmRecipesData?.length || 0,
        globalRecipes: globalRecipesForDropdown.length,
        uniqueGlobalRecipes: uniqueGlobalRecipes.length,
        total: allRecipes.length,
        sampleFarm: farmRecipesData?.[0],
        sampleGlobal: globalRecipesForDropdown[0],
        allRecipesWithFlags: allRecipes.map(r => ({ name: r.recipe_name, variety: r.variety_name, is_global: r.is_global }))
      });
      
      setRecipes(allRecipes);

      // Fetch varieties from varieties_view (farm-specific catalog)
      // This shows only varieties that have been added to your farm's catalog
      const { data: varietiesData, error: varietiesError } = await supabase
        .from('varieties_view')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .order('name', { ascending: true });

      if (varietiesError) throw varietiesError;
      
      // Normalize varieties (handle both column name formats)
      const normalizedVarieties = (varietiesData || []).map((v: any) => ({
        variety_id: v.varietyid || v.variety_id,
        variety_name: v.name || v.variety_name || '',
      }));

      setVarieties(normalizedVarieties);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [product]);

  useEffect(() => {
    if (open && product) {
      fetchData();
    }
  }, [open, product, fetchData]);

  // Filter recipes based on selected variety
  const getFilteredRecipes = () => {
    if (!newMapping.variety_id) return [];
    
    const selectedVarietyId = parseInt(newMapping.variety_id);
    // Find the selected variety to get its name for matching global recipes
    const selectedVariety = varieties.find(v => 
      (v.variety_id || parseInt(v.variety_id?.toString() || '0')) === selectedVarietyId
    );
    const selectedVarietyName = (selectedVariety?.variety_name || '').toLowerCase().trim();
    
    // Debug logging
    console.log('Filtering recipes:', {
      selectedVarietyId,
      selectedVarietyName,
      totalRecipes: recipes.length,
      farmRecipes: recipes.filter(r => !r.is_global).length,
      globalRecipes: recipes.filter(r => r.is_global).length,
      allRecipeNames: recipes.map(r => ({ name: r.recipe_name, variety: r.variety_name, is_global: r.is_global })),
      recipesArray: recipes // Full recipes array for debugging
    });
    
    // Filter to show recipes that match the selected variety
    // Match by variety_id for farm recipes, or by variety_name for global recipes
    const filtered = recipes.filter(r => {
      if (r.is_global) {
        // For global recipes, match by variety_name (case-insensitive, flexible matching)
        const globalVarietyName = (r.variety_name || '').toLowerCase().trim();
        const matches = globalVarietyName && selectedVarietyName && 
               (globalVarietyName === selectedVarietyName ||
                globalVarietyName.includes(selectedVarietyName) ||
                selectedVarietyName.includes(globalVarietyName));
        if (matches) {
          console.log('Matched global recipe:', r.recipe_name, 'variety:', r.variety_name);
        }
        return matches;
      } else {
        // For farm recipes, match by variety_id
        const matches = r.variety_id === selectedVarietyId;
        if (matches) {
          console.log('Matched farm recipe:', r.recipe_name, 'variety_id:', r.variety_id);
        }
        return matches;
      }
    });
    
    console.log('Filtered recipes count:', filtered.length);
    return filtered;
  };

  // Auto-select recipe when variety is selected (if only one matching recipe exists)
  const handleVarietyChange = (varietyId: string) => {
    const updatedMapping = { ...newMapping, variety_id: varietyId, recipe_id: '' };
    
    // Find the selected variety to get its name for matching global recipes
    const selectedVarietyId = parseInt(varietyId);
    const selectedVariety = varieties.find(v => 
      (v.variety_id || parseInt(v.variety_id?.toString() || '0')) === selectedVarietyId
    );
    const selectedVarietyName = selectedVariety?.variety_name || '';
    
    // Find recipes matching this variety (by variety_id for farm recipes, or variety_name for global)
    const matchingRecipes = recipes.filter(r => {
      if (r.is_global) {
        return r.variety_name && selectedVarietyName && 
               r.variety_name.toLowerCase().trim() === selectedVarietyName.toLowerCase().trim();
      } else {
        return r.variety_id === selectedVarietyId;
      }
    });
    
    // Auto-select recipe if there's exactly one match
    if (matchingRecipes.length === 1) {
      updatedMapping.recipe_id = matchingRecipes[0].recipe_id.toString();
    }
    
    setNewMapping(updatedMapping);
  };

  const handleAddMapping = async () => {
    if (!newMapping.variety_id || !newMapping.recipe_id) return;

    const recipe = recipes.find(r => r.recipe_id.toString() === newMapping.recipe_id);
    const variety = varieties.find(v => v.variety_id.toString() === newMapping.variety_id);

    if (!recipe || !variety) return;

    let finalRecipeId: number;

    // For global recipes, copy them to the farm first
    if (recipe.is_global && recipe.global_recipe_id) {
      try {
        const sessionData = localStorage.getItem('sproutify_session');
        if (!sessionData) {
          alert('Session expired. Please log in again.');
          return;
        }

        const { farmUuid, userId } = JSON.parse(sessionData);
        
        // Call the copy function to create a farm recipe from the global recipe
        const { data: copiedRecipeId, error: copyError } = await supabase.rpc(
          'copy_global_recipe_to_farm',
          {
            p_global_recipe_id: recipe.global_recipe_id,
            p_farm_uuid: farmUuid,
            p_created_by: userId,
            p_new_recipe_name: `${recipe.recipe_name} (Global)`
          }
        );

        if (copyError) {
          console.error('Error copying global recipe:', copyError);
          alert(`Error copying recipe: ${copyError.message}`);
          return;
        }

        finalRecipeId = copiedRecipeId;
        
        // Refresh recipes list to include the newly copied recipe
        // Re-fetch both farm and global recipes to ensure we have the latest data
        const { data: recipesData } = await supabase
          .from('recipes')
          .select('recipe_id, recipe_name, variety_name, variety_id')
          .eq('farm_uuid', farmUuid)
          .eq('is_active', true)
          .order('recipe_name', { ascending: true });

        // Re-fetch global recipes
        const { data: enabledGlobalRecipesRefresh } = await supabase
          .from('farm_global_recipes')
          .select(`
            global_recipe_id,
            global_recipes!inner(
              global_recipe_id,
              recipe_name,
              variety_name,
              description,
              notes,
              is_active
            )
          `)
          .eq('farm_uuid', farmUuid)
          .eq('is_active', true);

        // Rebuild global recipes list
        const globalRecipesForDropdownRefresh = (enabledGlobalRecipesRefresh || [])
          .filter((item: any) => item.global_recipes?.is_active)
          .map((item: any) => ({
            recipe_id: `global_${item.global_recipe_id}`,
            recipe_name: item.global_recipes.recipe_name,
            variety_name: item.global_recipes.variety_name,
            variety_id: null,
            is_global: true,
            global_recipe_id: item.global_recipe_id,
          }));

        // Re-deduplicate
        const farmRecipeKeysRefresh = new Set(
          (recipesData || []).map((r: any) => 
            `${(r.recipe_name || '').toLowerCase().trim()}_${(r.variety_name || '').toLowerCase().trim()}`
          )
        );
        const uniqueGlobalRecipesRefresh = globalRecipesForDropdownRefresh.filter(
          (gr: any) => {
            const globalKey = `${(gr.recipe_name || '').toLowerCase().trim()}_${(gr.variety_name || '').toLowerCase().trim()}`;
            return !farmRecipeKeysRefresh.has(globalKey);
          }
        );
        
        if (recipesData) {
          const updatedRecipes = [
            ...(recipesData || []).map((r: any) => ({ ...r, is_global: false })),
            ...uniqueGlobalRecipesRefresh,
          ];
          console.log('Refreshed recipes after copy:', {
            farmRecipes: updatedRecipes.filter(r => !r.is_global).length,
            globalRecipes: updatedRecipes.filter(r => r.is_global).length,
            total: updatedRecipes.length,
            globalRecipeNames: uniqueGlobalRecipesRefresh.map(r => r.recipe_name)
          });
          setRecipes(updatedRecipes);
        } else {
          // If recipesData is null, don't update recipes - keep existing state
          console.warn('No recipes data returned after copy, keeping existing recipes state');
        }
      } catch (error: any) {
        console.error('Error handling global recipe:', error);
        alert(`Error: ${error.message}`);
        return;
      }
    } else {
      // For farm recipes, use the recipe_id directly
      finalRecipeId = typeof newMapping.recipe_id === 'string' 
        ? parseInt(newMapping.recipe_id) 
        : newMapping.recipe_id as number;
    }

    const mapping: MixMapping = {
      recipe_id: finalRecipeId,
      variety_id: parseInt(newMapping.variety_id),
      ratio: parseFloat(newMapping.ratio) || 1.0,
      recipe_name: recipe.recipe_name,
      variety_name: variety.variety_name,
    };

    setMappings([...mappings, mapping]);
    setNewMapping({ variety_id: '', recipe_id: '', ratio: '1.0' });
  };

  const handleRemoveMapping = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete existing mappings
      const { error: deleteError } = await supabase
        .from('product_recipe_mapping')
        .delete()
        .eq('product_id', product.product_id);

      if (deleteError) throw deleteError;

      // Insert new mappings
      if (mappings.length > 0) {
        const payload = mappings.map(m => ({
          product_id: product.product_id,
          recipe_id: m.recipe_id,
          variety_id: m.variety_id,
          ratio: m.ratio,
        }));

        const { error: insertError } = await supabase
          .from('product_recipe_mapping')
          .insert(payload);

        if (insertError) throw insertError;
      }

      onUpdate();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving mix:', error);
      alert('Failed to save product mix');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Product Mix Configuration - {product.product_name}</DialogTitle>
          <DialogDescription>
            Select varieties from your catalog and matching recipes to configure this product mix. 
            Add varieties to your catalog in the Varieties page if needed.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : (
          <div className="space-y-4">
            <div className="border rounded-lg p-4 space-y-4">
              <h3 className="font-semibold">Add Crop to Mix</h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="variety">Variety *</Label>
                  <Select
                    value={newMapping.variety_id}
                    onValueChange={handleVarietyChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select variety" />
                    </SelectTrigger>
                    <SelectContent>
                      {varieties.length === 0 ? (
                        <SelectItem value="none" disabled>
                          No varieties in your catalog. Add varieties in the Varieties page.
                        </SelectItem>
                      ) : (
                        varieties.map((variety) => (
                          <SelectItem key={variety.variety_id} value={variety.variety_id.toString()}>
                            {variety.variety_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {varieties.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      Add varieties to your catalog in the <a href="/varieties" className="underline">Varieties page</a>
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="recipe">Recipe *</Label>
                  <Select
                    value={newMapping.recipe_id}
                    onValueChange={(value) => setNewMapping({ ...newMapping, recipe_id: value })}
                    disabled={!newMapping.variety_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={newMapping.variety_id ? "Select recipe" : "Select variety first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {getFilteredRecipes().length === 0 ? (
                        <SelectItem value="none" disabled>
                          {newMapping.variety_id 
                            ? "No recipes found for this variety. Create a recipe in the Recipes page." 
                            : "Select a variety first"}
                        </SelectItem>
                      ) : (
                        getFilteredRecipes().map((recipe) => {
                          // Use a unique key that combines recipe type and ID
                          const uniqueKey = recipe.is_global 
                            ? `global_${recipe.global_recipe_id}` 
                            : `farm_${recipe.recipe_id}`;
                          const recipeValue = typeof recipe.recipe_id === 'string' 
                            ? recipe.recipe_id 
                            : recipe.recipe_id.toString();
                          
                          console.log('Rendering SelectItem:', {
                            key: uniqueKey,
                            value: recipeValue,
                            name: recipe.recipe_name,
                            is_global: recipe.is_global
                          });
                          
                          return (
                            <SelectItem 
                              key={uniqueKey} 
                              value={recipeValue}
                            >
                              {recipe.recipe_name}
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                  {newMapping.variety_id && getFilteredRecipes().length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      Create a recipe for this variety in the <a href="/recipes" className="underline">Recipes page</a>
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="ratio">Ratio</Label>
                  <Input
                    id="ratio"
                    type="number"
                    step="0.1"
                    value={newMapping.ratio}
                    onChange={(e) => setNewMapping({ ...newMapping, ratio: e.target.value })}
                    placeholder="1.0"
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleAddMapping} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </div>
              </div>
            </div>

            {mappings.length > 0 && (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variety</TableHead>
                      <TableHead>Recipe</TableHead>
                      <TableHead>Ratio</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.map((mapping, index) => (
                      <TableRow key={`${mapping.recipe_id}-${mapping.variety_id}`}>
                        <TableCell>{mapping.variety_name || 'Unknown'}</TableCell>
                        <TableCell>{mapping.recipe_name || 'Unknown'}</TableCell>
                        <TableCell>{mapping.ratio}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveMapping(index)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Mix'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProductMixEditor;

