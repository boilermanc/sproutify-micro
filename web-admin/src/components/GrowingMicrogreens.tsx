import './GrowingMicrogreens.css';

interface GrowingMicrogreensProps {
  compact?: boolean;
  message?: string;
}

const GrowingMicrogreens = ({ compact = false, message }: GrowingMicrogreensProps) => {
  // Adjust parameters based on compact mode
  const sproutCount = compact ? 25 : 40;
  const soilWidth = compact ? 180 : 300;
  const soilHeight = compact ? 40 : 60;
  const containerMinHeight = compact ? 200 : 500;
  const maxSproutHeight = compact ? 80 : 150;
  const sproutsLayerHeight = compact ? 150 : 300;
  const sproutsLayerBottom = compact ? 35 : 50;

  // Create an array of sprouts to render with random delays for natural effect
  const sprouts = Array.from({ length: sproutCount }, (_, i) => ({
    id: i,
    left: `${Math.random() * 90 + 5}%`, // Random position 5-95%
    delay: `${Math.random() * 2}s`,     // Random start delay
    scale: 0.8 + Math.random() * 0.4,   // Random size variation
    angle: Math.random() * 20 - 10      // Slight random tilt
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      <div 
        className="growth-container"
        style={{ minHeight: `${containerMinHeight}px` }}
      >
        <div 
          className="soil-block"
          style={{ 
            width: `${soilWidth}px`, 
            height: `${soilHeight}px` 
          }}
        >
          <div className="soil-texture"></div>
          <div 
            className="sprouts-layer"
            style={{ 
              height: `${sproutsLayerHeight}px`,
              bottom: `${sproutsLayerBottom}px`
            }}
          >
            {sprouts.map((sprout) => (
              <div 
                key={sprout.id} 
                className="sprout-wrapper"
                style={{ 
                  left: sprout.left, 
                  animationDelay: sprout.delay,
                  transform: `scale(${sprout.scale}) rotate(${sprout.angle}deg)`,
                  // Override animation height for compact mode
                  animationName: compact ? 'growCycleCompact' : 'growCycle'
                }}
              >
                <div className="stem"></div>
                <div className="leaf left"></div>
                <div className="leaf right"></div>
                <div className="leaf center"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {message && (
        <p className="text-slate-500 text-center" style={{ marginTop: '0.5rem' }}>
          {message}
        </p>
      )}
      
      {/* Inject compact animation keyframes if needed */}
      {compact && (
        <style>{`
          @keyframes growCycleCompact {
            0%, 10% {
              height: 0;
              opacity: 0;
            }
            20% {
              opacity: 1;
              height: 15px;
            }
            50% {
              height: ${maxSproutHeight}px;
            }
            80% {
              height: ${maxSproutHeight}px;
              opacity: 1;
            }
            90% {
              opacity: 0;
            }
            100% {
              height: 0;
              opacity: 0;
            }
          }
        `}</style>
      )}
    </div>
  );
};

export default GrowingMicrogreens;
