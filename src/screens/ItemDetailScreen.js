// src/screens/ItemDetailScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { supabase } from '../lib/supabase';
import OffPlatformPayment from '../components/OffPlatformPayment';
import { useResponsive } from '../hooks/useResponsive';



export default async function ItemDetailScreen({ route, navigation }){
  const { isIPad, isTablet, columns, scale, horizontalRegular } = useResponsive();
const cardWidth = `calc(100% / ${columns})`;

  const initialItem = route?.params?.item || {};
  const [item, setItem] = useState(initialItem);

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');

  const [isOwner, setIsOwner] = useState(false);
  const [busyLabel, setBusyLabel] = useState(null);

  const [itemReservation, setItemReservation] = useState(null);
  

  // charge l'utilisateur courant, la réservation courante (si tu es concerné), et l'état "occupé"
  useEffect(() => {
    (async () => {
      try {
        if (!item?.id) return;

        // user courant
        const { data: { user } } = await supabase.auth.getUser();
        const me = user?.id || null;

        // propriétaire ?
        if (me && item?.owner_id) setIsOwner(String(item.owner_id) === String(me));

        // résa qui te concerne (accepted ou pending), la + récente
        if (me) {
          const { data, error } = await supabase
            .from('reservations')
            .select('*')
            .eq('item_id', item.id)
            .or(`owner_id.eq.${me},borrower_id.eq.${me}`)
            .in('status', ['accepted','pending'])
            .order('start_at', { ascending: false })
            .limit(1);

          if (error) throw error;
          const r = data?.[0] || null;
          setItemReservation(r);
          // si aucune résa trouvée, garde isOwner basé sur l'objet
          if (r && me) setIsOwner(r.owner_id === me);
        }

        // occupé ?
        const nowIso = new Date().toISOString();
        const { data: occ } = await supabase
          .from('reservations')
          .select('id,start_at,end_at,status')
          .eq('item_id', item.id)
          .eq('status','accepted')
          .lte('start_at', nowIso)
          .gte('end_at', nowIso)
          .limit(1);

        if (occ && occ.length) {
          const endAt = occ[0].end_at;
          const txt = `occupé (jusqu’au ${fmt(endAt)})`;
          setBusyLabel(txt);
        } else {
          setBusyLabel(null);
        }
      } catch (e) {
        console.log('ItemDetail init error', e);
      }
    })();
  }, [item?.id]);

  // Affichage du bloc paiement seulement si une résa acceptée te concerne
  const showPayment = !!(itemReservation && itemReservation.status === 'accepted');

  const fPrice = (cents)=> cents ? Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(cents/100) : 'Gratuit';

  const onAsk = async ()=>{
    try{
      if (!start || !end) return Alert.alert('Dates manquantes','Choisis début et fin (YYYY-MM-DD HH:mm)');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return Alert.alert('Non connecté','Connecte-toi.');

      const { error } = await supabase.from('reservations').insert([{
        circle_id: item.circle_id,
        item_id: item.id,
        borrower_id: user.id,
        owner_id: item.owner_id,
        start_at: start,
        end_at: end,
        status: 'pending',
        note,
        item_title: item.title,
        price_cents_snapshot: item.price_cents || null,
        price_unit_snapshot: item.price_unit || null,
        deposit_cents_snapshot: item.deposit_cents || null,
        fees_cents_snapshot: item.fees_cents || null,
        payment_status: 'unpaid',
        payment_mode: 'offplatform'
      }]);
      if (error) throw error;
      Alert.alert('Demande envoyée','Le propriétaire recevra ta demande.');
      navigation.navigate('Reservations');
    }catch(e){
      Alert.alert('Erreur', e.message || 'Impossible d’envoyer la demande.');
    }
  };

  const onDelete = async ()=>{
    Alert.alert('Supprimer','Supprimer définitivement cet objet ?',[
      { text:'Annuler', style:'cancel' },
      { text:'Supprimer', style:'destructive', onPress: async ()=>{
        const { error } = await supabase.from('items').delete().eq('id', item.id);
        if (error) return Alert.alert('Erreur', error.message);
        Alert.alert('Supprimé','Ton objet a été supprimé.');
        navigation.goBack();
      } }
    ]);
  };

  const onToggleAvailability = async ()=>{
    try{
      const { error } = await supabase.from('items').update({ available: !item.available }).eq('id', item.id);
      if (error) throw error;
      setItem(prev => ({ ...prev, available: !prev.available }));
    }catch(e){
      Alert.alert('Erreur', e.message || 'Impossible de mettre à jour la disponibilité.');
    }
  };
// récupérer la dispo
const { data } = await supabase
  .from('items')
  .select('*, item_availability!inner(is_available)')
  .eq('id', itemId)
  .maybeSingle();

const isAvailable = !!data?.item_availability?.is_available;

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>{item.title}</Text>
      <Text style={styles.meta}>
        {item.category}{item.subcategory ? ` • ${item.subcategory}` : ''} • par {item.owner_name||'—'}
      </Text>

      <View style={styles.row}>
        <Badge
          label={
            item.amicable
              ? 'À l’amiable'
              : (item.price_cents
                  ? `${fPrice(item.price_cents)}${item.price_unit ? unitLabel(item.price_unit) : ''}`
                  : 'Gratuit')
          }
        />
        {item.value_cents ? <Badge label={'Valeur '+fPrice(item.value_cents)} /> : null}
        <Badge label={busyLabel || (item.available ? 'dispo' : 'indispo')} />
      </View>

      {/* Paiement hors-plateforme (si résa acceptée) */}
      {showPayment && (
        <View style={{ marginBottom: 12 }}>
          <OffPlatformPayment reservation={itemReservation} isOwner={isOwner} />
        </View>
      )}

      {/* Formulaire de réservation si tu n'es pas le propriétaire */}
      {!isOwner && (
        <>
          <Text style={styles.section}>Réserver</Text>
          <Text style={styles.label}>Début</Text>
          <TextInput
            style={styles.input}
            value={start}
            onChangeText={setStart}
            placeholder="YYYY-MM-DD HH:mm"
            placeholderTextColor={colors.subtext}
          />
          <Text style={styles.label}>Fin</Text>
          <TextInput
            style={styles.input}
            value={end}
            onChangeText={setEnd}
            placeholder="YYYY-MM-DD HH:mm"
            placeholderTextColor={colors.subtext}
          />
          <Text style={styles.label}>Message (facultatif)</Text>
          <TextInput
            style={[styles.input,{ height:90, textAlignVertical:'top' }]}
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="Infos utiles…"
            placeholderTextColor={colors.subtext}
          />
          <TouchableOpacity onPress={onAsk} style={styles.cta}>
            <Text style={styles.ctaTxt}>Envoyer la demande</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Actions propriétaire */}
      {isOwner && (
        <>
          <Text style={styles.section}>Propriétaire</Text>
          <View style={{ flexDirection:'row', gap:8, flexWrap:'wrap' }}>
            <TouchableOpacity
              onPress={()=>navigation.navigate('AddItem', { circleId: item.circle_id, edit:item })}
              style={[styles.btn, styles.btnOk]}
            >
              <Text style={styles.btnTxtOk}>Modifier</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} style={[styles.btn, styles.btnDanger]}>
              <Text style={styles.btnTxtDanger}>Supprimer</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onToggleAvailability} style={[styles.btn]}>
              <Text style={styles.btnTxt}>{item.available ? 'Rendre indispo' : 'Rendre dispo'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

/* -------------------- utils locaux -------------------- */
function unitLabel(u){
  if (u==='day') return '/j';
  if (u==='week') return '/sem.';
  if (u==='month') return '/mois';
  return '';
}
function Badge({ label }){ return <View style={styles.badge}><Text style={styles.badgeTxt}>{label}</Text></View>; }
function fmt(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString('fr-FR',{ day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  }catch{return iso;}
}

/* --------------------------- styles --------------------------- */
const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor: colors.bg, padding:16 },
  h1:{ color: colors.text, fontSize:22, fontWeight:'800' },
  meta:{ color: colors.subtext, marginTop:6 },
  row:{ flexDirection:'row', gap:8, marginVertical:12, flexWrap:'wrap' },
  badge:{ backgroundColor:'#1b2a23', paddingHorizontal:10, paddingVertical:6, borderRadius:999 },
  badgeTxt:{ color: colors.mint, fontWeight:'700' },
  section:{ color: colors.text, fontWeight:'700', marginTop:8, marginBottom:8, fontSize:16 },
  label:{ color: colors.subtext, marginTop:12, marginBottom:6 },
  input:{ backgroundColor:'#151826', borderColor: colors.stroke, borderWidth:1, borderRadius:12, padding:12, color: colors.text },
  cta:{ marginTop:20, backgroundColor: colors.mint, padding:16, borderRadius:16, alignItems:'center' },
  ctaTxt:{ color: colors.bg, fontWeight:'800', fontSize:16 },
  btn:{ paddingVertical:10, paddingHorizontal:12, borderRadius:12, borderWidth:1, borderColor: colors.stroke },
  btnOk:{ backgroundColor:'#10241c', borderColor:'#1f3b31' },
  btnDanger:{ backgroundColor:'#2b1416', borderColor:'#4a2124' },
  btnTxtOk:{ color: colors.mint, fontWeight:'800' },
  btnTxtDanger:{ color: '#ff6b6b', fontWeight:'800' },
  btnTxt:{ color: colors.text, fontWeight:'800' },
});
