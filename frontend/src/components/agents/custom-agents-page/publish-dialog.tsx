'use client';

import React, { useState, useEffect } from 'react';
import { Globe, Loader2, Plus, Trash2, User, Bot, Wrench, Settings, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { UsageExampleMessage } from '@/hooks/secure-mcp/use-secure-mcp';

interface PublishDialogData {
  templateId: string;
  templateName: string;
  templateDescription?: string;
}

export interface PublishOptions {
  description: string;
  includeSystemPrompt: boolean;
  includeTools: boolean;
  includeTriggers: boolean;
  includePlaybooks: boolean;
  includeDefaultFiles: boolean;
  usageExamples: UsageExampleMessage[];
}

interface PublishDialogProps {
  publishDialog: PublishDialogData | null;
  templatesActioningId: string | null;
  onClose: () => void;
  onPublish: (options: PublishOptions) => void;
}

export const PublishDialog = ({
  publishDialog,
  templatesActioningId,
  onClose,
  onPublish
}: PublishDialogProps) => {
  const [examples, setExamples] = useState<UsageExampleMessage[]>([]);
  const [description, setDescription] = useState('');
  const [includeSystemPrompt, setIncludeSystemPrompt] = useState(true);
  const [includeTools, setIncludeTools] = useState(true);

  const [includeTriggers, setIncludeTriggers] = useState(true);
  const [includePlaybooks, setIncludePlaybooks] = useState(true);
  const [includeDefaultFiles, setIncludeDefaultFiles] = useState(true);

  // Initialize description when dialog opens
  useEffect(() => {
    if (publishDialog?.templateDescription) {
      setDescription(publishDialog.templateDescription);
    } else {
      setDescription('');
    }
    // Reset flags
    setIncludeSystemPrompt(true);
    setIncludeTools(true);
    setIncludeTriggers(true);
    setIncludePlaybooks(true);
    setIncludeDefaultFiles(true);
  }, [publishDialog]);

  const handleAddMessage = () => {
    setExamples([...examples, { role: 'user', content: '' }]);
  };

  const handleRemoveMessage = (index: number) => {
    setExamples(examples.filter((_, i) => i !== index));
  };

  const handleUpdateMessage = (index: number, field: keyof UsageExampleMessage, value: any) => {
    const updated = [...examples];
    updated[index] = { ...updated[index], [field]: value };
    setExamples(updated);
  };

  const handleAddToolCall = (messageIndex: number) => {
    const updated = [...examples];
    if (!updated[messageIndex].tool_calls) {
      updated[messageIndex].tool_calls = [];
    }
    updated[messageIndex].tool_calls!.push({ name: '', arguments: {} });
    setExamples(updated);
  };

  const handleRemoveToolCall = (messageIndex: number, toolIndex: number) => {
    const updated = [...examples];
    updated[messageIndex].tool_calls = updated[messageIndex].tool_calls?.filter((_, i) => i !== toolIndex);
    setExamples(updated);
  };

  const handleUpdateToolCall = (messageIndex: number, toolIndex: number, field: string, value: any) => {
    const updated = [...examples];
    if (updated[messageIndex].tool_calls) {
      updated[messageIndex].tool_calls![toolIndex] = {
        ...updated[messageIndex].tool_calls![toolIndex],
        [field]: value
      };
    }
    setExamples(updated);
  };

  const handlePublish = () => {
    const validExamples = examples.filter(ex => ex.content.trim());
    onPublish({
      description,
      includeSystemPrompt,
      includeTools,
      includeTriggers,
      includePlaybooks,
      includeDefaultFiles,
      usageExamples: validExamples
    });
    setExamples([]);
  };

  const handleClose = () => {
    setExamples([]);
    onClose();
  };

  return (
    <Dialog open={!!publishDialog} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publish Template to Marketplace</DialogTitle>
          <DialogDescription>
            Make "{publishDialog?.templateName}" available for the community to discover and install.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input value={publishDialog?.templateName || ''} disabled />
              <p className="text-xs text-muted-foreground">
                Template name is inherited from the agent name.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Describe what your agent does..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                This description will be shown in the marketplace listing.
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="bg-muted/30 p-4 rounded-lg border">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                Publishing Components
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Select which components of your agent you want to include in the template.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start space-x-3 space-y-0">
                  <Checkbox
                    id="include-prompt"
                    checked={includeSystemPrompt}
                    onCheckedChange={(c) => setIncludeSystemPrompt(!!c)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label
                      htmlFor="include-prompt"
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      System Prompt
                    </Label>
                  </div>
                </div>

                <div className="flex items-start space-x-3 space-y-0">
                  <Checkbox
                    id="include-tools"
                    checked={includeTools}
                    onCheckedChange={(c) => setIncludeTools(!!c)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label
                      htmlFor="include-tools"
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      Tool Configurations
                    </Label>
                  </div>
                </div>

                <div className="flex items-start space-x-3 space-y-0">
                  <Checkbox
                    id="include-triggers"
                    checked={includeTriggers}
                    onCheckedChange={(c) => setIncludeTriggers(!!c)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label
                      htmlFor="include-triggers"
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      Triggers
                    </Label>
                  </div>
                </div>

                <div className="flex items-start space-x-3 space-y-0">
                  <Checkbox
                    id="include-playbooks"
                    checked={includePlaybooks}
                    onCheckedChange={(c) => setIncludePlaybooks(!!c)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label
                      htmlFor="include-playbooks"
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      Playbooks
                    </Label>
                  </div>
                </div>

                <div className="flex items-start space-x-3 space-y-0">
                  <Checkbox
                    id="include-files"
                    checked={includeDefaultFiles}
                    onCheckedChange={(c) => setIncludeDefaultFiles(!!c)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label
                      htmlFor="include-files"
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      Default Files
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Usage Examples (Optional)</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Add example messages to help users understand how your agent works
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddMessage}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Message
              </Button>
            </div>

            {examples.length === 0 && (
              <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
                <p className="text-sm text-muted-foreground">
                  No example messages yet. Click "Add Message" to create an example conversation.
                </p>
              </div>
            )}

            <div className="space-y-3">
              {examples.map((message, index) => (
                <div
                  key={index}
                  className="border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <Select
                          value={message.role}
                          onValueChange={(value) => handleUpdateMessage(index, 'role', value)}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                <span>User</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="assistant">
                              <div className="flex items-center gap-2">
                                <Bot className="h-4 w-4" />
                                <span>Assistant</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>

                        {message.role === 'assistant' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddToolCall(index)}
                            className="gap-2"
                          >
                            <Wrench className="h-3 w-3" />
                            Add Tool Call
                          </Button>
                        )}
                      </div>

                      <Textarea
                        placeholder="Message content..."
                        value={message.content}
                        onChange={(e) => handleUpdateMessage(index, 'content', e.target.value)}
                        rows={3}
                      />

                      {message.tool_calls && message.tool_calls.length > 0 && (
                        <div className="space-y-2 pl-4 border-l-2">
                          <Label className="text-xs text-muted-foreground">Tool Calls</Label>
                          {message.tool_calls.map((toolCall, toolIndex) => (
                            <div key={toolIndex} className="flex items-center gap-2">
                              <Input
                                placeholder="Tool name"
                                value={toolCall.name}
                                onChange={(e) => handleUpdateToolCall(index, toolIndex, 'name', e.target.value)}
                                className="flex-1"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveToolCall(index, toolIndex)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveMessage(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={!!templatesActioningId}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePublish}
            disabled={!!templatesActioningId}
          >
            {templatesActioningId ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Globe className="h-4 w-4" />
                Publish Template
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
