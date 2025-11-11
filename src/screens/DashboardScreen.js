// src/screens/DashboardScreen.js
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { supabase, hasSupabaseConfig } from '../lib/supabase';
import { useResponsive } from '../hooks/useResponsive';

export default function DashboardScreen({ navigation }){
  const { contentMax } = useResponsive();

  const [pendingCount, setPendingCount] = useState(0);
  const [itemsCount, setItemsCount] = useState(0);
  const [toReturn, setToReturn] = useState([]);
  const [toPickup, setToPickup] = useState([]);

  const [calls, setCalls] = useState([]);
  const [callsCount, setCallsCount] = useState(0);

  useEffect(()=>{
    const load = async ()=>{
      if (!hasSupabaseConfig()) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count: itemsOwned } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', user.id);
      setItemsCount(itemsOwned || 0);

      const { data: allRes } = await supabase
        .from('reservations')
        .select('id,item_id,item_title,owner_id,borrower_id,start_at,end_at,status')
        .or(`borrower_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order('start_at', { ascending:true });

      const pending = (allRes||[]).filter(r => r.status === 'pending').length;
      setPendingCount(pending);

      let namesMap = {};
      const { data: visibleNames } = await supabase.rpc?.('visible_member_names') || {};
      if (Array.isArray(visibleNames)) {
        for (const u of visibleNames) namesMap[u.id] = u.name || '—';
      }

      const now = new Date();

      const mineToReturn = (allRes||[])
        .filter(r => r.borrower_id === user.id && r.status === 'accepted')
        .map(r => {
          const end = new Date(r.end_at);
          return {
            id: r.id,
            item_title: r.item_title || 'Objet',
            other_name: namesMap[r.owner_id] || '—',
            start_at: r.start_at,
            end_at: r.end_at,
            overdue: end < now,
            remaining: timeLeftLabel(end, now),
          };
        })
        .sort((a,b)=> new Date(a.end_at) - new Date(b.end_at));
      setToReturn(mineToReturn);

      const mineToPickup = (allRes||[])
        .filter(r => r.owner_id === user.id && (r.status === 'accepted' || r.status === 'pending'))
        .map(r => {
          const start = new Date(r.start_at);
          return {
            id: r.id,
            item_title: r.item_title || 'Objet',
            other_name: namesMap[r.borrower_id] || '—',
            start_at: r.start_at,
            when: start > now ? startsInLabel(start, now) : 'en cours',
          };
        })
        .sort((a,b)=> new Date(a.start_at) - new Date(b.start_at));
      setToPickup(mineToPickup);

      try {
        const { data: myCalls, error: callsErr, count: cnt } = await supabase
          .from('calls')
          .select('id,message,status,created_at,needed_at', { count: 'exact' })
          .eq('author_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5);
        if (!callsErr) {
          setCalls(myCalls || []);
          setCallsCount(cnt || (myCalls?.length || 0));
        }
      } catch {}
    };

    const unsub = navigation.addListener('focus', load);
    load();
    return unsub;
  },[navigation]);

  const { ongoingCount, upcomingCount } = useMemo(()=>{
    const now = new Date();
    let ongoing = 0;
    let upcoming = 0;
    for (const r of toReturn) {
      const start = new Date(r.start_at);
      const end = new Date(r.end_at);
      if (start <= now && end >= now) ongoing++;
      else if (start > now) upcoming++;
    }
    return { ongoingCount: ongoing, upcomingCount: upcoming };
  },[toReturn]);

  const goto = (route, params) => { navigation.getParent()?.navigate(route, params); };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, contentMax && { alignItems:'center' }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.hero, contentMax && { width: contentMax }]}>
        <View style={styles.heroHeadRow}>
          <Text style={styles.kicker}>Prête. Emprunte. Partage.</Text>
          <MaterialCommunityIcons name="hand-heart" size={18} color={colors.bg} />
        </View>
        <Text style={styles.heroTitle}>Le bon plan, c’est ton cercle</Text>
        <Text style={styles.heroBody}>
          Crée ou rejoins un cercle de confiance.{'\n'}
          Partage ce que tu as, trouve ce qu’il te faut.{'\n'}
          Gratuit ou payant — réserve en 1 clic.
        </Text>

        <View style={styles.benefitsRow}>
          <MiniBadge icon="recycle-variant" label="Économies" />
          <MiniBadge icon="lightbulb-on-outline" label="Malin" />
          <MiniBadge icon="account-multiple-outline" label="Entre proches" />
        </View>

        <View style={styles.payWrap}>
          <Text style={styles.payTitle}>Paye comme tu veux</Text>
          <Text style={styles.paySub}>
            Choisis ton mode préféré, en toute transparence avec ton cercle.
          </Text>
          <View style={styles.payRow}>
            <Chip onPress={()=> Linking.openURL('https://lydia-app.com/')} icon="credit-card-outline" label="Lydia" />
            <Chip onPress={()=> Linking.openURL('https://www.tricount.com/')} icon="account-multiple-outline" label="Tricount" />
            <Chip onPress={()=> Linking.openURL('https://www.paypal.com/')} icon="shield-check" label="PayPal" />
          </View>
        </View>
      </View>

      <View style={[styles.gridWrap, contentMax && { width: contentMax }]}>
        <View style={styles.grid}>
          <CounterCard icon="broadcast" label="Ondes" value={callsCount} onPress={()=> {}} />
          <CounterCard icon="clipboard-text-clock-outline" label="En attente" value={pendingCount} onPress={()=> goto('MyReservations', { filter: 'pending' })} />
          <CounterCard icon="progress-clock" label="En cours" value={ongoingCount} onPress={()=> goto('MyReservations', { filter: 'ongoing' })} />
          <CounterCard icon="calendar-clock" label="À venir" value={upcomingCount} onPress={()=> goto('MyReservations', { filter: 'upcoming' })} />
        </View>
      </View>

      <View style={[styles.sectionWrap, contentMax && { width: contentMax }]}>
        <TouchableOpacity style={styles.banner} onPress={()=> goto('MyReservations')} activeOpacity={0.9}>
          <MaterialCommunityIcons name="clipboard-check-outline" size={20} color={colors.mint} />
          <Text style={styles.bannerTxt}>
            {pendingCount>0 ? `${pendingCount} réservation en cours` : 'Aucune réservation en cours'}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.subtext} />
        </TouchableOpacity>

        {!!calls?.length && (
          <>
            <Text style={styles.section}>Mes ondes</Text>
            {calls.map(c => (
              <View key={c.id} style={styles.rowCard}>
                <View style={{ flexDirection:'row', alignItems:'center' }}>
                  <MaterialCommunityIcons name="radio-tower" size={18} color={colors.mint} />
                  <Text style={styles.rowTitle} numberOfLines={1}>{'  '}{trimToOneLine(c.message || 'Onde')}</Text>
                </View>
                <Text style={styles.rowMeta}>
                  {formatCallStatus(c.status)} — {timeAgo(new Date(c.created_at))}
                  {c.needed_at ? ` · pour ${fmtDateTime(new Date(c.needed_at))}` : ''}
                </Text>
              </View>
            ))}
          </>
        )}

        <Text style={styles.section}>À rendre</Text>
        {toReturn.length === 0 ? (
          <Text style={styles.empty}>Rien à rendre pour l’instant.</Text>
        ) : (
          toReturn.map(item => (
            <View key={item.id} style={styles.rowCard}>
              <View style={{ flexDirection:'row', alignItems:'center' }}>
                <MaterialCommunityIcons name="package-variant-closed" size={18} color={colors.mint} />
                <Text style={styles.rowTitle} numberOfLines={1}>{'  '}{item.item_title}</Text>
              </View>
              <Text style={styles.rowMeta}>À rendre à <Text style={styles.bold}>{item.other_name}</Text></Text>
              <View style={styles.badges}>
                <Badge text={item.overdue ? 'en retard' : `reste ${item.remaining}`} tone={item.overdue ? 'danger' : 'mint'} />
                <Badge text={fmtDateRange(new Date(item.start_at), new Date(item.end_at))} />
              </View>
            </View>
          ))
        )}

        {toPickup.length > 0 && (
          <>
            <Text style={styles.section}>À récupérer / à donner</Text>
            {toPickup.slice(0,5).map(item => (
              <View key={item.id} style={styles.rowCard}>
                <View style={{ flexDirection:'row', alignItems:'center' }}>
                  <MaterialCommunityIcons name="handshake-outline" size={18} color={colors.mint} />
                  <Text style={styles.rowTitle} numberOfLines={1}>{'  '}{item.item_title}</Text>
                </View>
                <Text style={styles.rowMeta}>Avec <Text style={styles.bold}>{item.other_name}</Text></Text>
                <View style={styles.badges}>
                  <Badge text={item.when} tone="mint" />
                </View>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 24 }} />
      </View>
    </ScrollView>
  );
}

/* composants locaux */
function CounterCard({ icon, label, value, onPress }){
  return (
    <TouchableOpacity style={styles.counterCard} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.counterIconWrap}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.mint} />
      </View>
      <Text style={styles.counterValue}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </TouchableOpacity>
  );
}
function Chip({ icon, label, onPress }){
  return (
    <TouchableOpacity onPress={onPress} style={styles.chip} activeOpacity={0.9}>
      <MaterialCommunityIcons name={icon} size={14} color={colors.text} />
      <Text style={styles.chipTxt}>{label}</Text>
    </TouchableOpacity>
  );
}
function MiniBadge({ icon, label }){
  return (
    <View style={styles.miniBadge}>
      <MaterialCommunityIcons name={icon} size={12} color={colors.mint} />
      <Text style={styles.miniBadgeTxt}>{label}</Text>
    </View>
  );
}
function Badge({ text, tone }){
  let bg = '#151826', br = '#29314b', col = colors.subtext;
  if (tone === 'mint') { bg = '#10241c'; br = '#1f3b31'; col = colors.mint; }
  if (tone === 'danger') { bg = '#2b1416'; br = '#4a2124'; col = '#ff6b6b'; }
  return (
    <View style={[styles.badge,{ backgroundColor:bg, borderColor:br }]}>
      <Text style={[styles.badgeTxt,{ color:col }]}>{text}</Text>
    </View>
  );
}

/* utils */
function fmtDateRange(a,b){
  const f = (d)=> d.toLocaleString('fr-FR',{ day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  return `${f(a)} → ${f(b)}`;
}
function fmtDateTime(d){ return d.toLocaleString('fr-FR',{ day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); }
function timeLeftLabel(end, now=new Date()){
  const ms = Math.max(0, end - now); const mins = Math.round(ms/60000);
  if (mins <= 0) return '0 min';
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins/60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours/24);
  return `${days} j`;
}
function startsInLabel(start, now=new Date()){
  const ms = start - now;
  if (ms <= 0) return 'en cours';
  const mins = Math.round(ms/60000);
  if (mins < 60) return `dans ${mins} min`;
  const hours = Math.round(mins/60);
  if (hours < 24) return `dans ${hours} h`;
  const days = Math.round(hours/24);
  return `dans ${days} j`;
}
function timeAgo(date){
  const ms = Date.now() - date.getTime();
  if (ms < 60e3) return 'à l’instant';
  const mins = Math.floor(ms/60e3);
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins/60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours/24);
  return `il y a ${days} j`;
}
function trimToOneLine(s=''){
  const t = String(s).replace(/\s+/g,' ').trim();
  return t.length > 80 ? `${t.slice(0,77)}…` : t;
}
function formatCallStatus(s){
  if (!s) return 'envoyée';
  const map = { pending:'envoyée', open:'ouverte', matched:'match', closed:'fermée', canceled:'annulée' };
  return map[s] || s;
}

/* styles */
const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor: colors.bg },
  content:{ padding:16, paddingBottom: 12 },

  hero:{ backgroundColor:'#0f1627', borderWidth:1, borderColor:'#21314d', borderRadius:18, padding:16, marginBottom:14, overflow:'hidden' },
  heroHeadRow:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:6 },
  kicker:{ color: colors.bg, backgroundColor: colors.mint, fontWeight:'900', paddingVertical:4, paddingHorizontal:10, borderRadius:999, overflow:'hidden' },
  heroTitle:{ color: colors.text, fontWeight:'900', fontSize:18, marginTop:6 },
  heroBody:{ color: colors.subtext, lineHeight:20, marginTop:6 },

  benefitsRow:{ flexDirection:'row', flexWrap:'wrap', marginHorizontal:-6, marginTop:10 },
  miniBadge:{ flexDirection:'row', alignItems:'center', paddingVertical:6, paddingHorizontal:10, borderRadius:999, borderWidth:1, borderColor:'#1f2a42', backgroundColor:'#10192b', marginHorizontal:6, marginBottom:8 },
  miniBadgeTxt:{ color: colors.text, fontWeight:'800' },

  payWrap:{ marginTop:12, backgroundColor:'#0d1422', borderRadius:14, borderWidth:1, borderColor:'#1f2a42', padding:12 },
  payTitle:{ color: colors.text, fontWeight:'900' },
  paySub:{ color: colors.subtext, marginTop:4 },
  payRow:{ flexDirection:'row', flexWrap:'wrap', marginHorizontal:-6, marginTop:10 },
  chip:{ flexDirection:'row', alignItems:'center', paddingVertical:6, paddingHorizontal:10, borderRadius:999, borderWidth:1, borderColor: colors.stroke, backgroundColor:'#101726', marginHorizontal:6, marginBottom:8 },
  chipTxt:{ color: colors.text, fontWeight:'800' },

  gridWrap:{ marginTop:2, marginBottom:10 },
  grid:{ flexDirection:'row', flexWrap:'wrap', marginHorizontal:-6 },
  counterCard:{ width:'48%', marginHorizontal:6, marginBottom:12, backgroundColor:'#101726', borderColor: colors.stroke, borderWidth:1, borderRadius:14, paddingVertical:12, paddingHorizontal:12 },
  counterIconWrap:{ marginBottom:6, alignSelf:'flex-start' },
  counterValue:{ color: colors.text, fontWeight:'900', fontSize:20, lineHeight:22 },
  counterLabel:{ color: colors.subtext, fontWeight:'700', marginTop:2 },

  sectionWrap:{},
  banner:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:'#101726', borderColor: colors.stroke, borderWidth:1, borderRadius:12, padding:12, marginBottom:12 },
  bannerTxt:{ color: colors.text, fontWeight:'700', flex:1, marginHorizontal:8 },

  section:{ color: colors.text, fontWeight:'900', marginTop:6, marginBottom:8, fontSize:16 },

  rowCard:{ backgroundColor: colors.card, borderRadius:12, padding:12, marginBottom:8, borderWidth:1, borderColor: colors.stroke },
  rowTitle:{ color: colors.text, fontWeight:'800', flex:1 },
  rowMeta:{ color: colors.subtext, marginTop:2 },
  bold:{ color: colors.text, fontWeight:'800' },

  badges:{ flexDirection:'row', flexWrap:'wrap', marginHorizontal:-6, marginTop:8 },
  badge:{ paddingVertical:6, paddingHorizontal:10, borderRadius:999, borderWidth:1, marginHorizontal:6, marginBottom:8 },
  badgeTxt:{ fontWeight:'800' },

  empty:{ color: colors.subtext, textAlign:'center', marginTop:2 },
});
