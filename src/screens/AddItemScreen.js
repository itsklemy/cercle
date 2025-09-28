// src/screens/AddItemScreen.js
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { supabase, hasSupabaseConfig } from '../lib/supabase';

const CATS = [
  { key:'numerique', label:'Numérique' },
  { key:'abonnement', label:'Abonnements' },
  { key:'cuisine', label:'Cuisine' },
  { key:'brico', label:'Travaux manuels' },
  { key:'musique', label:'Musique' },
  { key:'livres', label:'Livres' },
  { key:'sport', label:'Sport' },
  { key:'vehicules', label:'Véhicules' },
  { key:'travaux', label:'Travaux' },
  { key:'enfants', label:'Enfants' },
  { key:'events', label:'Événements' },
  { key:'it', label:'Informatique' },
];

const UNITS = [
  { key:'day', label:'/jour' },
  { key:'week', label:'/semaine' },
  { key:'month', label:'/mois' },
];

export default function AddItemScreen({ route, navigation }){
  const circleId = route?.params?.circleId || null;

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(null);
  const [subcategory, setSubcategory] = useState('');
  const [photo, setPhoto] = useState(null);

  const [value, setValue] = useState(''); // valeur estimée de l'objet (€)
  const [pricingMode, setPricingMode] = useState('amicable'); // 'amicable' | 'priced'
  const [unit, setUnit] = useState('day'); // day/week/month
  const [priceNumber, setPriceNumber] = useState(''); // prix numérique (€ selon unité)
  const [deposit, setDeposit] = useState('');
  const [fees, setFees] = useState('');
  const [maxDays, setMaxDays] = useState('');

  const pickImage = async ()=>{
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission','Autorise l’accès aux photos.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality:0.85 });
    if (!res.canceled && res.assets?.length) setPhoto(res.assets[0].uri);
  };

  const suggestPrice = ()=>{
    const v = Number(value) || 0;
    if (!v) return Alert.alert('Saisir la valeur','Indique une valeur estimée (€).');
    let perDay = Math.max(1, Math.round(v*0.015*100)/100); // 1.5% / jour
    let perWeek = Math.round(perDay*5*100)/100;            // 5 jours base
    let perMonth = Math.round(perDay*20*100)/100;          // 20 jours base
    if (unit==='day') setPriceNumber(String(perDay));
    if (unit==='week') setPriceNumber(String(perWeek));
    if (unit==='month') setPriceNumber(String(perMonth));
    setDeposit(String(Math.round(v*0.2))); // 20%
  };

  const save = async ()=>{
    if (!hasSupabaseConfig()) return Alert.alert('Config requise','Renseigne SUPABASE_URL / KEY.');
    if (!title.trim() || !category) return Alert.alert('Champs manquants','Titre et catégorie requis.');
    try{
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non connecté.');

      const payload = {
        title: title.trim(),
        category,
        subcategory: subcategory || null,
        circle_id: circleId,
        owner_id: user.id,
        owner_name: null,
        photo_url: photo || null,
        available: true,
        value_cents: value ? Math.round(Number(value)*100) : null,
        amicable: pricingMode==='amicable',
        price_unit: pricingMode==='priced' ? unit : null, // 'day'|'week'|'month'
        price_cents: pricingMode==='priced' && priceNumber ? Math.round(Number(priceNumber)*100) : null,
        deposit_cents: pricingMode==='priced' && deposit ? Math.round(Number(deposit)*100) : null,
        fees_cents: pricingMode==='priced' && fees ? Math.round(Number(fees)*100) : null,
        max_days: maxDays ? Number(maxDays) : null,
      };

      const { data, error } = await supabase.from('items').insert([payload]).select('*').single();
      if (error) throw error;

      Alert.alert('Ajouté','Ton objet est publié.');
      navigation.replace('ItemDetail', { item: data, preview: true }); // aperçu immédiat
    }catch(e){
      Alert.alert('Erreur', e.message || 'Impossible de publier.');
    }
  };

  const Seg = ({ options, value, onChange }) => (
    <View style={styles.segWrap}>
      {options.map(opt=>(
        <TouchableOpacity
          key={opt.key}
          onPress={()=>onChange(opt.key)}
          style={[styles.segBtn, value===opt.key && styles.segBtnActive]}
        >
          <Text style={[styles.segTxt, value===opt.key && styles.segTxtActive]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom:20 }}>
      <Text style={styles.h1}>Ajouter un objet</Text>

      <Text style={styles.label}>Titre</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Ex: Perceuse Bosch" placeholderTextColor={colors.subtext} />

      <Text style={styles.label}>Catégorie</Text>
      {/* vertical list */}
      {CATS.map(c=>(
        <TouchableOpacity key={c.key} onPress={()=>setCategory(c.key)} style={[styles.pillRow, category===c.key && styles.pillRowActive]}>
          <MaterialCommunityIcons name="checkbox-blank-circle" size={10} color={category===c.key?colors.mint:colors.subtext} />
          <Text style={[styles.pillRowTxt, category===c.key && styles.pillRowTxtActive]}>{c.label}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.label}>Sous-catégorie (facultatif)</Text>
      <TextInput style={styles.input} value={subcategory} onChangeText={setSubcategory} placeholder="Ex: Perceuse/visseuse" placeholderTextColor={colors.subtext} />

      <Text style={styles.label}>Photo</Text>
      <TouchableOpacity onPress={pickImage} style={styles.photoBtn}>
        {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : (
          <>
            <MaterialCommunityIcons name="image-plus" size={20} color={colors.subtext} />
            <Text style={styles.photoTxt}>Ajouter une photo</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>Valeur estimée de l’objet (€)</Text>
      <Text style={styles.help}>La valeur sert à fixer le dépôt/assurance. Elle n’est pas liée à l’unité de prix.</Text>
      <TextInput style={styles.input} keyboardType="decimal-pad" value={value} onChangeText={setValue} placeholder="Ex: 120" placeholderTextColor={colors.subtext} />

      <Text style={styles.label}>Mode de tarification</Text>
      <Seg
        options={[{key:'amicable',label:'À l’amiable'},{key:'priced',label:'Tarifé'}]}
        value={pricingMode}
        onChange={setPricingMode}
      />

      {pricingMode==='priced' && (
        <>
          <Text style={styles.label}>Unité</Text>
          <Seg options={UNITS} value={unit} onChange={(k)=>{ setUnit(k); if (priceNumber) suggestPrice(); }} />

          <Text style={styles.label}>Prix {UNITS.find(u=>u.key===unit)?.label} (€)</Text>
          <TextInput style={styles.input} keyboardType="decimal-pad" value={priceNumber} onChangeText={setPriceNumber} placeholder="Ex: 3" placeholderTextColor={colors.subtext} />
          <View style={{ flexDirection:'row', gap:8 }}>
            <TouchableOpacity onPress={suggestPrice} style={[styles.btn,{flex:1}]}><Text style={styles.btnTxt}>Tarif auto</Text></TouchableOpacity>
            <TouchableOpacity onPress={()=>setPriceNumber('')} style={[styles.btnGhost,{flex:1}]}><Text style={styles.btnGhostTxt}>Effacer</Text></TouchableOpacity>
          </View>

          <Text style={styles.label}>Dépôt de garantie (€)</Text>
          <TextInput style={styles.input} keyboardType="decimal-pad" value={deposit} onChangeText={setDeposit} placeholder="Ex: 25" placeholderTextColor={colors.subtext} />

          <Text style={styles.label}>Frais (nettoyage/consommables) (€)</Text>
          <TextInput style={styles.input} keyboardType="decimal-pad" value={fees} onChangeText={setFees} placeholder="Ex: 2" placeholderTextColor={colors.subtext} />
        </>
      )}

      <Text style={styles.label}>Durée max (jours) — optionnel</Text>
      <TextInput style={styles.input} keyboardType="number-pad" value={maxDays} onChangeText={setMaxDays} placeholder="Ex: 7" placeholderTextColor={colors.subtext} />

      <TouchableOpacity onPress={save} style={styles.cta}>
        <Text style={styles.ctaTxt}>Publier et voir l’aperçu</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor: colors.bg, padding:16 },
  h1:{ color: colors.text, fontSize:22, fontWeight:'800', marginBottom:12 },
  label:{ color: colors.subtext, marginTop:12, marginBottom:6 },
  help:{ color: colors.subtext, fontSize:12, marginBottom:6 },

  input:{ backgroundColor:'#151826', borderColor: colors.stroke, borderWidth:1, borderRadius:12, padding:12, color: colors.text },

  pillRow:{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:10, paddingHorizontal:12, borderRadius:12, borderWidth:1, borderColor: colors.stroke, backgroundColor:'#101726', marginBottom:6 },
  pillRowActive:{ backgroundColor:'#0f192a', borderColor:'#2a3b57' },
  pillRowTxt:{ color: colors.subtext, fontWeight:'700' },
  pillRowTxtActive:{ color: colors.text },

  photoBtn:{ height:140, borderRadius:12, borderWidth:1, borderColor: colors.stroke, backgroundColor:'#101726', alignItems:'center', justifyContent:'center', gap:8 },
  photo:{ width:'100%', height:'100%', borderRadius:12, resizeMode:'cover' },
  photoTxt:{ color: colors.subtext },

  segWrap:{ flexDirection:'row', gap:8 },
  segBtn:{ flex:1, paddingVertical:10, borderRadius:10, borderWidth:1, borderColor: colors.stroke, backgroundColor:'#0f1725', alignItems:'center' },
  segBtnActive:{ backgroundColor:'#0b1321', borderColor:'#2a3b57' },
  segTxt:{ color: colors.subtext, fontWeight:'800' },
  segTxtActive:{ color: colors.text },

  btn:{ backgroundColor: colors.mint, padding:12, borderRadius:12, alignItems:'center' },
  btnTxt:{ color: colors.bg, fontWeight:'900' },
  btnGhost:{ padding:12, borderRadius:12, borderWidth:1, borderColor: colors.stroke, backgroundColor:'#0f1725' },
  btnGhostTxt:{ color: colors.text, fontWeight:'800' },

  cta:{ marginTop:16, backgroundColor: colors.mint, padding:16, borderRadius:16, alignItems:'center' },
  ctaTxt:{ color: colors.bg, fontWeight:'900', fontSize:16 },
});
