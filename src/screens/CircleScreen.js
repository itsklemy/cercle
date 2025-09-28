// src/screens/CircleScreen.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Alert,
  PermissionsAndroid, Platform, TextInput, KeyboardAvoidingView
} from 'react-native';
import * as Contacts from 'expo-contacts';
import { useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { supabase, hasSupabaseConfig } from '../lib/supabase';

const CATEGORIES = [
  { key:'numerique',  label:'Numérique',       icon:'laptop' },
  { key:'abonnement', label:'Abonnements',     icon:'ticket-confirmation' },
  { key:'cuisine',    label:'Cuisine',         icon:'silverware-fork-knife' },
  { key:'brico',      label:'Travaux manuels', icon:'hand-saw' },
  { key:'musique',    label:'Musique',         icon:'music' },
  { key:'livres',     label:'Livres',          icon:'book-open-variant' },
  { key:'sport',      label:'Sport',           icon:'dumbbell' },
  { key:'vehicules',  label:'Véhicules',       icon:'car' },
  { key:'travaux',    label:'Travaux',         icon:'tools' },
  { key:'enfants',    label:'Enfants',         icon:'baby-carriage' },
  { key:'events',     label:'Événements',      icon:'party-popper' },
  { key:'it',         label:'Informatique',    icon:'monitor' },
];

export default function CircleScreen({ navigation }) {
  const route = useRoute();
  const wantedId = route?.params?.circleId || null;

  const [circles, setCircles] = useState([]);
  const [activeCircle, setActiveCircle] = useState(null);

  const [members, setMembers] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);

  const [contacts, setContacts] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [manageOpen, setManageOpen] = useState(false);
  const [circleOpen, setCircleOpen] = useState(false);
  const [circleEditOpen, setCircleEditOpen] = useState(false);
  const [isRename, setIsRename] = useState(false);
  const [circleName, setCircleName] = useState('');

  const [busyMap, setBusyMap] = useState({}); // { item_id: { untilIso, label } }

  useEffect(() => {
    (async () => {
      if (!hasSupabaseConfig()) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: my } = await supabase
        .from('circles')
        .select('*')
        .or(`owner_id.eq.${user.id},id.in.(select circle_id from circle_members where user_id.eq.${user.id})`)
        .order('created_at', { ascending: true });

      setCircles(my || []);

      // sélectionner le cercle voulu si fourni, sinon le premier
      if (wantedId && my?.length) {
        const found = my.find(c => String(c.id) === String(wantedId));
        setActiveCircle(found || my[0]);
      } else {
        setActiveCircle((my && my[0]) || null);
      }
    })();
    // wantedId en dépendance pour gérer un changement de paramètre
  }, [wantedId]);

  useEffect(() => { if (activeCircle) refreshCircle(); }, [activeCircle]);

  async function refreshCircle(){
    await Promise.all([loadMembers(), loadItems(), loadBusy()]);
  }

  async function loadMembers() {
    const { data } = await supabase
      .from('circle_members')
      .select('id,user_id,role,profiles!inner(name,email,phone)')
      .eq('circle_id', activeCircle.id)
      .order('created_at', { ascending: true });
    setMembers(
      (data || []).map(r => ({
        member_id: r.id,
        user_id: r.user_id,
        role: r.role,
        name: r.profiles?.name || '—',
        email: r.profiles?.email || '',
        phone: r.profiles?.phone || ''
      }))
    );
  }

  async function loadItems() {
    const { data } = await supabase
      .from('items')
      .select('*')
      .eq('circle_id', activeCircle.id)
      .order('created_at', { ascending: false });
    setItems(data || []);
  }

  // Repère les réservations "en cours" pour marquer les items comme occupés
  async function loadBusy() {
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from('reservations')
      .select('id,item_id,start_at,end_at,status')
      .eq('circle_id', activeCircle.id)
      .in('status', ['accepted'])
      .lte('start_at', nowIso)
      .gte('end_at', nowIso);
    const map = {};
    (data || []).forEach(r => {
      map[r.item_id] = { untilIso: r.end_at, label: `occupé (jusqu’au ${fmt(r.end_at)})` };
    });
    setBusyMap(map);
  }

  // contacts du téléphone
  async function requestContacts() {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CONTACTS);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) { Alert.alert('Permission requise','Autorise l’accès à tes contacts.'); return false; }
      return true;
    } else {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission requise','Autorise l’accès à tes contacts.'); return false; }
      return true;
    }
  }
  const openContactsPicker = async () => {
    const ok = await requestContacts(); if (!ok) return;
    await inviteContactToCircle({ circleId: activeCircle.id, name, email, phone });
    const { data } = await Contacts.getContactsAsync({ fields:[Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers] });
    const mapped = (data||[]).map(c => ({
      id: c.id,
      name: c.name || `${c.firstName||''} ${c.lastName||''}`.trim(),
      email: c.emails?.[0]?.email || null,
      phone: c.phoneNumbers?.[0]?.number || null
    })).filter(x=>x.name);
    setContacts(mapped);
    setPickerOpen(true);
  };
  const addMemberFromContact = async (contact) => {
    try {
      const { email, phone, name } = contact;
      let userId = null;
      if (email) {
        const { data: pe } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
        if (pe?.id) userId = pe.id;
      }
      if (!userId && phone) {
        const { data: pp } = await supabase.from('profiles').select('id').eq('phone', phone).maybeSingle();
        if (pp?.id) userId = pp.id;
      }
      if (userId) {
        const { error } = await supabase.from('circle_members').insert([{ circle_id: activeCircle.id, user_id: userId, role: 'member' }]);
        if (error && !String(error?.message).includes('duplicate')) throw error;
      } else {
        const { error } = await supabase.from('invites').insert([{ circle_id: activeCircle.id, phone: phone || '', name: name || null }]);
        if (error) throw error;
      }
    } catch (e) { console.log('addMemberFromContact error', e); }
  };
  const removeMember = async (member_id)=>{
    Alert.alert('Confirmer','Retirer ce membre ?',[
      { text:'Annuler', style:'cancel' },
      { text:'Retirer', style:'destructive', onPress: async ()=>{
        const { error } = await supabase.from('circle_members').delete().eq('id', member_id);
        if (error) return Alert.alert('Erreur', error.message);
        refreshCircle();
      } }
    ]);
  };

  // cercles : créer / renommer
  const openCreateCircle = ()=>{ setIsRename(false); setCircleName(''); setCircleEditOpen(true); };
  const openRenameCircle = ()=>{ setIsRename(true); setCircleName(activeCircle?.name||''); setCircleEditOpen(true); };

  const saveCircleName = async ()=>{
    const n = (circleName||'').trim(); if (!n) return;
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    if (isRename && activeCircle) {
      const { error } = await supabase.from('circles').update({ name:n }).eq('id', activeCircle.id);
      if (error) return Alert.alert('Erreur', error.message);
      setCircles(prev => prev.map(c=>c.id===activeCircle.id?{...c,name:n}:c));
      setActiveCircle({...activeCircle, name:n});
    } else {
      const { data, error } = await supabase.from('circles').insert([{ name:n, owner_id:user.id }]).select('*').single();
      if (error) return Alert.alert('Erreur', error.message);
      setCircles([...(circles||[]), data]); setActiveCircle(data);
    }
    setCircleEditOpen(false); setCircleOpen(false);
  };

  const filteredItems = useMemo(()=>{
    if (!selectedCat) return items;
    return items.filter(i => i.category === selectedCat);
  },[items, selectedCat]);

  return (
    <View style={styles.container}>

      {/* top actions */}
      <View style={styles.topRow}>
        <TouchableOpacity onPress={()=>setCircleOpen(true)} style={styles.circleBtn}>
          <MaterialCommunityIcons name="account-group-outline" size={20} color={colors.text} />
          <Text style={styles.circleTxt}>{activeCircle?.name || 'Mon cercle'}</Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={colors.subtext} />
        </TouchableOpacity>
        <View style={styles.actionsRow}>
          <TouchableOpacity onPress={()=>setManageOpen(true)} style={styles.iconBtn}>
            <MaterialCommunityIcons name="account-multiple" size={20} color={colors.text} />
            <Text style={styles.iconTxt}>Membres</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openContactsPicker} style={styles.iconBtn}>
            <MaterialCommunityIcons name="account-plus" size={20} color={colors.text} />
            <Text style={styles.iconTxt}>Ajouter</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* catégories visibles (2 colonnes, texte wrap) */}
      <Text style={styles.section}>Catégories</Text>
      <FlatList
        data={[{ key:'all', label:'Toutes', icon:'apps' }, ...CATEGORIES]}
        keyExtractor={it=>it.key}
        numColumns={2}
        columnWrapperStyle={{ gap:8 }}
        contentContainerStyle={{ gap:8, marginBottom:8 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={()=>setSelectedCat(item.key==='all'?null:item.key)}
            style={[
              styles.catCell,
              (selectedCat===item.key || (item.key==='all' && !selectedCat)) && styles.catCellActive
            ]}
          >
            <MaterialCommunityIcons name={item.icon} size={20} color={colors.mint} />
            <Text style={styles.catLabel} numberOfLines={2}>{item.label}</Text>
          </TouchableOpacity>
        )}
      />

      {/* objets */}
      <FlatList
        data={filteredItems}
        keyExtractor={it=>String(it.id)}
        renderItem={({item})=>{
          const busy = busyMap[item.id];
          return (
            <TouchableOpacity style={styles.itemCard} onPress={()=>navigation.navigate('ItemDetail',{ item })}>
              <MaterialCommunityIcons name="cube" size={22} color={colors.mint} />
              <View style={{ flex:1 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.meta}>{labelCat(item.category)} • {item.owner_name || '—'}</Text>
                <Text style={styles.meta2}>
                  {displayPrice(item)}
                  {item.max_days ? ` • max ${item.max_days} j` : ''}
                </Text>
              </View>
              <Text style={[styles.badge,{ color: busy ? colors.warning : colors.mint }]}>
                {busy ? busy.label : 'dispo'}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>
          Aucun objet {selectedCat ? `dans “${labelCat(selectedCat)}”` : ''}.
        </Text>}
        contentContainerStyle={{ paddingVertical:8 }}
      />

      {/* FAB */}
      <TouchableOpacity onPress={()=>navigation.navigate('AddItem', { circleId: activeCircle?.id })} style={styles.fab}>
        <MaterialCommunityIcons name="plus" size={20} color={colors.bg} />
        <Text style={styles.fabTxt}>Ajouter un objet</Text>
      </TouchableOpacity>

      {/* Modal membres */}
      <Modal visible={manageOpen} transparent animationType="slide" onRequestClose={()=>setManageOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Membres</Text>
              <TouchableOpacity onPress={()=>setManageOpen(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.subtext} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={members}
              keyExtractor={it=>String(it.member_id)}
              renderItem={({item})=>(
                <View style={styles.memberRow}>
                  <MaterialCommunityIcons name="account" size={20} color={colors.text} />
                  <View style={{ flex:1 }}>
                    <Text style={styles.mName}>{item.name}</Text>
                    <Text style={styles.mMeta}>{item.email || item.phone || '—'}</Text>
                  </View>
                  <TouchableOpacity onPress={()=>removeMember(item.member_id)} style={styles.removeBtn}>
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color="#ff6b6b" />
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.empty}>Personne pour l’instant.</Text>}
            />
          </View>
        </View>
      </Modal>

      {/* Modal cercles : liste + actions */}
      <Modal visible={circleOpen} transparent animationType="fade" onRequestClose={()=>setCircleOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Mes cercles</Text>
              <View style={{ flexDirection:'row', gap:8 }}>
                <TouchableOpacity onPress={openRenameCircle} style={styles.smallHeaderBtn}>
                  <MaterialCommunityIcons name="pencil" size={16} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity onPress={openCreateCircle} style={styles.smallHeaderBtn}>
                  <MaterialCommunityIcons name="plus-circle" size={16} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>setCircleOpen(false)}>
                  <MaterialCommunityIcons name="close" size={22} color={colors.subtext} />
                </TouchableOpacity>
              </View>
            </View>
            <FlatList
              data={circles}
              keyExtractor={it=>String(it.id)}
              renderItem={({item})=>(
                <TouchableOpacity
                  onPress={()=>{ setActiveCircle(item); setCircleOpen(false); }}
                  style={[styles.circleRow, activeCircle?.id===item.id && styles.circleRowActive]}
                >
                  <MaterialCommunityIcons name="checkbox-blank-circle" size={10} color={activeCircle?.id===item.id ? colors.mint : colors.subtext} />
                  <Text style={styles.circLabel}>{item.name}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.empty}>Aucun cercle. Crée le premier !</Text>}
            />
          </View>
        </View>
      </Modal>

      {/* Modal créer/renommer cercle */}
      <Modal visible={circleEditOpen} transparent animationType="slide" onRequestClose={()=>setCircleEditOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS==='ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{isRename ? 'Renommer le cercle' : 'Nouveau cercle'}</Text>
              <TouchableOpacity onPress={()=>setCircleEditOpen(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.subtext} />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Nom du cercle</Text>
            <TextInput value={circleName} onChangeText={setCircleName} placeholder="Ex: Famille, Colocs, Club..." placeholderTextColor={colors.subtext} style={styles.input} />
            <View style={{ flexDirection:'row', gap:8, marginTop:10 }}>
              <TouchableOpacity onPress={saveCircleName} style={[styles.btn, { flex:1 }]}>
                <Text style={styles.btnTxt}>{isRename ? 'Renommer' : 'Créer'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>setCircleEditOpen(false)} style={[styles.btnGhost, { flex:1 }]}>
                <Text style={styles.btnGhostTxt}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal contacts */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={()=>setPickerOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Depuis mes contacts</Text>
              <TouchableOpacity onPress={()=>setPickerOpen(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.subtext} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={contacts}
              keyExtractor={it=>String(it.id)}
              renderItem={({item})=>(
                <TouchableOpacity onPress={()=>{ addMemberFromContact(item); setPickerOpen(false); }} style={styles.contactRow}>
                  <MaterialCommunityIcons name="account-plus" size={18} color={colors.mint} />
                  <View style={{ flex:1 }}>
                    <Text style={styles.cName}>{item.name}</Text>
                    <Text style={styles.cMeta}>{item.phone || item.email || '—'}</Text>
                  </View>
                  <Text style={styles.cAdd}>Ajouter</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.empty}>Aucun contact lu.</Text>}
            />
          </View>
        </View>
      </Modal>

    </View>
  );
}

function labelCat(key){ const it = CATEGORIES.find(c=>c.key===key); return it ? it.label : 'Autre'; }
function fmt(iso){ try{ const d=new Date(iso); const dd=d.toLocaleString('fr-FR',{ day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); return dd; }catch{return iso;} }
function euro(n){ return Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n||0); }
function displayPrice(item){
  // nouveau schéma
  if (item?.price_cents && item?.price_unit) {
    const unit = item.price_unit==='day' ? '/j' : item.price_unit==='week' ? '/sem.' : '/mois';
    return `${euro(item.price_cents/100)}${unit}`;
  }
  // ancien schéma (fallback)
  if (item?.price_per_day_cents) return euro(item.price_per_day_cents/100);
  return 'Gratuit';
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor: colors.bg, padding:16 },
  topRow:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 },

  circleBtn:{ flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#1b1f2e', borderColor: colors.stroke, borderWidth:1, paddingVertical:8, paddingHorizontal:12, borderRadius:12, maxWidth:'60%' },
  circleTxt:{ color: colors.text, fontWeight:'800', flexShrink:1 },

  actionsRow:{ flexDirection:'row', gap:8 },
  iconBtn:{ flexDirection:'row', alignItems:'center', gap:6, paddingVertical:8, paddingHorizontal:12, borderRadius:12, backgroundColor:'#101726', borderColor: colors.stroke, borderWidth:1 },
  iconTxt:{ color: colors.text, fontWeight:'700' },

  section:{ color: colors.text, fontWeight:'800', marginBottom:6 },

  catCell:{ flex:1, flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#151826', borderColor: colors.stroke, borderWidth:1, paddingVertical:12, paddingHorizontal:12, borderRadius:12 },
  catCellActive:{ backgroundColor:'#0f192a', borderColor:'#2a3b57' },
  catLabel:{ color: colors.text, fontWeight:'700', flexShrink:1, flexWrap:'wrap' },

  itemCard:{ flexDirection:'row', alignItems:'center', backgroundColor: colors.card, borderColor: colors.stroke, borderWidth:1, borderRadius:14, padding:12, marginBottom:8, gap:12 },
  title:{ color: colors.text, fontWeight:'800' },
  meta:{ color: colors.subtext },
  meta2:{ color: colors.subtext },
  badge:{ fontWeight:'900' },
  empty:{ color: colors.subtext, textAlign:'center', paddingVertical:12 },

  fab:{ position:'absolute', bottom:20, left:16, right:16, backgroundColor: colors.mint, borderRadius:16, padding:14, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8 },
  fabTxt:{ color: colors.bg, fontWeight:'900' },

  modalWrap:{ flex:1, backgroundColor:'rgba(0,0,0,0.55)', justifyContent:'flex-end' },
  sheet:{ backgroundColor: colors.card, borderTopLeftRadius:18, borderTopRightRadius:18, padding:14, maxHeight:'75%', borderColor: colors.stroke, borderWidth:1 },
  sheetHeader:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:8 },
  sheetTitle:{ color: colors.text, fontWeight:'900', fontSize:16 },

  memberRow:{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#20263a' },
  mName:{ color: colors.text, fontWeight:'700' },
  mMeta:{ color: colors.subtext },
  removeBtn:{ padding:8, borderRadius:8, backgroundColor:'#2a1d22' },

  circleRow:{ flexDirection:'row', alignItems:'center', gap:8, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#20263a' },
  circleRowActive:{ backgroundColor:'#121a2b' },
  circLabel:{ color: colors.text, fontWeight:'700' },

  label:{ color: colors.subtext, marginTop:12, marginBottom:6 },
  input:{ backgroundColor:'#151826', borderColor: colors.stroke, borderWidth:1, borderRadius:12, padding:12, color: colors.text },
  btn:{ backgroundColor: colors.mint, padding:12, borderRadius:12, alignItems:'center' },
  btnTxt:{ color: colors.bg, fontWeight:'900' },
  btnGhost:{ padding:12, borderRadius:12, borderWidth:1, borderColor: colors.stroke, backgroundColor:'#0f1725' },
  btnGhostTxt:{ color: colors.text, fontWeight:'800' },

  contactRow:{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#20263a' },
  cName:{ color: colors.text, fontWeight:'700' },
  cMeta:{ color: colors.subtext },
  cAdd:{ color: colors.mint, fontWeight:'900' },

  smallHeaderBtn:{ padding:8, borderRadius:8, borderWidth:1, borderColor: colors.stroke, backgroundColor:'#141b2a' },
});
