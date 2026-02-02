'use client';

import React from 'react';
import { isEnterpriseMode } from '@/lib/config';

/**
 * Hides children when enterprise mode is enabled.
 * Use this to wrap SaaS billing UI that should not appear in enterprise instances.
 */
export const HideInEnterprise: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (isEnterpriseMode()) return null;
  return <>{children}</>;
};

/**
 * Shows children only when enterprise mode is enabled.
 * Use this to wrap enterprise-specific UI.
 */
export const ShowInEnterprise: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!isEnterpriseMode()) return null;
  return <>{children}</>;
};

/**
 * Hook to check if enterprise mode is enabled.
 * Useful for conditional logic in components.
 */
export const useIsEnterprise = (): boolean => {
  return isEnterpriseMode();
};
