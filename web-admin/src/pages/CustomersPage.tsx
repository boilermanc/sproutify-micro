import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import './TablePage.css';
import { Eye, Edit } from 'lucide-react';

const CustomersPage = () => {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const sessionData = localStorage.getItem('sproutify_session');
        if (!sessionData) return;

        const { farmUuid } = JSON.parse(sessionData);

        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .eq('farm_uuid', farmUuid)
          .order('customer_name', { ascending: true });

        if (error) throw error;

        setCustomers(data || []);
      } catch (error) {
        console.error('Error fetching customers:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  if (loading) {
    return (
      <div className="table-page">
        <div className="page-header">
          <div>
            <h1>Customers</h1>
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
          <h1>Customers</h1>
          <p className="subtitle">Manage your Customers</p>
        </div>
        <button className="btn btn-primary" onClick={() => alert('Create Customer feature coming soon!')}>+ Add New</button>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Address</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                  No customers found. Add your first customer to get started!
                </td>
              </tr>
            ) : (
              customers.map(customer => (
                <tr key={customer.customer_id}>
                  <td className="font-semibold">{customer.customer_name}</td>
                  <td>{customer.email || 'N/A'}</td>
                  <td>{customer.phone || 'N/A'}</td>
                  <td>{customer.address || 'N/A'}</td>
                <td>
                  <div className="actions">
                    <button className="action-icon" onClick={() => alert(`View customer: ${customer.name}`)}><Eye size={18} color="#5B7C99" /></button>
                    <button className="action-icon" onClick={() => alert(`Edit customer: ${customer.name}`)}><Edit size={18} color="#5B7C99" /></button>
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

export default CustomersPage;
