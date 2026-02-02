
"use client";

import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateCustomerRequest } from '@/hooks/react-query/use-customer-requests';
import { Loader2, Upload, X, Bot } from 'lucide-react';
import { toast } from 'sonner';

interface AgentRequestDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AgentRequestDialog({ open, onOpenChange }: AgentRequestDialogProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<string>('medium');
    const [attachments, setAttachments] = useState<string[]>([]);
    const { mutate, isPending } = useCreateCustomerRequest();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.size > 5 * 1024 * 1024) {
                toast.error(`File ${file.name} is too large (max 5MB)`);
                continue;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                setAttachments(prev => [...prev, base64String]);
            };
            reader.readAsDataURL(file);
        }
    };

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !description) return;

        mutate(
            {
                title: title,
                description: description,
                request_type: 'agent',
                priority: priority as 'low' | 'medium' | 'high' | 'urgent',
                attachments: attachments,
            },
            {
                onSuccess: () => {
                    onOpenChange(false);
                    setTitle('');
                    setDescription('');
                    setPriority('medium');
                    setAttachments([]);
                },
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-t-lg" />
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-purple-100 rounded-full">
                            <Bot className="w-5 h-5 text-purple-600" />
                        </div>
                        <DialogTitle>Request a Custom Agent</DialogTitle>
                    </div>
                    <DialogDescription>
                        Need a specific agent functionality? Describe it below.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                    <div className="space-y-2">
                        <Label htmlFor="title">Agent Name / Concept</Label>
                        <Input
                            id="title"
                            placeholder="e.g., LinkedIn Outreach Bot"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="priority">Priority</Label>
                        <Select value={priority} onValueChange={setPriority}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="low">Low - Nice to have</SelectItem>
                                <SelectItem value="medium">Medium - Normal</SelectItem>
                                <SelectItem value="high">High - Important</SelectItem>
                                <SelectItem value="urgent">Urgent - Critical</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Requirements / Workflow</Label>
                        <Textarea
                            id="description"
                            placeholder="Describe step-by-step what this agent should do..."
                            className="min-h-[120px]"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Attachments (Screenshots)</Label>
                        <div className="flex flex-wrap gap-2">
                            {attachments.map((_, index) => (
                                <div key={index} className="relative w-16 h-16 border rounded overflow-hidden group">
                                    <img src={attachments[index]} alt="Preview" className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => removeAttachment(index)}
                                        className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}

                            <Label htmlFor="agent-file-upload" className="w-16 h-16 border-2 border-dashed rounded flex flex-col items-center justify-center cursor-pointer hover:bg-accent/50 transition-colors">
                                <Upload className="w-5 h-5 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground mt-1">Add</span>
                            </Label>
                            <Input
                                id="agent-file-upload"
                                type="file"
                                multiple
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isPending} className="bg-purple-600 hover:bg-purple-700 text-white">
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Submit Request
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
