"use client";

import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { CronScheduleConfig as CronScheduleConfigType, CronValidationResponse } from '../types';

interface CronScheduleConfigProps {
  config: CronScheduleConfigType;
  onChange: (config: CronScheduleConfigType) => void;
  validation?: CronValidationResponse | null;
}

export function CronScheduleConfig({ config, onChange, validation }: CronScheduleConfigProps) {
  const [localExpression, setLocalExpression] = useState(config.cron_expression);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    setLocalExpression(config.cron_expression);
  }, [config.cron_expression]);

  const handleExpressionChange = (value: string) => {
    setLocalExpression(value);
    onChange({ cron_expression: value });
  };

  const validateExpression = async () => {
    if (!localExpression.trim()) return;
    
    setIsValidating(true);
    try {
      const response = await fetch('/api/v1/schedules/validate/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cron_expression: localExpression })
      });
      
      const result: CronValidationResponse = await response.json();
    } catch (error) {
      console.error('Failed to validate cron expression:', error);
    } finally {
      setIsValidating(false);
    }
  };

  const commonExpressions = [
    { label: 'Every minute', expression: '* * * * *' },
    { label: 'Every 5 minutes', expression: '*/5 * * * *' },
    { label: 'Every 15 minutes', expression: '*/15 * * * *' },
    { label: 'Every 30 minutes', expression: '*/30 * * * *' },
    { label: 'Every hour', expression: '0 * * * *' },
    { label: 'Every 2 hours', expression: '0 */2 * * *' },
    { label: 'Every 6 hours', expression: '0 */6 * * *' },
    { label: 'Daily at midnight', expression: '0 0 * * *' },
    { label: 'Daily at 9 AM', expression: '0 9 * * *' },
    { label: 'Daily at 6 PM', expression: '0 18 * * *' },
    { label: 'Weekdays at 9 AM', expression: '0 9 * * 1-5' },
    { label: 'Weekly on Monday', expression: '0 9 * * 1' },
    { label: 'Monthly on 1st', expression: '0 9 1 * *' },
  ];

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Configure a schedule using cron expressions for precise timing control.
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Cron Expression</Label>
            <a
              href="https://crontab.guru"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              Help with cron expressions
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex gap-2">
            <Input
              value={localExpression}
              onChange={(e) => handleExpressionChange(e.target.value)}
              placeholder="0 9 * * 1-5"
              className="font-mono"
            />
            <Button
              variant="outline"
              onClick={validateExpression}
              disabled={isValidating || !localExpression.trim()}
            >
              {isValidating ? 'Validating...' : 'Validate'}
            </Button>
          </div>
        </div>

        {validation && (
          <Alert className={validation.valid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
            {validation.valid ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
            <AlertDescription>
              {validation.valid ? (
                <div>
                  <div className="font-medium">Valid cron expression</div>
                  {validation.description && (
                    <div className="text-sm mt-1">{validation.description}</div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="font-medium">Invalid cron expression</div>
                  <div className="text-sm mt-1">{validation.error}</div>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="p-3 bg-muted/50 rounded-lg">
          <div className="text-sm font-medium mb-2">Cron Format</div>
          <div className="text-xs text-muted-foreground font-mono">
            ┌───────────── minute (0 - 59)<br />
            │ ┌───────────── hour (0 - 23)<br />
            │ │ ┌───────────── day of month (1 - 31)<br />
            │ │ │ ┌───────────── month (1 - 12)<br />
            │ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)<br />
            │ │ │ │ │<br />
            * * * * *
          </div>
        </div>

        <div className="space-y-2">
          <Label>Common Expressions</Label>
          <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
            {commonExpressions.map((item, index) => (
              <button
                key={index}
                type="button"
                className="flex items-center justify-between p-2 text-left text-sm border rounded hover:bg-muted/50 transition-colors"
                onClick={() => handleExpressionChange(item.expression)}
              >
                <span>{item.label}</span>
                <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                  {item.expression}
                </code>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 