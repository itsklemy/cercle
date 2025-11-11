// src/screens/DiagnosticsScreen.js
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';
import { Log } from '../lib/remoteLogger';

export default function DiagnosticsScreen() {
  const [out, setOut] = React.useState([]);

  const line = (k, v) => setOut(o => [...o, `${k}: ${v}`]);

  const run = async () => {
    setOut([]);
    line('SUPABASE_URL', SUPABASE_URL);
    line('ANON_KEY_len', (SUPABASE_ANON_KEY||'').length);

    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: SUPABASE_ANON_KEY }
      });
      line('/auth/v1/health', `${r.status} ${r.headers.get('content-type')}`);
    } catch (e) {
      line('/auth/v1/health', `ERR ${String(e)}`);
    }

    const { data: s } = await supabase.auth.getSession();
    line('session', s?.session ? 'yes' : 'no');

    try {
      const { data, error } = await supabase
        .from('calls')
        .select('id,circle_id,message,created_at')
        .limit(3);
      line('calls', error ? `ERR ${error.code||''} ${error.message}` : `${(data||[]).length} items`);
      if (error) Log.error('diag', 'calls-select', { code: error.code, message: error.message });
    } catch (e) {
      line('calls', `EXC ${String(e)}`);
    }
  };

  return (
    <View style={{ flex:1, padding:16 }}>
      <TouchableOpacity onPress={run} style={{ backgroundColor:'#1DFFC2', padding:12, borderRadius:12 }}>
        <Text style={{ color:'#0E0F12', fontWeight:'900', textAlign:'center' }}>Lancer les tests</Text>
      </TouchableOpacity>
      <ScrollView style={{ marginTop:12 }}>
        {out.map((t,i)=><Text key={i} style={{ color:'#ECECEC', marginBottom:6 }}>{t}</Text>)}
      </ScrollView>
    </View>
  );
}
