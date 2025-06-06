'use client';

import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

interface KortixLogoProps {
  size?: number;
}
export function KortixLogo({ size = 24 }: KortixLogoProps) {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // After mount, we can access the theme
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Image
        src="/kortix-symbol.svg"
        alt="Kortix"
        width={size}
        height={size}
        className={`${mounted && theme === 'dark' ? 'invert' : ''} flex-shrink-0`}
      />
  );
}
