import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { getSupabaseClient } from '../../../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import './steps.css';

interface RecipeStepProps {
  onNext: () => void;
  onBack: () => void;
  varietyId?: number;
  onDataCreated: (id: number) => void;
}

interface RecipeStep {
  sequence_order: number;
  description_id: number | null;
  description_name: string;
  duration: number;
  duration_unit: 'Days' | 'Hours';
}

const DEFAULT_STEPS: RecipeStep[] = [
  { sequence_order: 1, description_id: null, description_name: '', duration: 0, duration_unit: 'Days' },
  { sequence_order: 2, description_id: null, description_name: '', duration: 0, duration_unit: 'Days' },
  { sequence_order: 3, description_id: null, description_name: '', duration: 3, duration_unit: 'Days' },
  { sequence_order: 4, description_id: null, description_name: '', duration: 4, duration_unit: 'Days' },
  { sequence_order: 5, description_id: null, description_name: '', duration: 0, duration_unit: 'Days' },
];

const RecipeStep = ({ onNext, onBack, varietyId, onDataCreated }: RecipeStepProps) => {
  const [recipeName, setRecipeName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('Standard');
  const [steps, setSteps] = useState<RecipeStep[]>(DEFAULT_STEPS);
  const [varietyName, setVarietyName] = useState('');
  const [stepDescriptions, setStepDescriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Fetch step descriptions
    const fetchStepDescriptions = async () => {
      const { data } = await getSupabaseClient()
        .from('step_descriptions')
        .select('description_id, description_name, description_details')
        .order('description_name', { ascending: true });
      
      if (data) {
        setStepDescriptions(data);
      }
    };

    fetchStepDescriptions();

    if (varietyId) {
      const fetchVariety = async () => {
        const { data } = await getSupabaseClient()
          .from('varieties')
          .select('varietyid, name')
          .eq('varietyid', varietyId)
          .single();
        
        if (data) {
          const name = data.name || '';
          setVarietyName(name);
          setRecipeName(`${name} Standard Recipe`);
        }
      };
      fetchVariety();
    }
  }, [varietyId]);

  // Calculate total days, accounting for duration_unit
  const totalDays = steps.reduce((sum, step) => {
    const duration = step.duration || 0;
    const unit = (step.duration_unit || 'Days').toUpperCase();
    
    if (unit === 'DAYS') {
      return sum + duration;
    } else if (unit === 'HOURS') {
      // Hours >= 12 counts as 1 day, otherwise 0
      return sum + (duration >= 12 ? 1 : 0);
    }
    return sum + duration; // default: treat as days
  }, 0);

  const addStep = () => {
    const newStep: RecipeStep = {
      sequence_order: steps.length + 1,
      description_id: null,
      description_name: '',
      duration: 0,
      duration_unit: 'Days',
    };
    setSteps([...steps, newStep]);
  };

  const removeStep = (index: number) => {
    const newSteps = steps.filter((_, i) => i !== index).map((step, i) => ({
      ...step,
      sequence_order: i + 1,
    }));
    setSteps(newSteps);
  };

  const updateStep = (index: number, field: keyof RecipeStep, value: string | number) => {
    setSteps(prev => {
      const newSteps = [...prev];
      newSteps[index] = { ...newSteps[index], [field]: value };
      return newSteps;
    });
  };

  const updateStepMultiple = (index: number, updates: Partial<RecipeStep>) => {
    setSteps(prev => {
      const newSteps = [...prev];
      newSteps[index] = { ...newSteps[index], ...updates };
      return newSteps;
    });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!recipeName.trim()) {
      setError('Please enter a recipe name');
      return;
    }

    if (steps.some((step) => !step.description_id)) {
      setError('Please select a description for all steps');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) throw new Error('No session found');

      const { farmUuid, userId } = JSON.parse(sessionData);

      // Create recipe with variety_id (FK) and variety_name (for backward compatibility)
      const { data: recipe, error: recipeError } = await getSupabaseClient()
        .from('recipes')
        .insert({
          recipe_name: recipeName.trim(),
          description: description.trim() || null,
          type: type,
          variety_id: varietyId, // Foreign key
          variety_name: varietyName, // Keep for backward compatibility
          farm_uuid: farmUuid,
          is_active: true,
          created_by: userId,
        })
        .select()
        .single();

      if (recipeError) throw recipeError;

      if (!recipe) throw new Error('Failed to create recipe');

      // Create steps with correct column names
      const stepsData = steps.map((step) => {
        const selectedDescription = stepDescriptions.find(sd => sd.description_id === step.description_id);
        return {
          recipe_id: recipe.recipe_id,
          sequence_order: step.sequence_order,
          description_id: step.description_id,
          description_name: selectedDescription?.description_name || step.description_name || 'Untitled Step',
          duration: step.duration || 0,
          duration_unit: step.duration_unit || 'Days',
        };
      });

      const { error: stepsError } = await getSupabaseClient().from('steps').insert(stepsData);

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
              <div className="step-item-number">{step.sequence_order}</div>
              <div className="step-item-content">
                <Select
                  value={step.description_id?.toString() || ''}
                  onValueChange={(value) => {
                    const selectedDesc = stepDescriptions.find(sd => sd.description_id.toString() === value);
                    const descId = selectedDesc ? parseInt(value, 10) : null;
                    updateStepMultiple(index, {
                      description_id: descId !== null && !isNaN(descId) ? descId : null,
                      description_name: selectedDesc?.description_name || '',
                    });
                  }}
                >
                  <SelectTrigger className="modern-input modern-select" style={{ marginBottom: '0.5rem' }}>
                    <SelectValue placeholder="Select step description" />
                  </SelectTrigger>
                  <SelectContent>
                    {stepDescriptions
                      .filter(desc => {
                        const name = desc.description_name.toLowerCase();
                        return !name.includes('nutrient application') && 
                               !name.includes('cleaning') && 
                               !name.includes('resting');
                      })
                      .map((desc) => (
                        <SelectItem key={desc.description_id} value={desc.description_id.toString()}>
                          {desc.description_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="number"
                    className="modern-input"
                    value={step.duration}
                    onChange={(e) => updateStep(index, 'duration', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    min="0"
                    step="0.1"
                    style={{ width: '80px' }}
                  />
                  <select
                    className="modern-input modern-select"
                    value={step.duration_unit}
                    onChange={(e) => updateStep(index, 'duration_unit', e.target.value as 'Days' | 'Hours')}
                    style={{ width: '120px' }}
                  >
                    <option value="Days">Days</option>
                    <option value="Hours">Hours</option>
                  </select>
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



