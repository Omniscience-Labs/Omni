import { createQueryKeys } from '@/hooks/use-query';

export const dashboardKeys = createQueryKeys({
  all: ['dashboard'] as const,
  agents: ['dashboard', 'agents'] as const,
  initiateAgent: () => [...dashboardKeys.agents, 'initiate'] as const,
});
