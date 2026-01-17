/**
 * Site metadata configuration - SIMPLE AND WORKING
 */

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://becomeomni.com';

export const siteMetadata = {
  name: 'Omni',
  title: 'Omni – Build, manage and train your AI Workforce',
  description: 'A generalist AI Agent that works on your behalf. 80% more automation with 20% the resources.',
  url: baseUrl,
  keywords: 'Omni, AI Workforce, AI Agent, Generalist AI, Automation, AI Assistant',
};
