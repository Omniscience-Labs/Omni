'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import 'shepherd.js/dist/css/shepherd.css';
import './tour-styles.css';
import './types';

import { Button } from '@/components/ui/button';
import { HelpCircle, X } from 'lucide-react';

interface OmniSpecificTourProps {
  isFirstTime?: boolean;
  onComplete?: () => void;
}

export function OmniSpecificTour({ isFirstTime = false, onComplete }: OmniSpecificTourProps) {
  const tourRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTourActive, setIsTourActive] = useState(false);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (tourRef.current) {
      try {
        tourRef.current.destroy?.();
        tourRef.current = null;
      } catch (error) {
        console.warn('Error cleaning up Omni tour:', error);
      }
    }
    
    // Remove any lingering highlights
    document.querySelectorAll('.shepherd-highlight').forEach(el => {
      el.classList.remove('shepherd-highlight');
    });
    
    setIsTourActive(false);
  }, []);

  // Enhanced element finding for Omni-specific elements
  const findNewChatButton = () => {
    const selectors = [
      'button:has(.lucide-plus)',
      'button[aria-label*="new"]',
      'button[aria-label*="chat"]',
      '[data-tour="new-chat"]',
      '.new-chat-button'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  };

  const findProjectsSection = () => {
    const selectors = [
      '[data-tour="projects"]',
      '.projects-section',
      'nav a[href*="projects"]',
      'h2:contains("Projects")',
      '.sidebar a[href*="dashboard"]'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  };

  const findAgentsSection = () => {
    const selectors = [
      '[data-tour="agents"]',
      '.agents-section',
      'nav a[href*="agents"]',
      'h2:contains("Agents")',
      '.sidebar a[href*="agents"]'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  };

  // Start tour function
  const startTour = useCallback(async () => {
    if (isLoading || isTourActive) return;

    setIsLoading(true);
    cleanup(); // Clean up any existing tour

    try {
      // Import Shepherd.js dynamically
      const shepherdModule = await import('shepherd.js');
      const TourConstructor = shepherdModule.Tour || shepherdModule.default?.Tour || shepherdModule.default;

      if (!TourConstructor) {
        throw new Error('Tour constructor not found in shepherd.js module');
      }

      // Create new tour instance
      const tour = new (TourConstructor as any)({
        useModalOverlay: true,
        defaultStepOptions: {
          classes: 'shepherd-theme-arrows',
          scrollTo: true,
          cancelIcon: {
            enabled: true
          }
        }
      });

      // Add tour steps for Omni-specific features
      
      // Step 1: Welcome to Omni
      tour.addStep({
        title: '🎉 Welcome to Omni!',
        text: `
          <p>Welcome to your new AI development workspace! Let's take a quick tour of the key features that will help you build amazing projects.</p>
          <p>This tour will show you:</p>
          <ul class="list-disc ml-6 mt-2">
            <li>How to start new conversations</li>
            <li>Project management features</li>
            <li>Agent collaboration tools</li>
            <li>Advanced development capabilities</li>
          </ul>
        `,
        attachTo: { element: 'body', on: 'center' },
        buttons: [
          {
            text: 'Let\'s Go! 🚀',
            action: tour.next,
            classes: 'shepherd-button-primary'
          }
        ]
      });

      // Step 2: New Chat/Project Creation
      tour.addStep({
        title: '💬 Start New Conversations',
        text: `
          <p>Click here to start a new chat or create a new project. This is your gateway to:</p>
          <ul class="list-disc ml-6 mt-2">
            <li>AI-powered coding assistance</li>
            <li>Project scaffolding</li>
            <li>Interactive development sessions</li>
          </ul>
        `,
        attachTo: { element: findNewChatButton, on: 'bottom' },
        buttons: [
          {
            text: 'Back',
            action: tour.back,
            classes: 'shepherd-button-secondary'
          },
          {
            text: 'Next',
            action: tour.next,
            classes: 'shepherd-button-primary'
          }
        ]
      });

      // Step 3: Projects Overview
      tour.addStep({
        title: '📁 Project Management',
        text: `
          <p>Your projects are organized here. Omni helps you:</p>
          <ul class="list-disc ml-6 mt-2">
            <li>Keep track of all your development work</li>
            <li>Resume conversations where you left off</li>
            <li>Organize by different topics or technologies</li>
            <li>Share projects with team members</li>
          </ul>
        `,
        attachTo: { element: findProjectsSection, on: 'right' },
        buttons: [
          {
            text: 'Back',
            action: tour.back,
            classes: 'shepherd-button-secondary'
          },
          {
            text: 'Next',
            action: tour.next,
            classes: 'shepherd-button-primary'
          }
        ]
      });

      // Step 4: Agents Section
      tour.addStep({
        title: '🤖 AI Agents',
        text: `
          <p>Explore powerful AI agents designed for different development tasks:</p>
          <ul class="list-disc ml-6 mt-2">
            <li>Specialized agents for different programming languages</li>
            <li>Custom agents for your specific workflows</li>
            <li>Collaborative AI that understands your codebase</li>
            <li>Advanced reasoning and problem-solving capabilities</li>
          </ul>
        `,
        attachTo: { element: findAgentsSection, on: 'right' },
        buttons: [
          {
            text: 'Back',
            action: tour.back,
            classes: 'shepherd-button-secondary'
          },
          {
            text: 'Next',
            action: tour.next,
            classes: 'shepherd-button-primary'
          }
        ]
      });

      // Step 5: Advanced Features
      tour.addStep({
        title: '⚡ What Makes Omni Special',
        text: `
          <p>Omni offers advanced features that set it apart:</p>
          <ul class="list-disc ml-6 mt-2">
            <li><strong>Live Sandbox:</strong> Real development environments</li>
            <li><strong>Code Execution:</strong> Run and test code instantly</li>
            <li><strong>File Management:</strong> Full project file access</li>
            <li><strong>Multi-Agent Collaboration:</strong> Different AI specialists working together</li>
            <li><strong>Context Awareness:</strong> AI that remembers your entire project</li>
          </ul>
        `,
        attachTo: { element: 'body', on: 'center' },
        buttons: [
          {
            text: 'Back',
            action: tour.back,
            classes: 'shepherd-button-secondary'
          },
          {
            text: 'Start Building! 🎯',
            action: tour.complete,
            classes: 'shepherd-button-primary'
          }
        ]
      });

      // Tour event handlers
      tour.on('complete', () => {
        cleanup();
        onComplete?.();
      });

      tour.on('cancel', () => {
        cleanup();
      });

      // Store tour reference and start
      tourRef.current = tour;
      setIsTourActive(true);
      tour.start();

    } catch (error) {
      console.error('Failed to start Omni tour:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isTourActive, cleanup, onComplete]);

  // Auto-start tour for first-time users
  useEffect(() => {
    if (isFirstTime && !isTourActive && !isLoading) {
      // Delay to ensure DOM is ready
      const timer = setTimeout(startTour, 1000);
      return () => clearTimeout(timer);
    }
  }, [isFirstTime, isTourActive, isLoading, startTour]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Manual tour trigger button
  return (
    <Button
      onClick={startTour}
      disabled={isLoading || isTourActive}
      variant="outline"
      size="sm"
      className="fixed bottom-4 right-4 z-50 shadow-lg"
    >
      <HelpCircle className="h-4 w-4 mr-2" />
      {isLoading ? 'Loading...' : isTourActive ? 'Tour Active' : 'Take Tour'}
    </Button>
  );
}