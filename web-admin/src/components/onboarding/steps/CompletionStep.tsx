import { useState, useEffect } from 'react';
import { Check, Sprout, ShoppingBasket, Package, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '../../../hooks/useOnboarding';
import './steps.css';

interface CompletionStepProps {
  onComplete: () => void;
  onBack: () => void;
}

const CompletionStep = ({ onComplete, onBack }: CompletionStepProps) => {
  const navigate = useNavigate();
  const { state } = useOnboarding();
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    setShowConfetti(true);
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  const checklistItems = [
    {
      id: 'variety',
      label: 'Added your first variety',
      icon: <Sprout size={20} />,
      completed: state.onboarding_steps_completed.includes('varietyId'),
    },
    {
      id: 'recipe',
      label: 'Created your first recipe',
      icon: <ClipboardList size={20} />,
      completed: state.onboarding_steps_completed.includes('recipeId'),
    },
    {
      id: 'tray',
      label: 'Created your first tray',
      icon: <ShoppingBasket size={20} />,
      completed: state.onboarding_steps_completed.includes('trayId'),
    },
  ];

  const nextSteps = [
    {
      title: 'Add More Varieties',
      description: 'Expand your catalog',
      icon: <Sprout size={24} color="#5B7C99" />,
      onClick: () => {
        onComplete();
        navigate('/varieties');
      },
    },
    {
      title: 'Create More Trays',
      description: 'Start tracking',
      icon: <ShoppingBasket size={24} color="#5B7C99" />,
      onClick: () => {
        onComplete();
        navigate('/trays');
      },
    },
    {
      title: 'Add Customers',
      description: 'Track orders',
      icon: <Package size={24} color="#5B7C99" />,
      onClick: () => {
        onComplete();
        navigate('/customers');
      },
    },
    {
      title: 'Explore Dashboard',
      description: 'See your stats',
      icon: <ClipboardList size={24} color="#5B7C99" />,
      onClick: () => {
        onComplete();
        navigate('/');
      },
    },
  ];

  return (
    <div className="completion-step">
      {showConfetti && (
        <div className="celebration">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="confetti"
              style={{
                left: `${Math.random() * 100}%`,
                background: ['#5B7C99', '#4CAF50', '#FFB74D', '#E57373', '#90A4AE'][
                  Math.floor(Math.random() * 5)
                ],
                animationDelay: `${Math.random() * 0.5}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="completion-celebration">
        <div className="success-checkmark">
          <div className="success-checkmark-circle">
            <div className="success-checkmark-check" />
          </div>
        </div>
        <h2 style={{ fontSize: '2rem', fontWeight: 700, color: '#2A3744', marginBottom: '0.5rem' }}>
          🎉 You're All Set!
        </h2>
        <p style={{ color: '#5A6673', fontSize: '1.1rem' }}>
          Your farm is ready to go. Start tracking your microgreens!
        </p>
      </div>

      <div className="completion-checklist">
        <h3 style={{ color: '#2A3744', marginBottom: '1rem' }}>What You've Accomplished:</h3>
        {checklistItems.map((item, index) => (
          <div
            key={item.id}
            className={`completion-checklist-item ${item.completed ? 'completed' : ''}`}
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="checkmark-icon">
              {item.completed && <Check size={16} color="white" />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {item.icon}
              <span>{item.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 style={{ color: '#2A3744', marginBottom: '1rem' }}>Suggested Next Steps:</h3>
        <div className="completion-next-steps">
          {nextSteps.map((step, index) => (
            <button
              key={index}
              className="completion-next-step-btn"
              onClick={step.onClick}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div style={{ marginBottom: '0.5rem' }}>{step.icon}</div>
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{step.title}</div>
              <div style={{ fontSize: '0.875rem', color: '#5A6673' }}>{step.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
        <button
          type="button"
          className="btn-modern btn-secondary-modern"
          onClick={onBack}
          style={{ flex: 1 }}
        >
          ← Back
        </button>
        <button
          type="button"
          className="btn-modern btn-primary-modern"
          onClick={onComplete}
          style={{ flex: 2 }}
        >
          Start Using Sproutify →
        </button>
      </div>
    </div>
  );
};

export default CompletionStep;

