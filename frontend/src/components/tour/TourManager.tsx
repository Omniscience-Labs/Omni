'use client';

import { useTour } from './TourContext';
import { OperatorTour } from './OperatorTour';
import { AgentsPageTour } from './AgentsPageTour';
import { OmniSpecificTour } from './OmniSpecificTour';

export function TourManager() {
  const { 
    currentTour, 
    isFirstTimeUser, 
    hasCompletedDashboardTour, 
    setHasCompletedDashboardTour 
  } = useTour();

  // Determine if we should show the tour for the current page
  const shouldShowDashboardTour = currentTour === 'dashboard' && isFirstTimeUser && !hasCompletedDashboardTour;

  // Show the dashboard tour on the dashboard page
  if (currentTour === 'dashboard') {
    return (
      <>
        <OperatorTour 
          isFirstTime={shouldShowDashboardTour}
          onComplete={() => {
            setHasCompletedDashboardTour(true);
          }}
        />
        {/* Show Omni-specific tour button */}
        <OmniSpecificTour
          isFirstTime={false}
          onComplete={() => {
            console.log('Omni tour completed!');
          }}
        />
      </>
    );
  }

  // For other pages, show the Omni-specific tour button
  return <OmniSpecificTour isFirstTime={false} />;
} 