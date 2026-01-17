import { FlickeringGrid } from '@/components/ui/flickering-grid';
import { pricingTiers, type PricingTier } from '@/lib/pricing-config';

// Re-export for backward compatibility
export type { PricingTier } from '@/lib/pricing-config';

export const siteConfig = {
  name: 'Omni: Your Autonomous AI Worker',
  description: 'Build, manage and train your AI Workforce. A generalist AI Agent that works on your behalf.',
  cta: 'Get started',
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  keywords: ['Omni', 'Autonomous AI Worker', 'AI Worker', 'Generalist AI', 'Open Source AI', 'Autonomous Agent', 'Complex Tasks', 'AI Assistant'],
  links: {
    email: 'support@becomeomni.com',
    twitter: 'https://x.com/becomeomni',
    github: 'https://github.com/becomeomni',
    instagram: 'https://instagram.com/becomeomni',
  },
  nav: {
    links: [
      { id: 1, name: 'Home', href: '#hero' },
      { id: 2, name: 'Enterprise', href: '/enterprise' },
      { id: 4, name: 'Pricing', href: '/pricing' },
      { id: 5, name: 'Solutions', href: '/dashboard' },
    ],
  },
  hero: {
    badgeIcon: null,
    badge: '',
    githubUrl: 'https://github.com/becomeomni',
    title: 'Omni – Build, manage and train your AI Workforce.',
    description: 'a generalist AI Agent that works on your behalf.',
    inputPlaceholder: 'Ask Omni to...',
    stats: {
      text1: '80% more',
      highlight1: 'automation',
      text2: 'with 20% the',
      highlight2: 'resources',
    },
  },
  cloudPricingItems: pricingTiers,
  footerLinks: [
    {
      title: 'Omni',
      links: [
        { id: 1, title: 'About', url: 'https://becomeomni.com' },
        { id: 3, title: 'socials@latent-labs.ai', url: 'mailto:socials@latent-labs.ai' },
        { id: 4, title: 'Careers', url: 'https://becomeomni.com/careers' },
      ],
    },
    {
      title: 'Resources',
      links: [
        {
          id: 5,
          title: 'Documentation',
          url: 'https://github.com/becomeomni',
        },
        { id: 7, title: 'Discord', url: 'https://discord.gg/Py6pCBUUPw' },
        { id: 8, title: 'GitHub', url: 'https://github.com/becomeomni' },
      ],
    },
    {
      title: 'Legal',
      links: [
        {
          id: 9,
          title: 'Privacy Policy',
          url: 'https://becomeomni.com/legal?tab=privacy',
        },
        {
          id: 10,
          title: 'Terms of Service',
          url: 'https://becomeomni.com/legal?tab=terms',
        },
        {
          id: 11,
          title: 'License Apache 2.0',
          url: 'https://github.com/becomeomni/blob/main/LICENSE',
        },
      ],
    },
  ],
};

export type SiteConfig = typeof siteConfig;
