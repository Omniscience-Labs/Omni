"use client";

import { useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MessageSquare } from "lucide-react";
import Cal from "@calcom/embed-react";

interface CustomerSupportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CustomerSupportDialog({ open, onOpenChange }: CustomerSupportDialogProps) {
    useEffect(() => {
        // Inject global CSS to hide Cal.com branding and watermarks
        const style = document.createElement("style");
        style.textContent = `
            [data-cal-namespace="support-booking"] .cal-branding,
            [data-cal-namespace="support-booking"] .cal-powered-by,
            [data-cal-namespace="support-booking"] .cal-watermark,
            [data-cal-namespace="support-booking"] .cal-footer {
                display: none !important;
            }
            [data-cal-namespace="support-booking"] iframe {
                height: 100% !important;
                border: none !important;
            }
        `;
        document.head.appendChild(style);
        return () => {
            document.head.removeChild(style);
        };
    }, []);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0 overflow-hidden border-white/10 bg-[#0A0A0A]">
                <div className="flex flex-col h-full">
                    {/* Header — blue gradient icon, title, description */}
                    <div className="flex items-center gap-4 border-b border-white/10 px-6 py-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                            <MessageSquare className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-base font-semibold text-white">Help &amp; Support</h2>
                            <p className="text-xs text-white/40">Schedule a help session with a human</p>
                        </div>
                    </div>

                    {/* Cal.com inline embed — 600px scrollable area */}
                    <div className="flex-1 overflow-auto bg-white" style={{ height: 600 }}>
                        {open && (
                            <Cal
                                namespace="support-booking"
                                calLink="sundar001/30min"
                                style={{ width: "100%", height: "100%", overflow: "scroll" }}
                                config={{
                                    layout: "month_view",
                                    theme: "light",
                                }}
                            />
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
