"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { 
  Clock, 
  Calendar as CalendarIcon, 
  Repeat, 
  Settings2,
  AlertCircle,
  CheckCircle,
  Info
} from 'lucide-react';
import { format, addDays, addWeeks, addMonths, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { ScheduleConfig, SimpleScheduleConfig, AdvancedScheduleConfig } from '../types';

interface UserFriendlyScheduleConfigProps {
  config: ScheduleConfig;
  onChange: (config: ScheduleConfig) => void;
}

type ScheduleFrequency = 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

const FREQUENCY_OPTIONS = [
  { value: 'once', label: 'Run Once', icon: '⚡', description: 'Execute once at a specific time' },
  { value: 'hourly', label: 'Every Hour', icon: '🕐', description: 'Run every hour' },
  { value: 'daily', label: 'Daily', icon: '📅', description: 'Run once per day' },
  { value: 'weekly', label: 'Weekly', icon: '📆', description: 'Run once per week' },
  { value: 'monthly', label: 'Monthly', icon: '🗓️', description: 'Run once per month' },
  { value: 'custom', label: 'Custom', icon: '⚙️', description: 'Custom schedule pattern' }
];

const WEEKDAYS = [
  { value: '1', label: 'Monday', short: 'Mon' },
  { value: '2', label: 'Tuesday', short: 'Tue' },
  { value: '3', label: 'Wednesday', short: 'Wed' },
  { value: '4', label: 'Thursday', short: 'Thu' },
  { value: '5', label: 'Friday', short: 'Fri' },
  { value: '6', label: 'Saturday', short: 'Sat' },
  { value: '0', label: 'Sunday', short: 'Sun' }
];

export function UserFriendlyScheduleConfig({ config, onChange }: UserFriendlyScheduleConfigProps) {
  const [frequency, setFrequency] = useState<ScheduleFrequency>('daily');
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [time, setTime] = useState('09:00');
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>(['1', '2', '3', '4', '5']); // Weekdays by default
  const [monthlyDay, setMonthlyDay] = useState(1);
  const [customInterval, setCustomInterval] = useState(1);
  const [customUnit, setCustomUnit] = useState<'minutes' | 'hours' | 'days' | 'weeks'>('hours');
  const [hasEndDate, setHasEndDate] = useState(false);

  // Initialize state from config
  useEffect(() => {
    if (config.type === 'simple' && config.simple) {
      const { interval_type, interval_value } = config.simple;
      setCustomInterval(interval_value);
      setCustomUnit(interval_type);
      
      if (interval_type === 'hours' && interval_value === 1) {
        setFrequency('hourly');
      } else if (interval_type === 'days' && interval_value === 1) {
        setFrequency('daily');
      } else if (interval_type === 'weeks' && interval_value === 1) {
        setFrequency('weekly');
      } else {
        setFrequency('custom');
      }
    } else if (config.type === 'advanced' && config.advanced) {
      const { start_date, end_date } = config.advanced;
      if (start_date) setStartDate(new Date(start_date));
      if (end_date) {
        setEndDate(new Date(end_date));
        setHasEndDate(true);
      }
      setFrequency('custom');
    }
  }, [config]);

  const handleFrequencyChange = (newFrequency: ScheduleFrequency) => {
    setFrequency(newFrequency);
    updateScheduleConfig(newFrequency);
  };

  const updateScheduleConfig = (freq = frequency) => {
    const [hour, minute] = time.split(':').map(Number);
    
    let newConfig: ScheduleConfig;

    switch (freq) {
      case 'once':
        if (!startDate) return;
        
        newConfig = {
          type: 'advanced',
          enabled: true,
          advanced: {
            cron_expression: `${minute} ${hour} ${startDate.getDate()} ${startDate.getMonth() + 1} *`,
            timezone: 'UTC',
            start_date: startOfDay(startDate).toISOString(),
            end_date: endOfDay(startDate).toISOString(),
            max_executions: 1
          }
        };
        break;

      case 'hourly':
        newConfig = {
          type: 'simple',
          enabled: true,
          simple: {
            interval_type: 'hours',
            interval_value: 1
          }
        };
        break;

      case 'daily':
        newConfig = {
          type: 'cron',
          enabled: true,
          cron: {
            cron_expression: `${minute} ${hour} * * *`
          }
        };
        break;

      case 'weekly':
        const weekdaysCron = selectedWeekdays.join(',');
        newConfig = {
          type: 'cron',
          enabled: true,
          cron: {
            cron_expression: `${minute} ${hour} * * ${weekdaysCron}`
          }
        };
        break;

      case 'monthly':
        newConfig = {
          type: 'cron',
          enabled: true,
          cron: {
            cron_expression: `${minute} ${hour} ${monthlyDay} * *`
          }
        };
        break;

      case 'custom':
        newConfig = {
          type: 'simple',
          enabled: true,
          simple: {
            interval_type: customUnit,
            interval_value: customInterval
          }
        };
        break;

      default:
        return;
    }

    // Add advanced options if needed
    if ((freq === 'daily' || freq === 'weekly' || freq === 'monthly') && (startDate || hasEndDate)) {
      newConfig = {
        type: 'advanced',
        enabled: true,
        advanced: {
          cron_expression: newConfig.type === 'cron' ? newConfig.cron!.cron_expression : '0 9 * * *',
          timezone: 'UTC',
          start_date: startDate?.toISOString(),
          end_date: hasEndDate && endDate ? endDate.toISOString() : undefined
        }
      };
    }

    onChange(newConfig);
  };

  const getNextRuns = () => {
    const now = new Date();
    const [hour, minute] = time.split(':').map(Number);
    const runs: Date[] = [];

    switch (frequency) {
      case 'once':
        if (startDate) {
          const runTime = new Date(startDate);
          runTime.setHours(hour, minute, 0, 0);
          runs.push(runTime);
        }
        break;

      case 'hourly':
        for (let i = 0; i < 5; i++) {
          const next = new Date(now);
          next.setHours(now.getHours() + i + 1, minute, 0, 0);
          runs.push(next);
        }
        break;

      case 'daily':
        for (let i = 0; i < 5; i++) {
          const next = addDays(now, i + 1);
          next.setHours(hour, minute, 0, 0);
          runs.push(next);
        }
        break;

      case 'weekly':
        const today = now.getDay();
        for (const weekday of selectedWeekdays.slice(0, 3)) {
          const targetDay = parseInt(weekday) === 0 ? 7 : parseInt(weekday); // Convert Sunday
          const daysUntil = (targetDay - today + 7) % 7 || 7;
          const next = addDays(now, daysUntil);
          next.setHours(hour, minute, 0, 0);
          runs.push(next);
        }
        break;

      case 'monthly':
        for (let i = 0; i < 3; i++) {
          const next = addMonths(now, i + 1);
          next.setDate(monthlyDay);
          next.setHours(hour, minute, 0, 0);
          runs.push(next);
        }
        break;
    }

    return runs.sort((a, b) => a.getTime() - b.getTime()).slice(0, 3);
  };

  const toggleWeekday = (day: string) => {
    const newSelection = selectedWeekdays.includes(day)
      ? selectedWeekdays.filter(d => d !== day)
      : [...selectedWeekdays, day];
    setSelectedWeekdays(newSelection);
  };

  useEffect(() => {
    updateScheduleConfig();
  }, [time, selectedWeekdays, monthlyDay, customInterval, customUnit, startDate, endDate, hasEndDate]);

  return (
    <div className="space-y-6">
      {/* Frequency Selection */}
      <div className="space-y-3">
        <Label className="text-base font-medium">How often should this workflow run?</Label>
        <div className="grid grid-cols-2 gap-3">
          {FREQUENCY_OPTIONS.map((option) => (
            <Card
              key={option.value}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                frequency === option.value 
                  ? "ring-2 ring-primary bg-primary/5" 
                  : "hover:bg-muted/50"
              )}
              onClick={() => handleFrequencyChange(option.value as ScheduleFrequency)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{option.icon}</span>
                  <div>
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-muted-foreground">{option.description}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Time Selection */}
      {frequency !== 'hourly' && frequency !== 'custom' && (
        <div className="space-y-2">
          <Label>What time should it run?</Label>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">UTC</span>
          </div>
        </div>
      )}

      {/* Frequency-specific options */}
      {frequency === 'once' && (
        <div className="space-y-2">
          <Label>When should it run?</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !startDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={setStartDate}
                disabled={(date) => date < new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {frequency === 'weekly' && (
        <div className="space-y-2">
          <Label>Which days of the week?</Label>
          <div className="flex gap-2">
            {WEEKDAYS.map((day) => (
              <Button
                key={day.value}
                variant={selectedWeekdays.includes(day.value) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleWeekday(day.value)}
                className="h-10 w-12"
              >
                {day.short}
              </Button>
            ))}
          </div>
        </div>
      )}

      {frequency === 'monthly' && (
        <div className="space-y-2">
          <Label>Which day of the month?</Label>
          <Select value={monthlyDay.toString()} onValueChange={(value) => setMonthlyDay(parseInt(value))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <SelectItem key={day} value={day.toString()}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {frequency === 'custom' && (
        <div className="space-y-3">
          <Label>Custom interval</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm">Every</span>
            <Input
              type="number"
              min="1"
              max="999"
              value={customInterval}
              onChange={(e) => setCustomInterval(parseInt(e.target.value) || 1)}
              className="w-20"
            />
            <Select value={customUnit} onValueChange={(value: 'minutes' | 'hours' | 'days') => setCustomUnit(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Minutes</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Advanced Options */}
      {frequency !== 'once' && frequency !== 'custom' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            <Label className="text-sm font-medium">Advanced Options</Label>
          </div>

          {/* Start Date */}
          <div className="space-y-2">
            <Label className="text-sm">Start Date (Optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "PPP") : "Start immediately"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* End Date Toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-sm">Set an end date</Label>
            <Switch
              checked={hasEndDate}
              onCheckedChange={setHasEndDate}
            />
          </div>

          {/* End Date */}
          {hasEndDate && (
            <div className="space-y-2">
              <Label className="text-sm">End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP") : "Pick an end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    disabled={(date) => date < (startDate || new Date())}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Schedule Preview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            <strong>Frequency:</strong> {FREQUENCY_OPTIONS.find(f => f.value === frequency)?.label}
          </div>
          
          {frequency !== 'custom' && frequency !== 'hourly' && (
            <div className="text-sm">
              <strong>Time:</strong> {time} UTC
            </div>
          )}

          {getNextRuns().length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Next runs:</div>
              <div className="space-y-1">
                {getNextRuns().map((run, index) => (
                  <div key={index} className="text-xs text-muted-foreground flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {format(run, "MMM d, yyyy 'at' h:mm a")}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(startDate || hasEndDate) && (
            <div className="pt-2 border-t">
              <div className="text-xs text-muted-foreground space-y-1">
                {startDate && <div>Starts: {format(startDate, "PPP")}</div>}
                {hasEndDate && endDate && <div>Ends: {format(endDate, "PPP")}</div>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 