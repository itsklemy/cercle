import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Image,
  Switch,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors } from '../theme/colors';
import { supabase, hasSupabaseConfig } from '../lib/supabase';

export default function ProfileScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('Moi');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [photo, setPhoto] = useState(null);

  // préférences
  const [pushEnabled, setPushEnabled] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState(null);
  const [defaultCircleId, setDefaultCircleId] = useState(null);
  const [circles, setCircles] = useState([]);

  const canCloud = hasSupabaseConfig() && !!supabase;
  const inExpoGo = Constants.appOwnership === 'expo';

  useEffect(() => {
    (async () => {
      try {
        if (!canCloud) { setLoading(false); return; }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        // profil
        const { data: prof } = await supabase
          .from('profiles')
          .select('name,email,phone,photo,notify_push,expo_push_token,default_circle_id')
          .eq('id', user.id)
          .maybeSingle();

        setName(prof?.name || 'Moi');
        setEmail(prof?.email || user.email || '');
        setPhone(prof?.phone || '');
        setPhoto(prof?.photo || null);
        setPushEnabled(!!prof?.notify_push);
        setExpoPushToken(prof?.expo_push_token || null);
        setDefaultCircleId(prof?.default_circle_id || null);

        // cercles pour choix par défaut
        const { data: myCircles } = await supabase
          .from('circles')
          .select('id,name')
          .or(`owner_id.eq.${user.id},id.in.(select circle_id from circle_members where user_id.eq.${user.id})`)
          .order('created_at', { ascending: true });
        setCircles(myCircles || []);
      } catch (e) {
        console.log('Profile load error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [canCloud]);

  const currentCircleName = useMemo(()=>{
    const found = circles.find(c => String(c.id) === String(defaultCircleId));
    return found?.name || 'Aucun';
  }, [circles, defaultCircleId]);

  async function pickImage() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permission', 'Autorise l’accès à ta photothèque.');

      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) return;

      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      const fileExt = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `avatars/${user.id}.${fileExt}`;

      const file = await fetch(asset.uri).then(r => r.blob());
      const up = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true, contentType: file.type || 'image/jpeg' });
      if (up?.error) {
        console.log('storage upload error', up.error?.message);
        setPhoto(asset.uri);
        await supabase.from('profiles').update({ photo: asset.uri }).eq('id', user.id);
      } else {
        const { data: pub } = supabase.storage.from('avatars').getPublicUrl(filePath);
        const publicUrl = pub?.publicUrl || null;
        setPhoto(publicUrl);
        await supabase.from('profiles').update({ photo: publicUrl }).eq('id', user.id);
      }
      Alert.alert('Photo', 'Avatar mis à jour.');
    } catch (e) {
      console.log('pickImage error', e);
      Alert.alert('Erreur', e.message || 'Impossible de mettre à jour la photo.');
    } finally {
      setSaving(false);
    }
  }

  function validatePhone(v) {
    const str = (v || '').replace(/\s+/g,'');
    return /^(\+?\d{6,16})$/.test(str);
  }

  const save = async () => {
    try {
      if (!canCloud) return Alert.alert('Hors-ligne', 'Connexion cloud requise.');
      if (phone && !validatePhone(phone)) return Alert.alert('Téléphone invalide', 'Ex: +33612345678');

      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non connecté');

      // email (mise à jour Auth si changé)
      if (email && email !== user.email) {
        const { error: auErr } = await supabase.auth.updateUser({ email });
        if (auErr) throw auErr;
        Alert.alert('Email', 'Un lien de confirmation t’a été envoyé.');
      }

      const update = {
        name, email, phone, photo: photo || null,
        notify_push: pushEnabled,
        expo_push_token: expoPushToken || null,
        default_circle_id: defaultCircleId || null
      };

      const { error: upErr } = await supabase.from('profiles').upsert(
        { id: user.id, ...update }, { onConflict: 'id' }
      );
      if (upErr) throw upErr;

      Alert.alert('Profil', 'Tes informations ont été enregistrées.');
    } catch (e) {
      console.log('save profile error', e);
      Alert.alert('Erreur', e.message || 'Impossible de sauvegarder.');
    } finally {
      setSaving(false);
    }
  };

  const togglePush = async (val) => {
    try {
      // En Expo Go (SDK 53), les push distants ne sont pas supportés
      if (inExpoGo && val) {
        return Alert.alert('Notifications', 'Active-les dans un development build (pas Expo Go).');
      }

      setPushEnabled(val);
      if (!val) {
        setExpoPushToken(null);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await supabase.from('profiles').update({ notify_push:false, expo_push_token: null }).eq('id', user.id);
        return;
      }

      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') { setPushEnabled(false); return Alert.alert('Notifications', 'Permission refusée.'); }

      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.expoConfig?.extra?.projectId ||
        Constants?.easConfig?.projectId;

      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenData?.data;
      if (!token) throw new Error('Token indisponible (development build requis).');

      setExpoPushToken(token);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from('profiles').update({ notify_push:true, expo_push_token: token }).eq('id', user.id);
      Alert.alert('Notifications', 'Activées ✅');
    } catch (e) {
      console.log('push toggle error', e);
      Alert.alert('Notifications', e.message || 'Impossible d’activer les notifications.');
      setPushEnabled(false);
    }
  };

  const logout = async () => {
    try { if (canCloud) await supabase.auth.signOut(); }
    finally { navigation.replace('Auth'); }
  };

  const deleteAccount = async () => {
    Alert.alert('Supprimer le compte','Action définitive. Continuer ?', [
      { text:'Annuler', style:'cancel' },
      { text:'Supprimer', style:'destructive', onPress: async ()=>{
        try{
          const { data: { user } } = await supabase.auth.getUser();
          if (user) await supabase.from('profiles').delete().eq('id', user.id);
          await supabase.auth.signOut();
        } finally {
          navigation.replace('Auth');
        }
      }}
    ]);
  };

  if (loading) {
    return (
      <View style={{ flex:1, backgroundColor: colors.bg, alignItems:'center', justifyContent:'center' }}>
        <MaterialCommunityIcons name="loading" size={22} color={colors.mint} />
        <Text style={{ color: colors.subtext, marginTop:8 }}>Chargement…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header avatar + nom */}
            <View style={styles.header}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <MaterialCommunityIcons name="account" size={48} color={colors.subtext} />
                </View>
              )}
              <TouchableOpacity onPress={pickImage} style={styles.smallBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="camera" size={16} color={colors.text} />
                <Text style={styles.smallBtnTxt}>Changer</Text>
              </TouchableOpacity>
              <Text style={styles.h1}>{name || 'Moi'}</Text>
            </View>

            {/* Identité */}
            <Text style={styles.section}>Identité</Text>
            <Text style={styles.label}>Nom</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Email (connexion)</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.label}>Téléphone</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />

            {/* Préférences */}
            <Text style={styles.section}>Préférences</Text>
            <View style={styles.rowBetween}>
              <Text style={styles.toggleLabel}>Notifications push</Text>
              <Switch value={pushEnabled} onValueChange={togglePush} />
            </View>
            {!!expoPushToken && <Text style={styles.hint}>Token enregistré ✅</Text>}
            {inExpoGo && <Text style={styles.hint}>Pour tester les push, utilise un development build.</Text>}

            <Text style={styles.label}>Cercle par défaut</Text>
            <TouchableOpacity
              onPress={async ()=>{
                if (!circles.length) return;
                // cycle simple entre les cercles pour limiter les clics
                const idx = Math.max(0, circles.findIndex(c => String(c.id) === String(defaultCircleId)));
                const next = circles[(idx + 1) % circles.length];
                setDefaultCircleId(next?.id || null);
                // autosave rapide
                try{
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user) await supabase.from('profiles').update({ default_circle_id: next?.id || null }).eq('id', user.id);
                }catch{}
              }}
              style={styles.select}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="account-group-outline" size={16} color={colors.subtext} />
              <Text style={styles.selectTxt}>{currentCircleName}</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.subtext} />
            </TouchableOpacity>
            <Text style={styles.hint}>Touchez pour changer. Sert de cercle proposé par défaut.</Text>

            {/* Actions */}
            <TouchableOpacity onPress={save} disabled={saving} style={styles.cta} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.ctaTxt}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
            </TouchableOpacity>

            <View style={{ height:8 }} />
            <View style={styles.rowActions}>
              <TouchableOpacity onPress={logout} style={styles.ghost} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="logout" size={18} color={colors.warning} />
                <Text style={[styles.ghostTxt,{ color: colors.warning }]}>Déconnexion</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={deleteAccount} style={styles.danger} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.dangerTxt}>Supprimer mon compte</Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* --------------------------- styles --------------------------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 28 }, // espace bas pour éviter la superposition

  header: { alignItems: 'center', marginBottom: 18 },
  avatar: { width: 96, height: 96, borderRadius: 48, marginBottom: 10 },
  avatarPlaceholder: { backgroundColor: '#1b1f2e', justifyContent: 'center', alignItems: 'center' },
  smallBtn:{ flexDirection:'row', alignItems:'center', gap:6, borderWidth:1, borderColor: colors.stroke, backgroundColor:'#0f1725', paddingVertical:8, paddingHorizontal:12, borderRadius:10 },
  smallBtnTxt:{ color: colors.text, fontWeight:'800' },
  h1: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 10 },

  section:{ color: colors.text, fontWeight:'900', marginTop: 14, marginBottom: 6 },
  label: { color: colors.subtext, marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: '#151826', borderColor: colors.stroke, borderWidth: 1, borderRadius: 12, padding: 12, color: colors.text },

  rowBetween:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:6 },
  toggleLabel:{ color: colors.text, fontWeight:'700' },
  hint:{ color: colors.subtext, fontSize:12, marginTop:4 },

  select:{ flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#101726', borderColor: colors.stroke, borderWidth:1, borderRadius:10, paddingVertical:10, paddingHorizontal:12 },
  selectTxt:{ color: colors.text, fontWeight:'800', flex:1 },

  cta: { marginTop: 16, backgroundColor: colors.mint, padding: 16, borderRadius: 16, alignItems: 'center' },
  ctaTxt: { color: colors.bg, fontWeight: '800', fontSize: 16 },

  rowActions:{ flexDirection:'row', gap:10, marginTop:8, justifyContent:'space-between' },

  ghost:{ flex:1, flexDirection:'row', alignItems:'center', gap:8, padding:12, borderWidth:1, borderColor: colors.stroke, borderRadius:12, backgroundColor:'#0e172a', justifyContent:'center' },
  ghostTxt:{ color: colors.text, fontWeight:'800' },

  danger:{ marginTop: 12, padding: 12, alignItems:'center' },
  dangerTxt:{ color: colors.danger, fontWeight:'700' }
});
