
"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, Bot, MessageSquare, Lightbulb, Bug, X, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

import { BugReportDialog } from './bug-report-dialog';
import { FeedbackDialog } from './feedback-dialog';
import { AgentRequestDialog } from './agent-request-dialog';
import Cal, { getCalApi } from "@calcom/embed-react";
import { useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function HelpButton() {
    const [isExpanded, setIsExpanded] = useState(false);
    const [activeDialog, setActiveDialog] = useState<string | null>(null);

    useEffect(() => {
        (async function () {
            const cal = await getCalApi({ "namespace": "support-booking" });
            cal("ui", { "styles": { "branding": { "brandColor": "#000000" } }, "hideEventTypeDetails": false, "layout": "month_view" });
        })();
    }, []);

    const menuItems = [
        {
            id: 'agent',
            label: 'Agent Request',
            icon: Bot,
            color: 'bg-blue-500',
            action: () => setActiveDialog('agent'),
        },
        {
            id: 'support',
            label: 'Expert Session',
            icon: Calendar,
            color: 'bg-green-500',
            action: () => setActiveDialog('support'),
        },
        {
            id: 'feedback',
            label: 'Feedback',
            icon: Lightbulb,
            color: 'bg-yellow-500',
            action: () => setActiveDialog('feedback'),
        },
        {
            id: 'bug',
            label: 'Report Bug',
            icon: Bug,
            color: 'bg-red-500',
            action: () => setActiveDialog('bug'),
        },
    ];

    return (
        <>
            <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.8 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.8 }}
                            className="flex flex-col gap-2 mb-2"
                        >
                            {menuItems.map((item, index) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                >
                                    <TooltipProvider>
                                        <Tooltip delayDuration={0}>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="secondary"
                                                    size="icon"
                                                    className="h-10 w-10 rounded-full shadow-lg hover:shadow-xl transition-all"
                                                    onClick={() => {
                                                        setIsExpanded(false);
                                                        item.action();
                                                    }}
                                                >
                                                    <item.icon className="h-5 w-5" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="left">
                                                <p>{item.label}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </motion.div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>

                <Button
                    size="icon"
                    className={cn(
                        "h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300",
                        isExpanded ? "rotate-90 bg-slate-800" : "bg-primary"
                    )}
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {isExpanded ? (
                        <X className="h-6 w-6" />
                    ) : (
                        <HelpCircle className="h-6 w-6" />
                    )}
                </Button>
            </div>

            <BugReportDialog open={activeDialog === 'bug'} onOpenChange={(v) => !v && setActiveDialog(null)} />
            <FeedbackDialog open={activeDialog === 'feedback'} onOpenChange={(v) => !v && setActiveDialog(null)} />
            <AgentRequestDialog open={activeDialog === 'agent'} onOpenChange={(v) => !v && setActiveDialog(null)} />

            <Dialog open={activeDialog === 'support'} onOpenChange={(v) => !v && setActiveDialog(null)}>
                <DialogContent className="sm:max-w-[800px] h-[80vh] p-0 overflow-hidden">
                    <div className="w-full h-full">
                        <Cal
                            namespace="support-booking"
                            calLink="sundar001/30min"
                            style={{ width: "100%", height: "100%", overflow: "scroll" }}
                            config={{ "layout": "month_view" }}
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
