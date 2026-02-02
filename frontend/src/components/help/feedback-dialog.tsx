
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateCustomerRequest } from '@/hooks/react-query/use-customer-requests';
import { Loader2, Upload, X, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';

interface FeedbackDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
    const [feedback, setFeedback] = useState('');
    const [summary, setSummary] = useState(''); // Added Summary field per report
    const [priority, setPriority] = useState<string>('low'); // Added Priority field per report
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
        if (!summary || !feedback) return;

        mutate(
            {
                title: summary,
                description: feedback,
                request_type: 'improvement',
                priority: priority as 'low' | 'medium' | 'high' | 'urgent',
                attachments: attachments,
            },
            {
                onSuccess: () => {
                    onOpenChange(false);
                    setSummary('');
                    setFeedback('');
                    setPriority('low');
                    setAttachments([]);
                },
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-green-400 to-emerald-600 rounded-t-lg" />
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-green-100 rounded-full">
                            <Lightbulb className="w-5 h-5 text-green-600" />
                        </div>
                        <DialogTitle>Share Feedback</DialogTitle>
                    </div>
                    <DialogDescription>
                        We'd love to hear your thoughts on how to improve the app.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                    <div className="space-y-2">
                        <Label htmlFor="summary">Summary</Label>
                        <Input
                            id="summary"
                            placeholder="e.g., Add Dark Mode"
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
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
                                <SelectItem value="low">Nice to have</SelectItem>
                                <SelectItem value="medium">Important</SelectItem>
                                <SelectItem value="high">Critical</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="feedback">Details</Label>
                        <Textarea
                            id="feedback"
                            placeholder="What can be improved? Why is this important?"
                            className="min-h-[120px]"
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Attachments (Optional)</Label>
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

                            <Label htmlFor="feedback-file-upload" className="w-16 h-16 border-2 border-dashed rounded flex flex-col items-center justify-center cursor-pointer hover:bg-accent/50 transition-colors">
                                <Upload className="w-5 h-5 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground mt-1">Add</span>
                            </Label>
                            <Input
                                id="feedback-file-upload"
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
                        <Button type="submit" disabled={isPending} className="bg-green-600 hover:bg-green-700 text-white">
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Send Feedback
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
