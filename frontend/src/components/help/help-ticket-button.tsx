'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { HelpCircle, Bot, MessageSquare, Lightbulb, Bug, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AgentRequestDialog } from './agent-request-dialog';
import { CustomerSupportDialog } from './customer-support-dialog';
import { FeedbackDialog } from './feedback-dialog';
import { BugReportDialog } from './bug-report-dialog';

type ActiveDialog = 'agent' | 'support' | 'feedback' | 'bug' | null;

const options = [
  {
    id: 'agent' as const,
    icon: Bot,
    label: 'Agent Request',
    description: 'Request a new AI agent',
  },
  {
    id: 'support' as const,
    icon: MessageSquare,
    label: 'Customer Support',
    description: 'Book a support call',
  },
  {
    id: 'feedback' as const,
    icon: Lightbulb,
    label: 'Feedback',
    description: 'Share your ideas',
  },
  {
    id: 'bug' as const,
    icon: Bug,
    label: 'Report Bug',
    description: 'Report an issue',
  },
];

export function HelpTicketButton() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);

  const handleOptionClick = (optionId: ActiveDialog) => {
    setActiveDialog(optionId);
    setIsExpanded(false);
  };

  return (
    <>
      <div className="relative">
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="absolute bottom-full left-0 right-0 mb-3 z-50"
            >
              {/* Card background */}
              <div className="absolute inset-0 -inset-x-2 -inset-y-3 bg-card rounded-2xl shadow-lg border border-border/60 -z-10" />

              <div className="space-y-1.5">
                {options.map((option, index) => {
                  const Icon = option.icon;
                  return (
                    <motion.button
                      key={option.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{
                        delay: index * 0.04,
                        duration: 0.18,
                        ease: [0.23, 1, 0.32, 1],
                      }}
                      onClick={() => handleOptionClick(option.id)}
                      className="w-full group/item"
                    >
                      <div className="relative overflow-hidden rounded-xl bg-background border border-border/50 hover:border-border transition-all duration-200 hover:shadow-sm hover:-translate-y-px">
                        <div className="absolute inset-0 bg-muted/50 opacity-0 group-hover/item:opacity-100 transition-opacity duration-200" />
                        <div className="relative px-3 py-2.5 flex items-center gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-muted border border-border/50 flex items-center justify-center group-hover/item:bg-primary group-hover/item:border-primary transition-all duration-200">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover/item:text-primary-foreground transition-colors duration-200" />
                          </div>
                          <div className="text-left flex-1 min-w-0">
                            <div className="font-medium text-sm text-foreground">
                              {option.label}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {option.description}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Help Button */}
        <Button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full h-11 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2"
        >
          <span className="font-medium text-sm">Help</span>
          <motion.div
            animate={{ rotate: isExpanded ? 45 : 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0"
          >
            {isExpanded ? (
              <X className="h-4 w-4" />
            ) : (
              <HelpCircle className="h-4 w-4" />
            )}
          </motion.div>
        </Button>
      </div>

      <AgentRequestDialog
        open={activeDialog === 'agent'}
        onOpenChange={(open) => !open && setActiveDialog(null)}
      />
      <CustomerSupportDialog
        open={activeDialog === 'support'}
        onOpenChange={(open) => !open && setActiveDialog(null)}
      />
      <FeedbackDialog
        open={activeDialog === 'feedback'}
        onOpenChange={(open) => !open && setActiveDialog(null)}
      />
      <BugReportDialog
        open={activeDialog === 'bug'}
        onOpenChange={(open) => !open && setActiveDialog(null)}
      />
    </>
  );
}
