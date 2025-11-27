import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useOnboarding } from '../../hooks/useOnboarding';
import './onboarding.css';

interface ContextualTooltipProps {
  id: string;
  title: string;
  content: string;
  targetSelector?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  onDismiss?: () => void;
}

const ContextualTooltip = ({
  id,
  title,
  content,
  targetSelector,
  position = 'bottom',
  onDismiss,
}: ContextualTooltipProps) => {
  const { state, dismissTooltip } = useOnboarding();
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.tooltips_dismissed.includes(id)) {
      setIsVisible(false);
      return;
    }

    if (targetSelector) {
      const target = document.querySelector(targetSelector);
      if (target) {
        const rect = target.getBoundingClientRect();
        const tooltipRect = tooltipRef.current?.getBoundingClientRect();

        let top = 0;
        let left = 0;

        switch (position) {
          case 'top':
            top = rect.top - (tooltipRect?.height || 0) - 10;
            left = rect.left + rect.width / 2 - (tooltipRect?.width || 0) / 2;
            break;
          case 'bottom':
            top = rect.bottom + 10;
            left = rect.left + rect.width / 2 - (tooltipRect?.width || 0) / 2;
            break;
          case 'left':
            top = rect.top + rect.height / 2 - (tooltipRect?.height || 0) / 2;
            left = rect.left - (tooltipRect?.width || 0) - 10;
            break;
          case 'right':
            top = rect.top + rect.height / 2 - (tooltipRect?.height || 0) / 2;
            left = rect.right + 10;
            break;
        }

        setTooltipPosition({ top, left });
        setIsVisible(true);
      }
    } else {
      setIsVisible(true);
    }
  }, [id, targetSelector, position, state.tooltips_dismissed]);

  const handleDismiss = () => {
    dismissTooltip(id);
    setIsVisible(false);
    if (onDismiss) {
      onDismiss();
    }
  };

  if (!isVisible) return null;

  return (
    <>
      <div className="tooltip-overlay" onClick={handleDismiss} />
      <div
        ref={tooltipRef}
        className="tooltip-container"
        style={{
          top: targetSelector ? `${tooltipPosition.top}px` : '50%',
          left: targetSelector ? `${tooltipPosition.left}px` : '50%',
          transform: targetSelector ? 'none' : 'translate(-50%, -50%)',
        }}
      >
        <div className="tooltip-header">
          <h4 style={{ margin: 0, color: '#2A3744', fontSize: '1rem' }}>{title}</h4>
          <button className="tooltip-close" onClick={handleDismiss} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p style={{ margin: 0, color: '#5A6673', fontSize: '0.875rem', lineHeight: 1.6 }}>
          {content}
        </p>
      </div>
    </>
  );
};

export default ContextualTooltip;



