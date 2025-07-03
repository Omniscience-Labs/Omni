 "use client";

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Eye, EyeOff, Plus, X } from 'lucide-react';
import { SlackTriggerConfig } from '../types';

interface SlackTriggerConfigFormProps {
  config: SlackTriggerConfig;
  onChange: (config: SlackTriggerConfig) => void;
  errors: Record<string, string>;
}

export const SlackTriggerConfigForm: React.FC<SlackTriggerConfigFormProps> = ({
  config,
  onChange,
  errors,
}) => {
  const [showSigningSecret, setShowSigningSecret] = useState(false);
  const [showBotToken, setShowBotToken] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [newChannel, setNewChannel] = useState('');

  const updateConfig = (updates: Partial<SlackTriggerConfig>) => {
    onChange({ ...config, ...updates });
  };

  const addKeyword = () => {
    if (newKeyword.trim()) {
      const keywords = config.trigger_keywords || [];
      updateConfig({
        trigger_keywords: [...keywords, newKeyword.trim()]
      });
      setNewKeyword('');
    }
  };

  const removeKeyword = (index: number) => {
    const keywords = config.trigger_keywords || [];
    updateConfig({
      trigger_keywords: keywords.filter((_, i) => i !== index)
    });
  };

  const addChannel = () => {
    if (newChannel.trim()) {
      const channels = config.allowed_channels || [];
      updateConfig({
        allowed_channels: [...channels, newChannel.trim()]
      });
      setNewChannel('');
    }
  };

  const removeChannel = (index: number) => {
    const channels = config.allowed_channels || [];
    updateConfig({
      allowed_channels: channels.filter((_, i) => i !== index)
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="signing-secret">Signing Secret *</Label>
        <div className="relative">
          <Input
            id="signing-secret"
            type={showSigningSecret ? 'text' : 'password'}
            value={config.signing_secret || ''}
            onChange={(e) => updateConfig({ signing_secret: e.target.value })}
            placeholder="Your Slack app's signing secret"
            className={errors.signing_secret ? 'border-destructive pr-10' : 'pr-10'}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3"
            onClick={() => setShowSigningSecret(!showSigningSecret)}
          >
            {showSigningSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        {errors.signing_secret && (
          <p className="text-sm text-destructive">{errors.signing_secret}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Found in your Slack app settings under "Basic Information"
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="bot-token">Bot Token (Optional)</Label>
        <div className="relative">
          <Input
            id="bot-token"
            type={showBotToken ? 'text' : 'password'}
            value={config.bot_token || ''}
            onChange={(e) => updateConfig({ bot_token: e.target.value })}
            placeholder="xoxb-your-bot-token"
            className={showBotToken ? 'pr-10' : 'pr-10'}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3"
            onClick={() => setShowBotToken(!showBotToken)}
          >
            {showBotToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Required if you want the agent to respond back to Slack
        </p>
      </div>
      <div className="space-y-3">
        <Label>Allowed Channels</Label>
        <div className="flex space-x-2">
          <Input
            value={newChannel}
            onChange={(e) => setNewChannel(e.target.value)}
            placeholder="#general, #support, etc."
            onKeyPress={(e) => e.key === 'Enter' && addChannel()}
          />
          <Button onClick={addChannel} size="sm">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {config.allowed_channels && config.allowed_channels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {config.allowed_channels.map((channel, index) => (
              <Badge key={index} variant="secondary" className="flex items-center gap-1">
                {channel}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0"
                  onClick={() => removeChannel(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Leave empty to allow all channels
        </p>
      </div>
      <div className="space-y-3">
        <Label>Trigger Keywords</Label>
        <div className="flex space-x-2">
          <Input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="support, help, question, etc."
            onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
          />
          <Button onClick={addKeyword} size="sm">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {config.trigger_keywords && config.trigger_keywords.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {config.trigger_keywords.map((keyword, index) => (
              <Badge key={index} variant="secondary" className="flex items-center gap-1">
                {keyword}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0"
                  onClick={() => removeKeyword(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Keywords in messages that will trigger the agent
        </p>
      </div>
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Switch
            checked={config.respond_to_mentions || false}
            onCheckedChange={(checked) => updateConfig({ respond_to_mentions: checked })}
          />
          <Label>Respond to mentions</Label>
        </div>
        
        <div className="flex items-center space-x-2">
          <Switch
            checked={config.respond_to_direct_messages || false}
            onCheckedChange={(checked) => updateConfig({ respond_to_direct_messages: checked })}
          />
          <Label>Respond to direct messages</Label>
        </div>
      </div>
    </div>
  );
};