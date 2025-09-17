'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Upload, FileCode, Archive, Loader2, CheckCircle, AlertCircle, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface CustomAutomationConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (config: CustomAutomationConfig) => Promise<void>;
  agentId?: string;
  existingConfig?: CustomAutomationConfig;
}

interface CustomAutomationConfig {
  scriptContent: string;
  profileZipPath?: string;
  description?: string;
}

export const CustomAutomationConfigDialog: React.FC<CustomAutomationConfigDialogProps> = ({
  open,
  onOpenChange,
  onSave,
  agentId,
  existingConfig
}) => {
  const [scriptContent, setScriptContent] = useState(existingConfig?.scriptContent || '');
  const [description, setDescription] = useState(existingConfig?.description || '');
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [scriptFile, setScriptFile] = useState<File | null>(null);
  const [automationZip, setAutomationZip] = useState<File | null>(null);
  const [uploadMode, setUploadMode] = useState<'separate' | 'zip'>('zip');
  const [isSaving, setIsSaving] = useState(false);
  const [step, setStep] = useState<'upload' | 'configure' | 'preview'>('upload');

  const handleScriptFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.js')) {
        setScriptFile(file);
        // Read the file content
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setScriptContent(content);
          setStep('configure');
        };
        reader.readAsText(file);
      } else {
        toast.error('Please select a JavaScript (.js) file');
      }
    }
  };

  const handleProfileFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.zip')) {
        setProfileFile(file);
        toast.success(`Chrome profile selected: ${file.name}`);
      } else {
        toast.error('Please select a ZIP file containing Chrome profile');
      }
    }
  };

  const handleAutomationZipChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.zip')) {
        setAutomationZip(file);
        toast.success(`Automation ZIP selected: ${file.name}`);
      } else {
        toast.error('Please select a ZIP file containing your automation');
      }
    }
  };

  const handleSave = async () => {
    if (!agentId) {
      toast.error('Agent ID is required');
      return;
    }

    // Validate based on upload mode
    if (uploadMode === 'zip') {
      if (!automationZip) {
        toast.error('Please upload an automation ZIP file');
        return;
      }
    } else {
      if (!scriptFile || !profileFile) {
        toast.error('Please upload both script and Chrome profile files');
        return;
      }
      if (!scriptContent.trim()) {
        toast.error('Please provide automation script content');
        return;
      }
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      let endpoint = '';
      
      if (uploadMode === 'zip') {
        // Use single ZIP upload endpoint
        formData.append('automation_zip', automationZip!);
        formData.append('description', description || 'Custom browser automation');
        endpoint = `/api/agents/${agentId}/upload-automation-zip`;
      } else {
        // Use separate files upload endpoint
        formData.append('script_file', scriptFile!);
        formData.append('profile_file', profileFile!);
        formData.append('description', description || 'Custom browser automation');
        endpoint = `/api/agents/${agentId}/upload-automation-files`;
      }
      
      const uploadResponse = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.detail || errorData.error || 'Failed to upload automation files');
      }

      const uploadResult = await uploadResponse.json();
      
      // Create config for frontend callback
      const config: CustomAutomationConfig = {
        scriptContent: uploadMode === 'zip' ? 'Extracted from ZIP' : scriptContent,
        profileZipPath: uploadMode === 'zip' ? `/workspace/custom_automation/${automationZip!.name}` : `/workspace/custom_automation/${profileFile!.name}`,
        description: description || 'Custom browser automation'
      };

      if (onSave) {
        await onSave(config);
      }

      toast.success('Custom automation configured successfully');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save automation config:', error);
      toast.error(`Failed to configure automation: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const renderUploadStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-12 h-12 bg-violet-100 dark:bg-violet-800/50 rounded-full flex items-center justify-center mb-4">
          <Settings className="h-6 w-6 text-violet-600" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Upload Automation Files</h3>
        <p className="text-sm text-muted-foreground">
          Upload your Playwright script and Chrome profile to get started
        </p>
      </div>

      {/* Upload Mode Toggle */}
      <div className="flex items-center justify-center space-x-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4">
        <button
          type="button"
          onClick={() => setUploadMode('zip')}
          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            uploadMode === 'zip'
              ? 'bg-violet-600 text-white'
              : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
          }`}
        >
          <Archive className="h-4 w-4 inline mr-1" />
          Single ZIP
        </button>
        <button
          type="button"
          onClick={() => setUploadMode('separate')}
          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            uploadMode === 'separate'
              ? 'bg-violet-600 text-white'
              : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
          }`}
        >
          <FileCode className="h-4 w-4 inline mr-1" />
          Separate Files
        </button>
      </div>

      <div className="space-y-4">
        {uploadMode === 'zip' ? (
          /* Single ZIP Upload */
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Archive className="h-4 w-4" />
                Automation Package
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Input
                  type="file"
                  accept=".zip"
                  onChange={handleAutomationZipChange}
                  className="cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">
                  Upload a ZIP file containing your automation script (.js) and Chrome profile
                </p>
                {automationZip && (
                  <Badge variant="secondary" className="text-xs">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {automationZip.name} ({(automationZip.size / 1024 / 1024).toFixed(1)} MB)
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Separate Files Upload */
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileCode className="h-4 w-4" />
                  Automation Script
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Input
                    type="file"
                    accept=".js"
                    onChange={handleScriptFileChange}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground">
                    Upload a JavaScript file containing your Playwright automation script
                  </p>
                  {scriptFile && (
                    <Badge variant="secondary" className="text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {scriptFile.name}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Archive className="h-4 w-4" />
                  Chrome Profile
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Input
                    type="file"
                    accept=".zip"
                    onChange={handleProfileFileChange}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground">
                    Upload a ZIP file containing your Chrome user data directory
                  </p>
                  {profileFile && (
                    <Badge variant="secondary" className="text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {profileFile.name}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );

  const renderConfigureStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-12 h-12 bg-violet-100 dark:bg-violet-800/50 rounded-full flex items-center justify-center mb-4">
          <Settings className="h-6 w-6 text-violet-600" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Configure Automation</h3>
        <p className="text-sm text-muted-foreground">
          Review and customize your automation settings
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this automation does..."
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="script-preview">Script Preview</Label>
          <Textarea
            id="script-preview"
            value={scriptContent}
            onChange={(e) => setScriptContent(e.target.value)}
            placeholder="Your Playwright automation script will appear here..."
            className="mt-1 font-mono text-sm"
            rows={12}
          />
          <p className="text-xs text-muted-foreground mt-1">
            You can modify the script if needed. The profile path will be automatically updated.
          </p>
        </div>
      </div>
    </div>
  );

  const renderPreviewStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-800/50 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="h-6 w-6 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Ready to Configure</h3>
        <p className="text-sm text-muted-foreground">
          Review your automation configuration before saving
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Configuration Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Description:</span>
              <span>{description || 'Custom browser automation'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Script File:</span>
              <span>{scriptFile?.name || 'Existing script'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Profile File:</span>
              <span>{profileFile?.name || 'Existing profile'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Script Length:</span>
              <span>{scriptContent.length} characters</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const getStepContent = () => {
    switch (step) {
      case 'upload':
        return renderUploadStep();
      case 'configure':
        return renderConfigureStep();
      case 'preview':
        return renderPreviewStep();
      default:
        return renderUploadStep();
    }
  };

  const canProceedToNext = () => {
    switch (step) {
      case 'upload':
        return uploadMode === 'zip' ? automationZip : (scriptFile && profileFile);
      case 'configure':
        return uploadMode === 'zip' ? true : scriptContent.trim().length > 0;
      case 'preview':
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step === 'upload' && canProceedToNext()) {
      setStep('configure');
    } else if (step === 'configure' && canProceedToNext()) {
      setStep('preview');
    }
  };

  const handleBack = () => {
    if (step === 'configure') {
      setStep('upload');
    } else if (step === 'preview') {
      setStep('configure');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-800/50 flex items-center justify-center">
              🤖
            </div>
            Configure Custom Automation
          </DialogTitle>
          <DialogDescription>
            Upload your Playwright automation script and Chrome profile to enable custom browser automation
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {getStepContent()}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <div className="flex items-center space-x-2">
            {step !== 'upload' && (
              <Button variant="outline" onClick={handleBack}>
                Back
              </Button>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            
            {step === 'preview' ? (
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Configuring...
                  </>
                ) : (
                  'Save Configuration'
                )}
              </Button>
            ) : (
              <Button 
                onClick={handleNext} 
                disabled={!canProceedToNext()}
              >
                Next
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
