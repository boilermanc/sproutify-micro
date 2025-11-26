import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import './steps.css';

interface TrayStepProps {
  onNext: () => void;
  onBack: () => void;
  recipeId?: number;
  batchId?: number;
  onDataCreated: (id: number) => void;
}

const TrayStep = ({ onNext, onBack, recipeId, batchId, onDataCreated }: TrayStepProps) => {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | ''>(recipeId || '');
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | ''>(batchId || '');
  const [selectedRecipe, setSelectedRecipe] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Fetch recipes
      const { data: recipesData } = await supabase
        .from('recipes')
        .select('recipe_id, recipe_name, variety_name')
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true);

      if (recipesData) {
        setRecipes(recipesData);
        if (recipeId) {
          const recipe = recipesData.find((r) => r.recipe_id === recipeId);
          if (recipe) {
            setSelectedRecipe(recipe);
          }
        }
      }

      // Fetch batches - actual columns: batchid, varietyid (FK)
      const { data: batchesData } = await supabase
        .from('seedbatches')
        .select('batchid, varietyid')
        .eq('farm_uuid', farmUuid);

      if (batchesData) {
        // Fetch variety names
        const varietyIds = batchesData
          .map(b => b.varietyid)
          .filter(id => id !== null && id !== undefined);
        
        let varietiesMap: Record<number, string> = {};
        if (varietyIds.length > 0) {
          const { data: varietiesData } = await supabase
            .from('varieties')
            .select('varietyid, name')
            .in('varietyid', varietyIds);
          
          varietiesMap = (varietiesData || []).reduce((acc, v) => {
            acc[v.varietyid] = v.name;
            return acc;
          }, {} as Record<number, string>);
        }
        
        // Normalize batches with variety names
        const normalized = batchesData.map((batch: any) => ({
          batch_id: batch.batchid, // Map for compatibility
          batchid: batch.batchid,
          variety_name: varietiesMap[batch.varietyid] || ''
        }));
        
        setBatches(normalized);
      }
    };

    fetchData();
  }, [recipeId]);

  useEffect(() => {
    if (selectedRecipeId) {
      const recipe = recipes.find((r) => r.recipe_id === selectedRecipeId);
      setSelectedRecipe(recipe);
    }
  }, [selectedRecipeId, recipes]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!selectedRecipeId) {
      setError('Please select a recipe');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) throw new Error('No session found');

      const { farmUuid, userId } = JSON.parse(sessionData);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await fetch(`${supabaseUrl}/functions/v1/create-tray`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          recipeId: selectedRecipeId,
          customerId: null,
          farmUuid,
          batchId: selectedBatchId || null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create tray');
      }

      if (result.tray) {
        onDataCreated(result.tray.tray_id);
        setTimeout(() => {
          onNext();
        }, 500);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create tray');
      setLoading(false);
    }
  };

  return (
    <div className="tray-step">
      <p style={{ color: '#5A6673', marginBottom: '2rem' }}>
        Trays are what you're actually growing. Let's create your first one!
      </p>

      <form onSubmit={handleSubmit}>
        <div className="modern-input-group">
          <label className="modern-input-label">Recipe *</label>
          <select
            className="modern-input modern-select"
            value={selectedRecipeId}
            onChange={(e) => setSelectedRecipeId(e.target.value ? parseInt(e.target.value) : '')}
            required
          >
            <option value="">Select a recipe</option>
            {recipes.map((recipe) => (
              <option key={recipe.recipe_id} value={recipe.recipe_id}>
                {recipe.recipe_name} ({recipe.variety_name})
              </option>
            ))}
          </select>
        </div>

        {batches.length > 0 && (
          <div className="modern-input-group">
            <label className="modern-input-label">Batch (Optional)</label>
            <select
              className="modern-input modern-select"
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value ? parseInt(e.target.value) : '')}
            >
              <option value="">No batch</option>
              {batches.map((batch) => (
                <option key={batch.batch_id} value={batch.batch_id}>
                  B-{batch.batch_id} - {batch.variety_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedRecipe && (
          <div className="tray-preview">
            <h4>Tray Preview</h4>
            <div className="tray-preview-item">
              <span className="tray-preview-label">Recipe:</span>
              <span className="tray-preview-value">{selectedRecipe.recipe_name}</span>
            </div>
            <div className="tray-preview-item">
              <span className="tray-preview-label">Variety:</span>
              <span className="tray-preview-value">{selectedRecipe.variety_name}</span>
            </div>
            <div className="tray-preview-item">
              <span className="tray-preview-label">Tray ID:</span>
              <span className="tray-preview-value">Auto-generated</span>
            </div>
            <p style={{ color: '#5A6673', fontSize: '0.875rem', marginTop: '1rem' }}>
              This tray will track all steps from your recipe automatically.
            </p>
          </div>
        )}

        {error && (
          <div style={{ color: '#E57373', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        <div className="flex gap-4 mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className="flex-1"
          >
            ← Back
          </Button>
          <Button
            type="submit"
            disabled={loading || !selectedRecipeId}
            className="flex-[2]"
          >
            {loading ? 'Creating...' : 'Create Tray →'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default TrayStep;

