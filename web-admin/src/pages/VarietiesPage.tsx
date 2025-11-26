import { useState, useEffect } from 'react';
import { Sprout } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import EmptyState from '../components/onboarding/EmptyState';
import './TablePage.css';

const VarietiesPage = () => {
  const [varieties, setVarieties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVarieties = async () => {
      try {
        const sessionData = localStorage.getItem('sproutify_session');
        if (!sessionData) return;

        const { farmUuid } = JSON.parse(sessionData);

        const fetchWithColumn = async (column: string) =>
          supabase
            .from('varieties')
            .select('*')
            .eq(column as any, farmUuid)
            .order('variety_name', { ascending: true });

        let { data, error } = await fetchWithColumn('farm_uuid');

        if (error?.code === '42703') {
          ({ data, error } = await fetchWithColumn('farmuuid'));
        }

        if (error) throw error;

        setVarieties(data || []);
      } catch (error) {
        console.error('Error fetching varieties:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchVarieties();
  }, []);

  if (loading) {
    return (
      <div className="table-page">
        <div className="page-header">
          <div>
            <h1>Microgreen Varieties</h1>
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
          <h1>Microgreen Varieties</h1>
          <p className="subtitle">Manage your microgreen catalog</p>
        </div>
        <button className="btn btn-primary" onClick={() => alert('Add Variety feature coming soon!')}>+ Add Variety</button>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {varieties.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: 0, border: 'none' }}>
                  <EmptyState
                    icon={<Sprout size={64} color="#5B7C99" />}
                    title="No Varieties Yet"
                    description="Varieties are the types of microgreens you grow. Add your first variety to get started!"
                    actionLabel="+ Add Your First Variety"
                    actionPath="/varieties"
                    showOnboardingLink={true}
                  />
                </td>
              </tr>
            ) : (
              varieties.map(v => (
                <tr key={v.variety_id}>
                  <td className="font-semibold">{v.variety_name}</td>
                  <td>{v.description || 'No description'}</td>
                  <td><span className={`status ${v.is_active ? 'active' : 'inactive'}`}>{v.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div className="actions">
                    <button className="action-icon" onClick={() => alert('Edit feature coming soon!')}>✏️</button>
                    <button className="action-icon" onClick={() => alert('Delete feature coming soon!')}>🗑️</button>
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

export default VarietiesPage;
