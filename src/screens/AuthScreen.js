// src/screens/AuthScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { colors } from '../theme/colors';
import { supabase, hasSupabaseConfig, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';
import { useResponsive } from '../hooks/useResponsive';
import { resetAuthCache, diagnoseAuthStorage } from '../lib/resetAuthCache';

export default function AuthScreen({ navigation }) {
  useResponsive(); // ok si utile plus tard

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasConfig, setHasConfig] = useState(true);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  useEffect(() => {
    const ok = hasSupabaseConfig();
    setHasConfig(ok);
    if (!ok) {
      Alert.alert('Configuration requise', 'Renseigne SUPABASE_URL et SUPABASE_ANON_KEY dans app.config.js');
    }
  }, []);

  const validEmail = (s = '') => /\S+@\S+\.\S+/.test(s);
  const normalizeEmail = (s) => s.trim().toLowerCase();

  const goToApp = () => {
    navigation.reset({ index: 0, routes: [{ name: 'AppTabs' }] });
  };

  const humanizeError = (err) => {
    const msg = String(err?.message || '').toLowerCase();
    const code = String(err?.error_code || err?.code || '').toLowerCase();

    if (code === 'invalid_credentials' || msg.includes('invalid login')) {
      return 'Identifiants incorrects. Vérifie ton email et ton mot de passe.';
    }
    if (msg.includes('email not confirmed')) {
      setNeedsConfirm(true);
      return 'Ton email n’est pas encore confirmé. Consulte ta boîte mail ou renvoie la confirmation.';
    }
    if (err?.status === 429) {
      return 'Trop de tentatives : réessaie dans quelques minutes.';
    }
    if (msg.includes('network request failed') || msg.includes('failed to fetch')) {
      return 'Problème de connexion. Vérifie internet et réessaie.';
    }
    return err?.message || 'Une erreur est survenue.';
  };

  const signUp = async () => {
    const e = normalizeEmail(email);
    if (!validEmail(e)) return Alert.alert('Email invalide', 'Entre une adresse valide.');
    if ((password || '').length < 6) return Alert.alert('Mot de passe trop court', '6 caractères minimum.');

    setBusy(true);
    setNeedsConfirm(false);
    try {
      const { data, error } = await supabase.auth.signUp({ email: e, password });
      if (error) throw error;
      if (data.session) {
        goToApp();
      } else {
        Alert.alert('Vérifie tes emails', "Un email de confirmation t'a été envoyé.");
        setNeedsConfirm(true);
      }
    } catch (err) {
      Alert.alert('Inscription', humanizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    const e = normalizeEmail(email);
    if (!validEmail(e)) return Alert.alert('Email invalide', 'Entre une adresse valide.');
    if ((password || '').length < 6) return Alert.alert('Mot de passe trop court', '6 caractères minimum.');

    setBusy(true);
    setNeedsConfirm(false);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: e, password });
      if (error) throw error;
      if (data?.user?.email_confirmed_at || data?.session) {
        goToApp();
      } else {
        setNeedsConfirm(true);
        Alert.alert('Compte non confirmé', 'Confirme ton email pour te connecter.');
      }
    } catch (err) {
      Alert.alert('Connexion', humanizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const resendConfirmation = async () => {
    const e = normalizeEmail(email);
    if (!validEmail(e)) return Alert.alert('Email invalide', 'Renseigne ton email pour renvoyer la confirmation.');
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: e,
        options: { emailRedirectTo: 'cercle://auth/callback' },
      });
      if (error) throw error;
      Alert.alert('Email envoyé', 'Vérifie ta boîte mail (et spam).');
    } catch (err) {
      Alert.alert('Renvoi impossible', humanizeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Connexion</Text>

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        placeholder="toi@mail.com"
        placeholderTextColor={colors.subtext}
        autoCapitalize="none"
        textContentType="emailAddress"
        autoComplete="email"
        autoCorrect={false}
        accessible
        accessibilityLabel="Champ email"
      />

      <Text style={styles.label}>Mot de passe</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor={colors.subtext}
        textContentType="password"
        autoComplete="password"
        accessible
        accessibilityLabel="Champ mot de passe"
      />

      <TouchableOpacity
        onPress={signIn}
        style={[styles.cta, (busy || !hasConfig) && { opacity: 0.6 }]}
        activeOpacity={0.9}
        disabled={busy || !hasConfig}
        accessible
        accessibilityLabel="Bouton se connecter"
      >
        {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.ctaTxt}>Se connecter</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={signUp}
        style={[styles.ghost, (busy || !hasConfig) && { opacity: 0.6 }]}
        activeOpacity={0.9}
        disabled={busy || !hasConfig}
        accessible
        accessibilityLabel="Bouton créer un compte"
      >
        <Text style={styles.ghostTxt}>{busy ? 'Création…' : 'Créer un compte'}</Text>
      </TouchableOpacity>

      {needsConfirm && (
        <TouchableOpacity
          onPress={resendConfirmation}
          style={[styles.linkBtn, busy && { opacity: 0.6 }]}
          disabled={busy}
        >
          <Text style={styles.linkTxt}>Renvoyer l’email de confirmation</Text>
        </TouchableOpacity>
      )}

      {__DEV__ && (
        <>
          <TouchableOpacity
            onPress={async () => {
              try {
                const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_ANON_KEY } });
                Alert.alert('Auth health', `${r.status} ${r.headers.get('content-type')}`);
              } catch (e) {
                Alert.alert('Auth health', String(e));
              }
            }}
            style={styles.debugBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.debugTxt}>Tester /auth/v1/health</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={async () => {
              try {
                await resetAuthCache();
                Alert.alert('Connexion', 'Cache Supabase réinitialisé. Redémarre l’app puis reconnecte-toi.');
              } catch (e) {
                Alert.alert('Erreur', String(e?.message || e));
              }
            }}
            style={styles.debugBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.debugTxt}>Réinitialiser le cache d’auth</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={async () => {
              const dump = await diagnoseAuthStorage();
              Alert.alert('Dump AsyncStorage', 'Regarde la console Metro pour les détails.');
            }}
            style={styles.debugBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.debugTxt}>Diagnostiquer le stockage auth</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16, justifyContent: 'center' },
  h1: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  label: { color: colors.subtext, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#151826',
    borderColor: colors.stroke,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
  },
  cta: {
    marginTop: 20,
    backgroundColor: colors.mint,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  ctaTxt: { color: colors.bg, fontWeight: '800', fontSize: 17 },
  ghost: { marginTop: 12, padding: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  ghostTxt: { color: colors.subtext, fontWeight: '700' },
  linkBtn: { marginTop: 12, alignItems: 'center' },
  linkTxt: { color: colors.mint, fontWeight: '700' },
  debugBtn: { marginTop: 16, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.stroke, borderRadius: 12 },
  debugTxt: { color: colors.subtext, fontSize: 12 },
});
