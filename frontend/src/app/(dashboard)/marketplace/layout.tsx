import { isFlagEnabled } from '@/lib/feature-flags';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Agent Marketplace | Kortix Suna',
  description: 'Discover and add powerful AI agents created by the community to your personal library',
  openGraph: {
    title: 'Agent Marketplace | Kortix Suna',
    description: 'Discover and add powerful AI agents created by the community to your personal library',
    type: 'website',
  },
};

export default async function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
