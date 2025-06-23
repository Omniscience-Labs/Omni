"use client";

import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { AdvancedScheduleConfig as AdvancedScheduleConfigType, CronValidationResponse } from '../types';

interface AdvancedScheduleConfigProps {
  config: AdvancedScheduleConfigType;
  onChange: (config: AdvancedScheduleConfigType) => void;
  validation?: CronValidationResponse | null;
}

export function AdvancedScheduleConfig({ config, onChange, validation }: AdvancedScheduleConfigProps) {
  const [isValidating, setIsValidating] = useState(false);

  const handleChange = (field: keyof AdvancedScheduleConfigType, value: any) => {
    onChange({ ...config, [field]: value });
  };

  const validateExpression = async () => {
    if (!config.cron_expression?.trim()) return;
    setIsValidating(true);
    try {
      const response = await fetch('/api/v1/schedules/validate/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cron_expression: config.cron_expression })
      });
      const result: CronValidationResponse = await response.json();
    } catch (error) {
      console.error('Failed to validate cron expression:', error);
    } finally {
      setIsValidating(false);
    }
  };

  const timezones = [
    { value: 'UTC', label: 'UTC' },
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'Europe/London', label: 'London (GMT)' },
    { value: 'Europe/Paris', label: 'Paris (CET)' },
    { value: 'Europe/Berlin', label: 'Berlin (CET)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  ];

  const formatDateForInput = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toISOString().slice(0, 16);
    } catch {
      return '';
    }
  };

  const handleDateChange = (field: 'start_date' | 'end_date', value: string) => {
    const isoString = value ? new Date(value).toISOString() : undefined;
    handleChange(field, isoString);
  };

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Configure advanced scheduling options with timezone support, date ranges, and execution limits.
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Cron Expression *</Label>
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
              value={config.cron_expression}
              onChange={(e) => handleChange('cron_expression', e.target.value)}
              placeholder="0 9 * * 1-5"
              className="font-mono"
            />
            <Button
              variant="outline"
              onClick={validateExpression}
              disabled={isValidating || !config.cron_expression?.trim()}
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
        <div className="space-y-2">
          <Label>Timezone</Label>
          <Select
            value={config.timezone}
            onValueChange={(value) => handleChange('timezone', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezones.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Start Date (Optional)</Label>
            <Input
              type="datetime-local"
              value={formatDateForInput(config.start_date)}
              onChange={(e) => handleDateChange('start_date', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>End Date (Optional)</Label>
            <Input
              type="datetime-local"
              value={formatDateForInput(config.end_date)}
              onChange={(e) => handleDateChange('end_date', e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Maximum Executions (Optional)</Label>
          <Input
            type="number"
            min="1"
            max="10000"
            value={config.max_executions || ''}
            onChange={(e) => handleChange('max_executions', e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="Leave empty for unlimited"
          />
          <div className="text-xs text-muted-foreground">
            The schedule will stop after this many executions
          </div>
        </div>
        <div className="p-3 bg-muted/50 rounded-lg">
          <div className="text-sm font-medium mb-2">Advanced Features</div>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Timezone support for accurate scheduling across regions</li>
            <li>• Date range limits for temporary schedules</li>
            <li>• Execution count limits for finite schedules</li>
            <li>• All cron expressions are evaluated in the specified timezone</li>
          </ul>
        </div>
        {(config.start_date || config.end_date || config.max_executions) && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm font-medium mb-2">Schedule Constraints</div>
            <div className="text-xs text-blue-700 space-y-1">
              {config.start_date && (
                <div>Starts: {new Date(config.start_date).toLocaleString()}</div>
              )}
              {config.end_date && (
                <div>Ends: {new Date(config.end_date).toLocaleString()}</div>
              )}
              {config.max_executions && (
                <div>Max executions: {config.max_executions}</div>
              )}
              <div>Timezone: {config.timezone}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
