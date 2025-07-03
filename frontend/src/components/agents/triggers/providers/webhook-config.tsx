"use client";

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Plus, X } from 'lucide-react';
import { TriggerProvider, WebhookTriggerConfig } from '../types';

interface WebhookTriggerConfigFormProps {
  provider: TriggerProvider;
  config: WebhookTriggerConfig;
  onChange: (config: WebhookTriggerConfig) => void;
  errors: Record<string, string>;
}

export const WebhookTriggerConfigForm: React.FC<WebhookTriggerConfigFormProps> = ({
  provider,
  config,
  onChange,
  errors,
}) => {
  const [showSecret, setShowSecret] = useState(false);
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');

  const updateConfig = (updates: Partial<WebhookTriggerConfig>) => {
    onChange({ ...config, ...updates });
  };

  const addHeader = () => {
    if (newHeaderKey.trim() && newHeaderValue.trim()) {
      const headers = config.headers_validation || {};
      updateConfig({
        headers_validation: {
          ...headers,
          [newHeaderKey.trim()]: newHeaderValue.trim()
        }
      });
      setNewHeaderKey('');
      setNewHeaderValue('');
    }
  };

  const removeHeader = (key: string) => {
    const headers = config.headers_validation || {};
    const newHeaders = { ...headers };
    delete newHeaders[key];
    updateConfig({ headers_validation: newHeaders });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="webhook-secret">
          {provider.provider_id === 'github_webhook' ? 'GitHub Secret' : 'Webhook Secret'} (Optional)
        </Label>
        <div className="relative">
          <Input
            id="webhook-secret"
            type={showSecret ? 'text' : 'password'}
            value={config.secret || ''}
            onChange={(e) => updateConfig({ secret: e.target.value })}
            placeholder="Optional secret for webhook verification"
            className={showSecret ? 'pr-10' : 'pr-10'}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3"
            onClick={() => setShowSecret(!showSecret)}
          >
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {provider.provider_id === 'github_webhook' 
            ? 'Secret token for GitHub webhook signature verification'
            : 'Secret token for webhook signature verification'
          }
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="content-type">Expected Content Type</Label>
        <Input
          id="content-type"
          value={config.expected_content_type || 'application/json'}
          onChange={(e) => updateConfig({ expected_content_type: e.target.value })}
          placeholder="application/json"
        />
        <p className="text-xs text-muted-foreground">
          Content-Type header that the webhook should send
        </p>
      </div>
      <div className="space-y-3">
        <Label>Header Validation</Label>
        <div className="space-y-2">
          <div className="flex space-x-2">
            <Input
              value={newHeaderKey}
              onChange={(e) => setNewHeaderKey(e.target.value)}
              placeholder="Header name (e.g., X-API-Key)"
              className="flex-1"
            />
            <Input
              value={newHeaderValue}
              onChange={(e) => setNewHeaderValue(e.target.value)}
              placeholder="Expected value"
              className="flex-1"
            />
            <Button onClick={addHeader} size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {config.headers_validation && Object.keys(config.headers_validation).length > 0 && (
          <div className="space-y-2">
            {Object.entries(config.headers_validation).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between p-2 bg-muted rounded">
                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-xs">
                    {key}
                  </Badge>
                  <span className="text-sm text-muted-foreground">:</span>
                  <code className="text-xs bg-background px-1 py-0.5 rounded">
                    {value}
                  </code>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => removeHeader(key)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Headers that must be present with specific values for the webhook to be accepted
        </p>
      </div>
      {provider.provider_id === 'github_webhook' && (
        <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
          <h4 className="text-sm font-medium mb-2">GitHub Webhook Setup</h4>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Go to your repository settings</li>
            <li>Click on "Webhooks" in the left sidebar</li>
            <li>Click "Add webhook"</li>
            <li>Set the Payload URL to the generated webhook URL</li>
            <li>Set Content type to "application/json"</li>
            <li>Add your secret if configured</li>
            <li>Select the events you want to trigger the agent</li>
          </ol>
        </div>
      )}

      {provider.provider_id === 'discord' && (
        <div className="bg-indigo-50 dark:bg-indigo-950 p-4 rounded-lg">
          <h4 className="text-sm font-medium mb-2">Discord Webhook Setup</h4>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Go to your Discord server settings</li>
            <li>Click on "Integrations"</li>
            <li>Click "Create Webhook"</li>
            <li>Configure the webhook name and channel</li>
            <li>Copy the webhook URL and use it to send POST requests to trigger your agent</li>
          </ol>
        </div>
      )}
    </div>
  );
}; 