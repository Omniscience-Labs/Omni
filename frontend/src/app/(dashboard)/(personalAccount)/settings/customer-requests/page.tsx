'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquarePlus, ExternalLink } from 'lucide-react';
import { CustomerRequestDialog } from '@/components/settings/customer-request-dialog';
import { useCustomerRequests } from '@/hooks/react-query/use-customer-requests';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';

export default function CustomerRequestsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: requests, isLoading } = useCustomerRequests();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Customer Requests</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Submit feature requests and bug reports directly to our team
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <MessageSquarePlus className="h-4 w-4 mr-2" />
          New Request
        </Button>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <>
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </>
        ) : requests && requests.length > 0 ? (
          requests.map((request: any) => (
            <Card key={request.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{request.title}</CardTitle>
                    <CardDescription>
                      Submitted {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={request.priority === 'urgent' ? 'destructive' : 'secondary'}>
                      {request.priority}
                    </Badge>
                    {request.linear_issue_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(request.linear_issue_url, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {request.description}
                </p>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessageSquarePlus className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">No requests yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Submit your first feature request or bug report
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <MessageSquarePlus className="h-4 w-4 mr-2" />
                Create Request
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <CustomerRequestDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </div>
  );
}

