import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';

// 👉 Mets ICI tes valeurs (les mêmes que dans supabase.js)
const URL = 'https://omfvrlcelpxoguonqzbb.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tZnZybGNlbHB4b2d1b25xemJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NzQzODgsImV4cCI6MjA3NDQ1MDM4OH0.h4-qoyRPuzu7h7XOnNasVheW970gMl73LQxFbmxlTYoN';

async function getText(res) {
  try { return await res.text(); } catch { return ''; }
}

export default function SupabaseDoctorScreen() {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);

  const log = (l) => setLogs(prev => [`${new Date().toISOString()}  ${l}`, ...prev].slice(0,200));

  const run = async () => {
    setRunning(true);
    setLogs([]);
    log(`Start diagnostics — URL=${URL} keyLen=${ANON.length}`);

    // 0) Decode JWT ref
    try {
      const b64 = ANON.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      log(`JWT payload: ref=${payload?.ref} role=${payload?.role} iat=${payload?.iat} exp=${payload?.exp}`);
    } catch { log('JWT decode failed (non-bloquant)'); }

    // 1) /auth/v1/settings
    try {
      const r = await fetch(`${URL}/auth/v1/settings`, {
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
      });
      const t = await getText(r);
      log(`/auth/v1/settings → ${r.status} ${r.ok ? 'OK' : 'FAIL'}  body: ${t.slice(0,180)}`);
      if (r.status === 401) {
        log('⛔️ API KEY INVALID côté serveur (clé rotatée / mauvais projet). Va dans Supabase > Settings > API et remplace la Public ANON key.');
        setRunning(false); return;
      }
    } catch (e) {
      log(`/auth/v1/settings error: ${e?.message}`);
      setRunning(false); return;
    }

    // 2) REST “ping”
    try {
      const r = await fetch(`${URL}/rest/v1`, { method: 'OPTIONS' });
      log(`/rest/v1 (OPTIONS) → ${r.status}`);
    } catch (e) {
      log(`/rest/v1 error: ${e?.message}`);
    }

    // 3) INSERT test dans public.client_logs (ta policy autorise insert all)
    try {
      const r = await fetch(`${URL}/rest/v1/client_logs`, {
        method: 'POST',
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${ANON}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify([{ level: 'info', scope: 'doctor', message: 'mobile insert ok', details: { ts: Date.now() } }]),
      });
      const t = await getText(r);
      log(`POST /rest/v1/client_logs → ${r.status} ${r.ok ? 'CREATED' : 'FAIL'}  body: ${t.slice(0,180)}`);
      if (r.status === 201) {
        log('✅ Clé OK + REST OK + RLS OK (au moins sur client_logs). Le problème des annonces vient du payload (colonnes).');
      } else if (r.status === 401) {
        log('⛔️ 401 sur REST : encore un souci d’API key (ou un autre client utilise une mauvaise clé).');
      } else if (r.status === 403) {
        log('⛔️ 403 sur REST : RLS / policy / rôle pas autorisé (vérifie les policies).');
      }
    } catch (e) {
      log(`POST client_logs error: ${e?.message}`);
    }

    setRunning(false);
  };

  useEffect(() => { run(); }, []);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Supabase Doctor</Text>
        <TouchableOpacity onPress={run} style={s.btn} disabled={running}>
          {running ? <ActivityIndicator /> : <Text style={s.btnTxt}>Re-tester</Text>}
        </TouchableOpacity>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 24 }}>
        {logs.map((l, i) => <Text key={i} style={s.line}>{l}</Text>)}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220' },
  header: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontWeight: '900', fontSize: 18 },
  btn: { backgroundColor: '#57ffca', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  btnTxt: { color: '#0b1220', fontWeight: '900' },
  scroll: { flex: 1, paddingHorizontal: 16 },
  line: { color: '#c8d3f5', fontSize: 12, marginBottom: 8 },
});
