'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useAuth } from '../AuthProvider';

export const VSentry: React.FC = () => {
  const { user } = useAuth();
  useEffect(() => {
    if (!document) return;
    const scope = Sentry.getCurrentScope();
    if (!user) scope.setUser(null);
    else scope.setUser({ email: user.email, id: user.id });
  }, [user]);

  return null;
};
