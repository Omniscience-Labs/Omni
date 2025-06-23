"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Clock, Calendar, Settings, AlertCircle, CheckCircle, Loader2, Sparkles } from 'lucide-react';
import { ScheduleConfig, ScheduleTemplate, CronValidationResponse } from './types';
import { SimpleScheduleConfig } from './components/SimpleScheduleConfig';
import { CronScheduleConfig } from './components/CronScheduleConfig';
import { AdvancedScheduleConfig } from './components/AdvancedScheduleConfig';
import { ScheduleTemplates } from './components/ScheduleTemplates';
import { UserFriendlyScheduleConfig } from './components/UserFriendlyScheduleConfig';
import { useScheduleTemplates, useCronValidation } from '@/hooks/react-query';

interface ScheduleConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  initialConfig?: ScheduleConfig;
  onSave: (config: ScheduleConfig, name: string, description?: string) => Promise<void>;
}

export function ScheduleConfigDialog({
  open,
  onOpenChange,
  workflowId,
  initialConfig,
  onSave
}: ScheduleConfigDialogProps) {
  const [activeTab, setActiveTab] = useState<'quick' | 'templates' | 'advanced'>('quick');
  const [config, setConfig] = useState<ScheduleConfig>({
    type: 'simple',
    enabled: true,
    simple: {
      interval_type: 'hours',
      interval_value: 1
    }
  });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: templates, isLoading: templatesLoading } = useScheduleTemplates();
  
  const cronExpression = config.type === 'cron' ? config.cron?.cron_expression : 
                        config.type === 'advanced' ? config.advanced?.cron_expression : '';
  
  const { data: cronValidation } = useCronValidation(cronExpression || '');

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
      // Determine the best tab based on config complexity
      if (initialConfig.type === 'advanced' && (
        initialConfig.advanced?.start_date || 
        initialConfig.advanced?.end_date || 
        initialConfig.advanced?.max_executions ||
        initialConfig.advanced?.timezone !== 'UTC'
      )) {
        setActiveTab('advanced');
      } else {
        setActiveTab('quick');
      }
    } else {
      setConfig({
        type: 'simple',
        enabled: true,
        simple: {
          interval_type: 'hours',
          interval_value: 1
        }
      });
      setActiveTab('quick');
    }
    setName('');
    setDescription('');
    setValidationError(null);
  }, [initialConfig, open]);

  const handleTemplateSelect = (template: ScheduleTemplate) => {
    setConfig(template.config);
    setName(template.name);
    setDescription(template.description);
    // Always switch to quick setup after selecting a template for easy customization
    setActiveTab('quick');
  };

  const handleConfigChange = (newConfig: Partial<ScheduleConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
    setValidationError(null);
  };

  const validateConfig = async (): Promise<boolean> => {
    try {
      setValidationError(null);

      // Basic validation
      if (!name.trim()) {
        setValidationError('Schedule name is required');
        return false;
      }

      // Validate based on type
      if (config.type === 'simple') {
        if (!config.simple?.interval_value || config.simple.interval_value < 1) {
          setValidationError('Interval value must be at least 1');
          return false;
        }
      } else if (config.type === 'cron') {
        if (!config.cron?.cron_expression) {
          setValidationError('Cron expression is required');
          return false;
        }
        
        if (cronValidation && !cronValidation.valid) {
          setValidationError(`Invalid cron expression: ${cronValidation.error}`);
          return false;
        }
      } else if (config.type === 'advanced') {
        if (!config.advanced?.cron_expression) {
          setValidationError('Cron expression is required');
          return false;
        }
        
        if (cronValidation && !cronValidation.valid) {
          setValidationError(`Invalid cron expression: ${cronValidation.error}`);
          return false;
        }

        // Validate date range
        if (config.advanced.start_date && config.advanced.end_date) {
          const startDate = new Date(config.advanced.start_date);
          const endDate = new Date(config.advanced.end_date);
          
          if (endDate <= startDate) {
            setValidationError('End date must be after start date');
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Validation error:', error);
      setValidationError('Failed to validate configuration');
      return false;
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      const isValid = await validateConfig();
      if (!isValid) {
        return;
      }

      await onSave(config, name.trim(), description.trim() || undefined);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save schedule:', error);
      setValidationError('Failed to save schedule. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const getTabIcon = (tab: string) => {
    switch (tab) {
      case 'quick':
        return <Sparkles className="h-4 w-4" />;
      case 'templates':
        return <Calendar className="h-4 w-4" />;
      case 'advanced':
        return <Settings className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getNextExecutionPreview = () => {
    if (cronValidation?.next_executions) {
      return (
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium">Next Executions</span>
          </div>
          <div className="space-y-1">
            {cronValidation.next_executions.slice(0, 3).map((execution, index) => (
              <div key={index} className="text-xs text-muted-foreground">
                {new Date(execution).toLocaleString()}
              </div>
            ))}
          </div>
          {cronValidation.description && (
            <div className="mt-2 text-xs text-muted-foreground">
              {cronValidation.description}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Schedule Your Workflow
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="schedule-name">Schedule Name *</Label>
                <Input
                  id="schedule-name"
                  placeholder="e.g. Daily Data Sync, Weekly Report..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="schedule-description">Description</Label>
                <Input
                  id="schedule-description"
                  placeholder="What does this schedule do?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={config.enabled ? "default" : "secondary"}>
                {config.enabled ? "Enabled" : "Disabled"}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleConfigChange({ enabled: !config.enabled })}
              >
                {config.enabled ? "Disable" : "Enable"}
              </Button>
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="flex-1">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="quick" className="flex items-center gap-2">
                {getTabIcon('quick')}
                Quick Setup
              </TabsTrigger>
              <TabsTrigger value="templates" className="flex items-center gap-2">
                {getTabIcon('templates')}
                Template
              </TabsTrigger>
              {/* <TabsTrigger value="advanced" className="flex items-center gap-2">
                {getTabIcon('advanced')}
                Advanced
              </TabsTrigger> */}
            </TabsList>
            <div className="mt-4 overflow-y-auto max-h-[400px]">
              <TabsContent value="quick" className="mt-0">
                <div className="space-y-4">
                  <UserFriendlyScheduleConfig
                    config={config}
                    onChange={setConfig}
                  />
                </div>
              </TabsContent>
              <TabsContent value="templates" className="mt-0">
                <div className="space-y-4">
                  <ScheduleTemplates onSelect={handleTemplateSelect} />
                </div>
              </TabsContent>
              <TabsContent value="advanced" className="mt-0">
                <div className="space-y-4">
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <Label className="text-base font-medium">Cron Expression</Label>
                      <div className="space-y-2">
                        <Input
                          placeholder="0 9 * * * (9 AM daily)"
                          value={cronExpression || ''}
                          onChange={(e) => {
                            const expression = e.target.value;
                            handleConfigChange({
                              type: 'advanced',
                              advanced: {
                                ...config.advanced,
                                cron_expression: expression,
                                timezone: config.advanced?.timezone || 'UTC'
                              }
                            });
                          }}
                          className="font-mono"
                        />
                        <div className="text-xs text-muted-foreground">
                          Format: minute hour day month weekday. 
                          <a 
                            href="https://crontab.guru" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline ml-1"
                          >
                            Need help? Use crontab.guru
                          </a>
                        </div>
                      </div>
                    </div>
                    <AdvancedScheduleConfig
                      config={config.advanced || { cron_expression: '', timezone: 'UTC' }}
                      onChange={(advanced) => handleConfigChange({ type: 'advanced', advanced })}
                      validation={cronValidation}
                    />
                  </div>
                </div>
                {getNextExecutionPreview()}
              </TabsContent>
            </div>
          </Tabs>
        </div>
        {validationError && (
          <Alert className="mt-4 text-destructive bg-destructive/10 border-destructive/20">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-destructive">{validationError}</AlertDescription>
          </Alert>
        )}
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 