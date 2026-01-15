import { Metadata } from 'next';
import { HomeLayoutClient } from './layout-client';

// Static metadata for SEO - rendered in initial HTML
export const metadata: Metadata = {
  title: 'Omni – Build, manage and train your AI Workforce',
  description: 'A generalist AI Agent that works on your behalf. 80% more automation with 20% the resources.',
  keywords: 'Omni, AI Workforce, AI Agent, Generalist AI, Automation, AI Assistant',
  openGraph: {
    title: 'Omni – Build, manage and train your AI Workforce',
    description: 'A generalist AI Agent that works on your behalf. 80% more automation with 20% the resources.',
    url: 'https://becomeomni.com',
    siteName: 'Omni',
    images: [{ url: '/banner.png', width: 1200, height: 630 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Omni – Build, manage and train your AI Workforce',
    description: 'A generalist AI Agent that works on your behalf. 80% more automation with 20% the resources.',
    images: ['/banner.png'],
  },
};

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <HomeLayoutClient>{children}</HomeLayoutClient>;
}
