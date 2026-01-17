'use client';

import { cn } from '@/lib/utils';
import { ThreeSpinner } from '@/components/ui/three-spinner';

interface OmniLogoProps {
  size?: number;
  variant?: 'symbol' | 'logomark' | 'full';
  className?: string;
  showText?: boolean;
}

export function OmniLogo({
  size = 24,
  variant = 'symbol',
  className,
  showText = false,
}: OmniLogoProps) {
  // Full logo with text
  if (variant === 'full' || showText) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <ThreeSpinner
          size={size}
          className="text-white"
        />
        <span className="text-base font-semibold text-white">
          Omni
        </span>
      </div>
    );
  }

  // Icon only
  return (
    <ThreeSpinner
      size={size}
      className={cn('text-white', className)}
    />
  );
}
