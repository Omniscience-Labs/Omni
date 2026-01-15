export const siteConfig = {
  name: 'Omni',
  url: 'https://becomeomni.com',
  description: 'Omni – A generalist AI Agent that works on your behalf. Build, manage and train your AI Workforce with 80% more automation and 20% the resources.',
  tagline: 'Build, manage and train your AI Workforce',
  features: [
    'Autonomous task execution',
    'Browser automation & web scraping',
    'Code generation & file management', 
    'Research & data analysis',
    'Workflow automation & scheduling',
    'Multi-step problem solving',
  ],
  links: {
    twitter: 'https://x.com/becomeomni',
    github: 'https://github.com/becomeomni',
    linkedin: 'https://www.linkedin.com/company/becomeomni/',
    discord: 'https://discord.gg/becomeomni',
  },
};

export type SiteConfig = typeof siteConfig;
