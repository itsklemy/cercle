import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { colors } from '../theme/colors';

export default function SplashScreen({ navigation }){
  return (
    <View style={styles.container}>
      <Image source={{ uri: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&q=80' }} style={styles.hero} />
      <Text style={styles.logo}>Cercle</Text>
      <Text style={styles.subtitle}>Plateforme de ressources partagées.</Text>
      <View style={{ height: 12 }} />
      <Text style={styles.slogan}>« Prête, emprunte, partage. »</Text>
      <View style={{ height: 24 }} />
      <TouchableOpacity onPress={()=>navigation.replace('Auth')} style={styles.cta}><Text style={styles.ctaTxt}>Se connecter</Text></TouchableOpacity>
      <TouchableOpacity onPress={()=>navigation.replace('Auth')} style={styles.ghost}><Text style={styles.ghostTxt}>Créer un compte</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor: colors.bg, alignItems:'center', justifyContent:'center', padding:24 },
  hero:{ position:'absolute', opacity:0.1, top:0, left:0, right:0, bottom:0 },
  logo:{ color: colors.text, fontSize:40, fontWeight:'900', letterSpacing:1, marginBottom:6 },
  subtitle:{ color: colors.subtext, textAlign:'center', marginBottom:8 },
  slogan:{ color: colors.text, fontWeight:'700', textAlign:'center' },
  cta:{ backgroundColor: colors.mint, paddingVertical:14, paddingHorizontal:20, borderRadius:16, width:'100%', alignItems:'center', marginTop:8 },
  ctaTxt:{ color: colors.bg, fontWeight:'900' },
  ghost:{ padding:12, width:'100%', alignItems:'center' },
  ghostTxt:{ color: colors.subtext, fontWeight:'700' },
  legal:{ color: colors.subtext, marginTop:12 }
});
