import { useState } from 'react';
import './TablePage.css';

const VarietiesPage = () => {
  const [varieties] = useState([
    { id: 1, name: 'Sunflower', description: 'Nutty, crunchy microgreen', isActive: true },
    { id: 2, name: 'Pea Shoots', description: 'Sweet and tender', isActive: true },
    { id: 3, name: 'Radish', description: 'Spicy and colorful', isActive: true },
  ]);

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
            {varieties.map(v => (
              <tr key={v.id}>
                <td className="font-semibold">{v.name}</td>
                <td>{v.description}</td>
                <td><span className="status active">Active</span></td>
                <td>
                  <div className="actions">
                    <button className="action-icon" onClick={() => alert('Edit feature coming soon!')}>✏️</button>
                    <button className="action-icon" onClick={() => alert('Delete feature coming soon!')}>🗑️</button>
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

export default VarietiesPage;
