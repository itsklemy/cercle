import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { supabase, hasSupabaseConfig } from '../lib/supabase';

export default function AuthScreen({ navigation }){
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(()=>{
    if (!hasSupabaseConfig()) {
      Alert.alert('Configuration requise', 'Renseigne SUPABASE_URL et SUPABASE_ANON_KEY dans app.config.js');
    }
  },[]);

  const signUp = async ()=>{
    try{
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      Alert.alert('Compte créé', 'Vérifie tes emails si la confirmation est requise.');
    }catch(e){ Alert.alert('Erreur', e.message); }
  };
  const signIn = async ()=>{
    try{
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigation.replace('Main');
    }catch(e){ Alert.alert('Erreur', e.message); }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Connexion</Text>
      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType='email-address' placeholder='toi@mail.com' placeholderTextColor={colors.subtext} autoCapitalize="none" />
      <Text style={styles.label}>Mot de passe</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder='••••••••' placeholderTextColor={colors.subtext} />
      <TouchableOpacity onPress={signIn} style={styles.cta}><Text style={styles.ctaTxt}>Se connecter</Text></TouchableOpacity>
      <TouchableOpacity onPress={signUp} style={styles.ghost}><Text style={styles.ghostTxt}>Créer un compte</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor: colors.bg, padding:16 },
  h1:{ color: colors.text, fontSize:22, fontWeight:'800', marginBottom:12 },
  label:{ color: colors.subtext, marginTop:12, marginBottom:6 },
  input:{ backgroundColor: '#151826', borderColor: colors.stroke, borderWidth:1, borderRadius:12, padding: 14, color: colors.text },
  cta:{ marginTop:20, backgroundColor: colors.mint, padding:16, borderRadius:16, alignItems:'center' },
  ctaTxt:{ color: colors.bg, fontWeight:'800', fontSize: 17 },
  ghost:{ marginTop: 12, padding: 14, alignItems:'center' },
  ghostTxt:{ color: colors.subtext, fontWeight:'700' }
});
