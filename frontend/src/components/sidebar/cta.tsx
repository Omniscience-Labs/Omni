import { Button } from '@/components/ui/button';
import { KortixProcessModal } from '@/components/sidebar/kortix-enterprise-modal';

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
