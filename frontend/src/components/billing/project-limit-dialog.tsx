'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Trash2, ArrowUpCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ProjectLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCount?: number;
  limit?: number;
  tierName?: string;
  onUpgrade?: () => void;
}

export function ProjectLimitDialog({
  open,
  onOpenChange,
  currentCount = 0,
  limit = 0,
  tierName = 'current',
  onUpgrade,
}: ProjectLimitDialogProps) {
  const router = useRouter();

  const handleGoToChats = () => {
    onOpenChange(false);
    router.push('/dashboard');
  };

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] border-subtle dark:border-white/10 bg-card-bg dark:bg-background-secondary rounded-2xl shadow-custom">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle className="text-foreground text-xl">
              Chat Limit Reached
            </DialogTitle>
          </div>
          <DialogDescription className="text-foreground/70 text-base pt-2">
            You've reached your maximum number of chats for the {tierName} plan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert className="border-destructive/50 bg-destructive/5">
            <AlertDescription className="text-sm text-foreground/80">
              <div className="space-y-2">
                <p className="font-medium">
                  Current usage: {currentCount} / {limit} chats
                </p>
                <p>
                  To create new chats, you'll need to delete some existing ones or upgrade your plan.
                </p>
              </div>
            </AlertDescription>
          </Alert>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h4 className="font-medium text-sm text-foreground mb-2">
              What you can do:
            </h4>
            <ul className="space-y-2 text-sm text-foreground/70">
              <li className="flex items-start gap-2">
                <Trash2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-destructive" />
                <span>Delete old or unused chats to free up space</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowUpCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                <span>Upgrade your plan to get more chat capacity</span>
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Close
          </Button>
          <Button
            variant="default"
            onClick={handleGoToChats}
            className="w-full sm:w-auto bg-foreground hover:bg-foreground/90"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Manage Chats
          </Button>
          {onUpgrade && (
            <Button
              variant="default"
              onClick={handleUpgrade}
              className="w-full sm:w-auto bg-primary hover:bg-primary/90"
            >
              <ArrowUpCircle className="h-4 w-4 mr-2" />
              Upgrade Plan
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
