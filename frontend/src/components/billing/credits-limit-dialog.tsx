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
import { Zap, CreditCard, ArrowUpCircle, DollarSign, Shield } from 'lucide-react';

interface CreditsLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message?: string;
  currentUsage?: number;
  limit?: number;
  creditBalance?: number;
  onUpgrade?: () => void;
  isEnterprise?: boolean;
}

export function CreditsLimitDialog({
  open,
  onOpenChange,
  message = "You've exhausted your available credits.",
  currentUsage,
  limit,
  creditBalance,
  onUpgrade,
  isEnterprise = false,
}: CreditsLimitDialogProps) {
  // Enterprise mode - simple dialog without upgrade options
  if (isEnterprise) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px] border-subtle dark:border-white/10 bg-white dark:bg-neutral-900 rounded-2xl shadow-custom">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-full bg-destructive/10">
                <Shield className="h-5 w-5 text-destructive" />
              </div>
              <DialogTitle className="text-foreground text-xl">
                Usage Limit Reached
              </DialogTitle>
            </div>
            <DialogDescription className="text-foreground/70 text-base pt-2">
              {message || "Your monthly usage limit has been reached. Please contact your administrator to increase your limit."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert className="border-destructive/50 bg-destructive/5">
              <AlertDescription className="text-sm text-foreground/80">
                <div className="space-y-2">
                  <p className="font-medium">Enterprise Account</p>
                  <p>
                    Please contact your administrator to increase your monthly usage limit or adjust your organization's billing settings.
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // SaaS mode - full dialog with upgrade options
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] border-subtle dark:border-white/10 bg-white dark:bg-neutral-900 rounded-2xl shadow-custom">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-destructive/10">
              <Zap className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle className="text-foreground text-xl">
              Credits Limit Reached
            </DialogTitle>
          </div>
          <DialogDescription className="text-foreground/70 text-base pt-2">
            {message}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert className="border-destructive/50 bg-destructive/5">
            <AlertDescription className="text-sm text-foreground/80">
              <div className="space-y-2">
                {creditBalance !== undefined && (
                  <p className="font-medium">
                    <DollarSign className="h-4 w-4 inline mr-1" />
                    Current credit balance: ${creditBalance.toFixed(2)}
                  </p>
                )}
                {currentUsage !== undefined && limit !== undefined && (
                  <p className="font-medium">
                    Monthly usage: ${currentUsage.toFixed(2)} / ${limit.toFixed(2)}
                  </p>
                )}
                <p>
                  To continue using the service, you'll need to add more credits or upgrade your plan.
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
                <CreditCard className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                <span>Purchase additional credits to continue immediately</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowUpCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                <span>Upgrade to a higher tier plan with more included credits</span>
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
          {onUpgrade && (
            <Button
              variant="default"
              onClick={() => {
                onUpgrade();
                onOpenChange(false);
              }}
              className="w-full sm:w-auto bg-primary hover:bg-primary/90"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Add Credits / Upgrade
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
