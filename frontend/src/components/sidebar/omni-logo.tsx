'use client';

import { OmniSpinnerLogo } from '@/components/ui/omni-spinner-logo';

interface OmniLogoProps {
  size?: number;
}

export function OmniLogo({ size = 24 }: OmniLogoProps) {
  return <OmniSpinnerLogo size={size} className="flex-shrink-0" />;
}


