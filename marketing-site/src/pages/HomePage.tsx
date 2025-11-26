import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiLayers, FiBookOpen, FiTruck, FiUsers, FiBarChart2, FiSmartphone } from 'react-icons/fi';
import GrowingMicrogreens from '../components/GrowingMicrogreens';
import './HomePage.css';
import LoginPage from './LoginPage';
import SignUpPage from './SignUpPage';

const HomePage = () => {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [showLogin, setShowLogin] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);

  const featureItems = [
    {
      icon: FiLayers,
      title: 'Tray Management',
      description: 'Track every tray from seed to harvest with detailed lifecycle monitoring and batch operations.',
    },
    {
      icon: FiBookOpen,
      title: 'Recipe Library',
      description: 'Create and manage growing recipes with step-by-step instructions for consistent quality.',
    },
    {
      icon: FiTruck,
      title: 'Order Management',
      description: 'Streamline customer orders, track fulfillment, and manage deliveries all in one place.',
    },
    {
      icon: FiUsers,
      title: 'Multi-User Support',
      description: 'Collaborate with your team with role-based access for owners, editors, and viewers.',
    },
    {
      icon: FiBarChart2,
      title: 'Inventory Tracking',
      description: 'Monitor supplies, seed batches, and vendors to keep your operation running smoothly.',
    },
    {
      icon: FiSmartphone,
      title: 'Mobile & Web Apps',
      description: 'Access your farm from anywhere with our web admin and mobile worker apps.',
    },
  ];

  return (
    <div className="home-page">
      {showLogin && (
        <div className="modal-overlay" onClick={() => setShowLogin(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowLogin(false)}>×</button>
            <LoginPage />
          </div>
        </div>
      )}

      {showSignUp && (
        <div className="modal-overlay" onClick={() => setShowSignUp(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSignUp(false)}>×</button>
            <SignUpPage />
          </div>
        </div>
      )}

      <header className="header">
        <div className="container">
          <div className="logo">Sproutify Micro</div>
            <nav className="nav">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <Link to="/contact">Contact</Link>
            <Link to="/login" className="btn-login" style={{ textDecoration: 'none', display: 'inline-block' }}>Login</Link>
            <button onClick={() => setShowSignUp(true)} className="btn btn-primary" style={{ padding: '0.6rem 1.25rem', fontSize: '0.9rem' }}>Sign Up Free</button>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="container hero-container">
          <div className="hero-content">
            <h1 className="hero-title">
              Manage Your Microgreen Farm<br />
              <span className="highlight">With Confidence</span>
            </h1>
            <p className="hero-subtitle">
              The complete management solution for microgreen growers. Track trays, manage batches,
              streamline orders, and grow your business with Sproutify Micro.
            </p>
            <p className="hero-trial-badge" style={{ 
              display: 'inline-block',
              background: '#E8F5E9',
              color: '#2E7D32',
              padding: '0.5rem 1.25rem',
              borderRadius: '50px',
              fontSize: '0.95rem',
              fontWeight: '600',
              marginBottom: '1.5rem'
            }}>
              🎉 Start your 7-day free trial - No credit card required
            </p>
            <div className="hero-actions">
              <button onClick={() => setShowSignUp(true)} className="btn btn-primary">Start Free Trial</button>
              <a href="#features" className="btn btn-secondary">Learn More</a>
            </div>
          </div>
          <div className="hero-visual">
            <GrowingMicrogreens />
          </div>
        </div>
      </section>

      <section id="features" className="features">
        <div className="container">
          <h2 className="section-title">Everything You Need to Grow</h2>
          <div className="features-grid">
            {featureItems.map(({ icon: Icon, title, description }) => (
              <div className="feature-card" key={title}>
                <div className="feature-icon" aria-hidden="true">
                  <Icon />
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="pricing">
        <div className="container">
          <h2 className="section-title">Simple, Transparent Pricing</h2>
          <p style={{ textAlign: 'center', color: '#636E72', marginBottom: '1rem', fontSize: '1.1rem' }}>
            Try any plan free for 7 days - No credit card required
          </p>
          <div className="pricing-toggle">
            <button 
              className={`toggle-btn ${billingPeriod === 'monthly' ? 'active' : ''}`} 
              onClick={() => setBillingPeriod('monthly')}
            >
              Monthly
            </button>
            <button 
              className={`toggle-btn ${billingPeriod === 'annual' ? 'active' : ''}`} 
              onClick={() => setBillingPeriod('annual')}
            >
              Annual
            </button>
          </div>
          <div className="pricing-grid">
            <div className="pricing-card">
              <h3>Starter</h3>
              <div className="price">
                {billingPeriod === 'monthly' ? (
                  <>
                    <span className="amount monthly">$29</span>
                    <span className="period monthly">/month</span>
                  </>
                ) : (
                  <>
                    <span className="amount annual">$290</span>
                    <span className="period annual">/year</span>
                  </>
                )}
              </div>
              {billingPeriod === 'annual' && (
                <p className="price-savings annual">Save $58/year</p>
              )}
              {billingPeriod === 'monthly' && (
                <p className="price-savings" style={{ color: '#2E7D32', fontWeight: '600' }}>7-day free trial</p>
              )}
              <ul className="features-list">
                <li>1 Farm Location</li>
                <li>Up to 3 Users</li>
                <li>500 Trays/month</li>
                <li>Basic Recipe Library</li>
                <li>Mobile App Access</li>
                <li>Email Support</li>
              </ul>
              <button onClick={() => setShowSignUp(true)} className="btn btn-secondary">Start Free Trial</button>
            </div>
            <div className="pricing-card featured">
              <div className="badge">Most Popular</div>
              <h3>Professional</h3>
              <div className="price">
                {billingPeriod === 'monthly' ? (
                  <>
                    <span className="amount monthly">$79</span>
                    <span className="period monthly">/month</span>
                  </>
                ) : (
                  <>
                    <span className="amount annual">$790</span>
                    <span className="period annual">/year</span>
                  </>
                )}
              </div>
              {billingPeriod === 'annual' && (
                <p className="price-savings annual">Save $158/year</p>
              )}
               {billingPeriod === 'monthly' && (
                <p className="price-savings" style={{ color: '#2E7D32', fontWeight: '600' }}>7-day free trial</p>
              )}
              <ul className="features-list">
                <li>3 Farm Locations</li>
                <li>Up to 10 Users</li>
                <li>Unlimited Trays</li>
                <li>Advanced Recipe Library</li>
                <li>Customer & Vendor Management</li>
                <li>Label Printing</li>
                <li>Priority Support</li>
              </ul>
              <button onClick={() => setShowSignUp(true)} className="btn btn-primary">Start Free Trial</button>
            </div>
            <div className="pricing-card">
              <h3>Enterprise</h3>
              <div className="price">
                <span className="amount">Custom</span>
              </div>
              <p className="price-savings">&nbsp;</p>
              <ul className="features-list">
                <li>Unlimited Farms</li>
                <li>Unlimited Users</li>
                <li>Unlimited Trays</li>
                <li>Custom Integrations</li>
                <li>API Access</li>
                <li>Dedicated Support</li>
                <li>Custom Training</li>
              </ul>
              <Link to="/contact" className="btn btn-secondary">Contact Us</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <div className="logo">Sproutify Micro</div>
              <p>&copy; 2025 Sproutify Micro. All rights reserved.</p>
            </div>
            <div className="footer-links">
              <div className="footer-column">
                <h4>Product</h4>
                <a href="#features">Features</a>
                <a href="#pricing">Pricing</a>
                <button onClick={() => setShowLogin(true)} style={{ background: 'none', border: 'none', color: '#B2BEC3', cursor: 'pointer', fontSize: '1rem', padding: 0 }}>Login</button>
              </div>
              <div className="footer-column">
                <h4>Company</h4>
                <Link to="/contact">Contact</Link>
                <Link to="/terms">Terms & Conditions</Link>
                <Link to="/privacy">Privacy Policy</Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
