import { useState, useEffect } from 'react';
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
  recipe_id: number;
  recipe_name: string;
  variety_name: string;
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
    recipe_id: '',
    variety_id: '',
    ratio: '1.0',
  });

  useEffect(() => {
    if (open && product) {
      fetchData();
    }
  }, [open, product]);

  const fetchData = async () => {
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
          varieties!inner(variety_id, variety_name)
        `)
        .eq('product_id', product.product_id);

      if (mappingsError) throw mappingsError;

      // Normalize mappings
      const normalizedMappings = (mappingsData || []).map((m: any) => ({
        recipe_id: m.recipe_id,
        variety_id: m.variety_id,
        ratio: m.ratio || 1.0,
        recipe_name: m.recipes?.recipe_name || '',
        variety_name: m.varieties?.variety_name || '',
      }));

      setMappings(normalizedMappings);

      // Fetch recipes
      const { data: recipesData, error: recipesError } = await supabase
        .from('recipes')
        .select('recipe_id, recipe_name, variety_name')
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true)
        .order('recipe_name', { ascending: true });

      if (recipesError) throw recipesError;
      setRecipes(recipesData || []);

      // Fetch varieties
      const { data: varietiesData, error: varietiesError } = await supabase
        .from('varieties')
        .select('variety_id, variety_name')
        .eq('is_active', true)
        .order('variety_name', { ascending: true });

      if (varietiesError) throw varietiesError;
      
      // Normalize varieties (handle both column name formats)
      const normalizedVarieties = (varietiesData || []).map((v: any) => ({
        variety_id: v.varietyid || v.variety_id,
        variety_name: v.name || v.variety_name,
      }));

      setVarieties(normalizedVarieties);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMapping = () => {
    if (!newMapping.recipe_id || !newMapping.variety_id) return;

    const recipe = recipes.find(r => r.recipe_id.toString() === newMapping.recipe_id);
    const variety = varieties.find(v => v.variety_id.toString() === newMapping.variety_id);

    const mapping: MixMapping = {
      recipe_id: parseInt(newMapping.recipe_id),
      variety_id: parseInt(newMapping.variety_id),
      ratio: parseFloat(newMapping.ratio) || 1.0,
      recipe_name: recipe?.recipe_name,
      variety_name: variety?.variety_name,
    };

    setMappings([...mappings, mapping]);
    setNewMapping({ recipe_id: '', variety_id: '', ratio: '1.0' });
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
            Configure which crops and recipes are used in this product mix for the mix calculator
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
                  <Label htmlFor="recipe">Recipe</Label>
                  <Select
                    value={newMapping.recipe_id}
                    onValueChange={(value) => setNewMapping({ ...newMapping, recipe_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select recipe" />
                    </SelectTrigger>
                    <SelectContent>
                      {recipes.map((recipe) => (
                        <SelectItem key={recipe.recipe_id} value={recipe.recipe_id.toString()}>
                          {recipe.recipe_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="variety">Variety</Label>
                  <Select
                    value={newMapping.variety_id}
                    onValueChange={(value) => setNewMapping({ ...newMapping, variety_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select variety" />
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
                      <TableHead>Recipe</TableHead>
                      <TableHead>Variety</TableHead>
                      <TableHead>Ratio</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.map((mapping, index) => (
                      <TableRow key={`${mapping.recipe_id}-${mapping.variety_id}`}>
                        <TableCell>{mapping.recipe_name || 'Unknown'}</TableCell>
                        <TableCell>{mapping.variety_name || 'Unknown'}</TableCell>
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

