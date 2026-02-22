// ...existing code...
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { supabase, hasSupabaseConfig } from '../lib/supabase';
import { CommonActions } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';

export default function ProfileScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState(null);
  const [pseudo, setPseudo] = useState('');

  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifToggling, setNotifToggling] = useState(false);

  const goToAuth = useCallback(() => {
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Auth' }] }));
  }, [navigation]);
  
  const load = useCallback(async () => {
    if (!hasSupabaseConfig()) {
      setMe(null);
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!user) { goToAuth(); return; }
      setMe(user);

      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('public_name, notifications_enabled, push_token')
        .eq('id', user.id)
        .single();

      if (profErr && String(profErr.code) !== 'PGRST116') throw profErr;

      const safe = prof || { public_name: null };
      setProfile(safe);
      setPseudo((safe.public_name || '').toString());

      if (typeof safe.notifications_enabled === 'boolean') {
        setNotifEnabled(safe.notifications_enabled);
      } else {
        setNotifEnabled(false);
      }
    } catch (e) {
      console.log('[ProfileScreen] load error:', e?.message || e);
    } finally {
      setLoading(false);
    }
  }, [goToAuth]);

  useEffect(() => { load(); }, [load]);

  const canSave = useMemo(() => {
    const clean = pseudo.trim();
    return !!clean && clean.length >= 3 && clean !== (profile?.public_name || '');
  }, [pseudo, profile?.public_name]);

  const savePseudo = useCallback(async () => {
    const clean = pseudo.trim();
    if (!clean) { Alert.alert('Pseudo', 'Entre un pseudo.'); return; }
    if (clean.length < 3) { Alert.alert('Pseudo', 'Au moins 3 caractères.'); return; }

    setSaving(true);
    try {
      const { error } = await supabase.rpc('update_my_public_name', { p_name: clean });
      if (error) {
        const { error: upErr } = await supabase
          .from('profiles')
          .update({ public_name: clean })
          .eq('id', me.id);
        if (upErr) throw upErr;
      }

      await load();
      Alert.alert('Pseudo', 'Ton pseudo a été mis à jour ✅');
    } catch (e) {
      Alert.alert('Pseudo', e?.message || 'Mise à jour impossible.');
    } finally {
      setSaving(false);
    }
  }, [pseudo, load, me?.id]);

 const registerForPushAsync = useCallback(async () => {
  const settings = await Notifications.getPermissionsAsync();
  let status = settings.status;

  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }

  if (status !== "granted") {
    Alert.alert(
      "Notifications",
      "Active les notifications dans les Réglages de l’iPhone pour Cercle.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Ouvrir Réglages", onPress: () => Linking.openSettings() },
      ]
    );
    throw new Error("Permission notifications refusée.");
  }

  // ✅ projectId : le plus fiable
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    Constants?.expoConfig?.projectId ||
    null;

  if (!projectId) {
    throw new Error(
      "ProjectId EAS manquant. Ajoute extra.eas.projectId dans app.json/app.config.js."
    );
  }

  // ✅ Android: channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
  const expoPushToken = tokenResp?.data;

  if (!expoPushToken) throw new Error("Impossible de récupérer le token push.");

  console.log("[PUSH] token =", expoPushToken);
  return expoPushToken;
}, []);



  const enableNotifications = useCallback(async () => {
    if (!me?.id) return;
    setNotifToggling(true);
    try {
      const token = await registerForPushAsync();

      const { error } = await supabase
        .from('profiles')
        .update({ notifications_enabled: true, push_token: token })
        .eq('id', me.id);

      if (error && String(error.code) !== '42703') {
        throw error;
      }

      setNotifEnabled(true);
      setProfile((p) => ({ ...(p || {}), notifications_enabled: true, push_token: token }));
      Alert.alert('Notifications', 'Notifications activées ✅');
    } catch (e) {
      setNotifEnabled(false);
      Alert.alert('Notifications', e?.message || 'Activation impossible.');
    } finally {
      setNotifToggling(false);
    }
  }, [me?.id, registerForPushAsync]);

  const disableNotifications = useCallback(async () => {
    if (!me?.id) return;
    setNotifToggling(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ notifications_enabled: false, push_token: null })
        .eq('id', me.id);

      if (error && String(error.code) !== '42703') {
        throw error;
      }

      setNotifEnabled(false);
      setProfile((p) => ({ ...(p || {}), notifications_enabled: false, push_token: null }));
      Alert.alert('Notifications', 'Notifications désactivées.');
    } catch (e) {
      setNotifEnabled(true);
      Alert.alert('Notifications', e?.message || 'Désactivation impossible.');
    } finally {
      setNotifToggling(false);
    }
  }, [me?.id]);

  const onToggleNotifications = useCallback(async (next) => {
    if (notifToggling) return;
    if (next) await enableNotifications();
    else await disableNotifications();
  }, [notifToggling, enableNotifications, disableNotifications]);

