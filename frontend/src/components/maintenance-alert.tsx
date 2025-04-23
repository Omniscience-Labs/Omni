"use client"

import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { AlertCircle, X, Zap, Github } from "lucide-react"
import Link from "next/link"
import { AnimatePresence, motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { Portal } from "@/components/ui/portal"
import { cn } from "@/lib/utils"
import { setupNewSubscription } from "@/lib/actions/billing"
import { SubmitButton } from "@/components/ui/submit-button"
import { siteConfig } from "@/lib/home"

interface MaintenanceAlertProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  closeable?: boolean
  accountId?: string | null | undefined
}

export function MaintenanceAlert({ open, onOpenChange, closeable = true, accountId }: MaintenanceAlertProps) {
  const returnUrl = typeof window !== 'undefined' ? window.location.href : '';

  if (!open) return null;

  // Filter plans to show only Pro and Enterprise
  const premiumPlans = siteConfig.cloudPricingItems.filter(plan => 
    plan.name === 'Pro' || plan.name === 'Enterprise'
  );

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto py-4"
            >
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm"
                onClick={closeable ? () => onOpenChange(false) : undefined}
                aria-hidden="true"
              />
              
              {/* Modal */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className={cn(
                  "relative bg-background rounded-lg shadow-xl w-full max-w-md mx-3"
                )}
                role="dialog"
                aria-modal="true"
                aria-labelledby="free-tier-modal-title"
              >
                <div className="p-4">
                  {/* Close button */}
                  {closeable && (
                    <button
                      onClick={() => onOpenChange(false)}
                      className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Close dialog"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}

                  {/* Header */}
                  <div className="text-center mb-4">
                    <div className="inline-flex items-center justify-center p-1.5 bg-primary/10 rounded-full mb-2">
                      <Zap className="h-4 w-4 text-primary" />
                    </div>
                    <h2 id="free-tier-modal-title" className="text-lg font-medium tracking-tight mb-1">
                      Free Tier Unavailable At This Time
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Due to extremely high demand, we cannot offer a free tier at the moment. Upgrade to Pro to continue using our service.
                    </p>
                  </div>

                  {/* Custom plan comparison wrapper to show Pro, Enterprise and Self-Host side by side */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {premiumPlans.map((tier) => (
                      <div key={tier.name} className="border border-border rounded-lg p-3">
                        <div className="text-center mb-2">
                          <h3 className="font-medium">{tier.name}</h3>
                          <p className="text-sm font-bold">{tier.price}/mo</p>
                          <p className="text-xs text-muted-foreground">{tier.hours}/month</p>
                        </div>
                        <form>
                          <input type="hidden" name="accountId" value={accountId || ''} />
                          <input type="hidden" name="returnUrl" value={returnUrl} />
                          <input type="hidden" name="planId" value={
                            tier.name === 'Pro' 
                              ? siteConfig.cloudPricingItems.find(item => item.name === 'Pro')?.stripePriceId || ''
                              : siteConfig.cloudPricingItems.find(item => item.name === 'Enterprise')?.stripePriceId || ''
                          } />
                          <SubmitButton
                            pendingText="..."
                            formAction={setupNewSubscription}
                            className={cn(
                              "w-full font-medium transition-colors h-7 rounded-md text-xs",
                              tier.buttonColor
                            )}
                          >
                            Upgrade
                          </SubmitButton>
                        </form>
                      </div>
                    ))}
                    
                    {/* Self-host Option as the third card */}
                    <div className="border border-border rounded-lg p-3">
                      <div className="text-center mb-2">
                        <h3 className="font-medium">Self-Host</h3>
                        <p className="text-sm font-bold">Free</p>
                        <p className="text-xs text-muted-foreground">Open Source</p>
                      </div>
                      <Link 
                        href="https://github.com/kortix-ai/suna" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-1 h-7 bg-gradient-to-tr from-primary to-primary/80 hover:opacity-90 text-white font-medium rounded-md text-xs transition-all"
                      >
                        <Github className="h-3.5 w-3.5" />
                        <span>Self-Host</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Portal>
  )
} 