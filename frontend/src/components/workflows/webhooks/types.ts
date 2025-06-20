export interface SlackWebhookConfig {
  webhook_url: string;
  signing_secret: string;
  channel?: string;
  username?: string;
}

export interface TelegramWebhookConfig {
  webhook_url: string;
  bot_token: string;
  secret_token?: string;
}

export interface GenericWebhookConfig {
  url: string;
  headers?: Record<string, string>;
  auth_token?: string;
}

export interface WebhookConfig {
  type: 'slack' | 'telegram' | 'generic';
  method?: 'POST' | 'GET' | 'PUT';
  authentication?: 'none' | 'api_key' | 'bearer';
  slack?: SlackWebhookConfig;
  telegram?: TelegramWebhookConfig;
  generic?: GenericWebhookConfig;
}

export interface WebhookProvider {
  id: string;
  name: string;
  icon: string;
  description: string;
  configComponent: React.ComponentType<any>;
} 