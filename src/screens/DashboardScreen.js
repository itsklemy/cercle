import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { supabase, hasSupabaseConfig } from '../lib/supabase';

export default function DashboardScreen({ navigation }){
  const [circles, setCircles] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [schedule, setSchedule] = useState([]);
  const [itemsCount, setItemsCount] = useState(0);

  useEffect(()=>{
    const load = async ()=>{
      if (!hasSupabaseConfig()) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1) Mes cercles (owner OU membre)
      const { data: myCircles } = await supabase
        .from('circles')
        .select('*')
        .or(`owner_id.eq.${user.id},id.in.(select circle_id from circle_members where user_id.eq.${user.id})`)
        .order('created_at', { ascending: true });
      setCircles(myCircles || []);

      // 2) Compte d'objets que je possède
      const { count: itemsOwned } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', user.id);
      setItemsCount(itemsOwned || 0);

      // 3) Toutes mes réservations (où je suis propriétaire ou emprunteur)
      const { data: allRes } = await supabase
        .from('reservations')
        .select('id,item_id,item_title,owner_id,borrower_id,start_at,end_at,status')
        .or(`borrower_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order('start_at', { ascending:true });

      const pending = (allRes||[]).filter(r => r.status === 'pending').length;
      setPendingCount(pending);

      // 4) Échéancier = résa à venir ou en cours
      const now = new Date();
      const schedRaw = (allRes||[]).filter(r => new Date(r.end_at) >= now);

      // 5) Construire la liste des autres utilisateurs concernés
      const ids = new Set();
      for (const r of schedRaw) {
        const isOwner = r.owner_id === user.id;
        ids.add(isOwner ? r.borrower_id : r.owner_id);
      }
      const idList = Array.from(ids).filter(Boolean);

      // 6) Récupérer UNIQUEMENT les noms via la fonction visible_member_names()
      //    -> On récupère tous les noms visibles pour l'utilisateur courant,
      //       puis on filtre localement sur les IDs qui nous intéressent.
      let namesMap = {};
      if (idList.length){
        const { data: visibleNames, error } = await supabase.rpc('visible_member_names');
        if (!error && Array.isArray(visibleNames)) {
          // visibleNames: [{ id, name }]
          visibleNames
            .filter(u => idList.includes(u.id))
            .forEach(u => { namesMap[u.id] = u.name || '—'; });
        }
      }

      // 7) Mapper les réservations enrichies avec le nom de l'autre partie
      const mapped = (schedRaw||[]).map(r=>{
        const isOwner = r.owner_id === user.id;
        const otherId = isOwner ? r.borrower_id : r.owner_id;
        return {
          id: r.id,
          item_title: r.item_title || 'Objet',
          start_at: r.start_at,
          end_at: r.end_at,
          status: r.status, // pending | accepted | returned | refused
          role: isOwner ? 'owner' : 'borrower',
          other_id: otherId,
          other_name: namesMap[otherId] || '—',
        };
      });

      setSchedule(mapped);
    };

    const unsub = navigation.addListener('focus', load);
    load();
    return unsub;
  },[navigation]);

  // ---- Compteurs dérivés
  const { ongoingCount, upcomingCount } = useMemo(()=>{
    const now = new Date();
    let ongoing = 0;
    let upcoming = 0;
    for (const r of schedule) {
      const start = new Date(r.start_at);
      const end = new Date(r.end_at);
      if (start <= now && end >= now && r.status === 'accepted') ongoing++;
      else if (start > now && (r.status === 'accepted' || r.status === 'pending')) upcoming++;
    }
    return { ongoingCount: ongoing, upcomingCount: upcoming };
  },[schedule]);

  const scheduleSorted = useMemo(()=>{
    return [...schedule].sort((a,b)=> new Date(a.end_at) - new Date(b.end_at));
  },[schedule]);

  const circlesCount = circles.length;

  // Navigation vers le parent Stack
  const goto = (route, params) => {
    navigation.getParent()?.navigate(route, params);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Tableau de bord</Text>

      {/* Compteurs */}
      <View style={styles.countersGrid}>
        <CounterCard
          icon="clock-alert"
          label="En attente"
          value={pendingCount}
          onPress={()=> goto('MyReservations', { filter: 'pending' })}
        />
        <CounterCard
          icon="progress-clock"
          label="En cours"
          value={ongoingCount}
          onPress={()=> goto('MyReservations', { filter: 'ongoing' })}
        />
        <CounterCard
          icon="calendar-clock"
          label="À venir"
          value={upcomingCount}
          onPress={()=> goto('MyReservations', { filter: 'upcoming' })}
        />
        <CounterCard
          icon="archive-outline"
          label="Objets"
          value={itemsCount}
          onPress={()=> goto('MyItems')}
        />
        <CounterCard
          icon="account-group-outline"
          label="Cercles"
          value={circlesCount}
          onPress={()=> goto('Circles')}
        />
      </View>

      {/* Bannière raccourci */}
      <TouchableOpacity
        style={styles.banner}
        onPress={()=> goto('MyReservations')}
        hitSlop={{ top:8, bottom:8, left:8, right:8 }}
      >
        <MaterialCommunityIcons name="clipboard-text-clock-outline" size={20} color={colors.mint} />
        <Text style={styles.bannerTxt}>
          {pendingCount>0 ? `${pendingCount} demande(s) en attente` : 'Aucune demande en attente'}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.subtext} />
      </TouchableOpacity>

      {/* Cercles */}
      <Text style={styles.section}>Mes cercles</Text>
      <FlatList
        data={circles}
        keyExtractor={it=>String(it.id)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap:8, paddingBottom:4 }}
        renderItem={({item})=>(
          <TouchableOpacity
            onPress={()=> goto('Circle', { circleId: item.id })}
            style={styles.circleCard}
            hitSlop={{ top:8, bottom:8, left:8, right:8 }}
          >
            <MaterialCommunityIcons name="account-group-outline" size={18} color={colors.mint} />
            <Text style={styles.circleName} numberOfLines={1}>{item.name}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Aucun cercle pour l’instant.</Text>}
      />

      {/* Échéancier */}
      <Text style={styles.section}>Échéancier</Text>
      <FlatList
        data={scheduleSorted}
        keyExtractor={it=>String(it.id)}
        renderItem={({item})=>{
          const now = new Date();
          const start = new Date(item.start_at);
          const end = new Date(item.end_at);
          const isFuture = start > now;
          const isOngoing = start <= now && end >= now;
          const remaining = timeLeftLabel(end, now);

          const roleLabel = item.role === 'owner'
            ? `Prêté à ${item.other_name}`
            : `Emprunté à ${item.other_name}`;

          const statusLabel = item.status === 'pending'
            ? 'en attente'
            : (isOngoing ? 'en cours' : (isFuture ? 'à venir' : item.status));

          return (
            <View style={styles.rowCard}>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <MaterialCommunityIcons name={item.role==='owner'?'handshake-outline':'handshake'} size={18} color={colors.mint} />
                <Text style={styles.rowTitle}>{item.item_title}</Text>
              </View>
              <Text style={styles.rowMeta}>
                {roleLabel} • {fmtDateRange(start, end)}
              </Text>
              <View style={styles.badges}>
                <Badge text={statusLabel} />
                {item.status === 'accepted' && <Badge text={remaining} tone="mint" />}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Rien à l’agenda.</Text>}
        contentContainerStyle={{ paddingVertical:8 }}
      />
    </View>
  );
}

function CounterCard({ icon, label, value, onPress }){
  return (
    <TouchableOpacity style={styles.counterCard} onPress={onPress} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
      <View style={styles.counterIconWrap}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.mint} />
      </View>
      <Text style={styles.counterValue}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function Badge({ text, tone }){
  const bg = tone==='mint' ? '#10241c' : '#151826';
  const br = tone==='mint' ? '#1f3b31' : '#29314b';
  const col = tone==='mint' ? colors.mint : colors.subtext;
  return (
    <View style={[styles.badge,{ backgroundColor:bg, borderColor:br }]}>
      <Text style={[styles.badgeTxt,{ color:col }]}>{text}</Text>
    </View>
  );
}

function fmtDateRange(a,b){
  const f = (d)=> d.toLocaleString('fr-FR',{ day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  return `${f(a)} → ${f(b)}`;
}
function timeLeftLabel(end, now=new Date()){
  const ms = Math.max(0, end - now);
  const mins = Math.round(ms/60000);
  if (mins <= 0) return 'terminé';
  if (mins < 60) return `reste ${mins} min`;
  const hours = Math.round(mins/60);
  if (hours < 24) return `reste ${hours} h`;
  const days = Math.round(hours/24);
  if (days === 1) return 'reste 24 h';
  return `reste ${days} jours`;
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor: colors.bg, padding:16 },
  h1:{ color: colors.text, fontSize:22, fontWeight:'800', marginBottom:12 },

  countersGrid:{ flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:12 },
  counterCard:{ width:'31.5%', minWidth:110, backgroundColor:'#101726', borderColor: colors.stroke, borderWidth:1, borderRadius:12, paddingVertical:10, paddingHorizontal:12 },
  counterIconWrap:{ marginBottom:6, alignSelf:'flex-start' },
  counterValue:{ color: colors.text, fontWeight:'900', fontSize:18, lineHeight:22 },
  counterLabel:{ color: colors.subtext, fontWeight:'700', marginTop:2 },

  banner:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', gap:8, backgroundColor:'#101726', borderColor: colors.stroke, borderWidth:1, borderRadius:12, padding:12, marginBottom:10 },
  bannerTxt:{ color: colors.text, fontWeight:'700', flex:1 },

  section:{ color: colors.text, fontWeight:'800', marginTop:6, marginBottom:6 },

  circleCard:{ flexDirection:'row', alignItems:'center', gap:8, paddingVertical:10, paddingHorizontal:12, borderRadius:12, backgroundColor:'#151826', borderWidth:1, borderColor: colors.stroke, minWidth:140 },
  circleName:{ color: colors.text, fontWeight:'800', maxWidth:200 },

  rowCard:{ backgroundColor: colors.card, borderRadius:12, padding:12, marginBottom:8, borderWidth:1, borderColor: colors.stroke },
  rowTitle:{ color: colors.text, fontWeight:'800' },
  rowMeta:{ color: colors.subtext, marginTop:2 },
  badges:{ flexDirection:'row', gap:8, marginTop:8, flexWrap:'wrap' },
  badge:{ paddingVertical:6, paddingHorizontal:10, borderRadius:999, borderWidth:1 },
  badgeTxt:{ fontWeight:'800' },

  empty:{ color: colors.subtext, textAlign:'center', marginTop:8 },
});
