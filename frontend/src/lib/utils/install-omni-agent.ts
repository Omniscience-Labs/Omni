"use server";

async function installOmniForNewUser(userId: string) {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    const adminApiKey = process.env.OMNI_ADMIN_API_KEY;
    
    console.log('🔧 Installation config:', { 
      backendUrl, 
      hasApiKey: !!adminApiKey,
      apiKeyLength: adminApiKey?.length || 0 
    });
    
    if (!adminApiKey) {
      console.error('❌ OMNI_ADMIN_API_KEY not configured - cannot install Omni agent');
      return false;
    }
    
    const url = `${backendUrl}/admin/omni-agents/install-user/${userId}`;
    console.log('📡 Making API call to:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Api-Key': adminApiKey,
      },
    });

    console.log('📨 API Response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Success! Agent installed:', result);
      return true;
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Failed to install Omni agent:', {
        status: response.status,
        statusText: response.statusText,
        errorData
      });
      return false;
    }
  } catch (error) {
    console.error('💥 Exception installing Omni agent:', error);
    return false;
  }
}

export async function checkAndInstallOmniAgent(userId: string, userCreatedAt: string) {
  console.log('🔍 checkAndInstallOmniAgent called', { userId, userCreatedAt });
  
  const userCreatedDate = new Date(userCreatedAt);
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  
  console.log('📅 Time check:', { 
    userCreatedDate: userCreatedDate.toISOString(), 
    tenMinutesAgo: tenMinutesAgo.toISOString(),
    isRecent: userCreatedDate > tenMinutesAgo 
  });
  
  if (userCreatedDate > tenMinutesAgo) {
    const installKey = `omni-install-attempted-${userId}`;
    const hasAttempted = typeof window !== 'undefined' && localStorage.getItem(installKey);
    
    console.log('🔑 Install check:', { installKey, hasAttempted });
    
    if (hasAttempted) {
      console.log('⏭️ Already attempted installation, skipping');
      return;
    }
    
    console.log('🚀 Attempting to install Omni agent...');
    const success = await installOmniForNewUser(userId);
    
    console.log('✅ Installation result:', success);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(installKey, Date.now().toString());
    }
    
    return success;
  } else {
    console.log('⏰ User not recent enough, skipping installation');
  }
  
  return false;
} 
