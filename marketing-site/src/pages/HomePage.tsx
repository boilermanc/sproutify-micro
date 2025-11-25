import { useState } from 'react';
import { Link } from 'react-router-dom';
import GrowingMicrogreens from '../components/GrowingMicrogreens';
import './HomePage.css';
import LoginPage from './LoginPage';

const HomePage = () => {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [showLogin, setShowLogin] = useState(false);

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

      <header className="header">
        <div className="container">
          <div className="logo">Sproutify Micro</div>
          <nav className="nav">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <Link to="/contact">Contact</Link>
            <button onClick={() => setShowLogin(true)} className="btn-login">Login</button>
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
            <div className="hero-actions">
              <button onClick={() => setShowLogin(true)} className="btn btn-primary">Get Started</button>
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
            <div className="feature-card">
              <div className="feature-icon">🌱</div>
              <h3>Tray Management</h3>
              <p>Track every tray from seed to harvest with detailed lifecycle monitoring and batch operations.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📋</div>
              <h3>Recipe Library</h3>
              <p>Create and manage growing recipes with step-by-step instructions for consistent quality.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📦</div>
              <h3>Order Management</h3>
              <p>Streamline customer orders, track fulfillment, and manage deliveries all in one place.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">👥</div>
              <h3>Multi-User Support</h3>
              <p>Collaborate with your team with role-based access for owners, editors, and viewers.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Inventory Tracking</h3>
              <p>Monitor supplies, seed batches, and vendors to keep your operation running smoothly.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📱</div>
              <h3>Mobile & Web Apps</h3>
              <p>Access your farm from anywhere with our web admin and mobile worker apps.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="pricing">
        <div className="container">
          <h2 className="section-title">Simple, Transparent Pricing</h2>
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
                <p className="price-savings">&nbsp;</p>
              )}
              <ul className="features-list">
                <li>1 Farm Location</li>
                <li>Up to 3 Users</li>
                <li>500 Trays/month</li>
                <li>Basic Recipe Library</li>
                <li>Mobile App Access</li>
                <li>Email Support</li>
              </ul>
              <button onClick={() => setShowLogin(true)} className="btn btn-secondary">Get Started</button>
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
                <p className="price-savings">&nbsp;</p>
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
              <button onClick={() => setShowLogin(true)} className="btn btn-primary">Get Started</button>
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
