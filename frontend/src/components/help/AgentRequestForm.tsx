"use client";

import React, { useState } from 'react';
import { HelpLabel, HelpInput, HelpTextarea, HelpSelect, HelpPrimitiveButton as HelpButton } from './ui';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth'; // Assessing this exists
import { backendApi as apiClient } from '../../lib/api-client';

export const AgentRequestForm = ({ onSuccess }: { onSuccess: () => void }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        priority: 'medium',
        attachments: [] as string[]
    });

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            Array.from(files).forEach(file => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    if (typeof reader.result === 'string') {
                        setFormData(prev => ({
                            ...prev,
                            attachments: [...prev.attachments, reader.result as string]
                        }));
                    }
                };
                reader.readAsDataURL(file);
            });
        }
    };

    const removeAttachment = (index: number) => {
        setFormData(prev => ({
            ...prev,
            attachments: prev.attachments.filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await apiClient.post('/customer-requests', {
                ...formData,
                request_type: 'agent',
                environment: window.location.host
            });

            toast.success('Agent request submitted successfully!');
            onSuccess();
            setFormData({ title: '', description: '', priority: 'medium', attachments: [] });
        } catch (error) {
            console.error(error);
            toast.error('Failed to submit request. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="bg-gradient-to-r from-purple-500/10 to-transparent p-4 rounded-lg border border-purple-500/20 mb-4">
                <h3 className="text-purple-400 font-medium mb-1">New Agent Request</h3>
                <p className="text-xs text-gray-400">Describe the agent you need. We'll review and build it for you.</p>
            </div>

            <div>
                <HelpLabel>Agent Name</HelpLabel>
                <HelpInput
                    required
                    placeholder="e.g., LinkedIn Outreach Bot"
                    value={formData.title}
                    onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                />
            </div>

            <div>
                <HelpLabel>Priority</HelpLabel>
                <HelpSelect
                    value={formData.priority}
                    onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                </HelpSelect>
            </div>

            <div>
                <HelpLabel>Description & Workflows</HelpLabel>
                <HelpTextarea
                    required
                    className="min-h-[120px]"
                    placeholder="Describe exactly what this agent should do..."
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                />
            </div>

            <div>
                <HelpLabel>Attachments (Screenshots/Mockups)</HelpLabel>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-white/10 border-dashed rounded-md hover:border-white/20 transition-colors">
                    <div className="space-y-1 text-center">
                        <Upload className="mx-auto h-8 w-8 text-gray-400" />
                        <div className="flex text-sm text-gray-400">
                            <label className="relative cursor-pointer rounded-md font-medium text-purple-400 hover:text-purple-300 focus-within:outline-none">
                                <span>Upload a file</span>
                                <input type="file" className="sr-only" multiple accept="image/*" onChange={handleFileChange} />
                            </label>
                            <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                    </div>
                </div>

                {formData.attachments.length > 0 && (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                        {formData.attachments.map((file, i) => (
                            <div key={i} className="relative group aspect-square rounded-md overflow-hidden bg-black/20 border border-white/10">
                                <img src={file} alt="Preview" className="object-cover w-full h-full" />
                                <button
                                    type="button"
                                    onClick={() => removeAttachment(i)}
                                    className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="pt-2">
                <HelpButton type="submit" className="w-full bg-purple-600 hover:bg-purple-700" isLoading={loading}>
                    Submit Agent Request
                </HelpButton>
            </div>
        </form>
    );
};
