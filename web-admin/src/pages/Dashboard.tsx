import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
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
import { useOnboarding } from '../hooks/useOnboarding';
import WelcomeModal from '../components/onboarding/WelcomeModal';
import OnboardingWizard from '../components/onboarding/OnboardingWizard';
import ProgressIndicator from '../components/onboarding/ProgressIndicator';
import TrialBanner from '../components/onboarding/TrialBanner';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const { state, startWizard, startWizardAtStep, completeOnboarding } = useOnboarding();
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [trialEndDate, setTrialEndDate] = useState<string | null>(null);
  
  const [stats, setStats] = useState({
    totalTrays: 0,
    activeTrays: 0,
    totalVarieties: 0,
    totalOrders: 0,
    recentHarvests: 0,
    upcomingHarvests: 0,
  });

  const [farmInfo, setFarmInfo] = useState({
    farmName: '',
    farmUuid: '',
  });

  // Chart data (will be populated from Supabase)
  const [harvestData, setHarvestData] = useState([
    { name: 'Mon', yield: 0 },
    { name: 'Tue', yield: 0 },
    { name: 'Wed', yield: 0 },
    { name: 'Thu', yield: 0 },
    { name: 'Fri', yield: 0 },
    { name: 'Sat', yield: 0 },
    { name: 'Sun', yield: 0 },
  ]);

  const [varietyData, setVarietyData] = useState([
    { name: 'No Data', value: 1 },
  ]);

  const COLORS = ['#5B7C99', '#4CAF50', '#FFB74D', '#E57373', '#90A4AE'];

  useEffect(() => {
    // Check if onboarding should be shown
    const sessionData = localStorage.getItem('sproutify_session');
    if (sessionData) {
      const session = JSON.parse(sessionData);
      setTrialEndDate(session.trialEndDate || null);
      setFarmInfo((prev) => ({
        farmName: session.farmName || prev.farmName,
        farmUuid: session.farmUuid || prev.farmUuid,
      }));

      if (!state.onboarding_completed && !state.wizard_started) {
        setShowWelcomeModal(true);
      } else if (state.wizard_started && !state.onboarding_completed) {
        setShowWizard(true);
      }
    }
  }, [state.onboarding_completed, state.wizard_started]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const sessionData = localStorage.getItem('sproutify_session');
        if (!sessionData) return;

        const { farmUuid, farmName } = JSON.parse(sessionData);

        const { data: farmRecord } = await supabase
          .from('farms')
          .select('*')
          .eq('farm_uuid', farmUuid)
          .single();

        const resolvedFarmName =
          farmRecord?.farm_name ??
          farmRecord?.farmname ??
          farmName ??
          'My Farm';
        setFarmInfo({ farmName: resolvedFarmName, farmUuid });

        if (farmRecord?.trial_end_date) {
          setTrialEndDate((prev) => prev ?? farmRecord.trial_end_date);
        }

        // Fetch trays count
        const { count: totalTrays } = await supabase
          .from('trays')
          .select('*', { count: 'exact', head: true })
          .eq('farm_uuid', farmUuid);

        // Fetch active trays (trays without harvest_date)
        const { count: activeTrays } = await supabase
          .from('trays')
          .select('*', { count: 'exact', head: true })
          .eq('farm_uuid', farmUuid)
          .is('harvest_date', null);

        // Fetch varieties count
        const { count: totalVarieties } = await supabase
          .from('varieties')
          .select('*', { count: 'exact', head: true })
          .eq('farm_uuid', farmUuid)
          .eq('is_active', true);

        // Fetch recent harvests (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const { count: recentHarvests } = await supabase
          .from('trays')
          .select('*', { count: 'exact', head: true })
          .eq('farm_uuid', farmUuid)
          .not('harvest_date', 'is', null)
          .gte('harvest_date', sevenDaysAgo.toISOString());

        // Fetch upcoming harvests (next 7 days)
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const { count: upcomingHarvests } = await supabase
          .from('trays')
          .select('*', { count: 'exact', head: true })
          .eq('farm_uuid', farmUuid)
          .is('harvest_date', null)
          .gte('sow_date', today.toISOString())
          .lte('sow_date', nextWeek.toISOString());

        setStats({
          totalTrays: totalTrays || 0,
          activeTrays: activeTrays || 0,
          totalVarieties: totalVarieties || 0,
          totalOrders: 0, // Orders table doesn't exist in schema, keeping at 0
          recentHarvests: recentHarvests || 0,
          upcomingHarvests: upcomingHarvests || 0,
        });

        // Fetch harvest data for chart (last 7 days)
        const { data: harvestDataRaw } = await supabase
          .from('trays')
          .select('harvest_date, yield')
          .eq('farm_uuid', farmUuid)
          .not('harvest_date', 'is', null)
          .gte('harvest_date', sevenDaysAgo.toISOString())
          .order('harvest_date', { ascending: true });

        if (harvestDataRaw) {
          // Group by day and sum yields
          const dailyYields: { [key: string]: number } = {};
          harvestDataRaw.forEach(tray => {
            if (tray.harvest_date && tray.yield) {
              const date = new Date(tray.harvest_date).toLocaleDateString('en-US', { weekday: 'short' });
              dailyYields[date] = (dailyYields[date] || 0) + Number(tray.yield);
            }
          });

          // Convert to chart format
          const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
          const chartData = days.map(day => ({
            name: day,
            yield: dailyYields[day] || 0
          }));
          setHarvestData(chartData);
        }

        // Fetch variety distribution
        const { data: traysData } = await supabase
          .from('trays')
          .select(`
            recipe_id,
            recipes!inner(variety_name)
          `)
          .eq('farm_uuid', farmUuid)
          .is('harvest_date', null);

        if (traysData) {
          const varietyCounts: { [key: string]: number } = {};
          traysData.forEach((tray: any) => {
            const variety = tray.recipes?.variety_name || 'Unknown';
            varietyCounts[variety] = (varietyCounts[variety] || 0) + 1;
          });

          const varietyChartData = Object.entries(varietyCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
          setVarietyData(varietyChartData);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      }
    };

    fetchDashboardData();
  }, []);

  const handleWelcomeStart = () => {
    setShowWelcomeModal(false);
    startWizard();
    setShowWizard(true);
  };

  const handleWelcomeSkip = () => {
    setShowWelcomeModal(false);
    completeOnboarding();
  };

  const handleWizardComplete = () => {
    setShowWizard(false);
    completeOnboarding();
  };

  const handleWizardClose = () => {
    setShowWizard(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const friendlyGreeting = getGreeting();
  const todaySummary = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const trialEndLabel = trialEndDate
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
        new Date(trialEndDate)
      )
    : null;
  const shouldShowTrialBanner = false;

  return (
    <div className="dashboard">
      {showWelcomeModal && (
        <WelcomeModal
          farmName={farmInfo.farmName}
          onStart={handleWelcomeStart}
          onSkip={handleWelcomeSkip}
        />
      )}
      
      {showWizard && (
        <OnboardingWizard
          onComplete={handleWizardComplete}
          onClose={handleWizardClose}
        />
      )}

      <div className="dashboard-hero fade-in-up">
        <div className="farm-identity">
          <div className="farm-icon-large" aria-hidden="true">🌱</div>
          <div className="farm-text">
            <p className="hero-label">{friendlyGreeting}</p>
            <h1>{farmInfo.farmName || 'Your Farm'}</h1>
            <p className="hero-subtitle">It's {todaySummary}. Everything is synced and ready.</p>
            <div className="farm-meta">
              {trialEndLabel && (
                <span className="farm-pill subtle">Trial ends {trialEndLabel}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {!state.onboarding_completed && (
        <div style={{ marginBottom: '2rem' }}>
          <ProgressIndicator
            onStartStep={(stepIndex) => {
              setShowWelcomeModal(false);
              startWizardAtStep(stepIndex ?? 0);
              setShowWizard(true);
            }}
            onRestart={() => {
              setShowWelcomeModal(false);
              startWizardAtStep(0);
              setShowWizard(true);
            }}
          />
        </div>
      )}

      {shouldShowTrialBanner && <TrialBanner trialEndDate={trialEndDate} />}

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

