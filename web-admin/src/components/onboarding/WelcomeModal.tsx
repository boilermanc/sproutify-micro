import { useEffect, useState } from 'react';
import { useOnboarding } from '../../hooks/useOnboarding';
import './onboarding.css';

interface WelcomeModalProps {
  farmName: string;
  onStart: () => void;
  onSkip: () => void;
}

const WelcomeModal = ({ farmName, onStart, onSkip }: WelcomeModalProps) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isClosing, setIsClosing] = useState(false);

  const handleStart = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsVisible(false);
      onStart();
    }, 300);
  };

  const handleSkip = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsVisible(false);
      onSkip();
    }, 300);
  };

  if (!isVisible) return null;

  return (
    <div className={`welcome-modal-overlay ${isClosing ? 'closing' : ''}`} onClick={handleSkip}>
      <div className="welcome-modal" onClick={(e) => e.stopPropagation()}>
        <div className="welcome-modal-content">
          <h1>🌱 Welcome to {farmName}!</h1>
          <p>
            You're starting a <strong>7-day free trial</strong> of Sproutify Micro. 
            Let's get your farm set up in just a few minutes so you can start tracking 
            your microgreen operations right away.
          </p>
          <div className="welcome-modal-buttons">
            <button className="btn-modern btn-primary-modern" onClick={handleStart}>
              Let's Get Started
            </button>
            <button className="btn-modern btn-secondary-modern" onClick={handleSkip}>
              I'll Explore on My Own
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeModal;


