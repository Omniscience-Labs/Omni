import { Button } from '@/components/ui/button';
import { KortixProcessModal } from '@/components/sidebar/kortix-enterprise-modal';
import { CustomerRequestDialog } from '@/components/settings/customer-request-dialog';
import { useState, useEffect } from 'react';
import { MessageSquarePlus, HelpCircle } from 'lucide-react';

export function HelpFeedbackCard() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-200 dark:from-blue-950/40 dark:to-blue-900/40 shadow-sm border border-blue-200/50 dark:border-blue-800/50 p-4 transition-all">
        <div className="flex flex-col space-y-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-foreground">
                Need Help? Got Feedback?
              </span>
            </div>
            <span className="text-xs text-muted-foreground mt-0.5">
              Share feedback, report bugs, or request features to help us improve
            </span>
          </div>

          <div>
            <Button
              onClick={() => setIsDialogOpen(true)}
              className="w-full"
            >
              <MessageSquarePlus className="h-4 w-4 mr-2" />
              Submit Request
            </Button>
          </div>

        </div>
      </div>

      <CustomerRequestDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </>
  );
}

export function CTACard() {
  const isEnterpriseMode = process.env.NEXT_PUBLIC_ENTERPRISE_MODE === 'true';

  return (
    <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-200 dark:from-blue-950/40 dark:to-blue-900/40 shadow-sm border border-blue-200/50 dark:border-blue-800/50 p-4 transition-all">
      <div className="flex flex-col space-y-4">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">
            {isEnterpriseMode ? 'Help & Support' : 'Enterprise Demo'}
          </span>
          <span className="text-xs text-muted-foreground mt-0.5">
            {isEnterpriseMode
              ? 'Schedule a help session with a human'
              : 'Request custom AI Agents implementation'
            }
          </span>
        </div>

        <div>
          <KortixProcessModal>
            <Button className="w-full">
              {isEnterpriseMode ? 'Schedule help session' : 'Learn more'}
            </Button>
          </KortixProcessModal>
        </div>

      </div>
    </div>
  );
}

export function CTACarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const cards = [
    { component: HelpFeedbackCard, key: 'help-feedback', label: 'Help & Feedback' },
    { component: CTACard, key: 'enterprise-demo', label: 'Enterprise Demo' }
  ];

  // Auto-advance carousel every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % cards.length);
    }, 15000);

    return () => clearInterval(interval);
  }, [cards.length]);

  const handlePillClick = (index: number) => {
    setActiveIndex(index);
  };

  const ActiveCard = cards[activeIndex].component;

  return (
    <div className="relative">
      {/* Only render the active card */}
      <div className="relative">
        <ActiveCard />
      </div>

      {/* Pill Indicators */}
      <div className="flex justify-center gap-2 mt-3">
        {cards.map(({ label }, index) => (
          <button
            key={index}
            onClick={() => handlePillClick(index)}
            className={`h-2 rounded-full transition-all duration-300 ${
              index === activeIndex
                ? 'w-8 bg-gray-800 dark:bg-white shadow-sm'
                : 'w-2 bg-gray-800/40 dark:bg-white/40 hover:bg-gray-800/60 dark:hover:bg-white/60'
            }`}
            aria-label={`Show ${label}`}
          />
        ))}
      </div>
    </div>
  );
}
