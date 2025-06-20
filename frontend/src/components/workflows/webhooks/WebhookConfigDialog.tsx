"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SlackWebhookConfig } from "./providers/SlackWebhookConfig";
import { TelegramWebhookConfig } from "./providers/TelegramWebhookConfig";
import { WebhookConfig } from "./types";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface WebhookConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config?: WebhookConfig;
  onSave: (config: WebhookConfig) => void;
  workflowId?: string;
}

export function WebhookConfigDialog({
  open,
  onOpenChange,
  config,
  onSave,
  workflowId
}: WebhookConfigDialogProps) {
  const [webhookConfig, setWebhookConfig] = useState<WebhookConfig>(
    config || {
      type: 'slack',
      method: 'POST',
      authentication: 'none'
    }
  );
  const [copied, setCopied] = useState(false);
  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000'}/api/webhooks/trigger/${workflowId}`;
  
  const handleSave = () => {
    if (webhookConfig.type === 'slack') {
      if (!webhookConfig.slack?.webhook_url || !webhookConfig.slack?.signing_secret) {
        toast.error("Please fill in all required Slack configuration fields");
        return;
      }
    } else if (webhookConfig.type === 'telegram') {
      if (!webhookConfig.telegram?.webhook_url || !webhookConfig.telegram?.bot_token) {
        toast.error("Please fill in all required Telegram configuration fields");
        return;
      }
    }
    
    onSave(webhookConfig);
    
    if (webhookConfig.type === 'telegram') {
      toast.success("Telegram webhook configuration saved! The webhook will be automatically set up with Telegram.");
    } else {
      toast.success("Webhook configuration saved successfully!");
    }
    
    onOpenChange(false);
  };

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      toast.success("Webhook URL copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy webhook URL");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure Webhook</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <Tabs
            value={webhookConfig.type}
            onValueChange={(value) =>
              setWebhookConfig(prev => ({ ...prev, type: value as 'slack' | 'telegram' | 'generic' }))
            }
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="slack">Slack</TabsTrigger>
              <TabsTrigger value="telegram">Telegram</TabsTrigger>
            </TabsList>
            
            <TabsContent value="slack" className="space-y-4">
              <SlackWebhookConfig
                config={webhookConfig.slack}
                webhookUrl={webhookUrl}
                onChange={(slackConfig) =>
                  setWebhookConfig(prev => ({ ...prev, slack: slackConfig }))
                }
              />
            </TabsContent>
            
            <TabsContent value="telegram" className="space-y-4">
              <TelegramWebhookConfig
                config={webhookConfig.telegram}
                webhookUrl={webhookUrl}
                onChange={(telegramConfig) =>
                  setWebhookConfig(prev => ({ ...prev, telegram: telegramConfig }))
                }
              />
            </TabsContent>
          </Tabs>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 