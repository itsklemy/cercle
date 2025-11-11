// src/screens/CallDetailScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';

export default function CallDetailScreen({ route, navigation }) {
  const { callId, call: callFromList } = route.params || {};
  const [call, setCall] = useState(callFromList || null);
  const [loading, setLoading] = useState(!callFromList);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!callId || callFromList) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('calls')
      .select('id,circle_id,author_id,title,category,message,needed_at,status,photo,created_at')
      .eq('id', callId)
      .single();
    if (error) {
      Alert.alert('Onde', 'Impossible de charger cette onde.');
    } else {
      setCall(data);
    }
    setLoading(false);
  }, [callId, callFromList]);

  useEffect(() => { load(); }, [load]);

  const fmt = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return '—'; } };

  const onHelp = async () => {
    if (!call) return;
    setSending(true);
    try {
      const { error } = await supabase.from('call_responses').insert({
        call_id: call.id,
        status: 'offer',
      });
      if (error) throw error;

      // notification légère (sans casser si table absente)
      try {
        await supabase.from('notifications').insert({
          circle_id: call.circle_id,
          type: 'call_offer',
          payload: { call_id: call.id },
          created_at: new Date().toISOString(),
        });
      } catch {}

      Alert.alert('Merci ✨', 'Ta proposition a été envoyée.');
    } catch {
      Alert.alert('Erreur', 'Impossible d’envoyer ta proposition.');
    } finally {
      setSending(false);
    }
  };

  const shareInAnotherCircle = () => {
    Alert.alert(
      'Partager',
      'Depuis la page du cercle, tu peux republier cette onde dans d’autres cercles (multi-cercle).'
    );
  };

  if (loading || !call) {
    return (
      <View style={[s.wrap, { alignItems:'center', justifyContent:'center' }]}>
        {loading ? <ActivityIndicator /> : <Text style={{ color: colors.subtext }}>Aucune donnée</Text>}
      </View>
    );
  }

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ paddingBottom: 24 }}>
      {/* Header local */}
      <View style={s.headerRow}>
        <MaterialCommunityIcons name="bullhorn" size={20} color={colors.mint} />
        <Text style={s.title} numberOfLines={2}>{call.title || 'Onde'}</Text>
      </View>

      {/* Média */}
      {call.photo ? (
        <Image source={{ uri: call.photo }} style={s.media} resizeMode="cover" />
      ) : (
        <View style={[s.media, s.mediaPh]}>
          <MaterialCommunityIcons name="image-off-outline" size={28} color={colors.subtext} />
        </View>
      )}

      {/* Corps */}
      <Text style={s.message}>{call.message}</Text>
      <View style={s.metaRow}>
        <Text style={s.meta}>
          Publié le {fmt(call.created_at)}
          {call.needed_at ? ` • pour ${fmt(call.needed_at)}` : ''}
        </Text>
        {call.category ? (
          <View style={s.catPill}>
            <Text style={s.catTxt}>{call.category}</Text>
          </View>
        ) : null}
      </View>

      {/* Actions */}
      <View style={s.actions}>
        <TouchableOpacity onPress={onHelp} disabled={sending} style={[s.primary, sending && { opacity: 0.7 }]} activeOpacity={0.9}>
          <Text style={s.primaryTxt}>{sending ? 'Envoi…' : 'Je peux aider'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={shareInAnotherCircle} style={s.secondary} activeOpacity={0.9}>
          <Text style={s.secondaryTxt}>Partager</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  title: { color: colors.text, fontWeight: '900', fontSize: 18, flex: 1 },
  media: { width: '100%', height: 220, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.04)' },
  mediaPh: { alignItems: 'center', justifyContent: 'center' },
  message: { color: colors.text, marginTop: 12, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  meta: { color: colors.subtext },
  catPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  catTxt: { color: colors.text, fontWeight: '700' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primary: { backgroundColor: colors.mint, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, flex: 1 },
  primaryTxt: { color: colors.bg, textAlign: 'center', fontWeight: '900' },
  secondary: { borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, flex: 1 },
  secondaryTxt: { color: colors.text, textAlign: 'center', fontWeight: '800' },
});
