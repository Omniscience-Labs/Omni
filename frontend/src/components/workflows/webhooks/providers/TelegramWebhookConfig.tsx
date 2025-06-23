"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";
import { TelegramWebhookConfig as TelegramConfig } from "../types";

interface TelegramWebhookConfigProps {
  config?: TelegramConfig;
  onChange: (config: TelegramConfig) => void;
  webhookUrl?: string; // URL from the parent dialog
}

export function TelegramWebhookConfig({ config, onChange, webhookUrl }: TelegramWebhookConfigProps) {
  const [showBotToken, setShowBotToken] = useState(false);
  const [showSecretToken, setShowSecretToken] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize webhook URL if not set
  useEffect(() => {
    if (webhookUrl && (!config?.webhook_url || config.webhook_url === '')) {
      const newConfig = { ...config, webhook_url: webhookUrl };
      onChange(newConfig);
    }
  }, [webhookUrl, config, onChange]);

  const updateConfig = (field: keyof TelegramConfig, value: string) => {
    const newConfig = { ...config, [field]: value };
    onChange(newConfig);
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateField = (field: keyof TelegramConfig, value: string) => {
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
      case 'bot_token':
        if (!value) {
          newErrors[field] = 'Bot token is required';
        } else if (!value.includes(':') || value.length < 40) {
          newErrors[field] = 'Bot token format seems incorrect (should be like 123456:ABC-DEF...)';
        } else {
          delete newErrors[field];
        }
        break;
      case 'secret_token':
        if (value && (value.length < 1 || value.length > 256)) {
          newErrors[field] = 'Secret token must be between 1-256 characters';
        } else {
          delete newErrors[field];
        }
        break;
      default:
        delete newErrors[field];
    }
    
    setErrors(newErrors);
  };

  const getFieldStatus = (field: keyof TelegramConfig) => {
    const value = config?.[field] || '';
    if (errors[field]) return 'error';
    if (value && !errors[field]) return 'success';
    return 'default';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="w-6 h-6 rounded flex items-center justify-center bg-blue-500">
              <span className="text-white font-bold text-xs">T</span>
            </div>
            Setup Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-2">
            <p className="flex items-start gap-2">
              <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">1</span>
              <span>Create a Telegram bot by messaging <Button variant="link" className="h-auto p-0 text-sm" asChild>
                <a href="https://t.me/botfather" target="_blank" rel="noopener noreferrer">
                  @BotFather <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </Button></span>
            </p>
            <p className="flex items-start gap-2">
              <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">2</span>
              <span>Send the command: <Badge variant="outline" className="text-xs">/newbot</Badge></span>
            </p>
            <p className="flex items-start gap-2">
              <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">3</span>
              <span>Follow the prompts to choose a name and username for your bot</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">4</span>
              <span>Copy the bot token from BotFather and paste it below</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">5</span>
              <span>Configure the bot token and secret token below</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">6</span>
              <span>Save the configuration - the webhook will be automatically set up!</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">7</span>
              <span>Start chatting with your bot to trigger workflows!</span>
            </p>
          </div>
        </CardContent>
      </Card>
      
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="webhook-url" className="text-sm font-medium flex items-center gap-2">
            Webhook URL (copy from above)
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
          <Label htmlFor="bot-token" className="text-sm font-medium flex items-center gap-2">
            Bot Token
            <span className="text-red-500">*</span>
            {getFieldStatus('bot_token') === 'success' && (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
            {getFieldStatus('bot_token') === 'error' && (
              <AlertCircle className="h-4 w-4 text-red-500" />
            )}
          </Label>
          <div className="relative">
            <Input
              id="bot-token"
              type={showBotToken ? "text" : "password"}
              placeholder="Enter your Telegram bot token (e.g., 123456:ABC-DEF...)"
              value={config?.bot_token || ''}
              onChange={(e) => updateConfig('bot_token', e.target.value)}
              onBlur={(e) => validateField('bot_token', e.target.value)}
              className={getFieldStatus('bot_token') === 'error' ? 'border-red-500 pr-10' : 'pr-10'}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowBotToken(!showBotToken)}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
            >
              {showBotToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {errors.bot_token && (
            <p className="text-xs text-red-500">{errors.bot_token}</p>
          )}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="secret-token" className="text-sm font-medium flex items-center gap-2">
            Secret Token (Optional)
            {getFieldStatus('secret_token') === 'success' && (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
            {getFieldStatus('secret_token') === 'error' && (
              <AlertCircle className="h-4 w-4 text-red-500" />
            )}
          </Label>
          <div className="relative">
            <Input
              id="secret-token"
              type={showSecretToken ? "text" : "password"}
              placeholder="Enter secret token for additional security (optional)"
              value={config?.secret_token || ''}
              onChange={(e) => updateConfig('secret_token', e.target.value)}
              onBlur={(e) => validateField('secret_token', e.target.value)}
              className={getFieldStatus('secret_token') === 'error' ? 'border-red-500 pr-10' : 'pr-10'}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowSecretToken(!showSecretToken)}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
            >
              {showSecretToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {errors.secret_token && (
            <p className="text-xs text-red-500">{errors.secret_token}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Secret token provides additional security by verifying requests come from Telegram
          </p>
        </div>
      </div>
    </div>
  );
} 