const openPrivacy = useCallback(async () => {
  const url = "https://stunning-pothos-07a3d3.netlify.app";
  const can = await Linking.canOpenURL(url);
  if (!can) {
    Alert.alert("Confidentialité", "Impossible d’ouvrir le lien.");
    return;
  }
  await Linking.openURL(url);
}, []);

  const signOut = useCallback(async () => {
    try {
      setLoading(true);
      if (hasSupabaseConfig()) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
      goToAuth();
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Déconnexion impossible');
    } finally {
      setLoading(false);
    }
  }, [goToAuth]);

  const deleteAccount = useCallback(() => {
    Alert.alert(
      'Supprimer le compte',
      'Cette action est définitive. Confirmer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              if (hasSupabaseConfig()) await supabase.auth.signOut();
              goToAuth();
            } catch (e) {
              Alert.alert('Erreur', e.message || 'Suppression impossible');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  }, [goToAuth]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={[styles.container, { alignItems:'center', justifyContent:'center' }]}>
          <ActivityIndicator color={colors.mint} />
          <Text style={{ color: colors.subtext, marginTop: 10 }}>Chargement…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.h1}>Profil</Text>

          <View style={styles.card}>
            <View style={{ flexDirection:'row', alignItems:'center' }}>
              <MaterialCommunityIcons name="account-circle-outline" size={36} color={colors.mint} />
              <View style={{ marginLeft:12, flex:1, minWidth:0 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {profile?.public_name || 'Pseudo non défini'}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  ID: {(me?.id || '—').slice(0,8)}…
                </Text>
              </View>
            </View>

            <View style={{ marginTop:12 }}>
              <Text style={styles.label}>Mon pseudo</Text>
              <TextInput
                value={pseudo}
                onChangeText={setPseudo}
                placeholder="ex: clem-annecy"
                placeholderTextColor={colors.subtext}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                maxLength={32}
              />
              <Text style={styles.help}>
                Ce pseudo est visible par les autres. Ton e-mail reste privé.
              </Text>
              <TouchableOpacity
                onPress={savePseudo}
                disabled={!canSave || saving}
                style={[styles.btn, styles.btnMint, (!canSave || saving) && { opacity:0.7 }]}
                activeOpacity={0.9}
              >
                {saving
                  ? <ActivityIndicator color={colors.bg} />
                  : <>
                      <MaterialCommunityIcons name="content-save-outline" size={18} color={colors.bg} />
                      <Text style={[styles.btnTxt, { color: colors.bg }]}>Enregistrer le pseudo</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>Préférences</Text>

            <View style={styles.row}>
              <MaterialCommunityIcons name="bell-outline" size={18} color={colors.mint} />
              <Text style={styles.rowTxt}>Notifications</Text>
              {notifToggling ? (
                <ActivityIndicator />
              ) : (
                <Switch value={notifEnabled} onValueChange={onToggleNotifications} />
              )}
            </View>

            <TouchableOpacity style={styles.row} activeOpacity={0.9} onPress={openPrivacy}>
              <MaterialCommunityIcons name="shield-lock-outline" size={18} color={colors.mint} />
              <Text style={styles.rowTxt}>Confidentialité</Text>
              <MaterialCommunityIcons name="open-in-new" size={18} color={colors.subtext} />
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>À propos</Text>
            <Text style={styles.par}>
              Une <Text style={styles.bold}>onde</Text> est une recherche lancée dans ton cercle (ex: “Qui a une perceuse ?”).
            </Text>
            <Text style={styles.par}>
              <Text style={styles.bold}>Responsabilité :</Text> nous ne prenons aucune responsabilité en cas de perte, vol ou dégradation d’objets prêtés via l'application. Organisez-vous clairement avec votre cercle.
            </Text>
            <Text style={[styles.par, { marginTop: 6 }]}>
              Support : <Text style={styles.bold}>orastudio.org@gmail.com</Text>
            </Text>
          </View>

          <TouchableOpacity onPress={signOut} style={[styles.btn, styles.btnHollow]} activeOpacity={0.9}>
            <MaterialCommunityIcons name="logout" size={18} color={colors.text} />
            <Text style={[styles.btnTxt, { color: colors.text }]}>Se déconnecter</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={deleteAccount} style={[styles.btn, styles.btnDanger]} activeOpacity={0.9}>
            <MaterialCommunityIcons name="account-remove-outline" size={18} color="#ff6b6b" />
            <Text style={[styles.btnTxt, { color: '#ff6b6b' }]}>Supprimer mon compte</Text>
          </TouchableOpacity>

          <View style={{ height: 12 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* Styles */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1 },
  scrollContent: { padding: 16 },

  h1: { color: colors.text, fontSize: 22, fontWeight: '900', marginBottom: 12 },

  card: {
    backgroundColor: colors.card,
    borderColor: colors.stroke,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },

  title: { color: colors.text, fontWeight: '900' },
  meta: { color: colors.subtext, marginTop: 2 },

  label: { color: colors.text, fontWeight: '800', marginBottom: 6 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  help: { color: colors.subtext, marginTop: 6 },

  section: { color: colors.text, fontWeight: '900', marginBottom: 10 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowTxt: { color: colors.text, fontWeight: '700', flex: 1 },

  par: { color: colors.subtext, lineHeight: 20 },
  bold: { color: colors.text, fontWeight: '800' },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  btnMint: { backgroundColor: colors.mint, borderColor: colors.mint },
  btnHollow: { backgroundColor: 'transparent', borderColor: colors.stroke },
  btnDanger: { backgroundColor: '#2b1416', borderColor: '#4a2124' },
  btnTxt: { fontWeight: '900' },
});

