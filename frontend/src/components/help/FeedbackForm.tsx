"use client";

import React, { useState } from 'react';
import { HelpLabel, HelpInput, HelpTextarea, HelpPrimitiveButton as HelpButton } from './ui';
import { toast } from 'sonner';
import { backendApi as apiClient } from '../../lib/api-client';

export const FeedbackForm = ({ onSuccess }: { onSuccess: () => void }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await apiClient.post('/customer-requests', {
                ...formData,
                request_type: 'improvement', // or 'other'
                environment: window.location.host,
                priority: 'medium'
            });

            toast.success('Feedback submitted. Thanks for your thoughts!');
            onSuccess();
            setFormData({ title: '', description: '' });
        } catch (error) {
            console.error(error);
            toast.error('Failed to submit feedback. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="bg-gradient-to-r from-blue-500/10 to-transparent p-4 rounded-lg border border-blue-500/20 mb-4">
                <h3 className="text-blue-400 font-medium mb-1">Share Feedback</h3>
                <p className="text-xs text-gray-400">Have an idea or suggestion? We'd love to hear it.</p>
            </div>

            <div>
                <HelpLabel>Subject</HelpLabel>
                <HelpInput
                    required
                    placeholder="e.g., Make the sidebar collapsible"
                    value={formData.title}
                    onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                />
            </div>

            <div>
                <HelpLabel>Your Feedback</HelpLabel>
                <HelpTextarea
                    required
                    className="min-h-[120px]"
                    placeholder="Tell us what you think..."
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                />
            </div>

            <div className="pt-2">
                <HelpButton type="submit" className="w-full bg-blue-600 hover:bg-blue-700" isLoading={loading}>
                    Submit Feedback
                </HelpButton>
            </div>
        </form>
    );
};
