
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
import { Loader2, Upload, X, Bug } from 'lucide-react';
import { toast } from 'sonner';

interface BugReportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function BugReportDialog({ open, onOpenChange }: BugReportDialogProps) {
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
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
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
                title,
                description,
                request_type: 'bug',
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
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-500 to-orange-500 rounded-t-lg" />
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-red-100 rounded-full">
                            <Bug className="w-5 h-5 text-red-600" />
                        </div>
                        <DialogTitle>Report a Bug</DialogTitle>
                    </div>
                    <DialogDescription>
                        Found an issue? Let us know so we can fix it.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                    <div className="space-y-2">
                        <Label htmlFor="title">Bug Title</Label>
                        <Input
                            id="title"
                            placeholder="Brief summary of the issue"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="priority">Severity</Label>
                        <Select value={priority} onValueChange={setPriority}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select severity" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="low">Minor - Cosmetic / low impact</SelectItem>
                                <SelectItem value="medium">Medium - Normal issue</SelectItem>
                                <SelectItem value="high">High - Major feature broken</SelectItem>
                                <SelectItem value="urgent">Critical - System down / Data loss</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Steps to reproduce</Label>
                        <Textarea
                            id="description"
                            placeholder="1. Go to page X... 2. Click button Y... 3. See error..."
                            className="min-h-[100px]"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Screenshots (Highly Recommended)</Label>
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

                            <Label htmlFor="file-upload" className="w-16 h-16 border-2 border-dashed rounded flex flex-col items-center justify-center cursor-pointer hover:bg-accent/50 transition-colors">
                                <Upload className="w-5 h-5 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground mt-1">Add</span>
                            </Label>
                            <Input
                                id="file-upload"
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
                        <Button type="submit" disabled={isPending} className="bg-red-600 hover:bg-red-700 text-white">
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Submit Report
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
