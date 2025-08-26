'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface DocsNavigationItem {
  id: string;
  title: string;
  href?: string;
  icon?: LucideIcon;
  badge?: string;
  isActive?: boolean;
  children?: DocsNavigationItem[];
  defaultExpanded?: boolean;
}

export interface DocsNavigationSection {
  id: string;
  title: string;
  items: DocsNavigationItem[];
}

export interface DocsSidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  version?: string;
  navigation: DocsNavigationSection[];
  showSearch?: boolean;
  searchPlaceholder?: string;
  onNavigate?: (item: DocsNavigationItem) => void;
  onSearch?: () => void;
  activeItemId?: string;
  sidebarWidth?: string;
}

interface NavigationItemProps {
  item: DocsNavigationItem;
  level?: number;
  onNavigate?: (item: DocsNavigationItem) => void;
  activeItemId?: string;
}

const NavigationItem = ({ item, level = 0, onNavigate, activeItemId }: NavigationItemProps) => {
  const [isExpanded, setIsExpanded] = React.useState(item.defaultExpanded ?? false);
  const hasChildren = item.children && item.children.length > 0;
  const isActive = item.id === activeItemId || item.isActive;
  const paddingLeft = 16 + (level * 16);

  const handleClick = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
    if (item.href && onNavigate) {
      onNavigate(item);
    }
  };

  return (
    <div className="space-y-1">
      <Button
        variant={isActive ? "secondary" : "ghost"}
        onClick={handleClick}
        className={cn(
          "w-full justify-start h-9 px-3 font-normal text-sm",
          hasChildren && "cursor-pointer",
          !hasChildren && item.href && "hover:bg-accent/50",
          isActive && "bg-accent text-accent-foreground font-medium"
        )}
        style={{ paddingLeft: `${paddingLeft}px` }}
      >
        {hasChildren && (
          <ChevronRight 
            className={cn(
              "mr-2 h-3 w-3 transition-transform",
              isExpanded && "rotate-90"
            )} 
          />
        )}
        
        {item.icon && (
          <item.icon className={cn(
            "mr-2 h-4 w-4",
            !hasChildren && "ml-1"
          )} />
        )}
        
        <span className="flex-1 text-left truncate">
          {item.title}
        </span>
        
        {item.badge && (
          <Badge variant="secondary" className="ml-2 h-5 text-xs">
            {item.badge}
          </Badge>
        )}
      </Button>

      {hasChildren && isExpanded && (
        <div className="space-y-1">
          {item.children?.map((child) => (
            <NavigationItem
              key={child.id}
              item={child}
              level={level + 1}
              onNavigate={onNavigate}
              activeItemId={activeItemId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const DocsSidebar = React.forwardRef<HTMLDivElement, DocsSidebarProps>(
  ({ 
    title,
    subtitle,
    version,
    navigation,
    showSearch = true,
    searchPlaceholder = "Search docs...",
    onNavigate,
    onSearch,
    activeItemId,
    sidebarWidth = "280px",
    className,
    ...props
  }, ref) => {
    return (
      <div 
        ref={ref}
        className={cn("flex h-screen flex-col border-r bg-card", className)}
        style={{ width: sidebarWidth }}
        {...props}
      >
        <div className="p-6 pb-4">
          {title && (
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-tight">
                {title}
              </h2>
              {subtitle && (
                <p className="text-sm text-muted-foreground">
                  {subtitle}
                </p>
              )}
            </div>
          )}

          {showSearch && (
            <Button
              variant="outline"
              onClick={onSearch}
              className="w-full justify-start px-3 text-sm text-muted-foreground"
            >
              <Search className="mr-2 h-4 w-4" />
              {searchPlaceholder}
            </Button>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3">
          <div className="space-y-6 pb-6">
            {navigation.map((section, index) => (
              <div key={section.id} className="space-y-3">
                {section.title && (
                  <h3 className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {section.title}
                  </h3>
                )}
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <NavigationItem
                      key={item.id}
                      item={item}
                      onNavigate={onNavigate}
                      activeItemId={activeItemId}
                    />
                  ))}
                </div>
                {index < navigation.length - 1 && (
                  <Separator className="my-4" />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Footer */}
        {version && (
          <div className="p-6 pt-4 border-t">
            <Badge variant="outline" className="text-xs">
              {version}
            </Badge>
          </div>
        )}
      </div>
    );
  }
);

DocsSidebar.displayName = 'DocsSidebar'; 