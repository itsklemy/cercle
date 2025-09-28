// src/screens/MembersScreen.js
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase, hasSupabaseConfig } from '../lib/supabase';

const TABS = [
  { key: 'members', label: 'Membres' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'invites',  label: 'Invitations' },
];

export default function MembersScreen({ route }){
  const defaultTab = route?.params?.tab && ['members','contacts','invites'].includes(route.params.tab)
    ? route.params.tab : 'members';

  const [active, setActive] = useState(defaultTab);
  const [members, setMembers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [invites, setInvites] = useState([]);

  // Form states (uniquement pour l’onglet CONTACTS)
  const [cName, setCName]   = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPhone, setCPhone] = useState('');

  useEffect(()=>{ load(); },[active]);

  async function load(){
    if (!hasSupabaseConfig()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (active === 'members') {
      // Vue membres liée propriétaire/cercle : adapte si tu filtres par cercle actif
      const { data } = await supabase.from('circle_members_view').select('*').eq('owner_id', user.id);
      setMembers(data || []);
    }
    if (active === 'contacts') {
      const { data } = await supabase.from('contacts').select('*').eq('owner_id', user.id).order('created_at',{ ascending:false });
      setContacts(data || []);
    }
    if (active === 'invites') {
      const { data } = await supabase.from('pending_invites').select('*').order('created_at',{ ascending:false });
      setInvites(data || []);
    }
  }

  // CONTACTS
  const addContact = async ()=>{
    if (!cName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Alert.alert('Non connecté','Connecte-toi.');
    const { error } = await supabase
      .from('contacts')
      .insert([{ owner_id: user.id, name: cName.trim(), email: cEmail||null, phone: cPhone||null }]);
    if (error) return Alert.alert('Erreur', error.message);
    setCName(''); setCEmail(''); setCPhone('');
    await load();
  };
  const removeContact = async (id)=>{
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) return Alert.alert('Erreur', error.message);
    await load();
  };

  // MEMBRES
  const removeMember = async (member_id)=>{
    const { error } = await supabase.from('circle_members').delete().eq('id', member_id);
    if (error) return Alert.alert('Erreur', error.message);
    await load();
  };

  // INVITATIONS (exemples d’actions)
  const revokeInvite = async (id)=>{
    const { error } = await supabase.from('invites').update({ status: 'revoked' }).eq('id', id);
    if (error) return Alert.alert('Erreur', error.message);
    await load();
  };
  const remindInvite = async (id)=>{
    // Ici tu pourrais envoyer une notif/SMS via backend ; pour l’instant on “log” une relance
    Alert.alert('Relance envoyée', 'Une relance a été envoyée à l’invité.');
  };

  // FAB contextuel (évite les champs en doublon dans plusieurs pages)
  const showFab = active !== 'members' ? true : false;
  const fabLabel = active === 'contacts' ? 'Ajouter un contact' : (active === 'invites' ? 'Inviter' : '');
  const onFab = async ()=>{
    if (active === 'contacts') addContact();
    if (active === 'invites') {
      // Exemple minimal: créer une invitation vide à compléter ailleurs,
      // ou naviguer vers un écran "Créer invitation" si tu en as un.
      Alert.alert('Invitation', 'Ouvre l’écran d’invitation pour saisir le téléphone/nom.');
      // navigation.navigate('CreateInvite')  // si tu crées cet écran
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Cercle — Relations</Text>

      {/* Onglets */}
      <View style={styles.tabs}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} onPress={()=>setActive(t.key)} style={[styles.tab, active===t.key && styles.tabActive]}>
            <Text style={[styles.tabTxt, active===t.key && styles.tabTxtActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Contenu par onglet */}
      {active === 'members' && (
        <FlatList
          data={members}
          keyExtractor={(it)=>String(it.member_id || it.id)}
          contentContainerStyle={{ paddingVertical: 12 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
                <MaterialCommunityIcons name="account" size={22} color={colors.text} />
                <View>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.role}>{item.email || '—'}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={()=>removeMember(item.member_id)} style={styles.remove}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.rose} />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Aucun membre pour l’instant.</Text>}
        />
      )}

      {active === 'contacts' && (
        <>
          {/* Formulaire contact (unique ici, plus dans d’autres pages) */}
          <Text style={styles.label}>Nouveau contact</Text>
          <View style={styles.row}>
            <TextInput value={cName} onChangeText={setCName} placeholder="Nom" placeholderTextColor={colors.subtext} style={[styles.input,{ flex:1 }]} />
          </View>
          <View style={styles.row}>
            <TextInput value={cEmail} onChangeText={setCEmail} placeholder="Email" autoCapitalize="none" keyboardType="email-address" placeholderTextColor={colors.subtext} style={[styles.input,{ flex:1 }]} />
            <TextInput value={cPhone} onChangeText={setCPhone} placeholder="Téléphone" keyboardType="phone-pad" placeholderTextColor={colors.subtext} style={[styles.input,{ flex:1 }]} />
          </View>

          <FlatList
            data={contacts}
            keyExtractor={(it)=>String(it.id)}
            contentContainerStyle={{ paddingVertical: 12 }}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
                  <MaterialCommunityIcons name="account" size={22} color={colors.text} />
                  <View>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.role}>{item.email || item.phone || 'contact'}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={()=>removeContact(item.id)} style={styles.remove}>
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.rose} />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.empty}>Aucun contact enregistré.</Text>}
          />
        </>
      )}

      {active === 'invites' && (
        <FlatList
          data={invites}
          keyExtractor={(it)=>String(it.id)}
          contentContainerStyle={{ paddingVertical: 12 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
                <MaterialCommunityIcons name="account-plus" size={22} color={colors.text} />
                <View>
                  <Text style={styles.name}>{item.name || 'Invité'}</Text>
                  <Text style={styles.role}>{item.phone}</Text>
                </View>
              </View>
              <View style={{ flexDirection:'row', gap:8 }}>
                <TouchableOpacity onPress={()=>remindInvite(item.id)} style={styles.smallBtn}>
                  <Text style={styles.smallBtnTxt}>Relancer</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>revokeInvite(item.id)} style={[styles.smallBtn, styles.smallBtnDanger]}>
                  <Text style={[styles.smallBtnTxt, { color: colors.rose }]}>Révoquer</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Aucune invitation en attente.</Text>}
        />
      )}

      {/* FAB contextuel (pas sur "Membres") */}
      {showFab && (
        <TouchableOpacity onPress={onFab} style={styles.fab}>
          <MaterialCommunityIcons name="plus" size={22} color={colors.bg} />
          <Text style={styles.fabTxt}>{fabLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor: colors.bg, padding:16 },
  h1:{ color: colors.text, fontSize:22, fontWeight:'800' },

  tabs:{ flexDirection:'row', gap:8, marginTop:10, marginBottom:8 },
  tab:{ paddingVertical:8, paddingHorizontal:12, borderRadius:12, borderWidth:1, borderColor: colors.stroke, backgroundColor:'#1b1f2e' },
  tabActive:{ backgroundColor: colors.card },
  tabTxt:{ color: colors.subtext, fontWeight:'700' },
  tabTxtActive:{ color: colors.text },

  label:{ color: colors.subtext, marginTop:12, marginBottom:6 },
  row:{ flexDirection:'row', alignItems:'center', gap:8 },
  input:{ backgroundColor: '#151826', borderColor: colors.stroke, borderWidth:1, borderRadius:12, padding:12, color: colors.text },

  card:{ backgroundColor: colors.card, borderColor: colors.stroke, borderWidth:1, borderRadius:16, padding:12, marginBottom:10, flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  name:{ color: colors.text, fontWeight:'700' },
  role:{ color: colors.subtext, fontSize:12 },
  remove:{ padding:8, borderRadius:10, backgroundColor:'#2a1d22' },

  smallBtn:{ paddingVertical:8, paddingHorizontal:10, borderRadius:10, borderWidth:1, borderColor: colors.stroke },
  smallBtnDanger:{ backgroundColor:'#2b1416', borderColor:'#4a2124' },
  smallBtnTxt:{ color: colors.text, fontWeight:'700' },

  empty:{ color: colors.subtext, padding:12, textAlign:'center' },

  fab:{ position:'absolute', bottom:20, left:16, right:16, backgroundColor: colors.mint, borderRadius:16, padding:14, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8 },
  fabTxt:{ color: colors.bg, fontWeight:'900' }
});
