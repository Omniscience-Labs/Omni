import React from 'react';

interface OmniSpinnerLogoProps {
  size?: number;
  className?: string;
}

export const OmniSpinnerLogo: React.FC<OmniSpinnerLogoProps> = ({ 
  size = 24, 
  className = "" 
}) => {
  const dotSize = Math.max(3, size * 0.2); // Minimum 3px, scale with size
  
  return (
    <div 
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <div className="flex items-center gap-1">
        <div 
          className="bg-current rounded-full"
          style={{ width: dotSize, height: dotSize }}
        />
        <div 
          className="bg-current rounded-full"
          style={{ width: dotSize, height: dotSize }}
        />
        <div 
          className="bg-current rounded-full"
          style={{ width: dotSize, height: dotSize }}
        />
      </div>
    </div>
  );
};

export default OmniSpinnerLogo;
