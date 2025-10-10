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
      description: 'Request a new AI agent or workflow',
      color: 'from-purple-500 to-purple-600',
    },
    {
      id: 'support' as const,
      icon: MessageSquare,
      label: 'Customer Support',
      description: 'Book a call with our team',
      color: 'from-blue-500 to-blue-600',
    },
    {
      id: 'feedback' as const,
      icon: Lightbulb,
      label: 'Feedback',
      description: 'Share your thoughts and ideas',
      color: 'from-green-500 to-green-600',
    },
    {
      id: 'bug' as const,
      icon: Bug,
      label: 'Report Bug',
      description: 'Let us know about any issues',
      color: 'from-red-500 to-red-600',
    },
  ];

  const handleOptionClick = (optionId: typeof activeDialog) => {
    setActiveDialog(optionId);
    setIsExpanded(false);
  };

  return (
    <>
      {/* Fixed Help Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-16 right-0 w-80 space-y-2 mb-2"
            >
              {options.map((option, index) => {
                const Icon = option.icon;
                return (
                  <motion.div
                    key={option.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <button
                      onClick={() => handleOptionClick(option.id)}
                      className={`w-full p-4 rounded-lg bg-gradient-to-r ${option.color} text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95`}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                        <div className="text-left">
                          <div className="font-semibold text-sm">{option.label}</div>
                          <div className="text-xs opacity-90 mt-0.5">
                            {option.description}
                          </div>
                        </div>
                      </div>
                    </button>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Help Button */}
        <Button
          onClick={() => setIsExpanded(!isExpanded)}
          size="lg"
          className="h-14 w-14 rounded-full bg-black hover:bg-gray-800 text-white shadow-lg hover:shadow-xl transition-all duration-200 p-0"
        >
          {isExpanded ? (
            <X className="h-6 w-6" />
          ) : (
            <HelpCircle className="h-6 w-6" />
          )}
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

