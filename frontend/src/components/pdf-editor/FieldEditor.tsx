'use client';

import { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from './types';
import { cn } from '@/lib/utils';

interface FieldEditorProps {
  field: FormField;
  onUpdate: (field: FormField) => void;
  onDelete: (fieldId: string) => void;
  onClose: () => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
}

export function FieldEditor({
  field,
  onUpdate,
  onDelete,
  onClose,
  fontSize,
  onFontSizeChange,
}: FieldEditorProps) {
  const [label, setLabel] = useState(field.label || '');
  const [value, setValue] = useState(field.value || '');

  useEffect(() => {
    setLabel(field.label || '');
    setValue(field.value || '');
  }, [field]);

  const handleSave = () => {
    onUpdate({
      ...field,
      label,
      value: field.type === 'text' ? value : field.value,
      fontSize: field.fontSize || fontSize,
    });
  };

  const handleDelete = () => {
    onDelete(field.id);
    onClose();
  };

  return (
    <div className="absolute right-4 top-4 w-80 bg-card border border-border rounded-2xl shadow-lg p-4 z-10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">
          Edit {field.type === 'text' ? 'Text Field' : field.type === 'checkbox' ? 'Checkbox' : 'Signature'}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-6 w-6"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Label
          </label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Field label"
            className="h-9"
          />
        </div>

        {field.type === 'text' && (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Value
              </label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Enter text"
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Font Size: {field.fontSize || fontSize}px
              </label>
              <input
                type="range"
                min="8"
                max="48"
                step="2"
                value={field.fontSize || fontSize}
                onChange={(e) =>
                  onUpdate({ ...field, fontSize: parseInt(e.target.value) })
                }
                className="w-full"
              />
            </div>
          </>
        )}

        {field.type === 'checkbox' && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={field.checked || false}
              onChange={(e) =>
                onUpdate({ ...field, checked: e.target.checked })
              }
              className="h-4 w-4 rounded border-border"
            />
            <label className="text-xs text-muted-foreground">
              Checked
            </label>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleSave}
            variant="default"
            size="sm"
            className="flex-1"
          >
            Save
          </Button>
          <Button
            onClick={handleDelete}
            variant="destructive"
            size="sm"
            className="gap-1"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
