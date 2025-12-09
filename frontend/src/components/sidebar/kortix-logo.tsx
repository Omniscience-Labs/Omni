'use client';

import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

interface KortixLogoProps {
  size?: number;
  variant?: 'symbol' | 'logomark';
  className?: string;
}
export function KortixLogo({ size = 24, variant = 'symbol', className }: KortixLogoProps) {
  const { theme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // After mount, we can access the theme
  useEffect(() => {
    setMounted(true);
  }, []);

  const shouldInvert = mounted && (
    theme === 'dark' || (theme === 'system' && systemTheme === 'dark')
  );

  // For logomark variant, use logomark-white.svg which is already white
  // and invert it for light mode instead
  if (variant === 'logomark') {
    return (
      <Image
        src="/logomark-white.svg"
        alt="Omni"
        width={size}
        height={size}
        className={`${shouldInvert ? '' : 'invert'} flex-shrink-0 ${className || ''}`}
        style={{ height: `${size}px`, width: 'auto' }}
      />
    );
  }

  // Default symbol variant behavior
  return (
    <Image
      src="/Logomark.svg"
      alt="Omni"
      width={size}
      height={size}
      className={`${shouldInvert ? 'invert' : ''} flex-shrink-0 ${className || ''}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    />
  );
}

// Export as OmniLogo for clarity
export const OmniLogo = KortixLogo;
