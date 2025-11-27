import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { Button } from '@/components/ui/button';
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
        // Actual DB column: varietyid, name (not variety_id, variety_name)
        const { data } = await supabase
          .from('varieties')
          .select('varietyid, name')
          .eq('varietyid', varietyId)
          .single();
        
        if (data) {
          setVarietyName(data.name || data.variety_name || '');
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

      // seedbatches table uses varietyid (FK), not variety_name
      // Use the varietyId prop that was passed in
      if (!varietyId) {
        throw new Error('Variety ID is required');
      }

      const { data, error: insertError } = await supabase
        .from('seedbatches')
        .insert({
          varietyid: varietyId, // Actual column: varietyid (FK to varieties.varietyid)
          purchasedate: purchaseDate, // Actual column: purchasedate
          quantity: parseFloat(quantity),
          vendorid: vendorId || null, // Actual column: vendorid
          farm_uuid: farmUuid,
          status: 'new', // Required field
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (data) {
        onDataCreated(data.batchid || data.batch_id); // Actual column: batchid
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
            {loading ? 'Creating...' : 'Add Batch →'}
          </Button>
        </div>
      </form>

      <div className="mt-6 text-center">
        <Button
          type="button"
          variant="ghost"
          onClick={onSkip}
          className="text-sm"
        >
          Skip for now →
        </Button>
        <p style={{ color: '#8A95A1', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          You can add batches later when you purchase seeds
        </p>
      </div>
    </div>
  );
};

export default BatchStep;



