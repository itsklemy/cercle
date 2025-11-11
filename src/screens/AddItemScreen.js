// src/screens/AddItemScreen.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView,
  KeyboardAvoidingView, Platform, Switch, Modal, Pressable, Image, ActivityIndicator
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { supabase, hasSupabaseConfig } from '../lib/supabase';
import { useResponsive } from '../hooks/useResponsive';

const CATEGORIES = [
  { key: 'brico',      label: 'Bricolage',    dot: '#FFB648' },
  { key: 'vehicules',  label: 'Véhicules',    dot: '#5FC8FF' },
  { key: 'abonnement', label: 'Abonnements',  dot: '#AD8CFF' },
  { key: 'other',      label: 'Autre',        dot: '#6EE7B7' },
];
const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));
const labelCat = (k) => CAT_BY_KEY[k]?.label || 'Autre';

export default function AddItemScreen({ route, navigation }){
  const initialCircleId = route?.params?.circleId ?? null;
  const editItem = route?.params?.editItem || route?.params?.edit || null;
  const { } = useResponsive();

  const [loading, setLoading] = useState(true);
  const [circles, setCircles] = useState([]);
  const [preselectCircleIds, setPreselectCircleIds] = useState(
    initialCircleId ? [String(initialCircleId)] : []
  );

  // form
  const [title, setTitle] = useState(editItem?.title || '');
  const [desc, setDesc] = useState(editItem?.description || '');
  const [category, setCategory] = useState(editItem?.category || 'other');

  const [simpleFree, setSimpleFree] = useState(editItem ? editItem.price_cents === 0 : false);
  const [simplePrice, setSimplePrice] = useState(
    editItem?.price_cents && editItem.price_cents > 0 ? String(Math.round(editItem.price_cents/100)) : ''
  );
  const [billingUnit, setBillingUnit] = useState(editItem?.price_unit || 'day'); // day|week|month
  const [maxDays, setMaxDays] = useState(editItem?.max_days ? String(editItem.max_days) : '');

  // image
  const [imageUri, setImageUri] = useState(editItem?.photo || '');
  const [uploading, setUploading] = useState(false);

  // UI
  const [catOpen, setCatOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [selectedCircleIds, setSelectedCircleIds] = useState([]);

  const finalPriceCents = useMemo(() => {
    if (simpleFree) return 0;
    const n = parseFloat(simplePrice || '0');
    return Math.max(0, Math.round(n * 100));
  }, [simpleFree, simplePrice]);

  const euro = (n)=> Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format((n||0)/100);

  // load circles (owner + member)
  useEffect(()=>{
    (async ()=>{
      try{
        if (!hasSupabaseConfig()) { setLoading(false); return; }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const [{ data: myOwned }, { data: myMember }] = await Promise.all([
          supabase.from('circles').select('*').eq('owner_id', user.id).order('created_at',{ ascending:true }),
          supabase.from('circle_members').select('circle_id, circles!inner(*)').eq('user_id', user.id),
        ]);

        const list = [
          ...(myOwned || []),
          ...((myMember || []).map(r => r.circles)).filter(Boolean),
        ];
        const uniq = Object.values(Object.fromEntries((list || []).map(c => [String(c.id), c])));
        setCircles(uniq);

        if (!preselectCircleIds.length && (initialCircleId || uniq[0]?.id)) {
          setPreselectCircleIds([String(initialCircleId || uniq[0]?.id)]);
        }
      } catch(e){
        console.log('load circles error', e);
        Alert.alert('Cercles', 'Impossible de récupérer vos cercles.');
      } finally {
        setLoading(false);
      }
    })();
  }, [initialCircleId]);

  // pick image (no manipulator)
  const askImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Images', 'Autorise l’accès aux photos pour ajouter une image.'); return; }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // recadrage UI 1:1
        quality: 0.9,
      });
      if (res.canceled) return;

      const asset = res.assets?.[0];
      if (!asset?.uri) return;
      setImageUri(asset.uri);
    } catch (e) {
      console.log('image pick error', e);
      Alert.alert('Image', 'Impossible de sélectionner une image.');
    }
  }, []);

  // upload to Supabase Storage (bucket: items)
  const uploadImageIfNeeded = useCallback(async () => {
    if (!imageUri || imageUri.startsWith('http')) return imageUri; // déjà stockée
    try {
      setUploading(true);
      const resp = await fetch(imageUri);
      const blob = await resp.blob();
      const ext = 'jpg';
      const filePath = `items/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: upErr } = await supabase.storage.from('items').upload(filePath, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'image/jpeg',
      });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from('items').getPublicUrl(filePath);
      const publicUrl = data?.publicUrl || '';
      if (!publicUrl) throw new Error('publicUrl vide');
      return publicUrl;
    } catch (e) {
      console.log('upload image error', e);
      Alert.alert('Image', 'Upload impossible.');
      return null;
    } finally {
      setUploading(false);
    }
  }, [imageUri]);

  const returnToCircle = () => {
    if (navigation.canGoBack()) return navigation.goBack();
    const parent = navigation.getParent?.();
    if (parent?.navigate) return parent.navigate('Circle');
    return navigation.navigate('Circle');
  };

  const validateBase = () => {
    if (!title.trim()) { Alert.alert('Titre requis', 'Ajoute un titre.'); return false; }
    if (!CATEGORIES.find(c => c.key === category)) { Alert.alert('Catégorie', 'Choisis une catégorie.'); return false; }
    if (!simpleFree && !finalPriceCents) { Alert.alert('Prix', 'Indique un prix ou coche “Gratuit”.'); return false; }
    return true;
  };

  const openPublishModal = () => {
    if (!validateBase()) return;
    const preset = selectedCircleIds.length ? selectedCircleIds : preselectCircleIds;
    setSelectedCircleIds(preset);
    setPublishOpen(true);
  };

  const submit = useCallback(async () => {
    try {
      if (!validateBase()) return;
      if (!selectedCircleIds.length && !editItem?.id) { Alert.alert('Cercles', 'Sélectionne au moins un cercle.'); return; }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Auth','Connecte-toi d’abord.'); return; }

      const photoUrl = await uploadImageIfNeeded();
      if (imageUri && !photoUrl && !imageUri.startsWith('http')) return; // upload échoué

      const payloadCommon = {
        title: title.trim(),
        description: desc?.trim() || null,
        category,
        price_cents: finalPriceCents,
        price_unit: billingUnit,           // day | week | month
        max_days: maxDays ? parseInt(maxDays, 10) : null,
        photo: photoUrl || (imageUri?.startsWith('http') ? imageUri : null),
        // owner_id obligatoire + RLS
        owner_id: user.id,
      };

      if (editItem?.id) {
        const { error } = await supabase.from('items').update({
          ...payloadCommon,
          owner_id: undefined, // ne pas écraser l’owner
        }).eq('id', editItem.id);
        if (error) throw error;
        setPublishOpen(false);
        Alert.alert('Modifié', 'Annonce mise à jour.');
        returnToCircle();
        return;
      }

      // Nouveau : 1 ligne par cercle
      const rows = selectedCircleIds.map(cid => ({ ...payloadCommon, circle_id: cid }));
      const { error } = await supabase.from('items').insert(rows);
      if (error) throw error;

      setPublishOpen(false);
      Alert.alert('Publié', `Annonce publiée dans ${selectedCircleIds.length} cercle(s).`);
      returnToCircle();
    } catch (e) {
      console.log('submit item error', e);
      Alert.alert('Erreur', 'Impossible de publier.');
    }
  }, [
    title, desc, category, finalPriceCents, billingUnit, maxDays,
    selectedCircleIds, imageUri, uploadImageIfNeeded, editItem?.id
  ]);

  if (loading) {
    return <View style={{ flex:1, backgroundColor: colors.bg, alignItems:'center', justifyContent:'center' }}>
      <ActivityIndicator />
    </View>;
  }

  const multipleCircles = (circles?.length || 0) > 1;

  return (
    <KeyboardAvoidingView style={{ flex:1, backgroundColor: colors.bg }} behavior={Platform.OS==='ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding:16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>{editItem ? 'Modifier l’objet' : 'Ajouter un objet'}</Text>

        {/* Image carrée (optionnelle) */}
        <Text style={styles.label}>Image (recommandé)</Text>
        <TouchableOpacity onPress={askImage} style={styles.imagePicker} activeOpacity={0.9}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.imageSquare} resizeMode="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <MaterialCommunityIcons name="image-plus" size={28} color={colors.subtext} />
              <Text style={styles.imageHint}>Ajouter une image (format carré)</Text>
            </View>
          )}
          {uploading && (
            <View style={styles.imageUploading}>
              <ActivityIndicator />
              <Text style={styles.uploadingTxt}>Téléversement…</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Titre */}
        <Text style={styles.label}>Titre</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Ex: Perceuse, Coffre de toit, Abonnement Netflix…"
          placeholderTextColor={colors.subtext}
          style={styles.input}
        />

        {/* Catégorie (menu déroulant) */}
        <Text style={styles.label}>Catégorie</Text>
        <TouchableOpacity onPress={()=>setCatOpen(true)} style={styles.dropdownBtn} activeOpacity={0.9} accessibilityLabel="Choisir une catégorie">
          <View style={[styles.dot, { backgroundColor: CAT_BY_KEY[category]?.dot || '#9AA3B2' }]} />
          <Text style={styles.dropdownTxt} numberOfLines={1}>{labelCat(category)}</Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={colors.subtext} />
        </TouchableOpacity>

        {/* Description */}
        <Text style={styles.label}>Description</Text>
        <TextInput
          value={desc}
          onChangeText={setDesc}
          placeholder="Détails, état, conditions…"
          placeholderTextColor={colors.subtext}
          style={[styles.input, { height:110, textAlignVertical:'top' }]}
          multiline
        />

        {/* Tarifs */}
        <Text style={[styles.sectionTitle, { marginTop:16 }]}>Tarifs</Text>
        <View style={styles.card}>
          <View style={{ flexDirection:'row', alignItems:'center', marginBottom:10 }}>
            <TouchableOpacity
              onPress={()=>setSimpleFree(!simpleFree)}
              style={[styles.smallPill, simpleFree && styles.smallPillActive]}
              activeOpacity={0.9}
            >
              <Text style={[styles.smallPillTxt, simpleFree && styles.smallPillTxtActive]}>Gratuit</Text>
            </TouchableOpacity>
            {!simpleFree && (
              <View style={{ flex:1, marginLeft:10 }}>
                <Text style={styles.smallLabel}>Prix</Text>
                <TextInput
                  value={simplePrice}
                  onChangeText={setSimplePrice}
                  placeholder="ex. 10"
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.subtext}
                  style={styles.input}
                />
              </View>
            )}
          </View>

          <Text style={styles.smallLabelStrong}>Facturer par</Text>
          <View style={styles.pillsWrapRow}>
            {['day','week','month'].map(u => {
              const act = billingUnit === u;
              return (
                <TouchableOpacity
                  key={u}
                  onPress={()=>setBillingUnit(u)}
                  style={[styles.smallPill, act && styles.smallPillActive]}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.smallPillTxt, act && styles.smallPillTxtActive]}>{u==='day'?'Jour':u==='week'?'Sem.':'Mois'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.calcLine}>
            Prix final : <Text style={styles.calcStrong}>{euro(finalPriceCents)}</Text> {billingUnit==='day'?'/j':billingUnit==='week'?'/sem.':'/mois'}
          </Text>
        </View>

        {/* Options */}
        <Text style={styles.label}>Durée max (jours) — optionnel</Text>
        <TextInput
          value={maxDays}
          onChangeText={setMaxDays}
          placeholder="ex. 7"
          keyboardType="number-pad"
          placeholderTextColor={colors.subtext}
          style={styles.input}
        />

        {/* Sélecteur cercles : retiré du haut, on choisit à la fin */}
        {multipleCircles && (
          <Text style={[styles.subtle, { marginTop:8 }]}>Tu choisiras le(s) cercle(s) à la publication.</Text>
        )}

        {/* CTA Publier */}
        <TouchableOpacity onPress={openPublishModal} style={styles.submitBtn} activeOpacity={0.95}>
          <Text style={styles.submitTxt}>{editItem ? 'Enregistrer' : 'Publier'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* MODAL Catégories */}
      <Modal visible={catOpen} transparent animationType="fade" onRequestClose={()=>setCatOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={()=>setCatOpen(false)}>
          <View style={styles.dropdownSheet}>
            <Text style={styles.dropdownTitle}>Catégories</Text>
            {CATEGORIES.map(c => {
              const active = c.key === category;
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                  onPress={() => { setCategory(c.key); setCatOpen(false); }}
                  activeOpacity={0.8}
                  accessibilityLabel={`Choisir ${c.label}`}
                >
                  <View style={[styles.dot, { backgroundColor: c.dot }]} />
                  <Text style={[styles.dropdownItemTxt, active && styles.dropdownItemTxtActive]} numberOfLines={1}>{c.label}</Text>
                  {active && <MaterialCommunityIcons name="check" size={18} color={colors.mint} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* MODAL Publication multi-cercles */}
      <Modal visible={publishOpen} transparent animationType="fade" onRequestClose={()=>setPublishOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={()=>setPublishOpen(false)}>
          <View style={styles.publishSheet}>
            <Text style={styles.dropdownTitle}>Publier dans</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {circles.length ? circles.map(c => {
                const id = String(c.id);
                const checked = selectedCircleIds.includes(id);
                return (
                  <TouchableOpacity
                    key={id}
                    style={[styles.circleRow, checked && styles.circleRowActive]}
                    onPress={() => {
                      setSelectedCircleIds(prev => checked ? prev.filter(x => x !== id) : [...prev, id]);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.checkbox, checked && styles.checkboxActive]}>
                      {checked && <MaterialCommunityIcons name="check-bold" size={14} color={colors.bg} />}
                    </View>
                    <Text style={styles.circleName} numberOfLines={1}>{c.name}</Text>
                  </TouchableOpacity>
                );
              }) : (
                <Text style={styles.emptyModal}>Aucun cercle trouvé.</Text>
              )}
            </ScrollView>

            <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:12 }}>
              <TouchableOpacity
                onPress={() => setSelectedCircleIds(circles.map(c => String(c.id)))}
                style={styles.secondaryBtn}
                activeOpacity={0.9}
              >
                <Text style={styles.secondaryBtnTxt}>Tout sélectionner</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSelectedCircleIds([])}
                style={styles.secondaryBtn}
                activeOpacity={0.9}
              >
                <Text style={styles.secondaryBtnTxt}>Vider</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={submit} style={[styles.submitBtn, { marginTop:12 }]} activeOpacity={0.95}>
              <Text style={styles.submitTxt}>{editItem ? 'Enregistrer' : `Publier (${selectedCircleIds.length || preselectCircleIds.length || 0})`}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* styles */
const BTN_H = 40;
const IMAGE_SIDE = 220;

const styles = StyleSheet.create({
  h1:{ color: colors.text, fontWeight:'900', fontSize:20, marginBottom:10 },
  label:{ color: colors.subtext, marginTop:14, marginBottom:6 },
  subtle:{ color: colors.subtext, fontSize:12 },

  input:{ backgroundColor:'#151826', borderColor: colors.stroke, borderWidth:1, borderRadius:12, padding:12, color: colors.text },

  sectionTitle:{ color: colors.text, fontWeight:'800', fontSize:16 },

  // image
  imagePicker:{ alignSelf:'center', width: IMAGE_SIDE, height: IMAGE_SIDE, borderRadius:12, overflow:'hidden', borderWidth:1, borderColor: colors.stroke, marginBottom:6 },
  imageSquare:{ width:'100%', height:'100%' },
  imagePlaceholder:{ flex:1, alignItems:'center', justifyContent:'center', gap:6, backgroundColor:'#0f1725' },
  imageHint:{ color: colors.subtext, fontSize:12 },
  imageUploading:{ position:'absolute', left:0, right:0, top:0, bottom:0, backgroundColor:'rgba(0,0,0,0.35)', alignItems:'center', justifyContent:'center', gap:8 },
  uploadingTxt:{ color: colors.text },

  // small pills
  smallPill:{ height:BTN_H, paddingHorizontal:12, borderRadius:12, backgroundColor:'#121826', borderWidth:1, borderColor: colors.stroke, justifyContent:'center', marginRight:8, marginBottom:8 },
  smallPillActive:{ backgroundColor: colors.mint, borderColor: colors.mint },
  smallPillTxt:{ color: colors.text, fontWeight:'800' },
  smallPillTxtActive:{ color: colors.bg, fontWeight:'900' },

  pillsWrapRow:{ flexDirection:'row', flexWrap:'wrap' },
  smallLabel:{ color: colors.subtext, marginBottom:6 },
  smallLabelStrong:{ color: colors.text, fontWeight:'700', marginBottom:6 },

  card:{ backgroundColor:'#0f1725', borderColor: colors.stroke, borderWidth:1, borderRadius:12, padding:12, marginTop:10 },
  calcLine:{ color: colors.text, fontWeight:'900' },
  calcStrong:{ color: colors.mint },

  // dropdown catégorie
  dropdownBtn:{
    flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:10, height:42,
    borderWidth:1, borderColor: colors.stroke, borderRadius:12, backgroundColor:'#151826'
  },
  dropdownTxt:{ color: colors.text, fontWeight:'700', flex:1 },
  dot:{ width:10, height:10, borderRadius:5 },

  // modal overlay
  modalOverlay:{ flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'flex-end' },
  dropdownSheet:{ backgroundColor: colors.bg, padding:14, borderTopLeftRadius:16, borderTopRightRadius:16, gap:6 },
  dropdownTitle:{ color: colors.text, fontWeight:'900', marginBottom:6 },

  dropdownItem:{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:10, paddingHorizontal:6, borderRadius:10 },
  dropdownItemActive:{ backgroundColor:'rgba(255,255,255,0.06)' },
  dropdownItemTxt:{ color: colors.text, fontWeight:'700', flex:1 },
  dropdownItemTxtActive:{ color: colors.mint },

  // modal publish
  publishSheet:{ backgroundColor: colors.bg, padding:14, borderTopLeftRadius:16, borderTopRightRadius:16 },
  circleRow:{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:10, paddingHorizontal:6, borderRadius:10 },
  circleRowActive:{ backgroundColor:'rgba(255,255,255,0.06)' },
  circleName:{ color: colors.text, fontWeight:'700', flex:1 },

  checkbox:{ width:22, height:22, borderRadius:6, borderWidth:1, borderColor: colors.stroke, alignItems:'center', justifyContent:'center', backgroundColor:'transparent' },
  checkboxActive:{ backgroundColor: colors.mint, borderColor: colors.mint },

  submitBtn:{ marginTop:20, backgroundColor: colors.mint, padding:14, borderRadius:14, alignItems:'center' },
  submitTxt:{ color: colors.bg, fontWeight:'900' },

  secondaryBtn:{ borderWidth:1, borderColor: colors.stroke, paddingVertical:10, paddingHorizontal:14, borderRadius:12 },
  secondaryBtnTxt:{ color: colors.text },

  emptyModal:{ color: colors.subtext, textAlign:'center', paddingVertical:12 },
});
