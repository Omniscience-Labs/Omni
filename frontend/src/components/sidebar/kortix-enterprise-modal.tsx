import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMediaQuery } from '@/hooks/use-media-query';
import Image from 'next/image';
import Cal, { getCalApi } from '@calcom/embed-react';
import { useTheme } from 'next-themes';
import { Check, Calendar } from 'lucide-react';
import { OmniLogo } from '@/components/sidebar/omni-logo';

interface EnterpriseModalProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function KortixEnterpriseModal({ 
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange
}: EnterpriseModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';

  // Use controlled or internal state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;

  useEffect(() => {
    (async function () {
      const cal = await getCalApi({ namespace: 'enterprise-demo' });
      cal('ui', { hideEventTypeDetails: true, layout: 'month_view' });
    })();
  }, []);

  const benefits = [
    "Dedicated solution architect assigned",
    "Enterprise-grade security & compliance",
    "Custom integration with existing systems",
    "Comprehensive team training included",
    "Priority support & ongoing optimization",
    "Scalable architecture for growth",
    "Performance monitoring & analytics",
    "100% satisfaction guarantee"
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="p-0 gap-0 border-none max-w-[90vw] lg:max-w-[80vw] xl:max-w-[70vw] rounded-xl overflow-hidden">
        <DialogTitle className="sr-only">
          Enterprise AI Implementation - Schedule Consultation
        </DialogTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 h-[700px] lg:h-[800px]">
          {/* Enhanced Info Panel */}
          <div className="p-6 lg:p-8 flex flex-col bg-white dark:bg-black relative h-full overflow-y-auto border-r border-gray-200 dark:border-gray-800">
            <div className="relative z-10 flex flex-col h-full">
              <div className="mb-6 flex-shrink-0">
                {/* OMNI text and logo removed entirely */}
              </div>

              <div className="mb-6 flex-shrink-0">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 mb-4">
                  <div className="w-2 h-2 rounded-full bg-primary"></div>
                  <span className="text-xs font-medium text-primary">Enterprise Implementation</span>
                </div>
                
                <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight mb-3 text-foreground">
                  Let's Design Your Custom AI Solution
                </h2>
                <p className="text-base lg:text-lg text-muted-foreground mb-6 leading-relaxed">
                  Schedule a strategy session with our solution architects to explore how custom AI workers can transform your specific business processes and workflows.
                </p>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-800 pt-6 flex-1">
                <h3 className="text-lg font-semibold mb-4 text-foreground">What's Included</h3>
                <div className="space-y-3">
                  {benefits.map((benefit, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                        <Check className="w-3 h-3 text-primary" />
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{benefit}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-800 pt-4 mt-6 flex-shrink-0">
                <div className="text-center space-y-2">
                  <div className="flex items-center justify-center gap-2 text-sm font-medium text-foreground">
                    <Calendar className="w-4 h-4 text-primary" />
                    <span>Free Strategy Session</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    30-minute consultation • No commitment required
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Calendar Panel */}
          <div className="bg-white dark:bg-[#171717] h-full overflow-hidden">
            <div className="h-full overflow-auto">
              <style jsx global>{`
                /* Replace the specific OMNI logo with 3JS spinner */
                [data-cal-namespace="enterprise-demo"] img[alt="OMNI Logo"],
                [data-cal-namespace="enterprise-demo"] img[src*="OMNI-Logo-light.png"],
                [data-cal-namespace="enterprise-demo"] img[src*="OMNI-Logo"],
                [data-cal-namespace="enterprise-demo"] img[alt*="OMNI"],
                [data-cal-namespace="enterprise-demo"] img[alt*="omni"] {
                  content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='gradient' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%2300D4FF;stop-opacity:1' /%3E%3Cstop offset='50%25' style='stop-color:%2300A8CC;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23007ACC;stop-opacity:1' /%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='url(%23gradient)' stroke-width='2' opacity='0.3'/%3E%3Ccircle cx='16' cy='16' r='10' fill='none' stroke='url(%23gradient)' stroke-width='2' opacity='0.6'/%3E%3Ccircle cx='16' cy='16' r='6' fill='none' stroke='url(%23gradient)' stroke-width='2' opacity='0.9'/%3E%3Ccircle cx='16' cy='16' r='2' fill='url(%23gradient)'/%3E%3C/svg%3E") !important;
                  width: 32px !important;
                  height: 32px !important;
                  animation: spin 2s linear infinite !important;
                }
                
                @keyframes spin {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
                
                /* Hide all OMNI text and logos in Cal.com */
                [data-cal-namespace="enterprise-demo"] *[class*="omni"],
                [data-cal-namespace="enterprise-demo"] *[class*="OMNI"],
                [data-cal-namespace="enterprise-demo"] .cal-logo,
                [data-cal-namespace="enterprise-demo"] [class*="logo"],
                [data-cal-namespace="enterprise-demo"] .cal-brand,
                [data-cal-namespace="enterprise-demo"] [class*="brand"],
                /* Hide any broken images or missing logos */
                [data-cal-namespace="enterprise-demo"] img[src=""],
                [data-cal-namespace="enterprise-demo"] img[src*="undefined"],
                [data-cal-namespace="enterprise-demo"] img[src*="null"],
                [data-cal-namespace="enterprise-demo"] img[onerror],
                /* Hide any Cal.com default logos */
                [data-cal-namespace="enterprise-demo"] .cal-avatar,
                [data-cal-namespace="enterprise-demo"] [class*="avatar"],
                [data-cal-namespace="enterprise-demo"] .cal-profile-image,
                [data-cal-namespace="enterprise-demo"] [class*="profile"] {
                  display: none !important;
                }
                
                /* Hide Cal.com branding and logos */
                [data-cal-namespace="enterprise-demo"] .cal-branding,
                [data-cal-namespace="enterprise-demo"] .cal-powered-by,
                [data-cal-namespace="enterprise-demo"] [class*="branding"],
                [data-cal-namespace="enterprise-demo"] [class*="powered-by"],
                [data-cal-namespace="enterprise-demo"] .cal-powered,
                [data-cal-namespace="enterprise-demo"] [class*="cal-powered"],
                [data-cal-namespace="enterprise-demo"] .cal-footer,
                [data-cal-namespace="enterprise-demo"] [class*="footer"] {
                  display: none !important;
                }
                
                /* Hide Cal.com header if it exists */
                [data-cal-namespace="enterprise-demo"] .cal-header,
                [data-cal-namespace="enterprise-demo"] [class*="header"],
                [data-cal-namespace="enterprise-demo"] .cal-nav,
                [data-cal-namespace="enterprise-demo"] [class*="nav"] {
                  display: none !important;
                }
                
                /* Ensure the calendar takes full height and remove any padding */
                [data-cal-namespace="enterprise-demo"] iframe {
                  height: 100% !important;
                  border: none !important;
                  margin: 0 !important;
                  padding: 0 !important;
                }
                
                /* Hide any Cal.com watermark or overlay */
                [data-cal-namespace="enterprise-demo"] .cal-watermark,
                [data-cal-namespace="enterprise-demo"] [class*="watermark"],
                [data-cal-namespace="enterprise-demo"] .cal-overlay,
                [data-cal-namespace="enterprise-demo"] [class*="overlay"] {
                  display: none !important;
                }
              `}</style>
              <Cal
                namespace="enterprise-demo"
                calLink="arjun-subramaniam-u32lcu/30min"
                style={{ width: '100%', height: '100%' }}
                config={{
                  layout: 'month_view',
                  hideEventTypeDetails: 'false',
                  hideBranding: true,
                  hideLogo: true,
                  hideProfileImage: true,
                }}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Export with original name for backwards compatibility
export const KortixProcessModal = KortixEnterpriseModal;
