'use client';

import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import Image from 'next/image';

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
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isDarkMode = resolvedTheme === 'dark';

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div style={{ width: size, height: size }} />;
  }

  // Full logo with text
  if (variant === 'full' || showText) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Image
          src={isDarkMode ? '/OMNI-Logo-light.png' : '/OMNI-Logo-Dark.png'}
          alt="Omni"
          width={size * 4}
          height={size}
          className="h-auto"
          style={{ height: size }}
        />
      </div>
    );
  }

  // Icon only - use the symbol/logomark
  return (
    <Image
      src={isDarkMode ? '/OMNI-Logo-light.png' : '/OMNI-Logo-Dark.png'}
      alt="Omni"
      width={size * 4}
      height={size}
      className={cn('h-auto', className)}
      style={{ height: size }}
    />
  );
}
