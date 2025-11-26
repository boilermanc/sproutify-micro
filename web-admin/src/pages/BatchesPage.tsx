import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Eye, Edit, Package } from 'lucide-react';
import EmptyState from '../components/onboarding/EmptyState';
import './TablePage.css';

const BatchesPage = () => {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBatches = async () => {
      try {
        const sessionData = localStorage.getItem('sproutify_session');
        if (!sessionData) return;

        const { farmUuid } = JSON.parse(sessionData);

        const { data, error } = await supabase
          .from('seedbatches')
          .select('*, vendors(vendor_name)')
          .eq('farm_uuid', farmUuid)
          .order('purchase_date', { ascending: false });

        if (error) throw error;

        // Get tray counts for each batch
        const batchesWithTrayCounts = await Promise.all(
          (data || []).map(async (batch) => {
            const { count } = await supabase
              .from('trays')
              .select('*', { count: 'exact', head: true })
              .eq('batch_id', batch.batch_id)
              .eq('farm_uuid', farmUuid);

            return {
              ...batch,
              trayCount: count || 0,
            };
          })
        );

        setBatches(batchesWithTrayCounts);
      } catch (error) {
        console.error('Error fetching batches:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBatches();
  }, []);

  if (loading) {
    return (
      <div className="table-page">
        <div className="page-header">
          <div>
            <h1>Batches</h1>
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
          <h1>Batches</h1>
          <p className="subtitle">Manage your Batches</p>
        </div>
        <button className="btn btn-primary" onClick={() => alert('Create Batch feature coming soon!')}>+ Add New</button>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Batch ID</th>
              <th>Variety</th>
              <th>Purchase Date</th>
              <th>Quantity</th>
              <th>Vendor</th>
              <th>Trays</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 0, border: 'none' }}>
                  <EmptyState
                    icon={<Package size={64} color="#5B7C99" />}
                    title="No Batches Yet"
                    description="Track your seed purchases to manage inventory. Batches help you keep track of where your seeds came from and when you purchased them."
                    actionLabel="+ Add Your First Batch"
                    actionPath="/batches"
                    showOnboardingLink={true}
                  />
                </td>
              </tr>
            ) : (
              batches.map(batch => (
                <tr key={batch.batch_id}>
                  <td className="font-semibold">B-{batch.batch_id}</td>
                  <td>{batch.variety_name}</td>
                  <td>{batch.purchase_date ? new Date(batch.purchase_date).toLocaleDateString() : 'N/A'}</td>
                  <td>{batch.quantity || 'N/A'}</td>
                  <td>{batch.vendors?.vendor_name || 'N/A'}</td>
                  <td>{batch.trayCount || 0}</td>
                <td>
                  <div className="actions">
                    <button className="action-icon" onClick={() => alert(`View details for ${batch.batchId}`)}><Eye size={18} color="#5B7C99" /></button>
                    <button className="action-icon" onClick={() => alert(`Edit ${batch.batchId}`)}><Edit size={18} color="#5B7C99" /></button>
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

export default BatchesPage;
