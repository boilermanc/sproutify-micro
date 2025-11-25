import { useState } from 'react';
import './TablePage.css';
import { Eye, Edit } from 'lucide-react';

const CustomersPage = () => {
  const [customers] = useState([
    { id: 1, name: 'Local Market', email: 'orders@localmarket.com', phone: '555-0101', type: 'Retail', active: true },
    { id: 2, name: 'Fresh Cafe', email: 'manager@freshcafe.com', phone: '555-0102', type: 'Restaurant', active: true },
    { id: 3, name: 'Green Grocer', email: 'buyer@greengrocer.com', phone: '555-0103', type: 'Wholesale', active: false },
  ]);

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
              <th>Type</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map(customer => (
              <tr key={customer.id}>
                <td className="font-semibold">{customer.name}</td>
                <td>{customer.email}</td>
                <td>{customer.phone}</td>
                <td>{customer.type}</td>
                <td>
                  <span className={`status ${customer.active ? 'active' : 'inactive'}`}>
                    {customer.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    <button className="action-icon" onClick={() => alert(`View customer: ${customer.name}`)}><Eye size={18} color="#5B7C99" /></button>
                    <button className="action-icon" onClick={() => alert(`Edit customer: ${customer.name}`)}><Edit size={18} color="#5B7C99" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CustomersPage;
