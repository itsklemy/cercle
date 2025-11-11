import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../theme/colors';
import { supabase, hasSupabaseConfig } from '../lib/supabase';
import { CommonActions } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useResponsive } from '../hooks/useResponsive';


export default function ProfileScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
const { isIPad, isTablet, columns, scale, horizontalRegular } = useResponsive();
const cardWidth = `calc(100% / ${columns})`;
  const goToAuth = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Auth' }],
      })
    );
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!hasSupabaseConfig()) {
          setMe(null);
          return;
        }
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (mounted) setMe(user ?? null);
      } catch (e) {
        // si la session est cassée -> renvoie à l’auth
        goToAuth();
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const signOut = async () => {
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
  };

  const deleteAccount = async () => {
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
              // ⚠️ Adapter à ton backend : RPC sécurisée recommandée côté Supabase
              // Exemple si tu as une RPC `delete_my_account`:
              // const { error } = await supabase.rpc('delete_my_account');
              // if (error) throw error;

              // Fallback minimal : sign-out (ne supprime pas réellement côté DB)
              if (hasSupabaseConfig()) {
                await supabase.auth.signOut();
              }
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
  };

  if (loading) {
    return (
      <View style={[styles.container, { alignItems:'center', justifyContent:'center' }]}>
        <ActivityIndicator color={colors.mint} />
        <Text style={{ color: colors.subtext, marginTop: 10 }}>Chargement…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <Text style={styles.h1}>Profil</Text>

      {/* Carte profil */}
      <View style={styles.card}>
        <View style={{ flexDirection:'row', alignItems:'center' }}>
          <MaterialCommunityIcons name="account-circle-outline" size={36} color={colors.mint} />
          <View style={{ marginLeft:12, flex:1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {me?.email || 'Utilisateur'}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              ID: {me?.id || '—'}
            </Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <TouchableOpacity onPress={signOut} style={[styles.btn, styles.btnMint]} activeOpacity={0.9}>
        <MaterialCommunityIcons name="logout" size={18} color={colors.bg} />
        <Text style={[styles.btnTxt, { color: colors.bg }]}>Se déconnecter</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={deleteAccount} style={[styles.btn, styles.btnDanger]} activeOpacity={0.9}>
        <MaterialCommunityIcons name="account-remove-outline" size={18} color="#ff6b6b" />
        <Text style={[styles.btnTxt, { color: '#ff6b6b' }]}>Supprimer mon compte</Text>
      </TouchableOpacity>

      <View style={{ height: 12 }} />
      <Text style={styles.note}>
        Besoin d’aide ? Contacte le support : contact@orastudio.org
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor: colors.bg, padding:16 },
  h1:{ color: colors.text, fontSize:22, fontWeight:'900', marginBottom:12 },
  card:{
    backgroundColor: colors.card,
    borderColor: colors.stroke,
    borderWidth:1,
    borderRadius:14,
    padding:14,
    marginBottom:14
  },
  title:{ color: colors.text, fontWeight:'900' },
  meta:{ color: colors.subtext, marginTop:2 },

  btn:{
    flexDirection:'row',
    alignItems:'center',
    justifyContent:'center',
    gap:8,
    borderRadius:14,
    paddingVertical:14,
    borderWidth:1,
    marginBottom:10
  },
  btnMint:{ backgroundColor: colors.mint, borderColor: colors.mint },
  btnDanger:{ backgroundColor:'#2b1416', borderColor:'#4a2124' },
  btnTxt:{ fontWeight:'900' },

  note:{ color: colors.subtext, textAlign:'center' },
});
