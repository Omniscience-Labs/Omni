export const clearUserLocalStorage = () => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem('suna-preferred-model-v3');
    localStorage.removeItem('customModels');
    
    localStorage.removeItem('agent-selection-storage');
    
    localStorage.removeItem('auth-tracking-storage');
    
    localStorage.removeItem('pendingAgentPrompt');
    localStorage.removeItem('suna_upgrade_dialog_displayed');
    localStorage.removeItem('auth');
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('maintenance-dismissed-')) {
        localStorage.removeItem(key);
      }
    });
    
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('suna-agent-installed-')) {
        localStorage.removeItem(key);
      }
    });
    
    console.log('✅ Local storage cleared on logout');
  } catch (error) {
    console.error('❌ Error clearing local storage:', error);
  }
}; 