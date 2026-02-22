// src/ads/InterstitialVideoModal.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { colors } from '../theme/colors';

export default function InterstitialVideoModal({ visible, ad, onClose }) {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [secLeft, setSecLeft] = useState(0);

  const skipAfter = useMemo(() => Math.max(0, ad?.skipAfterSec ?? 5), [ad]);
  const canSkip = secLeft <= 0;

  useEffect(() => {
    if (!visible || !ad) return;
    setReady(false);
    setSecLeft(skipAfter);

    const t = setInterval(() => {
      setSecLeft(s => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => clearInterval(t);
  }, [visible, ad, skipAfter]);

  const openClick = async () => {
    const url = ad?.clickUrl;
    if (!url) return;
    try { await Linking.openURL(url); } catch {}
  };

  return (
    <Modal visible={!!visible} animationType="fade" transparent statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.topRow}>
            <Text style={styles.badge}>{ad?.title || 'Sponsorisé'}</Text>

            <TouchableOpacity
              onPress={onClose}
              disabled={!canSkip}
              style={[styles.skipBtn, !canSkip && { opacity: 0.5 }]}
            >
              <Text style={styles.skipTxt}>
                {canSkip ? 'Passer' : `Passer dans ${secLeft}s`}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity activeOpacity={0.9} onPress={openClick} style={styles.videoWrap}>
            {!ready && (
              <View style={styles.loading}>
                <ActivityIndicator />
                <Text style={styles.loadingTxt}>Chargement…</Text>
              </View>
            )}

            {!!ad?.videoUrl && (
              <Video
                ref={videoRef}
                source={{ uri: ad.videoUrl }}
                style={styles.video}
                resizeMode={ResizeMode.COVER}
                shouldPlay
                isLooping={false}
                onReadyForDisplay={() => setReady(true)}
                onPlaybackStatusUpdate={(s) => {
                  if (s?.didJustFinish) onClose?.();
                }}
              />
            )}
          </TouchableOpacity>

          <Text style={styles.hint}>
            Appuie sur la vidéo pour ouvrir l’offre.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  topRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: { color: colors.subtext, fontWeight: '800' },
  skipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  skipTxt: { color: colors.text, fontWeight: '800' },
  videoWrap: { width: '100%', aspectRatio: 9 / 16, backgroundColor: '#000' },
  video: { width: '100%', height: '100%' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingTxt: { color: colors.subtext },
  hint: { color: colors.subtext, padding: 10, textAlign: 'center' },
});
