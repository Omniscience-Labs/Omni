import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, FileCode, Archive, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface CustomAutomationConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  onSave?: () => void;
}

interface AutomationConfig {
  configName: string;
  description: string;
  scriptFile: File | null;
  profileZip: File | null;
}

export const CustomAutomationConfig: React.FC<CustomAutomationConfigProps> = ({
  open,
  onOpenChange,
  agentId,
  onSave
}) => {
  const [config, setConfig] = useState<AutomationConfig>({
    configName: '',
    description: '',
    scriptFile: null,
    profileZip: null
  });
  
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleFileUpload = (field: 'scriptFile' | 'profileZip') => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (field === 'scriptFile') {
      const validExtensions = ['.js', '.mjs', '.ts'];
      const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
      if (!hasValidExtension) {
        toast.error('Invalid file type', {
          description: 'Please upload a JavaScript (.js, .mjs) or TypeScript (.ts) file'
        });
        return;
      }
    } else if (field === 'profileZip') {
      if (!file.name.toLowerCase().endsWith('.zip')) {
        toast.error('Invalid file type', {
          description: 'Please upload a ZIP file containing the Chrome profile'
        });
        return;
      }
    }

    setConfig(prev => ({ ...prev, [field]: file }));
    setValidationError(null);
  };

  const validateConfig = (): boolean => {
    if (!config.configName.trim()) {
      setValidationError('Configuration name is required');
      return false;
    }
    if (!config.scriptFile) {
      setValidationError('Automation script file is required');
      return false;
    }
    if (!config.profileZip) {
      setValidationError('Chrome profile ZIP file is required');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateConfig()) return;

    setIsSaving(true);
    setValidationError(null);

    try {
      // Convert files to base64
      const scriptContent = await config.scriptFile!.text();
      const profileBuffer = await config.profileZip!.arrayBuffer();
      const profileBase64 = btoa(String.fromCharCode(...new Uint8Array(profileBuffer)));

      const response = await fetch(`/api/agents/${agentId}/custom-automation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config_name: config.configName,
          description: config.description || '',
          chrome_profile_base64: profileBase64,
          automation_script: scriptContent
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }

      toast.success('Custom automation configured!', {
        description: `Configuration "${config.configName}" has been saved successfully.`
      });

      // Reset form and close dialog
      setConfig({
        configName: '',
        description: '',
        scriptFile: null,
        profileZip: null
      });
      
      if (onSave) onSave();
      onOpenChange(false);

    } catch (error: any) {
      console.error('Error saving custom automation:', error);
      setValidationError(error.message || 'Failed to save configuration. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setConfig({
      configName: '',
      description: '',
      scriptFile: null,
      profileZip: null
    });
    setValidationError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center text-violet-600 dark:text-violet-400">
              ⚡
            </div>
            <div className="flex-1">
              <DialogTitle className="text-lg font-semibold">
                Configure Custom Automation
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Upload your automation script and Chrome profile for this agent
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Configuration Name */}
          <div className="space-y-2">
            <Label htmlFor="configName" className="text-sm font-medium">
              Configuration Name *
            </Label>
            <Input
              id="configName"
              placeholder="e.g., arcadia_inventory, crm_automation"
              value={config.configName}
              onChange={(e) => setConfig(prev => ({ ...prev, configName: e.target.value }))}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              A unique name to identify this automation configuration
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium">
              Description
            </Label>
            <Textarea
              id="description"
              placeholder="Briefly describe what this automation does..."
              value={config.description}
              onChange={(e) => setConfig(prev => ({ ...prev, description: e.target.value }))}
              className="w-full min-h-[80px] resize-none"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              Optional description of the automation workflow
            </p>
          </div>

          {/* Script File Upload */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Automation Script *
            </Label>
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 hover:border-muted-foreground/50 transition-colors">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  {config.scriptFile ? <CheckCircle className="w-6 h-6" /> : <FileCode className="w-6 h-6" />}
                </div>
                {config.scriptFile ? (
                  <div>
                    <p className="font-medium text-green-600 dark:text-green-400">
                      ✅ {config.scriptFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(config.scriptFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium">Upload Automation Script</p>
                    <p className="text-sm text-muted-foreground">
                      JavaScript (.js, .mjs) or TypeScript (.ts) file
                    </p>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="relative"
                  onClick={() => document.getElementById('scriptFile')?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {config.scriptFile ? 'Change File' : 'Choose File'}
                </Button>
                <input
                  id="scriptFile"
                  type="file"
                  accept=".js,.mjs,.ts"
                  onChange={handleFileUpload('scriptFile')}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ display: 'none' }}
                />
              </div>
            </div>
          </div>

          {/* Chrome Profile Upload */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Chrome Profile *
            </Label>
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 hover:border-muted-foreground/50 transition-colors">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-600 dark:text-orange-400">
                  {config.profileZip ? <CheckCircle className="w-6 h-6" /> : <Archive className="w-6 h-6" />}
                </div>
                {config.profileZip ? (
                  <div>
                    <p className="font-medium text-green-600 dark:text-green-400">
                      ✅ {config.profileZip.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(config.profileZip.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium">Upload Chrome Profile</p>
                    <p className="text-sm text-muted-foreground">
                      ZIP file containing your Chrome browser profile
                    </p>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="relative"
                  onClick={() => document.getElementById('profileZip')?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {config.profileZip ? 'Change File' : 'Choose File'}
                </Button>
                <input
                  id="profileZip"
                  type="file"
                  accept=".zip"
                  onChange={handleFileUpload('profileZip')}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ display: 'none' }}
                />
              </div>
            </div>
          </div>

          {/* Error Display */}
          {validationError && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p className="text-sm">{validationError}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="min-w-[100px]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Configuration'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};


