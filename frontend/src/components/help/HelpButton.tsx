"use client";

import { useState } from "react";
import { HelpCircle, Briefcase, MessageSquare, Lightbulb, Bug, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AgentRequestForm } from "./AgentRequestForm";
import { ReportBugForm } from "./ReportBugForm";
import { FeedbackForm } from "./FeedbackForm";
import { CustomerSupportDialog } from "./CustomerSupportDialog";

export function HelpButton() {
    const [isExpanded, setIsExpanded] = useState(false);
    const [activeDialog, setActiveDialog] = useState<'agent' | 'support' | 'feedback' | 'bug' | null>(null);

    const menuItems = [
        {
            id: 'agent' as const,
            icon: Briefcase,
            title: 'Agent Request',
            description: 'Request a new AI agent',
        },
        {
            id: 'support' as const,
            icon: MessageSquare,
            title: 'Customer Support',
            description: 'Book a support call',
        },
        {
            id: 'feedback' as const,
            icon: Lightbulb,
            title: 'Feedback',
            description: 'Share your ideas',
        },
        {
            id: 'bug' as const,
            icon: Bug,
            title: 'Report Bug',
            description: 'Report an issue',
        },
    ];

    const handleMenuClick = (id: 'agent' | 'support' | 'feedback' | 'bug') => {
        setIsExpanded(false);
        setActiveDialog(id);
    };

    const handleCloseDialog = () => {
        setActiveDialog(null);
    };

    return (
        <>
            {/* Backdrop when menu is open */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[99998]"
                        onClick={() => setIsExpanded(false)}
                    />
                )}
            </AnimatePresence>

            {/* Popup Menu */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="fixed bottom-24 right-6 z-[99999] w-80"
                    >
                        <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                            {menuItems.map((item, index) => {
                                const Icon = item.icon;
                                return (
                                    <motion.button
                                        key={item.id}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.05, duration: 0.2 }}
                                        onClick={() => handleMenuClick(item.id)}
                                        className={`w-full flex items-center gap-4 px-5 py-4 hover:bg-white/5 transition-colors cursor-pointer ${index !== menuItems.length - 1 ? 'border-b border-white/5' : ''
                                            }`}
                                    >
                                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                                            <Icon className="h-5 w-5 text-white/70" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <div className="text-white font-medium text-sm">{item.title}</div>
                                            <div className="text-white/40 text-xs">{item.description}</div>
                                        </div>
                                    </motion.button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Help Button */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl bg-black border border-white/10 text-white z-[99999] transition-all hover:scale-110 hover:shadow-lg flex items-center justify-center"
            >
                <AnimatePresence mode="wait">
                    {isExpanded ? (
                        <motion.div
                            key="close"
                            initial={{ rotate: -90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: 90, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                        >
                            <X className="h-6 w-6" />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="help"
                            initial={{ rotate: 90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: -90, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                        >
                            <HelpCircle className="h-7 w-7" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </button>

            {/* Agent Request Dialog */}
            <Dialog open={activeDialog === 'agent'} onOpenChange={(open) => !open && handleCloseDialog()}>
                <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden border-white/10 bg-[#0A0A0A]">
                    <div className="flex h-[600px] flex-col">
                        <div className="flex items-center gap-4 border-b border-white/10 px-6 py-4">
                            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                                <Briefcase className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-base font-semibold text-white">Agent Request</h2>
                                <p className="text-xs text-white/40">Request a new AI agent</p>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto px-6 py-4">
                            <AgentRequestForm onSuccess={handleCloseDialog} />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Customer Support Dialog */}
            <CustomerSupportDialog
                open={activeDialog === 'support'}
                onOpenChange={(open) => !open && handleCloseDialog()}
            />

            {/* Feedback Dialog */}
            <Dialog open={activeDialog === 'feedback'} onOpenChange={(open) => !open && handleCloseDialog()}>
                <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden border-white/10 bg-[#0A0A0A]">
                    <div className="flex h-[600px] flex-col">
                        <div className="flex items-center gap-4 border-b border-white/10 px-6 py-4">
                            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center">
                                <Lightbulb className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-base font-semibold text-white">Feedback</h2>
                                <p className="text-xs text-white/40">Share your ideas</p>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto px-6 py-4">
                            <FeedbackForm onSuccess={handleCloseDialog} />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Report Bug Dialog */}
            <Dialog open={activeDialog === 'bug'} onOpenChange={(open) => !open && handleCloseDialog()}>
                <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden border-white/10 bg-[#0A0A0A]">
                    <div className="flex h-[600px] flex-col">
                        <div className="flex items-center gap-4 border-b border-white/10 px-6 py-4">
                            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
                                <Bug className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-base font-semibold text-white">Report Bug</h2>
                                <p className="text-xs text-white/40">Report an issue</p>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto px-6 py-4">
                            <ReportBugForm onSuccess={handleCloseDialog} />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
