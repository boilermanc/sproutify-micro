import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Eye, Edit, ShoppingBasket } from 'lucide-react';
import EmptyState from '../components/onboarding/EmptyState';
import './TablePage.css';

const TraysPage = () => {
  const [trays, setTrays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrays = async () => {
      try {
        const sessionData = localStorage.getItem('sproutify_session');
        if (!sessionData) return;

        const { farmUuid } = JSON.parse(sessionData);

        const { data, error } = await supabase
          .from('trays')
          .select(`
            *,
            recipes!inner(variety_name, recipe_name),
            seedbatches(batch_id, variety_name)
          `)
          .eq('farm_uuid', farmUuid)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const formattedTrays = (data || []).map(tray => ({
          id: tray.tray_id,
          trayId: tray.tray_unique_id,
          batchId: tray.batch_id ? `B-${tray.batch_id}` : 'N/A',
          variety: tray.recipes?.variety_name || 'Unknown',
          location: 'N/A', // Location not in schema
          status: tray.harvest_date ? 'Harvested' : 'Growing'
        }));

        setTrays(formattedTrays);
      } catch (error) {
        console.error('Error fetching trays:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrays();
  }, []);

  if (loading) {
    return (
      <div className="table-page">
        <div className="page-header">
          <div>
            <h1>Trays</h1>
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
          <h1>Trays</h1>
          <p className="subtitle">Manage your Trays</p>
        </div>
        <button className="btn btn-primary" onClick={() => alert('Create Tray feature coming soon!')}>+ Add New</button>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tray ID</th>
              <th>Batch ID</th>
              <th>Variety</th>
              <th>Location</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {trays.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 0, border: 'none' }}>
                  <EmptyState
                    icon={<ShoppingBasket size={64} color="#5B7C99" />}
                    title="No Trays Yet"
                    description="Trays are your active growing containers. Track each tray from sowing to harvest to monitor your farm's progress."
                    actionLabel="+ Create Your First Tray"
                    actionPath="/trays"
                    showOnboardingLink={true}
                  />
                </td>
              </tr>
            ) : (
              trays.map(tray => (
              <tr key={tray.id}>
                <td className="font-semibold">{tray.trayId}</td>
                <td>{tray.batchId}</td>
                <td>{tray.variety}</td>
                <td>{tray.location}</td>
                <td>
                  <span className={`status ${tray.status.toLowerCase() === 'growing' ? 'active' : 'pending'}`}>
                    {tray.status}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    <button className="action-icon" onClick={() => alert(`View details for ${tray.trayId}`)}><Eye size={18} color="#5B7C99" /></button>
                    <button className="action-icon" onClick={() => alert(`Edit ${tray.trayId}`)}><Edit size={18} color="#5B7C99" /></button>
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

export default TraysPage;
