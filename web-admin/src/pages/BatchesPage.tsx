import { useState } from 'react';
import './TablePage.css';
import { Eye, Edit } from 'lucide-react';

const BatchesPage = () => {
  const [batches] = useState([
    { id: 1, batchId: 'B-2025-001', variety: 'Sunflower', sowDate: '2025-01-10', status: 'Growing', trays: 15 },
    { id: 2, batchId: 'B-2025-002', variety: 'Radish', sowDate: '2025-01-12', status: 'Harvested', trays: 8 },
    { id: 3, batchId: 'B-2025-003', variety: 'Pea Shoots', sowDate: '2025-01-14', status: 'Germinating', trays: 20 },
  ]);

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
              <th>Sow Date</th>
              <th>Trays</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {batches.map(batch => (
              <tr key={batch.id}>
                <td className="font-semibold">{batch.batchId}</td>
                <td>{batch.variety}</td>
                <td>{batch.sowDate}</td>
                <td>{batch.trays}</td>
                <td>
                  <span className={`status ${batch.status.toLowerCase() === 'growing' ? 'active' : batch.status.toLowerCase() === 'harvested' ? 'inactive' : 'pending'}`}>
                    {batch.status}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    <button className="action-icon" onClick={() => alert(`View details for ${batch.batchId}`)}><Eye size={18} color="#5B7C99" /></button>
                    <button className="action-icon" onClick={() => alert(`Edit ${batch.batchId}`)}><Edit size={18} color="#5B7C99" /></button>
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

export default BatchesPage;
