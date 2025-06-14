"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Plus } from "lucide-react";

interface KeyValueEditorProps {
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  placeholder?: {
    key?: string;
    value?: string;
  };
}

export default function KeyValueEditor({ 
  values, 
  onChange, 
  placeholder = { key: "Variable name", value: "Variable value" } 
}: KeyValueEditorProps) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const handleAddVariable = () => {
    if (newKey.trim() && !values.hasOwnProperty(newKey.trim())) {
      onChange({
        ...values,
        [newKey.trim()]: newValue.trim() || ""
      });
      setNewKey("");
      setNewValue("");
    }
  };

  const handleUpdateVariable = (key: string, value: string) => {
    onChange({
      ...values,
      [key]: value
    });
  };

  const handleDeleteVariable = (key: string) => {
    const newValues = { ...values };
    delete newValues[key];
    onChange(newValues);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddVariable();
    }
  };

  return (
    <div className="space-y-3">
      {/* Existing Variables */}
      {Object.entries(values).map(([key, value]) => (
        <Card key={key} className="p-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <Input
                value={key}
                onChange={(e) => {
                  const newKey = e.target.value;
                  if (newKey !== key) {
                    const newValues = { ...values };
                    delete newValues[key];
                    newValues[newKey] = value;
                    onChange(newValues);
                  }
                }}
                placeholder={placeholder.key}
                className="h-8 text-sm"
              />
              <Input
                value={value}
                onChange={(e) => handleUpdateVariable(key, e.target.value)}
                placeholder={placeholder.value}
                className="h-8 text-sm"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteVariable(key)}
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      ))}

      {/* Add New Variable */}
      <Card className="p-3 border-dashed">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder={placeholder.key}
              onKeyPress={handleKeyPress}
              className="h-8 text-sm"
            />
            <Input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder={placeholder.value}
              onKeyPress={handleKeyPress}
              className="h-8 text-sm"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddVariable}
            disabled={!newKey.trim()}
            className="w-full h-8"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Variable
          </Button>
        </div>
      </Card>

      {Object.keys(values).length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          No variables configured. Add variables to pass data to your workflow.
        </p>
      )}
    </div>
  );
} 