'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AIFillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFill: (userData?: Record<string, any>) => void;
  isFilling?: boolean;
}

const COMMON_FIELDS = [
  { key: 'name', label: 'Name', placeholder: 'John Doe' },
  { key: 'email', label: 'Email', placeholder: 'john@example.com' },
  { key: 'phone', label: 'Phone', placeholder: '+1 (555) 123-4567' },
  { key: 'address', label: 'Address', placeholder: '123 Main St, City, State ZIP' },
  { key: 'date', label: 'Date', placeholder: 'MM/DD/YYYY' },
  { key: 'company', label: 'Company', placeholder: 'Company Name' },
];

export function AIFillModal({
  open,
  onOpenChange,
  onFill,
  isFilling = false,
}: AIFillModalProps) {
  const [userData, setUserData] = useState<Record<string, string>>({});
  const [customFields, setCustomFields] = useState<Array<{ key: string; value: string }>>([]);
  const [newCustomKey, setNewCustomKey] = useState('');
  const [inputMode, setInputMode] = useState<'form' | 'chat'>('form');
  const [chatInput, setChatInput] = useState('');

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setUserData({});
      setCustomFields([]);
      setNewCustomKey('');
      setChatInput('');
      setInputMode('form');
    }
  }, [open]);

  const handleFieldChange = (key: string, value: string) => {
    setUserData((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddCustomField = () => {
    if (newCustomKey.trim()) {
      setCustomFields((prev) => [...prev, { key: newCustomKey.trim(), value: '' }]);
      setNewCustomKey('');
    }
  };

  const handleCustomFieldChange = (index: number, value: string) => {
    setCustomFields((prev) =>
      prev.map((field, i) => (i === index ? { ...field, value } : field))
    );
  };

  const handleRemoveCustomField = (index: number) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFill = () => {
    if (inputMode === 'chat') {
      // For chat mode, send the natural language input as a special key
      // The backend LLM will parse it
      if (chatInput.trim()) {
        onFill({ _natural_language_input: chatInput.trim() });
      } else {
        onFill(undefined);
      }
      return;
    }

    // Form mode: Combine common fields and custom fields
    const allData: Record<string, any> = { ...userData };
    customFields.forEach((field) => {
      if (field.value.trim()) {
        allData[field.key] = field.value;
      }
    });

    // Remove empty values
    const cleanedData = Object.fromEntries(
      Object.entries(allData).filter(([_, value]) => value && value.trim())
    );

    onFill(Object.keys(cleanedData).length > 0 ? cleanedData : undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI Form Filler</DialogTitle>
          <DialogDescription>
            Optionally provide data to pre-fill the form. Use structured fields or describe in natural language.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'form' | 'chat')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="form">Structured Form</TabsTrigger>
            <TabsTrigger value="chat">
              <MessageSquare className="w-4 h-4 mr-2" />
              Natural Language
            </TabsTrigger>
          </TabsList>

          <TabsContent value="form" className="space-y-6 py-4">
          {/* Common Fields */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Common Fields</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {COMMON_FIELDS.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <Input
                    id={field.key}
                    value={userData[field.key] || ''}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    disabled={isFilling}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Custom Fields */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Custom Fields</h3>
              <div className="flex gap-2">
                <Input
                  placeholder="Field name (e.g., 'License Number')"
                  value={newCustomKey}
                  onChange={(e) => setNewCustomKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddCustomField();
                    }
                  }}
                  disabled={isFilling}
                  className="w-48 h-8"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCustomField}
                  disabled={isFilling || !newCustomKey.trim()}
                >
                  Add
                </Button>
              </div>
            </div>

            {customFields.length > 0 && (
              <div className="space-y-2">
                {customFields.map((field, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">{field.key}</Label>
                      <Input
                        value={field.value}
                        onChange={(e) => handleCustomFieldChange(index, e.target.value)}
                        placeholder="Enter value"
                        disabled={isFilling}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveCustomField(index)}
                      disabled={isFilling}
                      className="h-8 w-8 mt-6"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Additional Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={userData.notes || ''}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              placeholder="Any additional context or instructions for the AI..."
              disabled={isFilling}
              rows={3}
            />
          </div>
          </TabsContent>

          <TabsContent value="chat" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="chat-input">Describe the form data in natural language</Label>
              <Textarea
                id="chat-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Example: My name is John Doe, email is john@example.com, phone is 555-1234, and I live at 123 Main St, New York, NY 10001. The date should be today's date."
                disabled={isFilling}
                rows={8}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                The AI will automatically extract and match your information to the form fields.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isFilling}
          >
            Cancel
          </Button>
          <Button onClick={handleFill} disabled={isFilling}>
            {isFilling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Filling Form...
              </>
            ) : (
              'Fill Form'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
