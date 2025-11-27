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
  const [availableBatches, setAvailableBatches] = useState<any[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | ''>(batchId || '');
  const [selectedRecipe, setSelectedRecipe] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Fetch all recipes with varieties join
      const { data: allRecipesData } = await supabase
        .from('recipes')
        .select(`
          recipe_id,
          recipe_name,
          variety_id,
          varieties!inner(varietyid, name, seed_quantity_grams)
        `)
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true);

      if (!allRecipesData) return;

      // Fetch all seedbatches with quantity and variety info
      const { data: batchesData } = await supabase
        .from('seedbatches')
        .select('batchid, varietyid, quantity, lot_number, purchasedate')
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true)
        .eq('status', 'active'); // Only active batches

      if (!batchesData) return;

      // Filter recipes to only include those with available inventory
      const recipesWithInventory = allRecipesData.filter((recipe: any) => {
        const varietyId = recipe.variety_id || recipe.varieties?.varietyid;
        const seedQuantityNeeded = recipe.varieties?.seed_quantity_grams || 0;
        
        if (!varietyId || !seedQuantityNeeded) return false;

        // Check if there's at least one batch for this variety with sufficient quantity
        const hasAvailableBatch = batchesData.some((batch: any) => {
          return batch.varietyid === varietyId && 
                 batch.quantity >= seedQuantityNeeded;
        });

        return hasAvailableBatch;
      });

      setRecipes(recipesWithInventory);
      
      if (recipeId) {
        const recipe = recipesWithInventory.find((r) => r.recipe_id === recipeId);
        if (recipe) {
          setSelectedRecipe(recipe);
        }
      }
    };

    fetchData();
  }, [recipeId]);

  useEffect(() => {
    const fetchAvailableBatches = async () => {
      if (!selectedRecipeId || !selectedRecipe) {
        setAvailableBatches([]);
        setSelectedBatchId('');
        return;
      }

      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);
      const varietyId = selectedRecipe.variety_id || selectedRecipe.varieties?.varietyid;
      const seedQuantityNeeded = selectedRecipe.varieties?.seed_quantity_grams || 0;

      if (!varietyId || !seedQuantityNeeded) {
        setAvailableBatches([]);
        return;
      }

      // Fetch batches for this variety with sufficient quantity
      const { data: batchesData } = await supabase
        .from('seedbatches')
        .select('batchid, varietyid, quantity, lot_number, purchasedate')
        .eq('farm_uuid', farmUuid)
        .eq('varietyid', varietyId)
        .eq('is_active', true)
        .eq('status', 'active')
        .gte('quantity', seedQuantityNeeded)
        .order('purchasedate', { ascending: false });

      if (batchesData) {
        // Fetch variety name
        const { data: varietyData } = await supabase
          .from('varieties')
          .select('varietyid, name')
          .eq('varietyid', varietyId)
          .single();

        const varietyName = varietyData?.name || '';

        // Normalize batches with variety name and available quantity
        const normalized = batchesData.map((batch: any) => ({
          batch_id: batch.batchid,
          batchid: batch.batchid,
          variety_name: varietyName,
          quantity: batch.quantity,
          lot_number: batch.lot_number,
          purchasedate: batch.purchasedate,
        }));

        setAvailableBatches(normalized);
      }
    };

    if (selectedRecipeId) {
      const recipe = recipes.find((r) => r.recipe_id === selectedRecipeId);
      setSelectedRecipe(recipe);
    }

    fetchAvailableBatches();
  }, [selectedRecipeId, recipes]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!selectedRecipeId || !selectedRecipe) {
      setError('Please select a recipe');
      return;
    }

    if (!selectedBatchId) {
      setError('Please select a seed batch');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) throw new Error('No session found');

      const { farmUuid, userId } = JSON.parse(sessionData);

      // Insert into tray_creation_requests - trigger will create the tray
      // Get variety name from join or fallback to text field
      const varietyName = selectedRecipe.varieties?.name || selectedRecipe.variety_name || '';
      
      const { error: requestError } = await supabase
        .from('tray_creation_requests')
        .insert({
          customer_name: null,
          variety_name: varietyName,
          recipe_name: selectedRecipe.recipe_name,
          farm_uuid: farmUuid,
          user_id: userId,
          requested_at: new Date().toISOString(),
          batch_id: selectedBatchId, // Now required
        });

      if (requestError) throw requestError;

      // Query for the newly created tray (trigger creates it)
      let query = supabase
        .from('trays')
        .select('tray_id')
        .eq('farm_uuid', farmUuid)
        .eq('created_by', userId)
        .eq('recipe_id', selectedRecipeId);

      // Add batch_id filter if provided
      if (selectedBatchId) {
        query = query.eq('batch_id', selectedBatchId);
      }

      const { data: trays, error: trayError } = await query
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (trayError) throw trayError;

      if (trays) {
        onDataCreated(trays.tray_id);
        setTimeout(() => {
          onNext();
        }, 500);
      } else {
        throw new Error('Tray was created but could not be retrieved');
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
            {recipes.map((recipe) => {
              const varietyName = recipe.varieties?.name || recipe.variety_name || 'N/A';
              return (
                <option key={recipe.recipe_id} value={recipe.recipe_id}>
                  {recipe.recipe_name} ({varietyName})
                </option>
              );
            })}
          </select>
        </div>

        {selectedRecipe && (
          <div className="modern-input-group">
            <label className="modern-input-label">Seed Batch *</label>
            {availableBatches.length === 0 ? (
              <div style={{ color: '#E57373', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                No batches available with sufficient inventory for this variety. 
                Please add a seed batch first.
              </div>
            ) : (
              <select
                className="modern-input modern-select"
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value ? parseInt(e.target.value) : '')}
                required
              >
                <option value="">Select a batch</option>
                {availableBatches.map((batch) => (
                  <option key={batch.batch_id} value={batch.batch_id}>
                    B-{batch.batch_id} - {batch.quantity}g available
                    {batch.lot_number ? ` (Lot: ${batch.lot_number})` : ''}
                  </option>
                ))}
              </select>
            )}
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
            disabled={loading || !selectedRecipeId || !selectedBatchId || availableBatches.length === 0}
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



