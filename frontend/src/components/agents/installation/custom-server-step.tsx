import React, { useCallback, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Server, Info, Plus, X } from 'lucide-react';
import type { SetupStep } from './types';

interface CustomServerStepProps {
  step: SetupStep;
  config: Record<string, any>;
  onConfigUpdate: (qualifiedName: string, config: Record<string, any>) => void;
}

interface HeaderEntry {
  id: string;
  key: string;
  value: string;
}

export const CustomServerStep: React.FC<CustomServerStepProps> = ({
  step,
  config,
  onConfigUpdate
}) => {
  // Initialize headers from existing config or empty array
  const [headers, setHeaders] = useState<HeaderEntry[]>(() => {
    if (config.headers && typeof config.headers === 'object') {
      return Object.entries(config.headers).map(([key, value]) => ({
        id: crypto.randomUUID(),
        key,
        value: value as string
      }));
    }
    return [];
  });
  
  const [showSensitiveValues, setShowSensitiveValues] = useState<Record<string, boolean>>({});

  const isSensitiveHeader = (key: string) => {
    return /authorization|bearer|token|key|secret|password|credential/i.test(key);
  };

  const handleFieldChange = useCallback((fieldKey: string, value: string) => {
    const newConfig = {
      ...config,
      [fieldKey]: value
    };
    onConfigUpdate(step.qualified_name, newConfig);
  }, [config, onConfigUpdate, step.qualified_name]);

  const handleAddHeader = () => {
    setHeaders(prev => [...prev, { id: crypto.randomUUID(), key: '', value: '' }]);
  };

  const handleRemoveHeader = (id: string) => {
    const newHeaders = headers.filter(h => h.id !== id);
    setHeaders(newHeaders);
    
    // Update config with new headers
    const headersObject = newHeaders.reduce((acc, h) => {
      if (h.key.trim() && h.value.trim()) {
        acc[h.key.trim()] = h.value.trim();
      }
      return acc;
    }, {} as Record<string, string>);
    
    const newConfig = {
      ...config,
      headers: headersObject
    };
    onConfigUpdate(step.qualified_name, newConfig);
    
    setShowSensitiveValues(prev => { 
      const updated = { ...prev }; 
      delete updated[id]; 
      return updated; 
    });
  };

  const handleHeaderChange = (id: string, field: 'key' | 'value', value: string) => {
    const newHeaders = headers.map(h => h.id === id ? { ...h, [field]: value } : h);
    setHeaders(newHeaders);
    
    // Update config with new headers
    const headersObject = newHeaders.reduce((acc, h) => {
      if (h.key.trim() && h.value.trim()) {
        acc[h.key.trim()] = h.value.trim();
      }
      return acc;
    }, {} as Record<string, string>);
    
    const newConfig = {
      ...config,
      headers: headersObject
    };
    onConfigUpdate(step.qualified_name, newConfig);
  };

  return (
    <div className="space-y-4">
      {step.custom_type && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
            {step.custom_type.toUpperCase()}
          </Badge>
          <span className="text-sm text-muted-foreground">Custom Server</span>
        </div>
      )}
      
      <div className="space-y-4">
        {step.required_fields?.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key} className="text-sm font-medium">
              {field.label}
            </Label>
            <Input
              id={field.key}
              type={field.type}
              placeholder={field.placeholder}
              value={config[field.key] || ''}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              className="h-11"
            />
            {field.description && (
              <div className="flex items-start gap-2">
                <Info className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">{field.description}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Headers section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Custom Headers (Optional)</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Add authentication headers or other custom headers required by your server
            </p>
          </div>
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            onClick={handleAddHeader}
            className="flex-shrink-0"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Header
          </Button>
        </div>
        
        {headers.length > 0 && (
          <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
            {headers.map((header) => {
              const isSensitive = isSensitiveHeader(header.key);
              const showValue = showSensitiveValues[header.id];
              return (
                <div key={header.id} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Header name (e.g., Authorization)"
                      value={header.key}
                      onChange={(e) => handleHeaderChange(header.id, 'key', e.target.value)}
                      className="h-9 text-sm"
                    />
                    <div className="relative">
                      <Input
                        placeholder="Header value (e.g., Bearer your-token-here)"
                        type={isSensitive && !showValue ? 'password' : 'text'}
                        value={header.value}
                        onChange={(e) => handleHeaderChange(header.id, 'value', e.target.value)}
                        className="h-9 text-sm pr-10"
                      />
                      {isSensitive && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                          onClick={() => setShowSensitiveValues(prev => ({ ...prev, [header.id]: !prev[header.id] }))}
                        >
                          {showValue ? '🙈' : '👁️'}
                        </Button>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveHeader(header.id)}
                    className="text-destructive hover:text-destructive/80 hover:bg-destructive/10 h-9 w-9 flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}; 