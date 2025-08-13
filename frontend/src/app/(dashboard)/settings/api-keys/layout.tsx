import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API Keys | Omni',
  description: 'Manage your API keys for programmatic access to Omni',
  openGraph: {
    title: 'API Keys | Omni',
    description: 'Manage your API keys for programmatic access to Omni',
    type: 'website',
  },
};

export default async function APIKeysLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
