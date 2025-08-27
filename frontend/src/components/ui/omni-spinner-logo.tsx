import React from 'react';
import { motion } from 'framer-motion';

interface OmniSpinnerLogoProps {
  size?: number;
  className?: string;
}

export const OmniSpinnerLogo: React.FC<OmniSpinnerLogoProps> = ({ 
  size = 24, 
  className = "" 
}) => {
  const dotSize = Math.max(2, size * 0.15); // Minimum 2px, scale with size
  
  return (
    <div 
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <div className="flex gap-1">
        {[0, 1, 2].map((index) => (
          <motion.div
            key={index}
            className="bg-current rounded-full"
            style={{ width: dotSize, height: dotSize }}
            animate={{ y: [0, -5, 0] }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: index * 0.2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default OmniSpinnerLogo;
