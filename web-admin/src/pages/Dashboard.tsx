import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { Sprout, Scissors, Package, User, ClipboardList, ShoppingBasket } from 'lucide-react';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalTrays: 0,
    activeTrays: 0,
    totalVarieties: 0,
    totalOrders: 0,
    recentHarvests: 0,
    upcomingHarvests: 0,
  });

  const [farmInfo, setFarmInfo] = useState({
    farmName: 'Demo Farm',
    farmUuid: 'demo-farm-uuid',
  });

  // Mock data for charts
  const harvestData = [
    { name: 'Mon', yield: 45 },
    { name: 'Tue', yield: 52 },
    { name: 'Wed', yield: 38 },
    { name: 'Thu', yield: 65 },
    { name: 'Fri', yield: 48 },
    { name: 'Sat', yield: 55 },
    { name: 'Sun', yield: 40 },
  ];

  const varietyData = [
    { name: 'Sunflower', value: 35 },
    { name: 'Pea Shoots', value: 25 },
    { name: 'Radish', value: 20 },
    { name: 'Broccoli', value: 15 },
    { name: 'Others', value: 5 },
  ];

  const COLORS = ['#5B7C99', '#4CAF50', '#FFB74D', '#E57373', '#90A4AE'];

  useEffect(() => {
    // In production, fetch from Supabase
    setStats({
      totalTrays: 156,
      activeTrays: 89,
      totalVarieties: 12,
      totalOrders: 34,
      recentHarvests: 23,
      upcomingHarvests: 45,
    });

    const session = localStorage.getItem('sproutify_session');
    if (session) {
      const { farmUuid } = JSON.parse(session);
      setFarmInfo({ farmName: 'Demo Farm', farmUuid });
    }
  }, []);

  return (
    <div className="dashboard">
      <div className="dashboard-hero fade-in-up">
        <div className="farm-identity">
          <div className="farm-icon-large">🌱</div>
          <div className="farm-text">
            <h1>{farmInfo.farmName}</h1>
            <p className="farm-location">Farm ID: {farmInfo.farmUuid}</p>
          </div>
        </div>
        <div className="welcome-message">
          <h2>Welcome back</h2>
          <p>Here's what's happening on your farm today.</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card primary fade-in-up" style={{animationDelay: '0.1s'}}>
          <div className="stat-icon"><ShoppingBasket className="icon-svg" /></div>
          <div className="stat-content">
            <h3>Active Trays</h3>
            <p className="stat-number">{stats.activeTrays}</p>
            <p className="stat-label">of {stats.totalTrays} total</p>
          </div>
        </div>

        <div className="stat-card success fade-in-up" style={{animationDelay: '0.2s'}}>
          <div className="stat-icon"><Sprout className="icon-svg" /></div>
          <div className="stat-content">
            <h3>Varieties</h3>
            <p className="stat-number">{stats.totalVarieties}</p>
            <p className="stat-label">in catalog</p>
          </div>
        </div>

        <div className="stat-card warning fade-in-up" style={{animationDelay: '0.3s'}}>
          <div className="stat-icon"><ClipboardList className="icon-svg" /></div>
          <div className="stat-content">
            <h3>Orders</h3>
            <p className="stat-number">{stats.totalOrders}</p>
            <p className="stat-label">active orders</p>
          </div>
        </div>

        <div className="stat-card info fade-in-up" style={{animationDelay: '0.4s'}}>
          <div className="stat-icon"><Scissors className="icon-svg" /></div>
          <div className="stat-content">
            <h3>Upcoming Harvests</h3>
            <p className="stat-number">{stats.upcomingHarvests}</p>
            <p className="stat-label">next 7 days</p>
          </div>
        </div>
      </div>

      <div className="charts-grid fade-in-up" style={{animationDelay: '0.5s'}}>
        <div className="chart-card">
          <h2>Weekly Harvest Yield (oz)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={harvestData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
              <Tooltip 
                cursor={{fill: '#F7F9FA'}}
                contentStyle={{
                  backgroundColor: '#FFF', 
                  borderRadius: '8px', 
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
              />
              <Bar dataKey="yield" fill="#5B7C99" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2>Tray Distribution by Variety</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={varietyData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {varietyData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{
                  backgroundColor: '#FFF', 
                  borderRadius: '8px', 
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
              />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card fade-in-up" style={{animationDelay: '0.6s'}}>
          <h2>Recent Activity</h2>
          <div className="activity-list">
            <div className="activity-item">
              <span className="activity-icon"><Sprout size={24} color="#5B7C99" /></span>
              <div className="activity-content">
                <p className="activity-text">New batch #123 created</p>
                <p className="activity-time">2 hours ago</p>
              </div>
            </div>
            <div className="activity-item">
              <span className="activity-icon"><Scissors size={24} color="#5B7C99" /></span>
              <div className="activity-content">
                <p className="activity-text">Harvested 15 trays of Sunflower</p>
                <p className="activity-time">5 hours ago</p>
              </div>
            </div>
            <div className="activity-item">
              <span className="activity-icon"><Package size={24} color="#5B7C99" /></span>
              <div className="activity-content">
                <p className="activity-text">Order #456 fulfilled</p>
                <p className="activity-time">1 day ago</p>
              </div>
            </div>
            <div className="activity-item">
              <span className="activity-icon"><User size={24} color="#5B7C99" /></span>
              <div className="activity-content">
                <p className="activity-text">New user added: John Doe</p>
                <p className="activity-time">2 days ago</p>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-card fade-in-up" style={{animationDelay: '0.7s'}}>
          <h2>Quick Actions</h2>
          <div className="quick-actions">
            <button className="action-btn" onClick={() => navigate('/trays')}>
              <span className="icon"><ShoppingBasket size={32} color="#5B7C99" /></span>
              <span>Create Tray</span>
            </button>
            <button className="action-btn" onClick={() => navigate('/batches')}>
              <span className="icon"><Package size={32} color="#5B7C99" /></span>
              <span>New Batch</span>
            </button>
            <button className="action-btn" onClick={() => navigate('/orders')}>
              <span className="icon"><ClipboardList size={32} color="#5B7C99" /></span>
              <span>New Order</span>
            </button>
            <button className="action-btn" onClick={() => navigate('/users')}>
              <span className="icon"><User size={32} color="#5B7C99" /></span>
              <span>Add User</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
