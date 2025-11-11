// src/lib/supabase.js
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

// Lis d'abord les variables d'env (si tu build avec EAS), sinon retombe sur app.config.js -> extra
const extras = Constants.expoConfig?.extra ?? Constants.manifest?.extra ?? {};

const URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  extras.EXPO_PUBLIC_SUPABASE_URL;

const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  extras.EXPO_PUBLIC_SUPABASE_ANON_KEY;

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
