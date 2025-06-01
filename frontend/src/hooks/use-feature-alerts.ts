import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FeatureAlert {
  id: string;
  title: string;
  description: string;
  content?: React.ReactNode;
  type: 'feature' | 'update' | 'announcement' | 'celebration';
  priority: 'low' | 'medium' | 'high';
  showOnce?: boolean; // Show only once per user
  version?: string; // Track by app version
  targetPath?: string; // Show only on specific routes
  delay?: number; // Delay before showing (ms)
  autoClose?: number; // Auto close after X seconds
  actions?: {
    primary?: {
      label: string;
      action: () => void;
    };
    secondary?: {
      label: string;
      action: () => void;
    };
  };
  metadata?: Record<string, any>;
}

interface FeatureAlertStore {
  alerts: FeatureAlert[];
  currentAlert: FeatureAlert | null;
  isOpen: boolean;
  seenAlerts: Set<string>;
  
  // Core methods
  addAlert: (alert: Omit<FeatureAlert, 'id'>) => string;
  showAlert: (id: string) => void;
  dismissAlert: (id: string) => void;
  closeDialog: () => void;
  
  // Utility methods
  hasUnseenAlerts: () => boolean;
  getAlertsForPath: (path: string) => FeatureAlert[];
  markAsSeen: (id: string) => void;
  clearAllAlerts: () => void;
  
  // Auto-show methods
  checkAndShowAlerts: (currentPath?: string) => void;
}

export const useFeatureAlerts = create<FeatureAlertStore>()(
  persist(
    (set, get) => ({
      alerts: [],
      currentAlert: null,
      isOpen: false,
      seenAlerts: new Set<string>(),
      
      addAlert: (alert) => {
        const id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newAlert: FeatureAlert = {
          ...alert,
          id,
        };
        
        set((state) => ({
          alerts: [...state.alerts, newAlert]
        }));
        
        return id;
      },
      
      showAlert: (id) => {
        const alert = get().alerts.find(a => a.id === id);
        if (!alert) return;
        
        // Check if alert should only show once and has been seen
        if (alert.showOnce && get().seenAlerts.has(id)) {
          return;
        }
        
        const showAlertNow = () => {
          set({ 
            currentAlert: alert,
            isOpen: true 
          });
          
          // Auto close if specified
          if (alert.autoClose) {
            setTimeout(() => {
              get().closeDialog();
            }, alert.autoClose * 1000);
          }
        };
        
        // Apply delay if specified
        if (alert.delay) {
          setTimeout(showAlertNow, alert.delay);
        } else {
          showAlertNow();
        }
      },
      
      dismissAlert: (id) => {
        get().markAsSeen(id);
        const current = get().currentAlert;
        if (current?.id === id) {
          get().closeDialog();
        }
      },
      
      closeDialog: () => {
        const current = get().currentAlert;
        if (current) {
          get().markAsSeen(current.id);
        }
        set({ 
          isOpen: false,
          currentAlert: null 
        });
      },
      
      hasUnseenAlerts: () => {
        const { alerts, seenAlerts } = get();
        return alerts.some(alert => 
          !seenAlerts.has(alert.id) && 
          (!alert.showOnce || !seenAlerts.has(alert.id))
        );
      },
      
      getAlertsForPath: (path) => {
        const { alerts, seenAlerts } = get();
        return alerts
          .filter(alert => {
            // Filter by path if specified
            if (alert.targetPath && !path.includes(alert.targetPath)) {
              return false;
            }
            
            // Filter out seen alerts if they should only show once
            if (alert.showOnce && seenAlerts.has(alert.id)) {
              return false;
            }
            
            return true;
          })
          .sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
          });
      },
      
      markAsSeen: (id) => {
        set((state) => ({
          seenAlerts: new Set([...state.seenAlerts, id])
        }));
      },
      
      clearAllAlerts: () => {
        set({ 
          alerts: [],
          currentAlert: null,
          isOpen: false
        });
      },
      
      checkAndShowAlerts: (currentPath = '') => {
        const alertsForPath = get().getAlertsForPath(currentPath);
        
        if (alertsForPath.length > 0) {
          // Show the highest priority alert
          const alertToShow = alertsForPath[0];
          get().showAlert(alertToShow.id);
        }
      },
    }),
    {
      name: 'feature-alerts-storage',
      partialize: (state) => ({ 
        seenAlerts: Array.from(state.seenAlerts),
        alerts: state.alerts // Persist all alerts
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.seenAlerts = new Set(state.seenAlerts || []);
        }
      }
    }
  )
);

export const FEATURE_ALERTS = {
  CONFIGURABLE_AGENTS: {
    title: "🤖 New: Configurable Agents",
    description: "Create and customize AI agents with your own configurations, prompts, and behaviors.",
    type: 'feature' as const,
    priority: 'high' as const,
    showOnce: true,
    delay: 1000,
    actions: {
      primary: {
        label: "Explore Agents",
        action: () => {
          window.location.href = '/agents';
        }
      },
      secondary: {
        label: "Learn More",
        action: () => {
          window.open('/docs/agents', '_blank');
        }
      }
    }
  },
  
  AGENTS_MARKETPLACE: {
    title: "🏪 Agents Marketplace",
    description: "Discover and install pre-built agents from our community marketplace.",
    type: 'feature' as const,
    priority: 'high' as const,
    showOnce: true,
    delay: 1500,
    targetPath: '/marketplace',
    actions: {
      primary: {
        label: "Browse Marketplace",
        action: () => {
          window.location.href = '/marketplace';
        }
      },
      secondary: {
        label: "Submit Agent",
        action: () => {
          window.location.href = '/marketplace/submit';
        }
      }
    }
  }
} as const;

export const useFeatureAlertHelpers = () => {
  const { addAlert, showAlert, checkAndShowAlerts } = useFeatureAlerts();
  const showConfigurableAgentsAlert = () => {
    const id = addAlert(FEATURE_ALERTS.CONFIGURABLE_AGENTS);
    showAlert(id);
  };
  
  const showAgentsMarketplaceAlert = () => {
    const id = addAlert(FEATURE_ALERTS.AGENTS_MARKETPLACE);
    showAlert(id);
  };
  
  const initializeFeatureAlerts = (currentPath?: string) => {
    const existingAlerts = useFeatureAlerts.getState().alerts;
    if (!existingAlerts.some(a => a.title === FEATURE_ALERTS.CONFIGURABLE_AGENTS.title)) {
      addAlert(FEATURE_ALERTS.CONFIGURABLE_AGENTS);
    }
    if (!existingAlerts.some(a => a.title === FEATURE_ALERTS.AGENTS_MARKETPLACE.title)) {
      addAlert(FEATURE_ALERTS.AGENTS_MARKETPLACE);
    }
    checkAndShowAlerts(currentPath);
  };
  
  return {
    showConfigurableAgentsAlert,
    showAgentsMarketplaceAlert,
    initializeFeatureAlerts,
  };
}; 