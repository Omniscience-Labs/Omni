import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TeamDashboard } from './_components/team-dashboard';
import { TeamDashboardSkeleton } from './_components/team-dashboard-skeleton';

interface TeamDashboardPageProps {
  params: Promise<{ accountSlug: string }>;
}

async function getTeamBySlug(slug: string) {
  const supabase = await createClient();
  
  // Use the existing basejump function
  const { data, error } = await supabase.rpc('get_account_by_slug', {
    slug: slug
  });

  if (error || !data || data.personal_account) {
    return null;
  }

  return {
    account_id: data.account_id,
    name: data.name,
    slug: data.slug,
    created_at: data.created_at,
    personal_account: data.personal_account
  };
}

export default async function TeamDashboardPage({ params }: TeamDashboardPageProps) {
  const { accountSlug } = await params;
  const team = await getTeamBySlug(accountSlug);

  if (!team) {
    notFound();
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Suspense fallback={<TeamDashboardSkeleton />}>
        <TeamDashboard team={team} />
      </Suspense>
    </div>
  );
}
