import { Metadata } from 'next';
import { getThread, getProject } from '@/lib/api-server';

export async function generateMetadata({ params }): Promise<Metadata> {
  const { threadId } = await params;
  const fallbackMetaData = {
    title: 'Shared Conversation | Kortix Suna',
    description: 'Replay this Agent conversation on Kortix Suna',
    openGraph: {
      title: 'Shared Conversation | Kortix Suna',
      description: 'Replay this Agent conversation on Kortix Suna',
      images: [`${process.env.NEXT_PUBLIC_URL}/share-page/og-fallback.png`],
    },
  };

  try {
    const threadData = await getThread(threadId);
    const projectData = await getProject(threadData.project_id);

    if (!threadData || !projectData) {
      return fallbackMetaData;
    }

    return {
      title: projectData.name || 'Shared Conversation | Kortix Suna',
      description:
        projectData.description ||
        'Replay this Agent conversation on Kortix Suna',
      openGraph: {
        title: projectData.name || 'Shared Conversation | Kortix Suna',
        description:
          projectData.description ||
          'Replay this Agent conversation on Kortix Suna',
        images: [
          `${process.env.NEXT_PUBLIC_URL}/api/share-page/og-image?title=${projectData.name}`,
        ],
      },
    };
  } catch (error) {
    return fallbackMetaData;
  }
}

export default async function ThreadLayout({ children }) {
  return <>{children}</>;
}
