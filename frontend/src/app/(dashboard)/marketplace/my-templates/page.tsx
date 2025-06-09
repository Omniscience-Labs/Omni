'use client';

import React, { useState } from 'react';
import { Globe, GlobeLock, Download, Calendar, User, Tags, Loader2, AlertTriangle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMyTemplates, useUnpublishTemplate } from '@/hooks/react-query/secure-mcp/use-secure-mcp';
import { toast } from 'sonner';
import { getAgentAvatar } from '../../agents/_utils/get-agent-style';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

export default function MyTemplatesPage() {
  const [unpublishingId, setUnpublishingId] = useState<string | null>(null);
  
  const { data: templates, isLoading, error } = useMyTemplates();
  const unpublishMutation = useUnpublishTemplate();

  const handleUnpublish = async (templateId: string, templateName: string) => {
    try {
      setUnpublishingId(templateId);
      await unpublishMutation.mutateAsync(templateId);
      toast.success(`${templateName} has been unpublished from the marketplace`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to unpublish template');
    } finally {
      setUnpublishingId(null);
    }
  };

  const getTemplateStyling = (template: any) => {
    if (template.avatar && template.avatar_color) {
      return {
        avatar: template.avatar,
        color: template.avatar_color,
      };
    }
    return getAgentAvatar(template.template_id);
  };

  if (error) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load your templates. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                My Templates
              </h1>
              <p className="text-muted-foreground">
                Manage your secure agent templates and marketplace presence
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <Link href="/marketplace/secure">
              <Button variant="outline">
                <Globe className="h-4 w-4 mr-2" />
                Browse Marketplace
              </Button>
            </Link>
            <Link href="/settings/credentials">
              <Button variant="outline">
                <User className="h-4 w-4 mr-2" />
                Manage Credentials
              </Button>
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-neutral-100 dark:bg-sidebar border border-border rounded-2xl overflow-hidden">
                <Skeleton className="h-32 w-full" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : templates?.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Globe className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No templates yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Create your first secure agent template to share with the community while keeping your credentials safe.
            </p>
            <Link href="/agents">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Agent
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {templates?.map((template) => {
              const { avatar, color } = getTemplateStyling(template);
              const isUnpublishing = unpublishingId === template.template_id;
              
              return (
                <div 
                  key={template.template_id} 
                  className="bg-neutral-100 dark:bg-sidebar border border-border rounded-2xl overflow-hidden hover:bg-muted/50 transition-all duration-200 flex flex-col h-full"
                >
                  <div className={`h-32 flex items-center justify-center relative`} style={{ backgroundColor: color }}>
                    <div className="text-4xl">
                      {avatar}
                    </div>
                    <div className="absolute top-3 right-3 flex gap-2">
                      {template.is_public ? (
                        <div className="flex items-center gap-1 bg-green-500/20 backdrop-blur-sm px-2 py-1 rounded-full">
                          <Globe className="h-3 w-3 text-green-400" />
                          <span className="text-green-400 text-xs font-medium">Public</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 bg-gray-500/20 backdrop-blur-sm px-2 py-1 rounded-full">
                          <GlobeLock className="h-3 w-3 text-gray-400" />
                          <span className="text-gray-400 text-xs font-medium">Private</span>
                        </div>
                      )}
                      {template.is_public && (
                        <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm px-2 py-1 rounded-full">
                          <Download className="h-3 w-3 text-white" />
                          <span className="text-white text-xs font-medium">{template.download_count || 0}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-4 flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-foreground font-medium text-lg line-clamp-1 flex-1">
                        {template.name}
                      </h3>
                    </div>
                    <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                      {template.description || 'No description available'}
                    </p>
                    
                    {template.tags && template.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {template.tags.slice(0, 2).map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {template.tags.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{template.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="space-y-1 mb-4">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>Created {new Date(template.created_at).toLocaleDateString()}</span>
                      </div>
                      {template.marketplace_published_at && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Globe className="h-3 w-3" />
                          <span>Published {new Date(template.marketplace_published_at).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-auto">
                      {template.is_public ? (
                        <Button
                          onClick={() => handleUnpublish(template.template_id, template.name)}
                          disabled={isUnpublishing}
                          variant="outline"
                          className="w-full"
                          size="sm"
                        >
                          {isUnpublishing ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin mr-2" />
                              Unpublishing...
                            </>
                          ) : (
                            <>
                              <GlobeLock className="h-3 w-3 mr-2" />
                              Make Private
                            </>
                          )}
                        </Button>
                      ) : (
                        <div className="text-center text-xs text-muted-foreground py-2">
                          Private template
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
} 