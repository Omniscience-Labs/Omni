'use client';

import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { GeodesicSphere } from '@/components/ui/geodesic-sphere';
import { OmniWordmarkLogo } from '@/components/ui/omni-wordmark-logo';

interface OmniLogoProps {
  size?: number;
  /** 'wordmark' = SVG "OMNI" text (default). 'sphere' = 3D geodesic ball. Legacy: 'symbol' | 'logomark' | 'full' render wordmark. */
  variant?: 'wordmark' | 'sphere' | 'symbol' | 'logomark' | 'full';
  className?: string;
  /** @deprecated Use variant="wordmark". Kept for backwards compatibility. */
  showText?: boolean;
  /** Show spinning sphere (same as variant="sphere" with motion). */
  spinning?: boolean;
  /** Speed multiplier for the spinning sphere. */
  speed?: number;
}

export function OmniLogo({
  size = 32,
  variant = 'wordmark',
  className,
  showText = false,
  spinning = false,
  speed = 1,
}: OmniLogoProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div style={{ width: spinning || variant === 'sphere' ? size : size * 4, height: size }} />;
  }

  // 3D geodesic sphere (sidebar collapsed, etc.)
  if (spinning || variant === 'sphere') {
    return (
      <GeodesicSphere
        size={size}
        className={cn('flex-shrink-0', className)}
        glow={size > 40}
        speed={speed}
        detail={1}
      />
    );
  }

  // SVG wordmark "OMNI" (default; all former symbol/full/logomark usages)
  return (
    <OmniWordmarkLogo
      height={size}
      className={cn('flex-shrink-0', className)}
    />
  );
}
