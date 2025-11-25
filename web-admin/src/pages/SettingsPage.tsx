import './TablePage.css';

const SettingsPage = () => {
  return (
    <div className="table-page">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="subtitle">Manage your Settings</p>
        </div>
        <button className="btn btn-primary">+ Add New</button>
      </div>
      <div className="table-container">
        <p style={{padding: '2rem', textAlign: 'center', color: '#8A95A1'}}>
          Settings management coming soon...
        </p>
      </div>
    </div>
  );
};

export default SettingsPage;
