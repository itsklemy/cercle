import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert
} from 'react-native';
import { colors } from '../theme/colors';
import { supabase, hasSupabaseConfig } from '../lib/supabase';
import { useResponsive } from '../hooks/useResponsive';



export default function MyReservationsScreen(){
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);
const { isIPad, isTablet, columns, scale, horizontalRegular } = useResponsive();
const cardWidth = `calc(100% / ${columns})`;
  const fPrice = useCallback((n)=> Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n || 0), []);
  const fDate = useCallback((iso)=>{
    try {
      if (!iso) return '—';
      const d = new Date(iso);
      return d.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    } catch { return iso || '—'; }
  }, []);

  const load = useCallback(async ()=>{
    if (!hasSupabaseConfig()) { setList([]); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUserId(null); setList([]); return; }
    setUserId(user.id);

    // Récupère toutes mes réservations (où je suis propriétaire OU emprunteur)
    const { data, error } = await supabase
      .from('reservations_view')
      .select('*')
      .or(`borrower_id.eq.${user.id},owner_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Erreur', error.message || 'Chargement impossible');
      setList([]);
      return;
    }
    setList(data || []);
  }, []);

  useEffect(()=>{
    (async ()=>{
      setLoading(true);
      try { await load(); }
      finally { setLoading(false); }
    })();
  }, [load]);

  const onRefresh = useCallback(async ()=>{
    setRefreshing(true);
    try { await load(); }
    finally { setRefreshing(false); }
  }, [load]);

  // MAJ optimiste du statut avec rollback si erreur
  const updateStatus = async (id, status)=>{
    const idx = list.findIndex(r => r.id === id);
    if (idx < 0) return;

    const prev = list[idx];
    const next = { ...prev, status };
    const draft = [...list];
    draft[idx] = next;
    setList(draft);

    const { error } = await supabase.from('reservations').update({ status }).eq('id', id);
    if (error) {
      // rollback
      const rb = [...draft];
      rb[idx] = prev;
      setList(rb);
      Alert.alert('Erreur', error.message || 'Mise à jour impossible');
    }
  };

  const confirmUpdate = (id, status, title)=>{
    Alert.alert(
      title,
      'Confirmer cette action ?',
      [
        { text:'Annuler', style:'cancel' },
        { text:'Confirmer', style:'default', onPress:()=>updateStatus(id, status) }
      ]
    );
  };

  const renderItem = ({item}) => {
    const iAmOwner = userId && item.owner_id === userId;
    const iAmBorrower = userId && item.borrower_id === userId;

    return (
      <View style={styles.card}>
        <Text style={styles.title}>{item.item_title}</Text>

        <Text style={styles.meta}>
          {fDate(item.start_at)} → {fDate(item.end_at)}
          {item.owner_name ? ` • propriétaire : ${item.owner_name}` : ''}
        </Text>

        <View style={styles.row}>
          <Badge label={item.status} tone={
            item.status === 'accepted' ? 'ok' :
            item.status === 'pending' ? 'info' :
            item.status === 'returned' ? 'neutral' :
            item.status === 'refused' ? 'danger' : 'neutral'
          }/>
          {item.price_per_day
            ? <Badge label={`${fPrice(item.price_per_day)}/j`} tone="ok" />
            : <Badge label="Gratuit" tone="info" />}
          {iAmOwner && <Badge label="Moi : proprio" tone="neutral" />}
          {iAmBorrower && <Badge label="Moi : emprunteur" tone="neutral" />}
        </View>

        <View style={styles.actions}>
          {/* Le propriétaire décide */}
          {iAmOwner && item.status === 'pending' && (
            <>
              <TouchableOpacity
                onPress={()=>confirmUpdate(item.id, 'accepted', 'Accepter la demande ?')}
                style={[styles.btn, styles.btnOk]}
                activeOpacity={0.9}
              >
                <Text style={styles.btnTxtOk}>Accepter</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={()=>confirmUpdate(item.id, 'refused', 'Refuser la demande ?')}
                style={[styles.btn, styles.btnDanger]}
                activeOpacity={0.9}
              >
                <Text style={styles.btnTxtDanger}>Refuser</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Le propriétaire marque rendu */}
          {iAmOwner && item.status === 'accepted' && (
            <TouchableOpacity
              onPress={()=>confirmUpdate(item.id, 'returned', 'Marquer comme rendu ?')}
              style={[styles.btn, styles.btnOk]}
              activeOpacity={0.9}
            >
              <Text style={styles.btnTxtOk}>Marquer rendu</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const keyExtractor = useCallback((it)=>String(it.id), []);

  if (loading) {
    return (
      <View style={[styles.container, { alignItems:'center', justifyContent:'center' }]}>
        <ActivityIndicator size="small" color={colors.mint} />
      </View>
    );
  }

  const Empty = () => (
    <View style={{ paddingVertical: 24 }}>
      <Text style={{ color: colors.subtext, textAlign:'center' }}>Aucune réservation pour le moment.</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Mes réservations</Text>

      <FlatList
        data={list}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={Empty}
        contentContainerStyle={{ paddingVertical: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.mint}
          />
        }
      />
    </View>
  );
}

function Badge({ label, tone='neutral' }){
  const bg =
    tone === 'ok' ? '#10241c' :
    tone === 'danger' ? '#2b1416' :
    tone === 'info' ? '#0f1c2a' :
    '#1b2130';
  const fg =
    tone === 'ok' ? colors.success :
    tone === 'danger' ? colors.danger :
    tone === 'info' ? colors.mint :
    colors.subtext;

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeTxt, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor: colors.bg, padding:16 },
  h1:{ color: colors.text, fontSize:22, fontWeight:'800', marginBottom:8 },

  card:{ backgroundColor: colors.card, borderColor: colors.stroke, borderWidth:1, padding:14, borderRadius:16, marginBottom:12 },
  title:{ color: colors.text, fontWeight:'700', fontSize:16 },
  meta:{ color: colors.subtext, marginTop:4 },

  row:{ flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:8, marginBottom:12 },

  badge:{ paddingHorizontal:10, paddingVertical:6, borderRadius:999 },
  badgeTxt:{ fontWeight:'700' },

  actions:{ flexDirection:'row', gap:10 },

  btn:{ paddingVertical:10, paddingHorizontal:12, borderRadius:12, borderWidth:1 },
  btnOk:{ backgroundColor:'#10241c', borderColor:'#1f3b31' },
  btnDanger:{ backgroundColor:'#2b1416', borderColor:'#4a2124' },

  btnTxtOk:{ color: colors.success, fontWeight:'800' },
  btnTxtDanger:{ color: colors.danger, fontWeight:'800' }
});
