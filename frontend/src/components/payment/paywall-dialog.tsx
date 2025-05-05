'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Crown,
  Check,
  X,
  Sparkles,
  Rocket,
  Zap,
  Lock,
} from 'lucide-react';
import React, {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface PaywallDialogProps {
  cancelText?: string;
  children?:
    | ((props: { isDisabled: boolean }) => React.ReactNode)
    | React.ReactNode;
  ctaText?: string;
  currentTier: 'free' | 'basic' | 'pro';
  open: boolean;
  description?: string;
  forceDisableContent?: boolean;
  onDialogClose?: () => void;
  onUpgradeClick?: () => void;
  paywallContent?: ReactNode;
  upgradeUrl?: string;
  renderCustomPaywall?: (props: {
    currentTier: 'free' | 'basic' | 'pro';
    requiredTier: 'free' | 'basic' | 'pro';
    onCancel: () => void;
    onUpgrade: () => void;
  }) => ReactNode;
  requiredTier: 'free' | 'basic' | 'pro';
  title?: string;
  featureDescription?: string;
}

const tierValue = {
  free: 0,
  basic: 1,
  pro: 2,
};

export const PaywallDialog: React.FC<PaywallDialogProps> = ({
  cancelText = 'Maybe Later',
  children,
  open = false,
  ctaText = 'Upgrade to Pro',
  currentTier,
  description = 'This feature requires a Pro subscription.',
  forceDisableContent = false,
  onDialogClose,
  onUpgradeClick,
  paywallContent,
  upgradeUrl = '/pricing',
  renderCustomPaywall,
  requiredTier = 'pro',
  title = 'Pro Feature',
  featureDescription = 'Unlock advanced features with a Pro subscription',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasRequiredTier = tierValue[currentTier] >= tierValue[requiredTier];
  const isBlocked = !hasRequiredTier || forceDisableContent;

  const handleUpgrade = useCallback(() => {
    if (onUpgradeClick) {
      onUpgradeClick();
    } else {
      window.location.href = upgradeUrl;
    }
  }, [onUpgradeClick, upgradeUrl]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    if (onDialogClose) {
      onDialogClose();
    }
  }, [onDialogClose]);

  useEffect(() => {
    if (isBlocked && containerRef.current) {
      const overlay = document.createElement('div');
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.zIndex = '100';

      const showPaywall = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(true);
      };

      overlay.addEventListener('click', showPaywall, true);
      overlay.addEventListener('dragenter', showPaywall, true);
      overlay.addEventListener(
        'dragover',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        true,
      );
      overlay.addEventListener('drop', showPaywall, true);

      containerRef.current.style.position = 'relative';
      containerRef.current.appendChild(overlay);
      return () => {
        if (containerRef.current?.contains(overlay)) {
          containerRef.current.removeChild(overlay);
        }
      };
    }
    return undefined;
  }, [isBlocked, setIsOpen]);

  const renderChildren = () => {
    if (typeof children === 'function') {
      return children({ isDisabled: false });
    }
    return children;
  };

  const getTierBadge = (tier: 'free' | 'basic' | 'pro') => {
    switch (tier) {
      case 'free':
        return (
          <Badge variant="outline" className="text-xs font-normal">
            Free
          </Badge>
        );
      case 'basic':
        return (
          <Badge variant="secondary" className="text-xs font-normal">
            Basic
          </Badge>
        );
      case 'pro':
        return (
          <Badge
            variant="default"
            className="bg-gradient-to-r from-indigo-500 to-purple-600 text-xs font-normal"
          >
            Pro
          </Badge>
        );
    }
  };

  return (
    <>
      <div
        className={`w-full
          ${isBlocked ? 'relative' : ''}
        `}
        ref={containerRef}
      >
        {renderChildren()}
      </div>

      <Dialog onOpenChange={setIsOpen} open={open}>
        <DialogContent className="sm:max-w-md">
          {renderCustomPaywall ? (
            renderCustomPaywall({
              currentTier,
              requiredTier,
              onCancel: handleClose,
              onUpgrade: handleUpgrade,
            })
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="flex items-center gap-2">
                    {title}
                    <Crown className="h-5 w-5 text-yellow-500" />
                  </DialogTitle>
                  {requiredTier === 'pro' && (
                    <Badge
                      variant="default"
                      className="bg-gradient-to-r from-indigo-500 to-purple-600"
                    >
                      Pro
                    </Badge>
                  )}
                </div>
                <DialogDescription>{description}</DialogDescription>
              </DialogHeader>

              <div className="py-8">
                {paywallContent ?? (
                  <div className="flex flex-col items-center text-center space-y-6">
                    <div className="relative">
                      <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 opacity-75 blur"></div>
                      <div className="relative rounded-full p-3">
                        <Crown className="h-8 w-8 text-yellow-500" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-lg font-medium">Pro Feature</h3>
                      <p className="text-gray-500">
                        Upgrade to Pro to avail this feature
                      </p>
                    </div>

                    <Badge
                      variant="default"
                      className="bg-gradient-to-r from-indigo-500 to-purple-600 py-1 px-3 text-sm"
                    >
                      Pro Exclusive
                    </Badge>
                  </div>
                )}
              </div>

              <DialogFooter className="flex items-center gap-2">
                <Button onClick={handleClose} variant="outline">
                  {cancelText}
                </Button>
                <Button
                  onClick={handleUpgrade}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
                >
                  <Rocket className="mr-2 h-4 w-4" />
                  {ctaText}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
