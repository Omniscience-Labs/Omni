import { redirect } from 'next/navigation';

interface TeamPageProps {
  params: Promise<{ accountSlug: string }>;
}

export default async function TeamPage({ params }: TeamPageProps) {
  const { accountSlug } = await params;
  
  // Redirect to team dashboard
  redirect(`/${accountSlug}/dashboard`);
}