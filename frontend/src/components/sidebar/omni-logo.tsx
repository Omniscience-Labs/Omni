'use client';

import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

interface OmniLogoProps {
  size?: number;
}

export function OmniLogo({ size = 24 }: OmniLogoProps) {
  const { theme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const shouldInvert = mounted && (
    theme === 'dark' || (theme === 'system' && systemTheme === 'dark')
  );

  return (
    <Image
      src="/kortix-symbol.svg"
      alt="Omni"
      width={size}
      height={size}
      className={`${shouldInvert ? 'invert' : ''} flex-shrink-0`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    />
  );
}


