import { Check } from 'lucide-react';
import { useOnboarding } from '../../hooks/useOnboarding';
import './onboarding.css';

type ProgressIndicatorProps = {
  onStartStep?: (stepIndex: number) => void;
  onRestart?: () => void;
};

const ProgressIndicator = ({ onStartStep, onRestart }: ProgressIndicatorProps) => {
  const { state } = useOnboarding();

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#5A6673', fontWeight: 600 }}>
            {completedCount} of {items.length} steps completed
          </span>
          {state.onboarding_completed && (
            <span style={{ 
              fontSize: '0.75rem', 
              color: '#10b981', 
              backgroundColor: '#d1fae5',
              padding: '0.125rem 0.5rem',
              borderRadius: '0.375rem',
              fontWeight: 600
            }}>
              ✓ Complete
            </span>
          )}
        </div>
      </div>
      <div className="wizard-progress-bar" style={{ marginBottom: '1rem', background: '#E0E6ED', position: 'relative', height: '1.5rem', borderRadius: '0.375rem', overflow: 'hidden' }}>
        <div
          className="wizard-progress-fill"
          style={{ 
            width: `${progress}%`, 
            background: state.onboarding_completed ? '#10b981' : '#5B7C99',
            transition: 'width 0.3s ease, background 0.3s ease',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: '0.5rem'
          }}
        >
          {state.onboarding_completed && (
            <span style={{
              color: 'white',
              fontSize: '0.75rem',
              fontWeight: 700,
              textShadow: '0 1px 2px rgba(0,0,0,0.2)'
            }}>
              ✓ 100%
            </span>
          )}
        </div>
        {!state.onboarding_completed && progress > 0 && (
          <div style={{
            position: 'absolute',
            right: '0.5rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#374151',
            fontSize: '0.75rem',
            fontWeight: 600
          }}>
            {Math.round(progress)}%
          </div>
        )}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: item.completed ? 600 : 400, color: item.completed ? '#10b981' : '#374151' }}>
                  {item.label}
                  {item.completed && <span style={{ color: '#10b981', marginLeft: '0.5rem' }}>✓</span>}
                </span>
                {item.optional && (
                  <span style={{ color: '#8A95A1', fontSize: '0.75rem', marginTop: '-0.125rem' }}>(optional)</span>
                )}
                {item.completed && (
                  <span style={{ color: '#6b7280', fontSize: '0.75rem', fontStyle: 'italic' }}>
                    Completed
                  </span>
                )}
              </div>
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

