import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { supabase, hasSupabaseConfig } from '../lib/supabase';
import { useResponsive } from '../hooks/useResponsive';


const CATEGORIES = [
  { key:'numerique',  label:'Numérique' },
  { key:'abonnement', label:'Abonnements' },
  { key:'cuisine',    label:'Cuisine' },
  { key:'brico',      label:'Travaux manuels' },
  { key:'musique',    label:'Musique' },
  { key:'livres',     label:'Livres' },
  { key:'sport',      label:'Sport' },
  { key:'vehicules',  label:'Véhicules' },
  { key:'travaux',    label:'Travaux' },
  { key:'enfants',    label:'Enfants' },
  { key:'events',     label:'Événements' },
  { key:'it',         label:'Informatique' },
  { key:'local',      label:'Local' },
  { key:'parking',    label:'Garage / Parking' },
  { key:'autres',     label:'Autres' },
];

export default function AddItemScreen({ route, navigation }){
  const initialCircleId = route?.params?.circleId ?? null;
  const editItem = route?.params?.editItem || route?.params?.edit || null;
const { isIPad, isTablet, columns, scale, horizontalRegular } = useResponsive();
const cardWidth = `calc(100% / ${columns})`;
  const [loading, setLoading] = useState(true);
  const [circles, setCircles] = useState([]);
  const [circleId, setCircleId] = useState(initialCircleId);

  const [title, setTitle] = useState(editItem?.title || '');
  const [desc, setDesc] = useState(editItem?.description || '');
  const [category, setCategory] = useState(editItem?.category || 'autres');
  const [maxDays, setMaxDays] = useState(editItem?.max_days ? String(editItem.max_days) : '');

  // tarifs intelligents
  const [costAmount, setCostAmount] = useState(''); // coût pour toi
  const [costPeriod, setCostPeriod] = useState('month'); // week | month | year
  const [billingUnit, setBillingUnit] = useState('day'); // day | week | month
  const [splitCount, setSplitCount] = useState('1');

  useEffect(()=>{
    (async ()=>{
      try{
        if (!hasSupabaseConfig()) { setLoading(false); return; }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const { data: my } = await supabase
          .from('circles')
          .select('*')
          .or(`owner_id.eq.${user.id},id.in.(select circle_id from circle_members where user_id.eq.${user.id})`)
          .order('created_at',{ ascending:true });

        const list = my || [];
        setCircles(list);

        const fromEditCircle = editItem?.circle_id || null;
        const chosen = initialCircleId || fromEditCircle || list[0]?.id || null;
        setCircleId(chosen);
      } catch(e){
        console.log('load circles error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [initialCircleId, editItem?.circle_id]);

  const priceCents = useMemo(()=>{
    const amount = parseFloat(costAmount || '0');
    const split = Math.max(1, parseInt(splitCount || '1', 10));
    if (!amount || amount<=0) return 0;

    const perYear = costPeriod === 'year' ? amount : costPeriod === 'month' ? amount * 12 : amount * 52;
    const unitsPerYear = billingUnit === 'month' ? 12 : billingUnit === 'week' ? 52 : 365;

    const perUnit = perYear / unitsPerYear;
    const perUnitSplit = perUnit / split;
    return Math.round(perUnitSplit * 100);
  }, [costAmount, costPeriod, billingUnit, splitCount]);

  const euro = (n)=> Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format((n||0)/100);

  /** ✅ Retour fiable sans 'Main' */
  const returnToCircle = () => {
    if (navigation.canGoBack()) return navigation.goBack();
    const parent = navigation.getParent?.();
    if (parent?.navigate) return parent.navigate('Circle');           // ou parent.navigate('App', { screen: 'Circle' }) selon ton root
    return navigation.navigate('Circle');
  };

  async function submit(){
    try {
      if (!circleId) return Alert.alert('Cercle requis','Choisis un cercle (sous le titre).');
      if (!title.trim()) return Alert.alert('Titre requis','Ajoute un titre.');

      const payload = {
        circle_id: circleId,
        title: title.trim(),
        description: desc?.trim() || null,
        category,
        price_cents: priceCents,
        price_unit: billingUnit, // day | week | month
        max_days: maxDays ? parseInt(maxDays, 10) : null,
        split_equal: true,
        split_count: Math.max(1, parseInt(splitCount||'1',10)),
        available: true,
      };

      if (editItem?.id) {
        const { error } = await supabase.from('items').update(payload).eq('id', editItem.id);
        if (error) throw error;
        Alert.alert('Modifié','Ton annonce a été mise à jour.');
      } else {
        const { error } = await supabase.from('items').insert([payload]);
        if (error) throw error;
        Alert.alert('Publié','Ton objet est en ligne dans ce cercle.');
      }
      returnToCircle();
    } catch (e) {
      console.log('submit item error', e);
      Alert.alert('Erreur', 'Impossible de publier pour le moment.');
    }
  }

  if (loading) {
    return <View style={{ flex:1, backgroundColor: colors.bg }} />;
  }

  const multipleCircles = (circles?.length || 0) > 1;

  return (
    <KeyboardAvoidingView style={{ flex:1, backgroundColor: colors.bg }} behavior={Platform.OS==='ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding:16, paddingBottom: 24 }}>
        <Text style={styles.h1}>{editItem ? 'Modifier l’objet' : 'Ajouter un objet'}</Text>

        {/* Titre */}
        <Text style={styles.label}>Titre</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="Ex: Perceuse, Box internet, Local..." placeholderTextColor={colors.subtext} style={styles.input} />

        {/* Sélecteur de cercle */}
        {multipleCircles && (
          <View style={{ marginTop:10 }}>
            <View style={styles.rowMiddle}>
              <MaterialCommunityIcons name="account-group-outline" size={16} color={colors.subtext} />
              <Text style={styles.subtle}>Cercle de publication</Text>
            </View>
            <View style={styles.chipsWrap}>
              {circles.map(c=>{
                const active = String(circleId) === String(c.id);
                return (
                  <TouchableOpacity key={c.id} onPress={()=>setCircleId(c.id)} style={[styles.chip, active && styles.chipActive]} activeOpacity={0.9}>
                    <Text style={[styles.chipTxt, active && styles.chipTxtActive]} numberOfLines={1}>{c.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Catégorie */}
        <Text style={styles.label}>Catégorie</Text>
        <View style={styles.pillsWrap}>
          {CATEGORIES.map(c => (
            <TouchableOpacity key={c.key} onPress={()=>setCategory(c.key)} style={[styles.pill, category===c.key && styles.pillActive]} activeOpacity={0.9}>
              <Text style={[styles.pillTxt, category===c.key && styles.pillTxtActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Description */}
        <Text style={styles.label}>Description</Text>
        <TextInput value={desc} onChangeText={setDesc} placeholder="Détails, état, conditions..." placeholderTextColor={colors.subtext} style={[styles.input, { height:110, textAlignVertical:'top' }]} multiline />

        {/* Tarifs intelligents */}
        <Text style={[styles.sectionTitle, { marginTop:16 }]}>Tarifs intelligents</Text>

        {/* Coût + Période */}
        <View style={styles.block}>
          <View style={{ flex:1, minWidth: 180 }}>
            <Text style={styles.smallLabel}>Ce que ça me coûte</Text>
            <TextInput value={costAmount} onChangeText={setCostAmount} placeholder="ex. 60" keyboardType="decimal-pad" placeholderTextColor={colors.subtext} style={styles.input} />
          </View>
          <View style={{ flex:1, minWidth: 180 }}>
            <Text style={styles.smallLabel}>Période de coût</Text>
            <View style={styles.pillsWrapRow}>
              {['week','month','year'].map(p => (
                <TouchableOpacity key={p} onPress={()=>setCostPeriod(p)} style={[styles.smallPill, costPeriod===p && styles.smallPillActive]} activeOpacity={0.9}>
                  <Text style={[styles.smallPillTxt, costPeriod===p && styles.smallPillTxtActive]}>
                    {p==='week'?'Semaine':p==='month'?'Mois':'An'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Facturer par + Répartir entre */}
        <View style={styles.block}>
          <View style={{ flex:1, minWidth: 180 }}>
            <Text style={styles.smallLabel}>Facturer par</Text>
            <View style={styles.pillsWrapRow}>
              {['day','week','month'].map(u => (
                <TouchableOpacity key={u} onPress={()=>setBillingUnit(u)} style={[styles.smallPill, billingUnit===u && styles.smallPillActive]} activeOpacity={0.9}>
                  <Text style={[styles.smallPillTxt, billingUnit===u && styles.smallPillTxtActive]}>
                    {u==='day'?'Jour':u==='week'?'Semaine':'Mois'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={{ flex:1, minWidth: 180 }}>
            <Text style={styles.smallLabel}>Répartir entre</Text>
            <TextInput value={splitCount} onChangeText={setSplitCount} placeholder="ex. 3" keyboardType="number-pad" placeholderTextColor={colors.subtext} style={styles.input} />
          </View>
        </View>

        {/* Résumé calcul */}
        <View style={styles.card}>
          <Text style={styles.calcLine}>
            Prix calculé: <Text style={styles.calcStrong}>{euro(priceCents)}</Text> {billingUnit==='day'?'/j':billingUnit==='week'?'/sem.':'/mois'}
          </Text>
          <Text style={styles.calcSub}>Répartition équitable sur {Math.max(1, parseInt(splitCount||'1',10))} personne(s).</Text>
        </View>

        {/* Options */}
        <Text style={styles.label}>Durée max (jours) — optionnel</Text>
        <TextInput value={maxDays} onChangeText={setMaxDays} placeholder="ex. 7" keyboardType="number-pad" placeholderTextColor={colors.subtext} style={styles.input} />

        <TouchableOpacity onPress={submit} style={styles.submitBtn} activeOpacity={0.95}>
          <Text style={styles.submitTxt}>{editItem ? 'Enregistrer' : 'Publier'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* styles */
const styles = StyleSheet.create({
  h1:{ color: colors.text, fontWeight:'900', fontSize:20, marginBottom:10 },
  label:{ color: colors.subtext, marginTop:14, marginBottom:6 },
  subtle:{ color: colors.subtext, marginLeft:6, fontSize:12 },

  input:{ backgroundColor:'#151826', borderColor: colors.stroke, borderWidth:1, borderRadius:12, padding:12, color: colors.text },

  sectionTitle:{ color: colors.text, fontWeight:'800', fontSize:16 },

  // groupements responsives
  block:{ flexDirection:'row', columnGap:12, rowGap:8, flexWrap:'wrap', marginTop:8 },

  // pills catégories
  pillsWrap:{ flexDirection:'row', flexWrap:'wrap', gap:8 },
  pill:{ paddingVertical:8, paddingHorizontal:12, borderRadius:12, backgroundColor:'#121826', borderWidth:1, borderColor: colors.stroke, marginBottom:6 },
  pillActive:{ backgroundColor:'#0f192a', borderColor:'#2a3b57' },
  pillTxt:{ color: colors.text, fontWeight:'700' },
  pillTxtActive:{ color: colors.mint },

  // petites pills
  pillsWrapRow:{ flexDirection:'row', flexWrap:'wrap', gap:8 },
  smallPill:{ paddingVertical:6, paddingHorizontal:10, borderRadius:10, backgroundColor:'#121826', borderWidth:1, borderColor: colors.stroke },
  smallPillActive:{ backgroundColor:'#0f192a', borderColor:'#2a3b57' },
  smallPillTxt:{ color: colors.text, fontWeight:'700', fontSize:12 },
  smallPillTxtActive:{ color: colors.mint },

  // chips cercle
  rowMiddle:{ flexDirection:'row', alignItems:'center', gap:6 },
  chipsWrap:{ flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:6 },
  chip:{ paddingVertical:6, paddingHorizontal:10, borderRadius:999, borderWidth:1, borderColor:colors.stroke, backgroundColor:'#101726' },
  chipActive:{ backgroundColor: colors.mint, borderColor: colors.mint },
  chipTxt:{ color: colors.text, fontWeight:'700' },
  chipTxtActive:{ color: colors.bg, fontWeight:'900' },

  // carte calcul
  card:{ backgroundColor:'#0f1725', borderColor: colors.stroke, borderWidth:1, borderRadius:12, padding:12, marginTop:10 },
  calcLine:{ color: colors.text, fontWeight:'800' },
  calcStrong:{ color: colors.mint },
  calcSub:{ color: colors.subtext, marginTop:4 },

  submitBtn:{ marginTop:20, backgroundColor: colors.mint, padding:14, borderRadius:14, alignItems:'center' },
  submitTxt:{ color: colors.bg, fontWeight:'900' },
});
