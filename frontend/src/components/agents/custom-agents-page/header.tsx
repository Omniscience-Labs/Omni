'use client';

import React from 'react';
import { Bot } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';

export const AgentsPageHeader = () => {
  return (
    <PageHeader icon={Bot}>
      <span className="text-primary">Custom agents</span> that
      <br />
      <span className="text-muted-foreground">automate</span> your <span className="text-muted-foreground">workflows</span>.
    </PageHeader>
  );
};
