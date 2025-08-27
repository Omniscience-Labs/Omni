import React from 'react';

interface OmniSpinnerLogoProps {
  size?: number;
  className?: string;
}

export const OmniSpinnerLogo: React.FC<OmniSpinnerLogoProps> = ({ 
  size = 24, 
  className = "" 
}) => {
  const dotSize = size * 0.2;
  const spacing = size * 0.15;

  return (
    <div 
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <div className="flex items-center gap-1">
        {/* Three animated dots */}
        <div 
          className="rounded-full bg-current animate-pulse"
          style={{ 
            width: dotSize, 
            height: dotSize,
            animationDelay: '0ms',
            animationDuration: '1500ms'
          }}
        />
        <div 
          className="rounded-full bg-current animate-pulse"
          style={{ 
            width: dotSize, 
            height: dotSize,
            animationDelay: '300ms',
            animationDuration: '1500ms'
          }}
        />
        <div 
          className="rounded-full bg-current animate-pulse"
          style={{ 
            width: dotSize, 
            height: dotSize,
            animationDelay: '600ms',
            animationDuration: '1500ms'
          }}
        />
      </div>
    </div>
  );
};

export default OmniSpinnerLogo;
