import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';
import { supabase, hasSupabaseConfig } from '../lib/supabase';

export default function MyReservationsScreen(){
  const [list, setList] = useState([]);

  useEffect(()=>{ load(); },[]);

  async function load(){
    if (!hasSupabaseConfig()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('reservations_view').select('*').or(`borrower_id.eq.${user.id},owner_id.eq.${user.id}`).order('created_at', { ascending: false });
    setList(data||[]);
  }

  const updateStatus = async (id, status)=>{
    await supabase.from('reservations').update({ status }).eq('id', id);
    await load();
  };

  const fPrice = (n)=> Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n);

  const renderItem = ({item}) => (
    <View style={styles.card}>
      <Text style={styles.title}>{item.item_title}</Text>
      <Text style={styles.meta}>{item.start_at} → {item.end_at} • propriétaire: {item.owner_name || '—'}</Text>
      <View style={styles.row}>
        <Badge label={item.status} />
        {item.price_per_day ? <Badge label={fPrice(item.price_per_day)+'/j'} /> : <Badge label="Gratuit" />}
      </View>
      <View style={styles.actions}>
        {item.status === 'pending' && (
          <>
            <TouchableOpacity onPress={()=>updateStatus(item.id,'accepted')} style={[styles.btn, styles.btnOk]}><Text style={styles.btnTxtOk}>Accepter</Text></TouchableOpacity>
            <TouchableOpacity onPress={()=>updateStatus(item.id,'refused')} style={[styles.btn, styles.btnDanger]}><Text style={styles.btnTxtDanger}>Refuser</Text></TouchableOpacity>
          </>
        )}
        {item.status === 'accepted' && (
          <TouchableOpacity onPress={()=>updateStatus(item.id,'returned')} style={[styles.btn, styles.btnOk]}><Text style={styles.btnTxtOk}>Marquer rendu</Text></TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Mes réservations</Text>
      <FlatList data={list} keyExtractor={(it)=>String(it.id)} renderItem={renderItem} contentContainerStyle={{ paddingVertical: 8 }} />
    </View>
  );
}

function Badge({ label }){ return <View style={styles.badge}><Text style={styles.badgeTxt}>{label}</Text></View>; }

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor: colors.bg, padding:16 },
  h1:{ color: colors.text, fontSize:22, fontWeight:'800', marginBottom:8 },
  card:{ backgroundColor: colors.card, borderColor: colors.stroke, borderWidth:1, padding:14, borderRadius:16, marginBottom:12 },
  title:{ color: colors.text, fontWeight:'700', fontSize:16 },
  meta:{ color: colors.subtext, marginTop:4 },
  row:{ flexDirection:'row', gap:8, marginTop:8, marginBottom:12 },
  badge:{ backgroundColor:'#1b2a23', paddingHorizontal:10, paddingVertical:6, borderRadius:999 },
  badgeTxt:{ color: colors.mint, fontWeight:'700' },
  actions:{ flexDirection:'row', gap:10 },
  btn:{ paddingVertical:10, paddingHorizontal:12, borderRadius:12, borderWidth:1 },
  btnOk:{ backgroundColor:'#10241c', borderColor:'#1f3b31' },
  btnDanger:{ backgroundColor:'#2b1416', borderColor:'#4a2124' },
  btnTxtOk:{ color: colors.success, fontWeight:'800' },
  btnTxtDanger:{ color: colors.danger, fontWeight:'800' }
});
