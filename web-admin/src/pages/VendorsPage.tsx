import { useState } from 'react';
import './TablePage.css';
import { Eye, Edit } from 'lucide-react';

const VendorsPage = () => {
  const [vendors] = useState([
    { id: 1, name: 'Seed Supply Co.', contact: 'Alice Johnson', email: 'alice@seedsupply.com', category: 'Seeds', active: true },
    { id: 2, name: 'Tray World', contact: 'Bob Smith', email: 'sales@trayworld.com', category: 'Equipment', active: true },
    { id: 3, name: 'Organic Soil Inc.', contact: 'Charlie Brown', email: 'info@organicsoil.com', category: 'Soil/Media', active: true },
  ]);

  return (
    <div className="table-page">
      <div className="page-header">
        <div>
          <h1>Vendors</h1>
          <p className="subtitle">Manage your Vendors</p>
        </div>
        <button className="btn btn-primary" onClick={() => alert('Create Vendor feature coming soon!')}>+ Add New</button>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact Person</th>
              <th>Email</th>
              <th>Category</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map(vendor => (
              <tr key={vendor.id}>
                <td className="font-semibold">{vendor.name}</td>
                <td>{vendor.contact}</td>
                <td>{vendor.email}</td>
                <td>{vendor.category}</td>
                <td>
                  <span className={`status ${vendor.active ? 'active' : 'inactive'}`}>
                    {vendor.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    <button className="action-icon" onClick={() => alert(`View vendor: ${vendor.name}`)}><Eye size={18} color="#5B7C99" /></button>
                    <button className="action-icon" onClick={() => alert(`Edit vendor: ${vendor.name}`)}><Edit size={18} color="#5B7C99" /></button>
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

export default VendorsPage;
