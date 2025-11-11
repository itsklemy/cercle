// src/lib/resetAuthCache.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export async function resetAuthCache() {
  try { await supabase.auth.signOut(); } catch {}
  const keys = await AsyncStorage.getAllKeys();
  const sbKeys = keys.filter(k => k.includes('-auth-token') || k.startsWith('sb-'));
  await AsyncStorage.multiRemove(sbKeys);
}
