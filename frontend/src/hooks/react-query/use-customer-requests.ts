
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface CustomerRequestData {
    title: string;
    description: string;
    request_type: 'feature' | 'bug' | 'improvement' | 'agent' | 'other';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    attachments?: string[];
}

import { createClient } from '@/lib/supabase/client';

export const useCreateCustomerRequest = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CustomerRequestData) => {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                throw new Error('No valid session');
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000/api'}/customer-requests`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                throw new Error('Failed to submit request');
            }

            return response.json();
        },
        onSuccess: () => {
            toast.success('Request submitted successfully!');
            // Invalidate relevant queries if needed, though this is a write-only op mainly
        },
        onError: (error) => {
            console.error('Error submitting request:', error);
            toast.error('Failed to submit request. Please try again.');
        },
    });
};
