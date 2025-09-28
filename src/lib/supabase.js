import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
const { SUPABASE_URL, SUPABASE_ANON_KEY } = (Constants?.expoConfig?.extra || {});

export function hasSupabaseConfig(){
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY && !String(SUPABASE_URL).includes('YOUR_PROJECT'));
}

export const supabase = hasSupabaseConfig()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
