import { Check } from 'lucide-react';
import { useOnboarding } from '../../hooks/useOnboarding';
import './onboarding.css';

type ProgressIndicatorProps = {
  onStartStep?: (stepIndex: number) => void;
  onRestart?: () => void;
};

const ProgressIndicator = ({ onStartStep, onRestart }: ProgressIndicatorProps) => {
  const { state } = useOnboarding();

  if (state.onboarding_completed) return null;

  const items = [
    {
      id: 'variety',
      label: 'Add first variety',
      completed: state.onboarding_steps_completed.includes('varietyId'),
      stepIndex: 1,
    },
    {
      id: 'recipe',
      label: 'Create first recipe',
      completed: state.onboarding_steps_completed.includes('recipeId'),
      stepIndex: 2,
    },
    {
      id: 'batch',
      label: 'Add first batch',
      completed: state.onboarding_steps_completed.includes('batchId'),
      optional: true,
      stepIndex: 3,
    },
    {
      id: 'tray',
      label: 'Create first tray',
      completed: state.onboarding_steps_completed.includes('trayId'),
      stepIndex: 4,
    },
  ];

  const completedCount = items.filter((item) => item.completed).length;
  const progress = (completedCount / items.length) * 100;

  return (
    <div className="progress-indicator">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#2A3744' }}>Setup Progress</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#5A6673' }}>
            {completedCount}/{items.length}
          </span>
          {onRestart && (
            <button
              type="button"
              className="wizard-nav-btn wizard-btn-back"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
              onClick={onRestart}
            >
              Restart wizard
            </button>
          )}
        </div>
      </div>
      <div className="wizard-progress-bar" style={{ marginBottom: '1rem', background: '#E0E6ED' }}>
        <div
          className="wizard-progress-fill"
          style={{ width: `${progress}%`, background: '#5B7C99' }}
        />
      </div>
      <ul className="progress-checklist">
        {items.map((item) => (
          <li
            key={item.id}
            className={`progress-checklist-item ${item.completed ? 'completed' : ''}`}
          >
            <div className="checkmark-icon">
              {item.completed && <Check size={14} color="white" />}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem' }}>
                {item.label}
                {item.optional && <span style={{ color: '#8A95A1', marginLeft: '0.25rem' }}>(optional)</span>}
              </span>
              {onStartStep && (
                <button
                  type="button"
                  className="wizard-nav-btn wizard-btn-next"
                  style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                  onClick={() => onStartStep(item.stepIndex)}
                >
                  {item.completed ? 'Redo' : 'Start'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ProgressIndicator;

