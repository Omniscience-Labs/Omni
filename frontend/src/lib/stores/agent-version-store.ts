import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { AgentVersion } from '@/hooks/react-query/agents/utils';

interface VersionState {
  // Current version being viewed/edited
  currentVersion: AgentVersion | null;
  
  // Version being compared to
  compareVersion: AgentVersion | null;
  
  // UI state
  isViewingVersion: boolean;
  isComparingVersions: boolean;
  hasUnsavedChanges: boolean;
  
  // Actions
  setCurrentVersion: (version: AgentVersion | null) => void;
  setCompareVersion: (version: AgentVersion | null) => void;
  setIsViewingVersion: (viewing: boolean) => void;
  setIsComparingVersions: (comparing: boolean) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  
  // Helper actions
  clearVersionState: () => void;
  isViewingOldVersion: (currentVersionId?: string) => boolean;
}

export const useAgentVersionStore = create<VersionState>()(
  devtools(
    (set, get) => ({
      // Initial state
      currentVersion: null,
      compareVersion: null,
      isViewingVersion: false,
      isComparingVersions: false,
      hasUnsavedChanges: false,
      
      // Actions
      setCurrentVersion: (version) => set({ 
        currentVersion: version,
        isViewingVersion: version !== null
      }),
      
      setCompareVersion: (version) => set({ 
        compareVersion: version,
        isComparingVersions: version !== null
      }),
      
      setIsViewingVersion: (viewing) => set({ isViewingVersion: viewing }),
      
      setIsComparingVersions: (comparing) => set({ 
        isComparingVersions: comparing,
        compareVersion: comparing ? get().compareVersion : null
      }),
      
      setHasUnsavedChanges: (hasChanges) => set({ hasUnsavedChanges: hasChanges }),
      
      // Helper actions
      clearVersionState: () => set({
        currentVersion: null,
        compareVersion: null,
        isViewingVersion: false,
        isComparingVersions: false,
        hasUnsavedChanges: false
      }),
      
      isViewingOldVersion: (currentVersionId?: string) => {
        const state = get();
        return state.isViewingVersion && 
               state.currentVersion !== null && 
               state.currentVersion.version_id !== currentVersionId;
      }
    }),
    {
      name: 'agent-version-store'
    }
  )
);

// Selectors for common use cases
export const selectCurrentVersion = (state: VersionState) => state.currentVersion;
export const selectIsViewingOldVersion = (state: VersionState) => state.isViewingVersion && state.currentVersion !== null;
export const selectHasUnsavedChanges = (state: VersionState) => state.hasUnsavedChanges;
export const selectIsComparingVersions = (state: VersionState) => state.isComparingVersions; 