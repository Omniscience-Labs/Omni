import DashboardLayoutContent from '@/components/dashboard/layout-content';
import { HelpButton } from '@/components/help';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  return (
    <DashboardLayoutContent>
      {children}
      <HelpButton />
    </DashboardLayoutContent>
  );
}
