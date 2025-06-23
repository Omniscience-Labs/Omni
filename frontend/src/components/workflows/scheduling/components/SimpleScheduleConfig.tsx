"use client";

import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { SimpleScheduleConfig as SimpleScheduleConfigType } from '../types';

interface SimpleScheduleConfigProps {
  config: SimpleScheduleConfigType;
  onChange: (config: SimpleScheduleConfigType) => void;
}

export function SimpleScheduleConfig({ config, onChange }: SimpleScheduleConfigProps) {
  const handleIntervalTypeChange = (interval_type: 'minutes' | 'hours' | 'days' | 'weeks') => {
    onChange({ ...config, interval_type });
  };

  const handleIntervalValueChange = (value: string) => {
    const interval_value = parseInt(value) || 1;
    onChange({ ...config, interval_value });
  };

  const getMaxValue = () => {
    switch (config.interval_type) {
      case 'minutes':
        return 1440;
      case 'hours':
        return 168;
      case 'days':
        return 365;
      case 'weeks':
        return 52;
      default:
        return 999;
    }
  };

  const getExampleText = () => {
    const value = config.interval_value;
    switch (config.interval_type) {
      case 'minutes':
        return `Runs every ${value} minute${value !== 1 ? 's' : ''}`;
      case 'hours':
        return `Runs every ${value} hour${value !== 1 ? 's' : ''}`;
      case 'days':
        return `Runs every ${value} day${value !== 1 ? 's' : ''}`;
      case 'weeks':
        return `Runs every ${value} week${value !== 1 ? 's' : ''}`;
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Configure a simple repeating schedule with fixed intervals.
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Interval Type</Label>
          <Select
            value={config.interval_type}
            onValueChange={handleIntervalTypeChange}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">Minutes</SelectItem>
              <SelectItem value="hours">Hours</SelectItem>
              <SelectItem value="days">Days</SelectItem>
              <SelectItem value="weeks">Weeks</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Interval Value</Label>
          <Input
            type="number"
            min="1"
            max={getMaxValue()}
            value={config.interval_value}
            onChange={(e) => handleIntervalValueChange(e.target.value)}
            placeholder="1"
          />
        </div>
      </div>
      <div className="p-3 bg-muted/50 rounded-lg">
        <div className="text-sm font-medium mb-1">Schedule Preview</div>
        <div className="text-sm text-muted-foreground">
          {getExampleText()}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Quick Presets</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="p-2 text-left text-sm border rounded hover:bg-muted/50 transition-colors"
            onClick={() => onChange({ interval_type: 'minutes', interval_value: 15 })}
          >
            Every 15 minutes
          </button>
          <button
            type="button"
            className="p-2 text-left text-sm border rounded hover:bg-muted/50 transition-colors"
            onClick={() => onChange({ interval_type: 'hours', interval_value: 1 })}
          >
            Every hour
          </button>
          <button
            type="button"
            className="p-2 text-left text-sm border rounded hover:bg-muted/50 transition-colors"
            onClick={() => onChange({ interval_type: 'hours', interval_value: 6 })}
          >
            Every 6 hours
          </button>
          <button
            type="button"
            className="p-2 text-left text-sm border rounded hover:bg-muted/50 transition-colors"
            onClick={() => onChange({ interval_type: 'days', interval_value: 1 })}
          >
            Daily
          </button>
        </div>
      </div>
    </div>
  );
} 