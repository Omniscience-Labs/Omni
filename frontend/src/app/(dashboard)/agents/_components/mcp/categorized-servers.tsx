import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { categoryIcons } from './constants';
import { McpServerCard } from './mcp-server-card';

interface CategorizedServersListProps {
  categorizedServers: Record<string, any[]>;
  selectedCategory: string | null;
  onServerSelect: (server: any) => void;
  onCategorySelect: (category: string) => void;
}

export const CategorizedServersList: React.FC<CategorizedServersListProps> = ({
  categorizedServers,
  selectedCategory,
  onServerSelect,
  onCategorySelect,
}) => {
  if (selectedCategory) {
    const servers = categorizedServers[selectedCategory] || [];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{categoryIcons[selectedCategory] || "🧩"}</span>
          <h3 className="text-lg font-semibold">{selectedCategory}</h3>
          <Badge variant="outline" className="ml-auto">
            {servers.length} servers
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {servers.map((server) => (
            <McpServerCard
              key={server.qualifiedName}
              server={server}
              onClick={onServerSelect}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(categorizedServers).map(([category, servers]) => (
        <div key={category} className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{categoryIcons[category] || "🧩"}</span>
              <h3 className="text-sm font-semibold text-muted-foreground">{category}</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{servers.length} servers</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCategorySelect(category)}
                className="text-xs"
              >
                View All
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {servers.slice(0, 6).map((server) => (
              <McpServerCard
                key={server.qualifiedName}
                server={server}
                onClick={onServerSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};