"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";
import { SlackWebhookConfig as SlackConfig } from "../types";

interface SlackWebhookConfigProps {
  config?: SlackConfig;
  onChange: (config: SlackConfig) => void;
  webhookUrl?: string; // URL from the parent dialog
}

export function SlackWebhookConfig({ config, onChange, webhookUrl }: SlackWebhookConfigProps) {
  const [showSigningSecret, setShowSigningSecret] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize webhook URL if not set
  useEffect(() => {
    if (webhookUrl && (!config?.webhook_url || config.webhook_url === '')) {
      const newConfig = { ...config, webhook_url: webhookUrl };
      onChange(newConfig);
    }
  }, [webhookUrl, config, onChange]);

  const updateConfig = (field: keyof SlackConfig, value: string) => {
    const newConfig = { ...config, [field]: value };
    onChange(newConfig);
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateField = (field: keyof SlackConfig, value: string) => {
    const newErrors = { ...errors };
    
    switch (field) {
      case 'webhook_url':
        if (!value) {
          newErrors[field] = 'Webhook URL is required';
        } else if (!value.startsWith('https://') || !value.includes('/api/webhooks/trigger/')) {
          newErrors[field] = 'Please use the webhook URL provided above';
        } else {
          delete newErrors[field];
        }
        break;
      case 'signing_secret':
        if (!value) {
          newErrors[field] = 'Signing secret is required';
        } else if (value.length < 20) {
          newErrors[field] = 'Signing secret seems too short';
        } else {
          delete newErrors[field];
        }
        break;
      default:
        delete newErrors[field];
    }
    
    setErrors(newErrors);
  };

  const getFieldStatus = (field: keyof SlackConfig) => {
    const value = config?.[field] || '';
    if (errors[field]) return 'error';
    if (value && !errors[field]) return 'success';
    return 'default';
  };

  return (
    <div className="space-y-6">
      {/* Setup Instructions */}
      <Card>
        <CardHeader className="pb-3">
                     <CardTitle className="flex items-center gap-2 text-base">
             <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: '#4A154B' }}>
               <span className="text-white font-bold text-xs">S</span>
             </div>
             Setup Instructions
           </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-2">
            <p className="flex items-start gap-2">
              <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">1</span>
              <span>Go to <Button variant="link" className="h-auto p-0 text-sm" asChild>
                <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer">
                  Slack Apps page <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </Button></span>
            </p>
            <p className="flex items-start gap-2">
              <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">2</span>
              <span>If you don't have an app:</span>
            </p>
            <div className="ml-7 space-y-1 text-muted-foreground">
              <p>• Create an app from scratch</p>
              <p>• Give it a name and select your workspace</p>
            </div>
            <p className="flex items-start gap-2">
              <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">3</span>
              <span>Go to "Basic Information", find the "Signing Secret", and paste it in the field below.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">4</span>
              <span>Go to "OAuth & Permissions" and add bot token scopes:</span>
            </p>
            <div className="ml-7 space-y-1">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">app_mentions:read</Badge>
                <span className="text-muted-foreground text-xs">- For viewing messages that tag your bot with an @</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">chat:write</Badge>
                <span className="text-muted-foreground text-xs">- To send messages to channels your bot is a part of</span>
              </div>
            </div>
            <p className="flex items-start gap-2">
              <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">5</span>
              <span>Go to "Event Subscriptions":</span>
            </p>
            <div className="ml-7 space-y-1 text-muted-foreground">
              <p>• Enable events</p>
              <p>• Under "Subscribe to Bot Events", add <Badge variant="outline" className="text-xs">app_mention</Badge> to listen to messages that mention your bot</p>
            </div>
            <p className="flex items-start gap-2">
              <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">6</span>
              <span>Paste the Webhook URL (from above) into the "Request URL" field</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">7</span>
              <span>Save changes in both Slack and here.</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="webhook-url" className="text-sm font-medium flex items-center gap-2">
            Request URL (copy from above)
            <span className="text-red-500">*</span>
            {getFieldStatus('webhook_url') === 'success' && (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
            {getFieldStatus('webhook_url') === 'error' && (
              <AlertCircle className="h-4 w-4 text-red-500" />
            )}
          </Label>
          <Input
            id="webhook-url"
            placeholder="Paste the webhook URL from above"
            value={config?.webhook_url || ''}
            onChange={(e) => updateConfig('webhook_url', e.target.value)}
            onBlur={(e) => validateField('webhook_url', e.target.value)}
            className={getFieldStatus('webhook_url') === 'error' ? 'border-red-500' : ''}
          />
          {errors.webhook_url && (
            <p className="text-xs text-red-500">{errors.webhook_url}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="signing-secret" className="text-sm font-medium flex items-center gap-2">
            Signing Secret
            <span className="text-red-500">*</span>
            {getFieldStatus('signing_secret') === 'success' && (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
            {getFieldStatus('signing_secret') === 'error' && (
              <AlertCircle className="h-4 w-4 text-red-500" />
            )}
          </Label>
          <div className="relative">
            <Input
              id="signing-secret"
              type={showSigningSecret ? "text" : "password"}
              placeholder="Enter your Slack app signing secret"
              value={config?.signing_secret || ''}
              onChange={(e) => updateConfig('signing_secret', e.target.value)}
              onBlur={(e) => validateField('signing_secret', e.target.value)}
              className={getFieldStatus('signing_secret') === 'error' ? 'border-red-500 pr-10' : 'pr-10'}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowSigningSecret(!showSigningSecret)}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
            >
              {showSigningSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {errors.signing_secret && (
            <p className="text-xs text-red-500">{errors.signing_secret}</p>
          )}
        </div>
      </div>
         </div>
   );
 } 