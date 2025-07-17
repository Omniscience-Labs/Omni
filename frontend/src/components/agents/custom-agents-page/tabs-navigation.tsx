'use client';

import React from 'react';
import { Bot, ShoppingBag, FileText } from 'lucide-react';
import { FancyTabs, TabConfig } from '@/components/ui/fancy-tabs';

interface TabsNavigationProps {
  activeTab: string;
  onTabChange: (value: string) => void;
}

const agentTabs: TabConfig[] = [
  {
    value: 'my-agents',
    icon: Bot,
    label: 'My Agents',
  },
  {
    value: 'marketplace',
    icon: ShoppingBag,
    label: 'Marketplace',
    shortLabel: 'Market',
  },
];

export const TabsNavigation = ({ activeTab, onTabChange }: TabsNavigationProps) => {
  return (
    <FancyTabs
      tabs={agentTabs}
      activeTab={activeTab}
      onTabChange={onTabChange}
    />
  );
}; 