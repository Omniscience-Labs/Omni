import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { categoryIcons } from './constants';

interface CategorySidebarProps {
  categories: string[];
  selectedCategory: string | null;
  onCategorySelect: (category: string | null) => void;
  categorizedServers: Record<string, any[]>;
}

export const CategorySidebar: React.FC<CategorySidebarProps> = ({
  categories,
  selectedCategory,
  onCategorySelect,
  categorizedServers,
}) => {
  return (
    <div className="w-76 flex-shrink-0">
      <h3 className="text-sm font-semibold mb-3">Categories</h3>
      <ScrollArea className="h-full">
        <div className="space-y-1">
          <Button
            size="sm"
            className={cn(
              "w-full justify-start shadow-none bg-transparent text-primary hover:bg-muted hover:text-primary",
              selectedCategory === null && "bg-primary/5 text-foreground"
            )}
            onClick={() => onCategorySelect(null)}
          >
            <span>🌐</span>
            All Categories
          </Button>
          {categories.map((category) => {
            const count = categorizedServers[category]?.length || 0;
            return (
              <Button
                key={category}
                size="sm"
                className={cn(
                  "w-full justify-start shadow-none bg-transparent text-primary hover:bg-muted hover:text-primary",
                  selectedCategory === category && "bg-primary/5 text-foreground"
                )}
                onClick={() => onCategorySelect(category)}
              >
                <span>{categoryIcons[category] || "🧩"}</span>
                <span className="flex-1 text-left">{category}</span>
                <Badge variant="outline" className="ml-auto text-xs">
                  {count}
                </Badge>
              </Button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};