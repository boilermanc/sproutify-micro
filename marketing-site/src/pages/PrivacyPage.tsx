import { Link } from 'react-router-dom';
import './LegalPage.css';

const PrivacyPage = () => {
  return (
    <div className="legal-page">
      <div className="container">
        <Link to="/" className="back-link">← Back to Home</Link>
        <h1>Privacy Policy</h1>
        <p className="last-updated">Last updated: January 2025</p>

        <section>
          <h2>1. Information We Collect</h2>
          <p>
            We collect information you provide directly to us, including name, email address, farm
            information, and operational data related to your microgreen farming activities.
          </p>
        </section>

        <section>
          <h2>2. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide, maintain, and improve our services</li>
            <li>Process transactions and send related information</li>
            <li>Send technical notices and support messages</li>
            <li>Respond to your comments and questions</li>
            <li>Monitor and analyze trends and usage</li>
          </ul>
        </section>

        <section>
          <h2>3. Data Storage and Security</h2>
          <p>
            Your data is stored securely using Supabase infrastructure with industry-standard
            encryption. We implement appropriate technical and organizational measures to protect
            your personal information.
          </p>
        </section>

        <section>
          <h2>4. Data Sharing</h2>
          <p>
            We do not sell, trade, or rent your personal information to third parties. We may share
            your information only in the following circumstances:
          </p>
          <ul>
            <li>With your consent</li>
            <li>To comply with legal obligations</li>
            <li>To protect our rights and prevent fraud</li>
            <li>With service providers who assist in our operations</li>
          </ul>
        </section>

        <section>
          <h2>5. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Export your data</li>
            <li>Opt-out of marketing communications</li>
          </ul>
        </section>

        <section>
          <h2>6. Cookies and Tracking</h2>
          <p>
            We use cookies and similar tracking technologies to track activity on our service and
            hold certain information to improve and analyze our service.
          </p>
        </section>

        <section>
          <h2>7. Children's Privacy</h2>
          <p>
            Our service is not intended for individuals under the age of 18. We do not knowingly
            collect personal information from children.
          </p>
        </section>

        <section>
          <h2>8. Changes to This Policy</h2>
          <p>
            We may update our Privacy Policy from time to time. We will notify you of any changes
            by posting the new Privacy Policy on this page and updating the "Last updated" date.
          </p>
        </section>

        <section>
          <h2>9. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us via our{' '}
            <Link to="/contact">contact page</Link>.
          </p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPage;
