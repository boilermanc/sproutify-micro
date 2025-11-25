import './GrowingMicrogreens.css';

const GrowingMicrogreens = () => {
  // Create an array of sprouts to render with random delays for natural effect
  const sprouts = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 90 + 5}%`, // Random position 5-95%
    delay: `${Math.random() * 2}s`,     // Random start delay
    scale: 0.8 + Math.random() * 0.4,   // Random size variation
    angle: Math.random() * 20 - 10      // Slight random tilt
  }));

  return (
    <div className="growth-container">
      <div className="soil-block">
        <div className="soil-texture"></div>
        <div className="sprouts-layer">
          {sprouts.map((sprout) => (
            <div 
              key={sprout.id} 
              className="sprout-wrapper"
              style={{ 
                left: sprout.left, 
                animationDelay: sprout.delay,
                transform: `scale(${sprout.scale}) rotate(${sprout.angle}deg)`
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
  );
};

export default GrowingMicrogreens;


