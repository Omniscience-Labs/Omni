import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface GlassmorphicContainerProps {
  children: ReactNode;
  className?: string;
  showfade?: boolean;
}

export const GlassmorphicContainer: React.FC<GlassmorphicContainerProps> = ({
  children,
  className,
  showfade = false,
}) => {
  return (
    <div className={cn('relative w-full overflow-hidden', className)}>
      <div className="fixed inset-0 bg-transparent">
        <div className="absolute top-1/4 -left-[5%] w-1/3 h-1/3 rounded-full bg-purple-600/20 blur-[100px]" />
        <div
          className="absolute top-[10%] right-[5%] w-1/4 h-1/4 rounded-full bg-blue-500/20 blur-[100px]"
          style={{ animationDelay: '2s' }}
        />
      </div>
      <div className="relative w-full h-full z-20">
        <div className="relative z-30 h-full cursor-default select-none">
          {children}
        </div>
        {showfade && (
          <div className="fixed bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-primary-dark/40 to-transparent pointer-events-none z-40" />
        )}
      </div>
    </div>
  );
};