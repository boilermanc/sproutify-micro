import { useState } from 'react';
import './TablePage.css';
import { Eye, Edit } from 'lucide-react';

const SuppliesPage = () => {
  const [supplies] = useState([
    { id: 1, name: '1020 Trays (No Holes)', category: 'Equipment', stock: 150, unit: 'pcs', status: 'In Stock' },
    { id: 2, name: 'Coco Coir Bricks', category: 'Growing Media', stock: 25, unit: 'bricks', status: 'Low Stock' },
    { id: 3, name: 'Sunflower Seeds (Black Oil)', category: 'Seeds', stock: 0, unit: 'lbs', status: 'Out of Stock' },
  ]);

  return (
    <div className="table-page">
      <div className="page-header">
        <div>
          <h1>Supplies</h1>
          <p className="subtitle">Manage your Supplies</p>
        </div>
        <button className="btn btn-primary" onClick={() => alert('Add Supply feature coming soon!')}>+ Add New</button>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Category</th>
              <th>Current Stock</th>
              <th>Unit</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {supplies.map(supply => (
              <tr key={supply.id}>
                <td className="font-semibold">{supply.name}</td>
                <td>{supply.category}</td>
                <td>{supply.stock}</td>
                <td>{supply.unit}</td>
                <td>
                  <span className={`status ${supply.status === 'In Stock' ? 'active' : supply.status === 'Low Stock' ? 'pending' : 'inactive'}`}>
                    {supply.status}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    <button className="action-icon" onClick={() => alert(`View supply: ${supply.name}`)}><Eye size={18} color="#5B7C99" /></button>
                    <button className="action-icon" onClick={() => alert(`Edit supply: ${supply.name}`)}><Edit size={18} color="#5B7C99" /></button>
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

export default SuppliesPage;
