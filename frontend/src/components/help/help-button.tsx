'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { HelpCircle, Bot, MessageSquare, Lightbulb, Bug, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AgentRequestDialog } from './agent-request-dialog';
import { CustomerSupportDialog } from './customer-support-dialog';
import { FeedbackDialog } from './feedback-dialog';
import { BugReportDialog } from './bug-report-dialog';

export function HelpButton() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeDialog, setActiveDialog] = useState<'agent' | 'support' | 'feedback' | 'bug' | null>(null);

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

  const handleOptionClick = (optionId: typeof activeDialog) => {
    setActiveDialog(optionId);
    setIsExpanded(false);
  };

  return (
    <>
      {/* Help Button in Sidebar */}
      <div className="relative">
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="absolute bottom-full left-0 right-0 mb-2 space-y-2"
            >
              {options.map((option, index) => {
                const Icon = option.icon;
                return (
                  <motion.button
                    key={option.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    transition={{ 
                      delay: index * 0.04,
                      duration: 0.2,
                      ease: [0.23, 1, 0.32, 1]
                    }}
                    onClick={() => handleOptionClick(option.id)}
                    className="w-full group relative"
                  >
                    <div className="relative overflow-hidden rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5">
                      <div className="absolute inset-0 bg-gradient-to-r from-neutral-50 to-transparent dark:from-neutral-800/50 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      <div className="relative p-3 flex items-center gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center group-hover:bg-neutral-900 dark:group-hover:bg-white group-hover:border-neutral-900 dark:group-hover:border-white transition-all duration-200">
                          <Icon className="h-4 w-4 text-neutral-700 dark:text-neutral-300 group-hover:text-white dark:group-hover:text-neutral-900 transition-colors duration-200" />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <div className="font-medium text-sm text-neutral-900 dark:text-neutral-100 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors duration-200">
                            {option.label}
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                            {option.description}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Help Button - Black Circle */}
        <Button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full h-14 rounded-full bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-black shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2 text-base"
        >
          <span className="font-medium">Help</span>
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0"
          >
            {isExpanded ? (
              <X className="h-5 w-5" />
            ) : (
              <HelpCircle className="h-5 w-5" />
            )}
          </motion.div>
        </Button>
      </div>

      {/* Dialogs */}
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
