import { Link } from 'react-router-dom';
import './LegalPage.css';

const TermsPage = () => {
  return (
    <div className="legal-page">
      <div className="container">
        <Link to="/" className="back-link">← Back to Home</Link>
        <h1>Terms & Conditions</h1>
        <p className="last-updated">Last updated: January 2025</p>

        <section>
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing and using Sproutify Micro, you accept and agree to be bound by the terms
            and provision of this agreement.
          </p>
        </section>

        <section>
          <h2>2. Use License</h2>
          <p>
            Permission is granted to use Sproutify Micro for managing your microgreen farming
            operations. This license shall automatically terminate if you violate any of these
            restrictions.
          </p>
        </section>

        <section>
          <h2>3. Service Description</h2>
          <p>
            Sproutify Micro provides farm management software including tray tracking, recipe
            management, order processing, and inventory management for microgreen operations.
          </p>
        </section>

        <section>
          <h2>4. User Accounts</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account and password.
            You agree to accept responsibility for all activities that occur under your account.
          </p>
        </section>

        <section>
          <h2>5. Payment Terms</h2>
          <p>
            Subscription fees are billed in advance on a monthly or annual basis. All fees are
            non-refundable except as required by law.
          </p>
        </section>

        <section>
          <h2>6. Data Ownership</h2>
          <p>
            You retain all rights to your data. We claim no intellectual property rights over the
            material you provide to the service.
          </p>
        </section>

        <section>
          <h2>7. Service Modifications</h2>
          <p>
            We reserve the right to modify or discontinue the service with or without notice. We
            shall not be liable to you or any third party for any modification or discontinuance.
          </p>
        </section>

        <section>
          <h2>8. Limitation of Liability</h2>
          <p>
            Sproutify Micro shall not be liable for any indirect, incidental, special, consequential
            or punitive damages resulting from your use or inability to use the service.
          </p>
        </section>

        <section>
          <h2>9. Contact Information</h2>
          <p>
            Questions about the Terms of Service should be sent to us via our{' '}
            <Link to="/contact">contact page</Link>.
          </p>
        </section>
      </div>
    </div>
  );
};

export default TermsPage;
