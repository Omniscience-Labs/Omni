import React from 'react';
import { ExternalLink, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface PipedreamConnectButtonProps {
  url: string;
  appSlug?: string;
}

// Common app name mappings for better display
const APP_NAME_MAPPINGS: Record<string, string> = {
  'linear': 'Linear',
  'github': 'GitHub', 
  'gitlab': 'GitLab',
  'google_sheets': 'Google Sheets',
  'google_drive': 'Google Drive',
  'google_calendar': 'Google Calendar',
  'google_maps': 'Google Maps',
  'notion': 'Notion',
  'slack': 'Slack',
  'discord': 'Discord',
  'twitter': 'Twitter',
  'linkedin': 'LinkedIn',
  'facebook': 'Facebook',
  'instagram': 'Instagram',
  'youtube': 'YouTube',
  'zoom': 'Zoom',
  'microsoft_teams': 'Microsoft Teams',
  'outlook': 'Outlook',
  'gmail': 'Gmail',
  'dropbox': 'Dropbox',
  'onedrive': 'OneDrive',
  'salesforce': 'Salesforce',
  'hubspot': 'HubSpot',
  'mailchimp': 'Mailchimp',
  'stripe': 'Stripe',
  'paypal': 'PayPal',
  'shopify': 'Shopify',
  'woocommerce': 'WooCommerce',
  'wordpress': 'WordPress',
  'webflow': 'Webflow',
  'airtable': 'Airtable',
  'monday': 'Monday.com',
  'asana': 'Asana',
  'trello': 'Trello',
  'jira': 'Jira',
  'confluence': 'Confluence',
  'figma': 'Figma',
  'adobe_creative': 'Adobe Creative',
  'twilio': 'Twilio',
  'sendgrid': 'SendGrid',
  'aws': 'AWS',
  'google_cloud': 'Google Cloud',
  'azure': 'Azure',
  'heroku': 'Heroku',
  'vercel': 'Vercel',
  'netlify': 'Netlify'
};

function formatAppName(appSlug: string): string {
  // Check if we have a custom mapping first
  if (APP_NAME_MAPPINGS[appSlug.toLowerCase()]) {
    return APP_NAME_MAPPINGS[appSlug.toLowerCase()];
  }
  
  // Fall back to converting snake_case to Title Case
  return appSlug
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function extractAppSlug(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const appParam = urlObj.searchParams.get('app');
    return appParam;
  } catch {
    const match = url.match(/[&?]app=([^&]+)/);
    return match ? match[1] : null;
  }
}

export const PipedreamConnectButton: React.FC<PipedreamConnectButtonProps> = ({ 
  url, 
  appSlug: providedAppSlug 
}) => {
  const appSlug = providedAppSlug || extractAppSlug(url);
  const appName = appSlug ? formatAppName(appSlug) : 'Service';

  const handleConnect = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card className="my-3 border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <Link2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                🔗 Connect: Credential Profile
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Connect your {appName} account to enable integrations
              </p>
            </div>
          </div>
          <Button 
            onClick={handleConnect}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            Connect to {appName}
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-3 text-xs text-blue-600 dark:text-blue-400 font-mono bg-blue-100 dark:bg-blue-900/30 p-2 rounded border">
          Click the button above to securely connect your account
        </div>
      </CardContent>
    </Card>
  );
}; 