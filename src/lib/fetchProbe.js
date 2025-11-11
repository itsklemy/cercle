// src/lib/fetchProbe.js
import { Log } from './remoteLogger';

const originalFetch = global.fetch;
global.fetch = async (url, options = {}) => {
  const started = Date.now();
  try {
    const res = await originalFetch(url, options);
    const ct = res.headers?.get?.('content-type') || '';
    const ok = res.ok;
    const status = res.status;
    const ms = Date.now() - started;

    // Log minimal
    if (!ok || !ct.includes('application/json')) {
      Log.warn('fetch', 'response', { url, status, ct, ms });
    }
    return res;
  } catch (e) {
    const ms = Date.now() - started;
    Log.error('fetch', 'network-fail', { url, ms, error: String(e) });
    throw e;
  }
};
