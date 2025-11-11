// src/screens/SplashScreen.js
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Linking,
  ActivityIndicator, InteractionManager, SafeAreaView, ScrollView, Alert,
} from 'react-native';
import { colors } from '../theme/colors';
import { supabase, hasSupabaseConfig, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';
import { CommonActions } from '@react-navigation/native';
import { useResponsive } from '../hooks/useResponsive';

function getRootNav(navigation) {
  let nav = navigation;
  let parent = nav?.getParent?.();
  while (parent) { nav = parent; parent = nav.getParent?.(); }
  return nav || navigation;
}

export default function SplashScreen({ navigation }) {
  const navigatingRef = useRef(false);
  const [msg, setMsg] = useState('Initialisation…');

  useResponsive();

  const resetToAuth = () => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    const root = getRootNav(navigation);
    InteractionManager.runAfterInteractions(() => {
      root.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Auth' }] }));
    });
  };

  const resetToAppTabs = (initialTab = 'Dashboard') => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    const root = getRootNav(navigation);
    InteractionManager.runAfterInteractions(() => {
      root.dispatch(CommonActions.reset({
        index: 0,
        routes: [{ name: 'AppTabs', state: { index: 0, routes: [{ name: initialTab }] } }],
      }));
    });
  };

  // ➕ Bouton "Commencer"
  const onStart = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session) resetToAppTabs('Dashboard');
      else resetToAuth();
    } catch {
      resetToAuth();
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      await new Promise((r) => setTimeout(r, 400));

      if (!hasSupabaseConfig()) {
        setMsg('Config requise…');
        return;
      }

      try {
        setMsg('Connexion au service…');
        const health = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
          headers: { apikey: SUPABASE_ANON_KEY },
        });
        const ct = health.headers.get('content-type') || '';
        if (!(health.status === 200 && ct.includes('application/json'))) {
          if (!mounted) return;
          Alert.alert('Connexion au service', `Réponse inattendue: ${health.status} ${ct}`);
          setMsg('Service indisponible');
          return;
        }

        setMsg('Chargement de la session…');
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        if (data?.session) {
          resetToAppTabs('Circle'); // auto-route si déjà connecté
        } else {
          // On reste sur Splash ; l’utilisateur peut appuyer sur "Commencer" / "Se connecter"
          setMsg('Prêt');
        }
      } catch (e) {
        if (!mounted) return;
        setMsg('Erreur de démarrage');
      }
    })();

    return () => { mounted = false; };
  }, [navigation]);

  return (
    <SafeAreaView style={styles.safe}>
      <Image
        source={{ uri: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1200&q=80' }}
        style={styles.hero}
        resizeMode="cover"
        accessible
        accessibilityLabel="Image d’illustration Cercle"
      />

      <ScrollView contentContainerStyle={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text style={styles.logo}>Cercle</Text>
          <Text style={styles.subtitle}>Plateforme de ressources partagées.</Text>
          <View style={{ height: 12 }} />
          <Text style={styles.slogan}>« Prête, emprunte, partage. »</Text>
          <View style={{ height: 24 }} />

          {/* ➕ Commencer */}
          <TouchableOpacity
            onPress={onStart}
            style={[styles.cta, { backgroundColor: colors.mint }]}
            activeOpacity={0.9}
            accessible
            accessibilityLabel="Commencer"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.ctaTxt}>Commencer</Text>
          </TouchableOpacity>

          {/* Connexion / Création compte */}
          <TouchableOpacity
            onPress={resetToAuth}
            style={[styles.ghost, { marginTop: 6 }]}
            activeOpacity={0.9}
            accessible
            accessibilityLabel="Se connecter"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.ghostTxt}>Se connecter</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={resetToAuth}
            style={styles.ghost}
            activeOpacity={0.9}
            accessible
            accessibilityLabel="Créer un compte"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.ghostTxt}>Créer un compte</Text>
          </TouchableOpacity>

          {/* Loader + message */}
          <View style={{ marginTop: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.mint} />
            <Text style={{ color: colors.subtext, marginTop: 8 }}>{msg}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={async () => {
              const url = 'https://stunning-pothos-07a3d3.netlify.app';
              try { if (await Linking.canOpenURL(url)) await Linking.openURL(url); } catch {}
            }}
            activeOpacity={0.8}
            accessible
            accessibilityLabel="Confidentialité, CGU et mentions légales"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.legal}>Confidentialité · CGU · Mentions légales</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  hero: { position: 'absolute', opacity: 0.12, top: 0, left: 0, right: 0, bottom: 0 },

  container: { flexGrow: 1, padding: 24, paddingBottom: 32, justifyContent: 'space-between' },
  content: { alignItems: 'center' },
  footer: { alignItems: 'center', paddingTop: 16 },

  logo: { color: colors.text, fontSize: 40, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  subtitle: { color: colors.subtext, textAlign: 'center', marginBottom: 8 },
  slogan: { color: colors.text, fontWeight: '700', textAlign: 'center' },

  cta: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  ctaTxt: { color: colors.bg, fontWeight: '900' },
  ghost: { padding: 12, width: '100%', alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  ghostTxt: { color: colors.subtext, fontWeight: '700' },

  legal: { color: colors.text, opacity: 0.8, textDecorationLine: 'underline' },
});
