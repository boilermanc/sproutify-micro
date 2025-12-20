import { useState } from 'react';
import { getSupabaseClient } from '../../../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import './steps.css';

interface VarietyStepProps {
  onNext: () => void;
  onDataCreated: (id: number) => void;
}

const VARIETY_SUGGESTIONS = [
  'Broccoli Sprouts',
  'Pea Shoots',
  'Sunflower',
  'Radish',
  'Arugula',
  'Kale',
  'Cilantro',
];

const VarietyStep = ({ onNext, onDataCreated }: VarietyStepProps) => {
  const [varietyName, setVarietyName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSuggestionClick = (suggestion: string) => {
    setSelectedSuggestion(suggestion);
    setVarietyName(suggestion);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!varietyName.trim()) {
      setError('Please enter a variety name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) throw new Error('No session found');

      // farmUuid not needed for varieties (they're global)
      // const { farmUuid } = JSON.parse(sessionData);

      // Use actual DB column names: name (not variety_name), no farm_uuid
      const payload = {
        name: varietyName.trim(), // DB column is 'name'
        description: description.trim() || null,
        // No farm_uuid - varieties are global
      };

      const { data, error: insertError } = await getSupabaseClient()
        .from('varieties')
        .insert(payload)
        .select()
        .single();

      if (insertError) throw insertError;

      if (data) {
        // Map varietyid to variety_id for consistency
        const varietyId = data.varietyid || data.variety_id;
        onDataCreated(varietyId);
        setTimeout(() => {
          onNext();
        }, 500);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create variety');
      setLoading(false);
    }
  };

  return (
    <div className="variety-step">
      <div className="variety-suggestions">
        {VARIETY_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className={`variety-suggestion-btn ${selectedSuggestion === suggestion ? 'selected' : ''}`}
            onClick={() => handleSuggestionClick(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="modern-input-group">
          <label className="modern-input-label">Variety Name *</label>
          <input
            type="text"
            className="modern-input"
            value={varietyName}
            onChange={(e) => {
              setVarietyName(e.target.value);
              setSelectedSuggestion(null);
            }}
            placeholder="e.g., Broccoli Sprouts"
            required
          />
        </div>

        <div className="modern-input-group">
          <label className="modern-input-label">Description (Optional)</label>
          <textarea
            className="modern-input modern-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Fast-growing, mild flavor, high yield"
          />
        </div>

        {error && (
          <div style={{ color: '#E57373', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full"
        >
          {loading ? 'Creating...' : 'Create Variety →'}
        </Button>
      </form>
    </div>
  );
};

export default VarietyStep;

