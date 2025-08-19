import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

export function createClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    console.error('❌ CRITICAL: Missing Supabase environment variables!', {
      hasUrl: !!url,
      hasKey: !!key
    });
    return null;
  }
  
  try {
    const client = createBrowserClient(url, key);
    // Only log if there's an issue
    if (!client) {
      console.error('❌ createBrowserClient returned null/undefined');
      return null;
    }
    if (!client.auth) {
      console.error('❌ Supabase client missing auth module');
      return null;
    }
    return client;
  } catch (error) {
    console.error('❌ CRITICAL: Error creating Supabase client:', error);
    return null;
  }
}
