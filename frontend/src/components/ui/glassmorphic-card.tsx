import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface GlassmorphicCardProps {
  children: ReactNode;
  className?: string;
  level?: 'surface' | 'raised' | 'sunken';
}

export const GlassmorphicCard: React.FC<GlassmorphicCardProps> = ({
  children,
  className,
  level = 'sunken',
}) => {
  return (
    <div
      className={cn(
        'relative rounded-xl border-white/10 overflow-hidden',
        level === 'surface' && 'bg-white/5 backdrop-blur-md',
        level === 'raised' && 'bg-white/10 backdrop-blur-lg shadow-lg',
        level === 'sunken' && 'bg-black/20 backdrop-blur-lg',
        className,
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-50 pointer-events-none" />
      <div className="absolute inset-[1px] rounded-[10px] pointer-events-none ring-1 ring-inset ring-white/5" />
      <div className="relative z-10">{children}</div>
    </div>
  );
};