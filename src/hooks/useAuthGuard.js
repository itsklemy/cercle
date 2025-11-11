// src/hooks/useAuthGuard.js
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Retourne true quand l’état d’auth est connu (session chargée).
 * Optionnel : si requireSession=true, on invoke onUnauthenticated() quand il n’y a pas de session.
 */
export function useAuthGuard({ requireSession = false, onUnauthenticated } = {}) {
  const [ready, setReady] = useState(false);

  const handleSession = useCallback(
    (session) => {
      setReady(true);
      if (requireSession && !session) {
        try { onUnauthenticated?.(); } catch {}
      }
    },
    [requireSession, onUnauthenticated]
  );

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      handleSession(data?.session || null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session || null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [handleSession]);

  return ready;
}
