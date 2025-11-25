import { useState } from 'react';
import './TablePage.css';
import { Eye, Edit } from 'lucide-react';

const TraysPage = () => {
  const [trays] = useState([
    { id: 1, trayId: 'TRY-001', batchId: 'B-2025-001', variety: 'Sunflower', location: 'Zone A - Rack 1', status: 'Growing' },
    { id: 2, trayId: 'TRY-002', batchId: 'B-2025-001', variety: 'Sunflower', location: 'Zone A - Rack 1', status: 'Growing' },
    { id: 3, trayId: 'TRY-003', batchId: 'B-2025-003', variety: 'Pea Shoots', location: 'Germination Chamber', status: 'Germinating' },
  ]);

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
            {trays.map(tray => (
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TraysPage;
