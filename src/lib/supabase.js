// src/lib/supabase.js
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Lis d'abord les variables d'env (si tu build avec EAS), sinon fallback (Expo Go)
const URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  'https://omfvrlcelpxoguonqzbb.supabase.co';

const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'sb_publishable_1ok4DF0c3OJ2yIozh8xvrw_6ny7xPwn';

if (!URL || !ANON) {
  console.warn('[Supabase] URL ou ANON key manquante. Vérifie app.config.js / eas.json.');
}

export const supabase = createClient(URL, ANON, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const hasSupabaseConfig = () => Boolean(URL && ANON);