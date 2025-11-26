import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import './steps.css';

interface RecipeStepProps {
  onNext: () => void;
  onBack: () => void;
  varietyId?: number;
  onDataCreated: (id: number) => void;
}

interface RecipeStep {
  step_order: number;
  step_description: string;
  duration_days: number;
}

const DEFAULT_STEPS: RecipeStep[] = [
  { step_order: 1, step_description: 'Soak seeds', duration_days: 0 },
  { step_order: 2, step_description: 'Sow seeds', duration_days: 0 },
  { step_order: 3, step_description: 'Blackout period', duration_days: 3 },
  { step_order: 4, step_description: 'Light exposure', duration_days: 4 },
  { step_order: 5, step_description: 'Harvest', duration_days: 0 },
];

const RecipeStep = ({ onNext, onBack, varietyId, onDataCreated }: RecipeStepProps) => {
  const [recipeName, setRecipeName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('Standard');
  const [steps, setSteps] = useState<RecipeStep[]>(DEFAULT_STEPS);
  const [varietyName, setVarietyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (varietyId) {
      const fetchVariety = async () => {
        const { data } = await supabase
          .from('varieties')
          .select('variety_name')
          .eq('variety_id', varietyId)
          .single();
        
        if (data) {
          setVarietyName(data.variety_name);
          setRecipeName(`${data.variety_name} Standard Recipe`);
        }
      };
      fetchVariety();
    }
  }, [varietyId]);

  const totalDays = steps.reduce((sum, step) => sum + step.duration_days, 0);

  const addStep = () => {
    const newStep: RecipeStep = {
      step_order: steps.length + 1,
      step_description: '',
      duration_days: 0,
    };
    setSteps([...steps, newStep]);
  };

  const removeStep = (index: number) => {
    const newSteps = steps.filter((_, i) => i !== index).map((step, i) => ({
      ...step,
      step_order: i + 1,
    }));
    setSteps(newSteps);
  };

  const updateStep = (index: number, field: keyof RecipeStep, value: string | number) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setSteps(newSteps);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!recipeName.trim()) {
      setError('Please enter a recipe name');
      return;
    }

    if (steps.some((step) => !step.step_description.trim())) {
      setError('Please fill in all step descriptions');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) throw new Error('No session found');

      const { farmUuid, userId } = JSON.parse(sessionData);

      // Create recipe
      const { data: recipe, error: recipeError } = await supabase
        .from('recipes')
        .insert({
          recipe_name: recipeName.trim(),
          description: description.trim() || null,
          type: type,
          variety_name: varietyName,
          farm_uuid: farmUuid,
          is_active: true,
          created_by: userId,
        })
        .select()
        .single();

      if (recipeError) throw recipeError;

      if (!recipe) throw new Error('Failed to create recipe');

      // Create steps
      const stepsData = steps.map((step) => ({
        recipe_id: recipe.recipe_id,
        step_order: step.step_order,
        step_description: step.step_description.trim(),
        duration_days: step.duration_days,
      }));

      const { error: stepsError } = await supabase.from('steps').insert(stepsData);

      if (stepsError) throw stepsError;

      onDataCreated(recipe.recipe_id);
      setTimeout(() => {
        onNext();
      }, 500);
    } catch (err: any) {
      setError(err.message || 'Failed to create recipe');
      setLoading(false);
    }
  };

  return (
    <div className="recipe-step">
      <form onSubmit={handleSubmit}>
        <div className="modern-input-group">
          <label className="modern-input-label">Recipe Name *</label>
          <input
            type="text"
            className="modern-input"
            value={recipeName}
            onChange={(e) => setRecipeName(e.target.value)}
            placeholder="e.g., Broccoli Sprouts Standard Recipe"
            required
          />
        </div>

        <div className="modern-input-group">
          <label className="modern-input-label">Description (Optional)</label>
          <textarea
            className="modern-input modern-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add any notes about this recipe"
          />
        </div>

        <div className="modern-input-group">
          <label className="modern-input-label">Type</label>
          <select
            className="modern-input modern-select"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="Standard">Standard</option>
            <option value="Organic">Organic</option>
            <option value="Hydroponic">Hydroponic</option>
            <option value="Soil">Soil</option>
          </select>
        </div>

        <div className="step-builder">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <label className="modern-input-label">Recipe Steps *</label>
            <button
              type="button"
              className="add-step-btn"
              onClick={addStep}
              style={{ width: 'auto', padding: '0.5rem 1rem' }}
            >
              <Plus size={16} style={{ marginRight: '0.5rem', display: 'inline' }} />
              Add Step
            </button>
          </div>

          {steps.map((step, index) => (
            <div key={index} className="step-item">
              <div className="step-item-number">{step.step_order}</div>
              <div className="step-item-content">
                <input
                  type="text"
                  className="modern-input"
                  value={step.step_description}
                  onChange={(e) => updateStep(index, 'step_description', e.target.value)}
                  placeholder="Step description"
                  style={{ marginBottom: '0.5rem' }}
                  required
                />
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="number"
                    className="modern-input"
                    value={step.duration_days}
                    onChange={(e) => updateStep(index, 'duration_days', parseInt(e.target.value) || 0)}
                    placeholder="Days"
                    min="0"
                    style={{ width: '100px' }}
                  />
                  <span style={{ color: '#5A6673', fontSize: '0.875rem' }}>days</span>
                </div>
              </div>
              <div className="step-item-actions">
                {steps.length > 1 && (
                  <button
                    type="button"
                    className="step-action-btn"
                    onClick={() => removeStep(index)}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
          ))}

          <div className="recipe-steps-preview">
            <h4>Total Growing Time</h4>
            <div className="total-days-badge">
              {totalDays} {totalDays === 1 ? 'day' : 'days'} to harvest
            </div>
          </div>
        </div>

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
            disabled={loading}
            className="flex-[2]"
          >
            {loading ? 'Creating...' : 'Create Recipe →'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default RecipeStep;

