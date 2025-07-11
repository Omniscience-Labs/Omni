import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCategoryEmoji, getAppCategoryCount } from '../utils';
import type { CategorySidebarProps } from '../types';

export const CategorySidebar: React.FC<CategorySidebarProps> = ({
  isCollapsed,
  onToggle,
  categories,
  selectedCategory,
  onCategorySelect,
  allApps
}) => {
  return (
    <div className="border-r bg-sidebar flex-shrink-0 sticky top-0 h-[calc(100vh-12vh)] overflow-hidden">
      <div className="p-3 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn(
              "overflow-hidden transition-all duration-300 ease-in-out",
              isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
            )}>
              <h3 className="font-semibold text-sm whitespace-nowrap">Categories</h3>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-7 w-7"
          >
            <ChevronRight className={cn(
              "h-3 w-3 transition-transform duration-300 ease-in-out",
              isCollapsed ? "rotate-0" : "rotate-180"
            )} />
          </Button>
        </div>
      </div>
      
      <div className="p-2 space-y-0.5 flex-1 overflow-y-auto">
        {categories.map((category) => {
          const isActive = selectedCategory === category;
          const emoji = getCategoryEmoji(category);
          return (
            <button
              key={category}
              onClick={() => onCategorySelect(category)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all duration-200 overflow-hidden",
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "hover:bg-primary/5"
              )}
              title={isCollapsed ? category : undefined}
            >
              <span className="text-sm flex-shrink-0">{emoji}</span>
              <div className={cn(
                "flex items-center justify-between flex-1 min-w-0 overflow-hidden transition-all duration-300 ease-in-out",
                isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
              )}>
                <span className="text-sm truncate whitespace-nowrap">{category}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}; 