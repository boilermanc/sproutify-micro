import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { TowerCardData } from '../../types/chat';

interface TowerCardProps {
  data: TowerCardData;
  index: number;
}

const TowerCard: React.FC<TowerCardProps> = ({ data, index }) => {
  const [displayCount, setDisplayCount] = useState(0);

  useEffect(() => {
    // Count animation (0 → final value)
    const startDelay = index * 500;
    const duration = 2000;
    const steps = 30;
    const increment = data.count / steps;
    const stepDuration = duration / steps;

    const startTimer = setTimeout(() => {
      let current = 0;
      const timer = setInterval(() => {
        current += increment;
        if (current >= data.count) {
          setDisplayCount(data.count);
          clearInterval(timer);
        } else {
          setDisplayCount(Math.floor(current));
        }
      }, stepDuration);
    }, startDelay);

    return () => {
      clearTimeout(startTimer);
    };
  }, [data.count, index]);

  const getCardStyles = () => {
    switch (data.type) {
      case 'harvest':
        return {
          backgroundColor: '#FEF3C7',
          borderColor: '#F59E0B',
          accentColor: '#F59E0B',
        };
      case 'growing':
        return {
          backgroundColor: '#F0FDF4',
          borderColor: '#2F855A',
          accentColor: '#2F855A',
        };
      case 'attention':
        return {
          backgroundColor: '#FEF2F2',
          borderColor: '#EF4444',
          accentColor: '#EF4444',
        };
      case 'sowing':
        return {
          backgroundColor: '#EFF6FF',
          borderColor: '#3B82F6',
          accentColor: '#3B82F6',
        };
      case 'inventory':
        return {
          backgroundColor: '#F5F3FF',
          borderColor: '#8B5CF6',
          accentColor: '#8B5CF6',
        };
      case 'tasks':
        return {
          backgroundColor: '#EFF6FF',
          borderColor: '#3B82F6',
          accentColor: '#3B82F6',
        };
      default:
        return {
          backgroundColor: '#F9FAFB',
          borderColor: '#D1D5DB',
          accentColor: '#6B7280',
        };
    }
  };

  const cardStyles = getCardStyles();

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.6,
        duration: 0.8,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="rounded-xl border-2 p-4 mb-3 shadow-sm"
      style={{
        backgroundColor: cardStyles.backgroundColor,
        borderColor: cardStyles.borderColor,
      }}
    >
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {data.emoji && <span className="text-xl">{data.emoji}</span>}
          <h3
            className="text-base font-semibold flex-1"
            style={{ color: cardStyles.accentColor }}
          >
            {data.title}
          </h3>
          <span
            className="rounded-xl px-2.5 py-1 text-xs font-bold text-white"
            style={{ backgroundColor: cardStyles.accentColor }}
          >
            {displayCount}
          </span>
        </div>
        {data.description && (
          <p className="text-sm text-gray-600 mt-1">{data.description}</p>
        )}
      </div>
      {data.items && data.items.length > 0 && (
        <div className="space-y-2.5">
          {data.items.map((item, itemIndex) => (
            <motion.div
              key={itemIndex}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: index * 0.6 + 1.0 + itemIndex * 0.15,
                duration: 0.4,
              }}
              className="pt-2.5 border-t border-black/8"
            >
              <p className="text-sm font-semibold text-gray-900 mb-1">
                {item.name}
              </p>
              {item.ports && (
                <p className="text-xs text-gray-600">{item.ports} ports</p>
              )}
              {item.details && (
                <p className="text-xs text-gray-600 leading-relaxed">
                  {item.details}
                </p>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default TowerCard;




