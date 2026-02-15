'use client';

import { cn } from '@/lib/utils';

export interface OmniWordmarkLogoProps {
  /** Height in pixels; width scales to preserve aspect. */
  height?: number;
  className?: string;
}

const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = 36;
const TEXT_Y = VIEWBOX_HEIGHT * 0.78;

/**
 * Scalable SVG wordmark: "OMNI" text only.
 * Uses currentColor so it adapts to light/dark.
 */
export function OmniWordmarkLogo({ height = 32, className }: OmniWordmarkLogoProps) {
  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      height={height}
      className={cn('h-auto w-auto', className)}
      style={{ height: `${height}px`, width: 'auto', minWidth: 0 }}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Omni"
    >
      <text
        x={0}
        y={TEXT_Y}
        fill="currentColor"
        fontFamily="var(--font-sans), system-ui, sans-serif"
        fontSize="28"
        fontWeight="700"
        letterSpacing="0.02em"
      >
        OMNI
      </text>
    </svg>
  );
}
