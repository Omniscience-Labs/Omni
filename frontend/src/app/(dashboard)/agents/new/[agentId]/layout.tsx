import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Agent | Kortix Suna',
  description: 'Interactive agent playground powered by Kortix Suna',
  openGraph: {
    title: 'Agent Playground | Kortix Suna',
    description: 'Interactive agent playground powered by Kortix Suna',
    type: 'website',
  },
};

export default async function NewAgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
