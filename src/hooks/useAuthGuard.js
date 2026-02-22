// hooks/useAuthGuard.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';

export function useAuthGuard() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        const user = data?.user;
        if (!user) {
          Alert.alert('Auth', 'Connecte-toi d’abord.');
          // éventuellement, navigation vers login ici
        }
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  return ready;
}
