"use client";

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Eye, EyeOff, Plus, X } from 'lucide-react';
import { TelegramTriggerConfig } from '../types';

interface TelegramTriggerConfigFormProps {
  config: TelegramTriggerConfig;
  onChange: (config: TelegramTriggerConfig) => void;
  errors: Record<string, string>;
}

export const TelegramTriggerConfigForm: React.FC<TelegramTriggerConfigFormProps> = ({
  config,
  onChange,
  errors,
}) => {
  const [showBotToken, setShowBotToken] = useState(false);
  const [newCommand, setNewCommand] = useState('');
  const [newKeyword, setNewKeyword] = useState('');

  const updateConfig = (updates: Partial<TelegramTriggerConfig>) => {
    onChange({ ...config, ...updates });
  };

  const addCommand = () => {
    if (newCommand.trim()) {
      const commands = config.trigger_commands || [];
      updateConfig({
        trigger_commands: [...commands, newCommand.trim()]
      });
      setNewCommand('');
    }
  };

  const removeCommand = (index: number) => {
    const commands = config.trigger_commands || [];
    updateConfig({
      trigger_commands: commands.filter((_, i) => i !== index)
    });
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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="bot-token">Bot Token *</Label>
        <div className="relative">
          <Input
            id="bot-token"
            type={showBotToken ? 'text' : 'password'}
            value={config.bot_token || ''}
            onChange={(e) => updateConfig({ bot_token: e.target.value })}
            placeholder="123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
            className={errors.bot_token ? 'border-destructive pr-10' : 'pr-10'}
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
        {errors.bot_token && (
          <p className="text-sm text-destructive">{errors.bot_token}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Get your bot token from @BotFather on Telegram
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="secret-token">Secret Token (Optional)</Label>
        <Input
          id="secret-token"
          value={config.secret_token || ''}
          onChange={(e) => updateConfig({ secret_token: e.target.value })}
          placeholder="Optional webhook secret for additional security"
        />
        <p className="text-xs text-muted-foreground">
          Additional security token for webhook verification
        </p>
      </div>
      <div className="space-y-3">
        <Label>Trigger Commands</Label>
        <div className="flex space-x-2">
          <Input
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            placeholder="/start, /help, etc."
            onKeyPress={(e) => e.key === 'Enter' && addCommand()}
          />
          <Button onClick={addCommand} size="sm">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {config.trigger_commands && config.trigger_commands.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {config.trigger_commands.map((command, index) => (
              <Badge key={index} variant="secondary" className="flex items-center gap-1">
                {command}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0"
                  onClick={() => removeCommand(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Commands that will trigger the agent (e.g., /help, /start)
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
            checked={config.respond_to_all_messages || false}
            onCheckedChange={(checked) => updateConfig({ respond_to_all_messages: checked })}
          />
          <Label>Respond to all messages</Label>
        </div>
        <p className="text-xs text-muted-foreground ml-6">
          If enabled, the agent will respond to every message, ignoring commands and keywords
        </p>
      </div>
    </div>
  );
}; 