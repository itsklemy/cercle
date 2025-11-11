// src/lib/remoteLogger.js
import { supabase } from './supabase';

export async function logRemote(level, scope, message, details = {}) {
  try {
    await supabase.from('client_logs').insert({
      level, scope, message, details
    });
  } catch {}
}

export const Log = {
  info: (s, m, d) => logRemote('info', s, m, d),
  warn: (s, m, d) => logRemote('warn', s, m, d),
  error: (s, m, d) => logRemote('error', s, m, d),
};
