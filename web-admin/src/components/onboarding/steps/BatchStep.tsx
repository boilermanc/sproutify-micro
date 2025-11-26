import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import './steps.css';

interface BatchStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  varietyId?: number;
  onDataCreated: (id: number) => void;
}

const BatchStep = ({ onNext, onBack, onSkip, varietyId, onDataCreated }: BatchStepProps) => {
  const [varietyName, setVarietyName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [quantity, setQuantity] = useState('');
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [vendors, setVendors] = useState<any[]>([]);
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
        }
      };
      fetchVariety();
    }

    const fetchVendors = async () => {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);
      const { data } = await supabase
        .from('vendors')
        .select('vendor_id, vendor_name')
        .eq('farm_uuid', farmUuid);

      if (data) {
        setVendors(data);
      }
    };

    fetchVendors();
  }, [varietyId]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!quantity.trim()) {
      setError('Please enter a quantity');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) throw new Error('No session found');

      const { farmUuid } = JSON.parse(sessionData);

      const { data, error: insertError } = await supabase
        .from('seedbatches')
        .insert({
          variety_name: varietyName,
          purchase_date: purchaseDate,
          quantity: parseFloat(quantity),
          vendor_id: vendorId || null,
          farm_uuid: farmUuid,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (data) {
        onDataCreated(data.batch_id);
        setTimeout(() => {
          onNext();
        }, 500);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create batch');
      setLoading(false);
    }
  };

  return (
    <div className="batch-step">
      <p style={{ color: '#5A6673', marginBottom: '2rem' }}>
        Track your seed purchases to manage inventory. You can skip this step and add batches later.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="modern-input-group">
          <label className="modern-input-label">Variety</label>
          <input
            type="text"
            className="modern-input"
            value={varietyName}
            disabled
            style={{ background: '#F7F9FA', cursor: 'not-allowed' }}
          />
        </div>

        <div className="modern-input-group">
          <label className="modern-input-label">Purchase Date</label>
          <input
            type="date"
            className="modern-input"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            required
          />
        </div>

        <div className="modern-input-group">
          <label className="modern-input-label">Quantity *</label>
          <input
            type="text"
            className="modern-input"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g., 1000g or 1 lb"
            required
          />
        </div>

        {vendors.length > 0 && (
          <div className="modern-input-group">
            <label className="modern-input-label">Vendor (Optional)</label>
            <select
              className="modern-input modern-select"
              value={vendorId || ''}
              onChange={(e) => setVendorId(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">No vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.vendor_id} value={vendor.vendor_id}>
                  {vendor.vendor_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <div style={{ color: '#E57373', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
          <button
            type="button"
            className="btn-modern btn-secondary-modern"
            onClick={onBack}
            style={{ flex: 1 }}
          >
            ← Back
          </button>
          <button
            type="submit"
            className="btn-modern btn-primary-modern"
            disabled={loading}
            style={{ flex: 2 }}
          >
            {loading ? 'Creating...' : 'Add Batch →'}
          </button>
        </div>
      </form>

      <div className="skip-section">
        <button
          type="button"
          className="wizard-btn-skip"
          onClick={onSkip}
          style={{ fontSize: '1rem', padding: '0.75rem 1.5rem' }}
        >
          Skip for now →
        </button>
        <p style={{ color: '#8A95A1', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          You can add batches later when you purchase seeds
        </p>
      </div>
    </div>
  );
};

export default BatchStep;

