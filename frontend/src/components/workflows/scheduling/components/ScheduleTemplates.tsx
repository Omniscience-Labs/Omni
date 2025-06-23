"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Clock, Calendar, Briefcase, TestTube } from 'lucide-react';
import { ScheduleTemplate } from '../types';
import { useScheduleTemplates } from '@/hooks/react-query';

interface ScheduleTemplatesProps {
  onSelect: (template: ScheduleTemplate) => void;
}

export function ScheduleTemplates({ onSelect }: ScheduleTemplatesProps) {
  const [filteredTemplates, setFilteredTemplates] = useState<ScheduleTemplate[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const { data: templates = [], isLoading, error } = useScheduleTemplates();

  useEffect(() => {
    filterTemplates();
  }, [templates, searchTerm, selectedCategory]);

  const filterTemplates = () => {
    let filtered = templates;

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(template => template.category.toLowerCase() === selectedCategory);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(template =>
        template.name.toLowerCase().includes(term) ||
        template.description.toLowerCase().includes(term)
      );
    }

    setFilteredTemplates(filtered);
  };

  const categories = [
    { value: 'all', label: 'All Templates', icon: null },
    { value: 'testing', label: 'Testing', icon: TestTube },
    { value: 'frequent', label: 'Frequent', icon: Clock },
    { value: 'regular', label: 'Regular', icon: Clock },
    { value: 'daily', label: 'Daily', icon: Calendar },
    { value: 'business', label: 'Business', icon: Briefcase },
    { value: 'weekly', label: 'Weekly', icon: Calendar },
    { value: 'monthly', label: 'Monthly', icon: Calendar }
  ];

  const getCategoryIcon = (category: string) => {
    const cat = categories.find(c => c.value === category.toLowerCase());
    return cat?.icon;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading templates...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-red-500">Failed to load templates</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-hidden">
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
        {filteredTemplates.map((template) => {
          const CategoryIcon = getCategoryIcon(template.category);
          return (
            <Card
              key={template.id}
              className="py-0 cursor-pointer hover:border-1 hover:border-primary transition"
              onClick={() => onSelect(template)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{template.icon}</span>
                    <div>
                      <h3 className="font-medium text-sm">{template.name}</h3>
                      <p className="text-xs text-muted-foreground">{template.description}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    <div className="flex items-center gap-1">
                      {CategoryIcon && <CategoryIcon className="h-3 w-3" />}
                      {template.category}
                    </div>
                  </Badge>
                </div>

                <div className="text-xs text-muted-foreground">
                  {template.config.type === 'simple' && template.config.simple && (
                    <span>
                      Every {template.config.simple.interval_value} {template.config.simple.interval_type}
                    </span>
                  )}
                  {template.config.type === 'cron' && template.config.cron && (
                    <code className="bg-muted px-2 py-1 rounded font-mono">
                      {template.config.cron.cron_expression}
                    </code>
                  )}
                  {template.config.type === 'advanced' && template.config.advanced && (
                    <code className="bg-muted px-2 py-1 rounded font-mono">
                      {template.config.advanced.cron_expression}
                    </code>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <div className="text-sm">No templates found matching your criteria</div>
          <div className="text-xs mt-1">Try adjusting your search or category filter</div>
        </div>
      )}
    </div>
  );
} 