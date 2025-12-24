import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import PreLaunchPage from './pages/PreLaunchPage';
import SproutifyLanding from './pages/SproutifyLanding';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import ContactPage from './pages/ContactPage';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import './App.css';

/**
 * Marketing Site App
 * 
 * NOTE: All routes in the marketing site are PUBLIC and do NOT require authentication.
 * The home page and all marketing pages are accessible without login.
 * Only the /login and /signup pages handle authentication, but they are also publicly accessible.
 * 
 * PRE-LAUNCH: Root path redirects to /pre-launch for pre-registration.
 * When ready to launch, remove the redirect and change root back to HomePage.
 */
function App() {
  return (
    <Router>
      <Routes>
        {/* Pre-launch: Redirect root to pre-launch page */}
        <Route path="/" element={<Navigate to="/pre-launch" replace />} />
        <Route path="/pre-launch" element={<SproutifyLanding />} />
        <Route path="/pre-launch-old" element={<PreLaunchPage />} />
        
        {/* Public routes - no authentication required */}
        <Route path="/home" element={<HomePage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </Router>
  );
}

export default App;
