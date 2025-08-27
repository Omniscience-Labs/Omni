'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { OmniFallbackIcon } from '@/components/ui/omni-fallback-icon';

interface OmniLogoProps {
  size?: number;
}

export function OmniLogo({ size = 24 }: OmniLogoProps) {
  const { theme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const shouldInvert = mounted && (
    theme === 'dark' || (theme === 'system' && systemTheme === 'dark')
  );

  // If image fails to load, use geometric sphere fallback
  if (imageError) {
    return <OmniFallbackIcon size={size} />;
  }

  return (
    <img
      src={shouldInvert ? '/omni-ball-light.svg' : '/omni-ball-dark.svg'}
      alt="Omni"
      width={size}
      height={size}
      className="flex-shrink-0"
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      onError={() => {
        console.warn('Failed to load OmniLogo, using geometric fallback');
        setImageError(true);
      }}
    />
  );
}


