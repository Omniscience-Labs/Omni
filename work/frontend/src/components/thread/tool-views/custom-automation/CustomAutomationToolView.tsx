import React, { useState } from 'react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Upload, Play, Settings, List, Cog, FileCode, Chrome } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CustomAutomationToolViewProps extends ToolViewProps {}

export function CustomAutomationToolView({ 
  toolContent, 
  name, 
  className,
  ...props 
}: CustomAutomationToolViewProps) {
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);

  const toolData = toolContent?.content;
  
  // Parse function name from tool content
  const functionName = toolData?.function_name || name || 'custom_automation';
  
  // Get appropriate icon and title based on function
  const getToolDetails = () => {
    switch (functionName) {
      case 'configure_custom_automation':
        return {
          icon: Settings,
          title: '🔧 Custom Automation',
          subtitle: 'Configuration',
          color: 'bg-purple-500'
        };
      case 'run_custom_automation':
        return {
          icon: Play,
          title: '▶️ Custom Automation', 
          subtitle: 'Execution',
          color: 'bg-green-500'
        };
      case 'list_custom_automations':
        return {
          icon: List,
          title: '📋 Custom Automations',
          subtitle: 'Management',
          color: 'bg-blue-500'
        };
      default:
        return {
          icon: Cog,
          title: '🤖 Custom Automation',
          subtitle: 'Browser Automation',
          color: 'bg-purple-500'
        };
    }
  };

  const { icon: Icon, title, subtitle, color } = getToolDetails();

  return (
    <Card className={cn('border-l-4 border-l-purple-500', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg text-white', color)}>
            <Icon size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-lg">{title}</h3>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <Badge variant="outline" className="ml-auto">
            Custom Tool
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Configuration Form for configure function */}
        {functionName === 'configure_custom_automation' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="config-name">Configuration Name</Label>
                <Input 
                  id="config-name" 
                  placeholder="e.g., Arcadia Automation"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Input 
                  id="description" 
                  placeholder="Brief description of automation"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Chrome Profile Upload */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Chrome size={16} />
                Chrome Profile (.zip)
              </Label>
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Upload your Chrome profile zip file
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Contains saved logins, cookies, and browser settings
                </p>
                <Button variant="outline" className="mt-3">
                  Choose File
                </Button>
              </div>
            </div>

            {/* JavaScript Script */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileCode size={16} />
                Automation Script (.js)
              </Label>
              <Textarea 
                placeholder={`// Example Playwright/Stagehand automation script
import { chromium } from 'playwright';

async function customAutomation() {
  const context = await chromium.launchPersistentContext('./contexts/profile', {
    headless: false,
    viewport: { width: 1280, height: 720 }
  });
  
  const page = context.pages()[0] || await context.newPage();
  
  // Your automation logic here...
  await page.goto('https://example.com');
  
  await context.close();
}`}
                className="min-h-[200px] font-mono text-sm"
              />
            </div>

            <Button className="w-full bg-purple-600 hover:bg-purple-700">
              <Settings className="mr-2 h-4 w-4" />
              Save Configuration
            </Button>
          </div>
        )}

        {/* Execution View for run function */}
        {functionName === 'run_custom_automation' && (
          <div className="space-y-4">
            {toolData?.result && (
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Play className="h-4 w-4 text-green-600" />
                  <span className="font-medium">Automation Executed</span>
                </div>
                <pre className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {typeof toolData.result === 'string' 
                    ? toolData.result 
                    : JSON.stringify(toolData.result, null, 2)}
                </pre>
              </div>
            )}
            
            {toolData?.status && (
              <Badge variant={toolData.status === 'success' ? 'default' : 'destructive'}>
                {toolData.status}
              </Badge>
            )}
          </div>
        )}

        {/* List View for list function */}
        {functionName === 'list_custom_automations' && (
          <div className="space-y-4">
            {toolData?.configurations && Array.isArray(toolData.configurations) && (
              <div className="space-y-2">
                {toolData.configurations.map((config: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <h4 className="font-medium">{config.config_name}</h4>
                      <p className="text-sm text-muted-foreground">{config.description}</p>
                    </div>
                    <Badge variant="outline">
                      {new Date(config.created_at).toLocaleDateString()}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            
            {(!toolData?.configurations || toolData.configurations.length === 0) && (
              <div className="text-center p-6 text-muted-foreground">
                <Cog className="mx-auto h-8 w-8 mb-2" />
                <p>No custom automations configured yet</p>
              </div>
            )}
          </div>
        )}

        {/* Generic content display */}
        {toolData && !['configure_custom_automation', 'run_custom_automation', 'list_custom_automations'].includes(functionName) && (
          <div className="bg-muted p-4 rounded-lg">
            <pre className="text-sm whitespace-pre-wrap">
              {typeof toolData === 'string' 
                ? toolData 
                : JSON.stringify(toolData, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}