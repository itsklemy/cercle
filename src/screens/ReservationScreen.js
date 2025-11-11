
// src/screens/ReservationScreen.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker'; // expo install @react-native-community/datetimepicker
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';

export default function ReservationScreen({ route, navigation }) {
  const { itemId } = route.params || {};
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date(Date.now() + 24*3600*1000));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non connecté');

      // Conflit côté SQL recommandé ; ici simple insert :
      const { error } = await supabase.from('bookings').insert({
        item_id: itemId,
        renter_id: user.id,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        status: 'pending'
      });
      if (error) throw error;

      Alert.alert('Réservation', 'Demande envoyée.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Réservation', e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex:1, backgroundColor: colors.bg, padding: 16, gap: 16 }}>
      <Text style={{ color: colors.text, fontWeight: '900' }}>Dates</Text>
      <DateTimePicker value={start} onChange={(_, d)=> d && setStart(d)} mode="datetime" />
      <DateTimePicker value={end} onChange={(_, d)=> d && setEnd(d)} mode="datetime" />
      <TouchableOpacity
        disabled={saving}
        onPress={save}
        style={{ backgroundColor: colors.mint, paddingVertical: 12, borderRadius: 12 }}
      >
        <Text style={{ color: colors.bg, textAlign:'center', fontWeight:'900' }}>
          {saving ? 'Envoi…' : 'Confirmer la demande'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
