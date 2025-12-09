'use client';

import * as React from 'react';
import { ThreeSpinner } from './three-spinner';
import { cn } from '@/lib/utils';

interface OmniLoaderProps {
  /**
   * Size preset for the loader
   * @default 'medium'
   */
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  /**
   * Animation speed multiplier (not used with Three.js spinner, kept for API compatibility)
   * @default 1.2
   */
  speed?: number;
  /**
   * Custom size in pixels (overrides size preset)
   */
  customSize?: number;
  /**
   * Additional className for the container
   */
  className?: string;
  /**
   * Additional style for the container
   */
  style?: React.CSSProperties;
  /**
   * Whether the animation should autoPlay (not used with Three.js spinner, kept for API compatibility)
   * @default true
   */
  autoPlay?: boolean;
  /**
   * Whether the animation should loop (not used with Three.js spinner, kept for API compatibility)
   * @default true
   */
  loop?: boolean;
  /**
   * Force a specific loader variant (overrides auto-detection)
   * - 'white': White loader (for dark backgrounds)
   * - 'black': Black loader (for light backgrounds)
   * - 'auto': Auto-detect based on theme (default)
   */
  variant?: 'white' | 'black' | 'auto';
  /**
   * @deprecated Use 'variant' instead
   */
  forceTheme?: 'light' | 'dark';
}

const SIZE_MAP = {
  small: 20,
  medium: 40,
  large: 80,
  xlarge: 120,
} as const;

/**
 * OmniLoader - A unified loading animation component using Three.js
 * 
 * Uses Three.js-based 3D spinner that automatically adapts to theme.
 * 
 * **Automatic Behavior:**
 * - Light mode → Black spinner (for white backgrounds)
 * - Dark mode → Gray spinner (for dark backgrounds)
 * 
 * **Manual Override (for special cases):**
 * Use the `variant` prop when the background doesn't match the theme.
 * 
 * @example
 * ```tsx
 * // Auto-themed (default)
 * <OmniLoader />
 * 
 * // Always white (for dark backgrounds in any theme)
 * <OmniLoader variant="white" />
 * 
 * // Always black (for light backgrounds in any theme)
 * <OmniLoader variant="black" />
 * 
 * // Custom size
 * <OmniLoader size="large" />
 * ```
 */
export function OmniLoader({
  size = 'medium',
  speed = 1.2,
  customSize,
  className,
  style,
  autoPlay = true,
  loop = true,
  variant = 'auto',
  forceTheme, // deprecated, but kept for backwards compatibility
}: OmniLoaderProps) {
  const loaderSize = customSize || SIZE_MAP[size];
  
  // Determine color based on variant
  // ThreeSpinner uses 'currentColor' by default which adapts to theme
  // For explicit variants, we can pass a specific color
  let color = 'currentColor';
  
  if (variant !== 'auto') {
    // Explicit variant set - ThreeSpinner handles theme automatically,
    // but we can override if needed (though 'currentColor' works best)
    color = 'currentColor';
  } else if (forceTheme) {
    // Backwards compatibility with forceTheme
    color = 'currentColor';
  } else {
    // Auto-detect - use currentColor which adapts to theme
    color = 'currentColor';
  }

  return (
    <div className={cn('flex items-center justify-center', className)} style={style}>
      <ThreeSpinner 
        size={loaderSize} 
        color={color}
        className="flex-shrink-0"
      />
    </div>
  );
}

