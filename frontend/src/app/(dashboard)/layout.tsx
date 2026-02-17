'use client';

import DashboardLayoutContent from '@/components/dashboard/layout-content';
import dynamic from 'next/dynamic';

const HelpButton = dynamic(() => import('@/components/help/HelpButton').then(mod => mod.HelpButton), {
  ssr: false,
});

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  return (
    <>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
      <HelpButton />
    </>
  );
}
