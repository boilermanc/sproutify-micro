import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Eye, Edit, ClipboardList, Plus, Search } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newRecipe, setNewRecipe] = useState({
    recipe_name: '',
    variety_id: '',
    type: 'Standard', // Schema only allows 'Standard' or 'Custom'
  });

  const fetchRecipes = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Recipes table has variety_name as a text field, not a foreign key
      // No join needed - variety_name is already in the recipes table
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
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
            .eq('recipe_id', recipe.recipe_id)
            .order('step_order', { ascending: true });

          const totalDays = steps?.reduce((sum, step) => sum + (step.duration_days || 0), 0) || 0;

          return {
            ...recipe,
            variety_name: recipe.variety_name || '', // Already in the table
            harvestDays: totalDays,
            stepCount: steps?.length || 0,
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

  useEffect(() => {
    fetchRecipes();
    fetchVarieties();
  }, []);

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

      // Recipes table schema: recipe_name, variety_name (text), type ('Standard' or 'Custom')
      // No variety_id column - variety_name is stored as text
      const payload = {
        recipe_name: newRecipe.recipe_name,
        variety_name: selectedVariety?.variety_name ?? selectedVariety?.name ?? '', // Store as text
        type: newRecipe.type === 'Standard' || newRecipe.type === 'Custom' 
          ? newRecipe.type 
          : 'Standard', // Schema only allows 'Standard' or 'Custom'
        farm_uuid: farmUuid,
        is_active: true
      };

      const { error } = await supabase
        .from('recipes')
        .insert([payload]);

      if (error) throw error;

      setNewRecipe({ recipe_name: '', variety_id: '', type: 'Standard' });
      setIsAddDialogOpen(false);
      fetchRecipes();
    } catch (error) {
      console.error('Error creating recipe:', error);
      alert('Failed to create recipe');
    } finally {
      setCreating(false);
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddRecipe} disabled={creating || !newRecipe.recipe_name || !newRecipe.variety_id}>
                {creating ? 'Creating...' : 'Create Recipe'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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
                  <TableCell className="font-medium">{recipe.recipe_name}</TableCell>
                  <TableCell>{recipe.variety_name || 'N/A'}</TableCell>
                  <TableCell>{recipe.type || 'N/A'}</TableCell>
                  <TableCell>{recipe.harvestDays || 0}</TableCell>
                  <TableCell>{recipe.stepCount || 0}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => alert(`View recipe: ${recipe.recipe_name}`)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => alert(`Edit recipe: ${recipe.recipe_name}`)}>
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
