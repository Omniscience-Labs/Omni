"use server";

async function installOmniForNewUser(userId: string) {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    const adminApiKey = process.env.OMNI_ADMIN_API_KEY;
    
    if (!adminApiKey) {
      console.error('OMNI_ADMIN_API_KEY not configured - cannot install Omni agent');
      return false;
    }
    
    const url = `${backendUrl}/admin/omni-agents/install-user/${userId}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Api-Key': adminApiKey,
      },
    });
    
    if (response.ok) {
      await response.json().catch(() => ({}));
      return true;
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error('Failed to install Omni agent:', {
        status: response.status,
        statusText: response.statusText,
        errorData
      });
      return false;
    }
  } catch (error) {
    console.error('Exception installing Omni agent:', error);
    return false;
  }
}

export async function checkAndInstallOmniAgent(userId: string, userCreatedAt: string) {
  const userCreatedDate = new Date(userCreatedAt);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  if (userCreatedDate > oneHourAgo) {
    const installKey = `omni-install-attempted-${userId}`;
    const hasAttempted = typeof window !== 'undefined' && localStorage.getItem(installKey);
    
    if (hasAttempted) {
      return;
    }
    
    const success = await installOmniForNewUser(userId);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(installKey, Date.now().toString());
    }
    
    return success;
  } else {
    // Not recent enough; skip installation silently
  }
  
  return false;
} 
