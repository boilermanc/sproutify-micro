import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Eye, Edit, ClipboardList } from 'lucide-react';
import EmptyState from '../components/onboarding/EmptyState';
import './TablePage.css';

const RecipesPage = () => {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecipes = async () => {
      try {
        const sessionData = localStorage.getItem('sproutify_session');
        if (!sessionData) return;

        const { farmUuid } = JSON.parse(sessionData);

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

    fetchRecipes();
  }, []);

  if (loading) {
    return (
      <div className="table-page">
        <div className="page-header">
          <div>
            <h1>Recipes</h1>
            <p className="subtitle">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="table-page">
      <div className="page-header">
        <div>
          <h1>Recipes</h1>
          <p className="subtitle">Manage your Recipes</p>
        </div>
        <button className="btn btn-primary" onClick={() => alert('Create Recipe feature coming soon!')}>+ Add New</button>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Variety</th>
              <th>Type</th>
              <th>Harvest (Days)</th>
              <th>Steps</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {recipes.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 0, border: 'none' }}>
                  <EmptyState
                    icon={<ClipboardList size={64} color="#5B7C99" />}
                    title="No Recipes Yet"
                    description="Recipes define how to grow each variety. They include steps like soaking, sowing, and harvesting."
                    actionLabel="+ Create Your First Recipe"
                    actionPath="/recipes"
                    showOnboardingLink={true}
                  />
                </td>
              </tr>
            ) : (
              recipes.map(recipe => (
                <tr key={recipe.recipe_id}>
                  <td className="font-semibold">{recipe.recipe_name}</td>
                  <td>{recipe.variety_name || 'N/A'}</td>
                  <td>{recipe.type || 'N/A'}</td>
                  <td>{recipe.harvestDays || 0}</td>
                  <td>{recipe.stepCount || 0}</td>
                <td>
                  <div className="actions">
                    <button className="action-icon" onClick={() => alert(`View recipe: ${recipe.name}`)}><Eye size={18} color="#5B7C99" /></button>
                    <button className="action-icon" onClick={() => alert(`Edit recipe: ${recipe.name}`)}><Edit size={18} color="#5B7C99" /></button>
                  </div>
                </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecipesPage;
