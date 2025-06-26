import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Credentials | Kortix Suna',
  description: 'Create and manage credentials to your services',
  openGraph: {
    title: 'Credentials | Kortix Suna',
    description: 'Create and manage credentials to your services',
    type: 'website',
  },
};

export default async function CredentialsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
