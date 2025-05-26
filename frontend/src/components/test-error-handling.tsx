'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { handleApiError, handleApiSuccess, handleApiWarning } from '@/lib/error-handler';
import { projectsApi } from '@/lib/api-enhanced';

export const TestErrorHandling: React.FC = () => {
  const testError = () => {
    // Simulate a 404 error
    const error = new Error('Resource not found');
    (error as any).status = 404;
    handleApiError(error, { operation: 'test operation', resource: 'test data' });
  };

  const testSuccess = () => {
    handleApiSuccess('Test successful!', 'This is a success message');
  };

  const testWarning = () => {
    handleApiWarning('Test warning', 'This is a warning message');
  };

  const testEnhancedApi = async () => {
    try {
      // This will trigger error handling automatically
      await projectsApi.getById('non-existent-id');
    } catch (error) {
      console.log('Error caught:', error);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-lg font-semibold">Test Error Handling</h3>
      <div className="space-x-2">
        <Button onClick={testError} variant="destructive">
          Test Error Toast
        </Button>
        <Button onClick={testSuccess} variant="default">
          Test Success Toast
        </Button>
        <Button onClick={testWarning} variant="secondary">
          Test Warning Toast
        </Button>
        <Button onClick={testEnhancedApi} variant="outline">
          Test Enhanced API Error
        </Button>
      </div>
    </div>
  );
}; 