import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  RefreshCcw, 
  Sprout,
  ClipboardList,
  Search,
  X,
  Edit,
  Globe
} from 'lucide-react';

interface Recipe {
  recipe_id: number;
  recipe_name: string;
  variety_name: string;
  type: string;
  farm_uuid: string;
  is_active: boolean;
  created_at: string;
  farm_name?: string;
}

interface Variety {
  variety_id: number;
  variety_name: string;
  description: string;
  farm_uuid: string;
  is_active: boolean;
  created_at: string;
  farm_name?: string;
}

const AdminRecipesVarieties = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [globalRecipes, setGlobalRecipes] = useState<any[]>([]);
  const [varieties, setVarieties] = useState<Variety[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'recipes' | 'varieties' | 'global'>('recipes');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch recipes with farm names
      const { data: recipesData, error: recipesError } = await getSupabaseClient()
        .from('recipes')
        .select(`
          *,
          farms (
            farmname
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (recipesError) {
        console.error('Recipes error:', recipesError);
        if (recipesError.code === 'PGRST301' || recipesError.message.includes('permission denied')) {
          throw new Error('Admin RLS policies not configured. Please run migration 033_add_admin_rls_policies.sql');
        }
        throw recipesError;
      }

      const recipesWithFarmNames = (recipesData || []).map((recipe: any) => ({
        ...recipe,
        farm_name: recipe.farms?.farmname || 'Unknown Farm'
      }));

      setRecipes(recipesWithFarmNames);

      // Fetch varieties with farm names
      const { data: varietiesData, error: varietiesError } = await getSupabaseClient()
        .from('varieties')
        .select(`
          *,
          farms (
            farmname
          )
        `)
        .limit(100);

      if (varietiesError) {
        console.error('Varieties error:', varietiesError);
        if (varietiesError.code === 'PGRST301' || varietiesError.message.includes('permission denied')) {
          throw new Error('Admin RLS policies not configured. Please run migration 033_add_admin_rls_policies.sql');
        }
        throw varietiesError;
      }

      const varietiesWithFarmNames = (varietiesData || []).map((variety: any) => ({
        ...variety,
        farm_name: variety.farms?.farmname || 'Unknown Farm'
      }));

      setVarieties(varietiesWithFarmNames);

      // Fetch global recipes
      const { data: globalRecipesData, error: globalRecipesError } = await getSupabaseClient()
        .from('global_recipes')
        .select('*')
        .eq('is_active', true)
        .order('recipe_name', { ascending: true });

      if (globalRecipesError) {
        console.error('Global recipes error:', globalRecipesError);
        // Global recipes might not be accessible, that's okay
        setGlobalRecipes([]);
      } else {
        setGlobalRecipes(globalRecipesData || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      if (error instanceof Error && error.message.includes('RLS')) {
        alert('Admin access not configured. Please contact support to set up admin RLS policies.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredRecipes = recipes.filter(recipe => {
    const recipeName = (recipe.recipe_name || '').toLowerCase();
    const varietyName = (recipe.variety_name || '').toLowerCase();
    const farmName = (recipe.farm_name || '').toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    return recipeName.includes(searchLower) || 
           varietyName.includes(searchLower) || 
           farmName.includes(searchLower);
  });

  const filteredVarieties = varieties.filter(variety => {
    const varietyName = (variety.variety_name || '').toLowerCase();
    const farmName = (variety.farm_name || '').toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    return varietyName.includes(searchLower) || 
           farmName.includes(searchLower);
  });

  const filteredGlobalRecipes = globalRecipes.filter(recipe => {
    const recipeName = (recipe.recipe_name || '').toLowerCase();
    const varietyName = (recipe.variety_name || '').toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    return recipeName.includes(searchLower) || 
           varietyName.includes(searchLower);
  });

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Recipes & Varieties</h1>
          <p className="text-gray-500 font-medium mt-1">View all recipes and varieties across farms</p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('recipes')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'recipes'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ClipboardList className="h-4 w-4 inline mr-2" />
          Farm Recipes ({recipes.length})
        </button>
        <button
          onClick={() => setActiveTab('global')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'global'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Globe className="h-4 w-4 inline mr-2" />
          Global Recipes ({globalRecipes.length})
        </button>
        <button
          onClick={() => setActiveTab('varieties')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'varieties'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Sprout className="h-4 w-4 inline mr-2" />
          Varieties ({varieties.length})
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          placeholder={
            activeTab === 'recipes' ? 'Search farm recipes...' : 
            activeTab === 'global' ? 'Search global recipes...' : 
            'Search varieties...'
          }
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 pr-10"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : activeTab === 'recipes' ? (
        <div className="space-y-4">
          {filteredRecipes.map((recipe) => (
            <Card key={recipe.recipe_id} className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{recipe.recipe_name}</h3>
                      <Badge variant={recipe.is_active ? 'default' : 'secondary'}>
                        {recipe.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {recipe.type && (
                        <Badge variant="outline">{recipe.type}</Badge>
                      )}
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <div key="variety" className="flex items-center gap-2">
                        <span className="font-medium">Variety:</span>
                        <span>{recipe.variety_name || 'N/A'}</span>
                      </div>
                      <div key="farm" className="flex items-center gap-2">
                        <span className="font-medium">Farm:</span>
                        <span>{recipe.farm_name}</span>
                      </div>
                      <div key="created" className="flex items-center gap-2">
                        <span className="font-medium">Created:</span>
                        <span>{new Date(recipe.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/recipe-builder?id=${recipe.recipe_id}`)}
                    className="ml-4"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredRecipes.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No recipes found
            </div>
          )}
        </div>
      ) : activeTab === 'global' ? (
        <div className="space-y-4">
          {filteredGlobalRecipes.map((recipe) => (
            <Card key={recipe.global_recipe_id} className="border-none shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-purple-500">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Globe className="h-4 w-4 text-purple-600" />
                      <h3 className="font-semibold text-lg">{recipe.recipe_name}</h3>
                      <Badge variant="default" className="bg-purple-600">
                        Global Template
                      </Badge>
                      <Badge variant={recipe.is_active ? 'default' : 'secondary'}>
                        {recipe.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <div key="variety" className="flex items-center gap-2">
                        <span className="font-medium">Variety:</span>
                        <span>{recipe.variety_name || 'N/A'}</span>
                      </div>
                      {recipe.description && (
                        <div key="description" className="flex items-center gap-2">
                          <span className="font-medium">Description:</span>
                          <span className="text-gray-500">{recipe.description}</span>
                        </div>
                      )}
                      {recipe.notes && (
                        <div key="notes" className="flex items-center gap-2">
                          <span className="font-medium">Notes:</span>
                          <span className="text-gray-500">{recipe.notes}</span>
                        </div>
                      )}
                      <div key="created" className="flex items-center gap-2">
                        <span className="font-medium">Created:</span>
                        <span>{new Date(recipe.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // For global recipes, we can view/edit them via a different route or modal
                      // For now, navigate to a view page or show a message
                      alert('Global recipe editing coming soon. These are template recipes that farms can copy.');
                    }}
                    className="ml-4"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    View
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredGlobalRecipes.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No global recipes found
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredVarieties.map((variety) => (
            <Card key={variety.variety_id} className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{variety.variety_name}</h3>
                      <Badge variant={variety.is_active ? 'default' : 'secondary'}>
                        {variety.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <div key="farm" className="flex items-center gap-2">
                        <span className="font-medium">Farm:</span>
                        <span>{variety.farm_name}</span>
                      </div>
                      {variety.description && (
                        <div key="description" className="flex items-center gap-2">
                          <span className="font-medium">Description:</span>
                          <span className="text-gray-500">{variety.description}</span>
                        </div>
                      )}
                      <div key="created" className="flex items-center gap-2">
                        <span className="font-medium">Created:</span>
                        <span>{new Date(variety.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredVarieties.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No varieties found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminRecipesVarieties;

