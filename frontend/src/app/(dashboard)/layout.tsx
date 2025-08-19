import DashboardLayoutContent from '@/components/dashboard/layout-content';
import { TeamContextProvider } from '@/hooks/use-team-context';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  return (
    <TeamContextProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </TeamContextProvider>
  );
}
