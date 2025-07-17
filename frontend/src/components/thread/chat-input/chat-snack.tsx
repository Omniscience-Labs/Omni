import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UsagePreview } from './usage-preview';
import { FloatingToolPreview, ToolCallInput } from './floating-tool-preview';

export interface ChatSnackProps {
    // Tool preview props
    toolCalls?: ToolCallInput[];
    toolCallIndex?: number;
    onExpandToolPreview?: () => void;
    agentName?: string;
    showToolPreview?: boolean;

    // Usage preview props
    showUsagePreview?: 'tokens' | 'upgrade' | false;
    subscriptionData?: any;
    onCloseUsage?: () => void;

    // General props
    isVisible?: boolean;
}

const SNACK_LAYOUT_ID = 'chat-snack-float';
const SNACK_CONTENT_LAYOUT_ID = 'chat-snack-content';

export const ChatSnack: React.FC<ChatSnackProps> = ({
    toolCalls = [],
    toolCallIndex = 0,
    onExpandToolPreview,
    agentName,
    showToolPreview = false,
    showUsagePreview = false,
    subscriptionData,
    onCloseUsage,
    isVisible = false,
}) => {
    const [currentView, setCurrentView] = React.useState(0);

    // Determine what notifications we have
    const notifications = [];
    if (showToolPreview && toolCalls.length > 0) {
        notifications.push('tool');
    }
    if (showUsagePreview) {
        notifications.push('usage');
    }

    const totalNotifications = notifications.length;
    const hasMultiple = totalNotifications > 1;

    // Reset currentView when notifications change
    React.useEffect(() => {
        if (currentView >= totalNotifications && totalNotifications > 0) {
            setCurrentView(0);
        }
    }, [totalNotifications, currentView]);

    // Auto-cycle through notifications
    React.useEffect(() => {
        if (!hasMultiple || !isVisible) return;

        const interval = setInterval(() => {
            setCurrentView((prev) => (prev + 1) % totalNotifications);
        }, 20000);

        return () => clearInterval(interval);
    }, [hasMultiple, isVisible, totalNotifications, currentView]); // Reset timer when currentView changes

    if (!isVisible || totalNotifications === 0) return null;

    const currentNotification = notifications[currentView];

    const renderContent = () => {
        if (currentNotification === 'tool' && showToolPreview) {
            return (
                <FloatingToolPreview
                    toolCalls={toolCalls}
                    currentIndex={toolCallIndex}
                    onExpand={onExpandToolPreview || (() => { })}
                    agentName={agentName}
                    isVisible={true}
                    showIndicators={hasMultiple}
                    indicatorIndex={currentView}
                    indicatorTotal={totalNotifications}
                    onIndicatorClick={(index) => setCurrentView(index)}
                />
            );
        }

        if (currentNotification === 'usage' && showUsagePreview) {
            return (
                <motion.div
                    layoutId={SNACK_LAYOUT_ID}
                    layout
                    transition={{
                        layout: {
                            type: "spring",
                            stiffness: 300,
                            damping: 30
                        }
                    }}
                    className="-mb-4 w-full"
                    style={{ pointerEvents: 'auto' }}
                >
                    <motion.div
                        layoutId={SNACK_CONTENT_LAYOUT_ID}
                        className="bg-card border border-border rounded-3xl p-2 w-full"
                    >
                        <UsagePreview
                            type={showUsagePreview}
                            subscriptionData={subscriptionData}
                            onClose={() => {
                                if (onCloseUsage) onCloseUsage();
                                // If there are other notifications, switch to them
                                if (totalNotifications > 1) {
                                    const remainingNotifications = notifications.filter(n => n !== 'usage');
                                    if (remainingNotifications.length > 0) {
                                        setCurrentView(0); // Switch to first remaining notification
                                    }
                                }
                            }}
                            hasMultiple={hasMultiple}
                            showIndicators={hasMultiple}
                            currentIndex={currentView}
                            totalCount={totalNotifications}
                            onIndicatorClick={(index) => setCurrentView(index)}
                        />
                    </motion.div>
                </motion.div>
            );
        }

        return null;
    };

    return (
        <AnimatePresence mode="wait">
            {isVisible && (
                <motion.div
                    key={currentNotification}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                >
                    {renderContent()}
                </motion.div>
            )}
        </AnimatePresence>
    );
};
