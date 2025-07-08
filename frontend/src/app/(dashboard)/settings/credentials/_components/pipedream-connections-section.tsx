'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Zap, 
  ExternalLink, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2,
  Calendar,
  Globe
} from 'lucide-react';
import { usePipedreamConnections } from '@/hooks/react-query/pipedream/utils';
import { PipedreamConnectButton } from '@/components/agents/pipedream/pipedream-connect-button';
import { toast } from 'sonner';

interface PipedreamConnection {
  id: string;
  name: string;
  name_slug: string;
  description?: string;
  categories?: string[];
  status: 'connected' | 'disconnected' | 'error';
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

interface PipedreamConnectionCardProps {
  connection: PipedreamConnection;
}

const PipedreamConnectionCard: React.FC<PipedreamConnectionCardProps> = ({ connection }) => {
  const getAppLogoUrl = (connection: PipedreamConnection) => {
    const logoSlug = connection.name_slug.toLowerCase();
    return `https://logo.clearbit.com/${logoSlug}.com`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <Card className="p-0 group transition-all duration-200 border-border/50 hover:border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center overflow-hidden bg-muted/50">
              <img
                src={getAppLogoUrl(connection)}
                alt={`${connection.name} logo`}
                className="w-full h-full object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent && !parent.querySelector('.fallback-logo')) {
                    const fallback = document.createElement('div');
                    fallback.className = 'fallback-logo w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm';
                    fallback.textContent = connection.name.charAt(0).toUpperCase();
                    parent.appendChild(fallback);
                  }
                }}
              />
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-sm truncate">{connection.name}</h3>
                <p className="text-xs text-muted-foreground truncate">
                  {connection.description || `Connected ${connection.name_slug} app`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {connection.created_at && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>Connected {formatDate(connection.created_at)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const PipedreamConnectionsSection: React.FC = () => {
  const { data: connectionsData, isLoading, error, refetch } = usePipedreamConnections();

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success('Refreshed Pipedream connections');
    } catch (error) {
      toast.error('Failed to refresh connections');
    }
  };

  const connections = connectionsData?.connections || [];

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="bg-card border-border/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                    <div className="flex gap-1">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load Pipedream connections. Please try again.
          </AlertDescription>
        </Alert>
      ) : connections.length === 0 ? (
        <Card className="border-dashed border-border/60 bg-muted/20">
          <CardContent className="p-8 text-center">
            <div className="space-y-4">
              <div className="p-3 rounded-full bg-blue-500/10 w-fit mx-auto">
                <Zap className="h-6 w-6 text-blue-500" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-foreground">No Pipedream connections yet</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Connect your apps through Pipedream to access their tools in your agents
                </p>
              </div>
              <PipedreamConnectButton 
                onConnect={handleRefresh}
                className="h-9"
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {connections.length} app{connections.length !== 1 ? 's' : ''} connected
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connections.map((connection) => (
              <PipedreamConnectionCard
                key={connection.id}
                connection={{
                  ...connection,
                  name_slug: connection.name?.toLowerCase().replace(/\s+/g, '-') || connection.id
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}; 