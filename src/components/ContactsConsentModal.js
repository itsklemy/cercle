// src/components/ContactsConsentModal.js
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

export default function ContactsConsentModal({ visible, onAccept, onDecline }) {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDecline}
      presentationStyle="overFullScreen"
    >
      <SafeAreaView style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Accès à tes contacts</Text>

          <Text style={styles.text}>
            Pour t’aider à inviter facilement tes proches dans ton cercle,
            l’app a besoin d’accéder à ton carnet d’adresses.
          </Text>

          <Text style={[styles.text, { marginTop: 6 }]}>
            Tu peux continuer à utiliser l’app même si tu refuses,
            mais l’ajout de membres sera moins simple.
          </Text>

          <View style={styles.btnRow}>
            <TouchableOpacity
              onPress={onDecline}
              style={[styles.btn, styles.btnSecondary]}
              activeOpacity={0.9}
            >
              <Text style={styles.btnSecondaryTxt}>Plus tard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onAccept}
              style={[styles.btn, styles.btnPrimary]}
              activeOpacity={0.9}
            >
              <Text style={styles.btnPrimaryTxt}>Autoriser</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',      // 👈 au centre de l'écran (iPhone + iPad)
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,                  // 👈 sur iPad ça reste une jolie carte
    borderRadius: 16,
    padding: 16,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 18,
    marginBottom: 8,
  },
  text: {
    color: colors.subtext,
    fontSize: 14,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  btnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  btnSecondaryTxt: {
    color: colors.text,
    fontWeight: '700',
  },
  btnPrimary: {
    backgroundColor: colors.mint,
  },
  btnPrimaryTxt: {
    color: colors.bg,
    fontWeight: '900',
  },
});
