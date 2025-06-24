import { isFlagEnabled } from '@/lib/feature-flags';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Workflows | Kortix Suna',
  description: 'Create and manage powerful workflows to automate your tasks',
  openGraph: {
    title: 'Workflows | Kortix Suna',
    description: 'Create and manage powerful workflows to automate your tasks',
    type: 'website',
  },
};

export default async function WorkflowsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
