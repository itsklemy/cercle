// src/screens/ContactsPicker.js
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as Contacts from 'expo-contacts';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';

export default function ContactsPicker() {
  const route = useRoute();
  const navigation = useNavigation();
  const circleId = route?.params?.circleId;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== Contacts.PermissionStatus.GRANTED) {
        Alert.alert('Contacts', 'Autorise l’accès aux contacts dans les réglages.');
        navigation.goBack();
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        pageSize: 3000,
        sort: 'firstName',
      });
      const rows = (data || [])
        .map(c => ({
          id: c.id,
          name: c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Sans nom',
          phone: (c.phoneNumbers?.[0]?.number || '').replace(/\s+/g, ''),
        }))
        .filter(x => !!x.phone);
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const save = async () => {
    if (!circleId) { Alert.alert('Cercle', 'Aucun cercle.'); return; }
    const picks = items.filter(i => selected.has(i.id));
    if (picks.length === 0) { Alert.alert('Contacts', 'Sélectionne au moins un contact.'); return; }

    // ⚠️ Exemple : on appelle une RPC (à implémenter) qui :
    // - mappe phone -> user_id si déjà inscrit
    // - sinon crée une "invitation" et un user placeholder
    // - insère dans circle_members (circle_id, user_id)
    try {
      const payload = picks.map(p => ({ name: p.name, phone: p.phone }));
      const { error } = await supabase.rpc('add_contacts_to_circle', { circle_id_input: circleId, contacts_input: payload });
      if (error) throw error;
      Alert.alert('Contacts', 'Membres ajoutés (ou invités).');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Contacts', e.message || 'Ajout impossible.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
          <Text style={{ color: colors.subtext, marginTop: 8 }}>Chargement…</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(it) => it.id}
            renderItem={({ item }) => {
              const isSel = selected.has(item.id);
              return (
                <TouchableOpacity
                  onPress={() => toggle(item.id)}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.08)',
                    marginBottom: 8,
                    backgroundColor: isSel ? 'rgba(29,255,194,0.12)' : 'transparent',
                  }}
                >
                  <Text style={{ color: colors.text, fontWeight: '800' }}>{item.name}</Text>
                  <Text style={{ color: colors.subtext, marginTop: 2 }}>{item.phone}</Text>
                </TouchableOpacity>
              );
            }}
          />
          <TouchableOpacity
            onPress={save}
            style={{ backgroundColor: colors.mint, paddingVertical: 12, borderRadius: 12, marginTop: 8 }}
          >
            <Text style={{ color: colors.bg, textAlign: 'center', fontWeight: '900' }}>Ajouter au cercle</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
