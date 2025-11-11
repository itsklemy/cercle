import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export default function ContactsConsentModal({ visible, onAccept, onDecline }) {
  if (!visible) return null;
  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        <Text style={styles.title}>Accès aux contacts</Text>
        <Text style={styles.body}>
          Nous utilisons tes contacts pour inviter des proches. Accepter ?
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity onPress={onDecline} style={[styles.btn, styles.btnDecline]}>
            <Text style={styles.btnTxtDecline}>Refuser</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onAccept} style={[styles.btn, styles.btnAccept]}>
            <Text style={styles.btnTxtAccept}>Accepter</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  modal: { backgroundColor: colors.card, padding: 20, borderRadius: 12, width: '80%' },
  title: { color: colors.text, fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  body: { color: colors.subtext, marginBottom: 20 },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  btn: { padding: 12, borderRadius: 8, flex: 1, marginHorizontal: 5 },
  btnDecline: { backgroundColor: colors.danger },
  btnAccept: { backgroundColor: colors.mint },
  btnTxtDecline: { color: colors.text, textAlign: 'center' },
  btnTxtAccept: { color: colors.bg, textAlign: 'center' },
});