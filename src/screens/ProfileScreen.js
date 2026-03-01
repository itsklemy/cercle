import React, {
  useEffect, useMemo, useState, useCallback,
} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, TextInput, Platform, ScrollView,
  Switch, Linking, LayoutAnimation, UIManager, Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CommonActions } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { colors as themeColors } from '../theme/colors';
import { supabase, hasSupabaseConfig } from '../lib/supabase';

if (Platform.OS === 'android' && UIManager?.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ─── Theme ─── */
const C = themeColors || {};
const colors = {
  bg:      C.bg      ?? '#0B0E14',
  text:    C.text    ?? '#F3F4F6',
  subtext: C.subtext ?? '#9AA3B2',
  mint:    C.mint    ?? '#1DFFC2',
  card:    C.card    ?? 'rgba(255,255,255,0.04)',
  stroke:  C.stroke  ?? 'rgba(255,255,255,0.10)',
  danger:  C.danger  ?? '#ff6b6b',
};

const ARCHIVE_KEY   = 'cercle_archived_reservation_ids_v1';
const DONE_STATUSES = ['returned', 'done', 'canceled', 'refused', 'rejected'];
const PROJECT_ID    =
  Constants.expoConfig?.extra?.eas?.projectId
  ?? Constants.expoConfig?.extra?.projectId
  ?? Constants.easConfig?.projectId
  ?? '4de9ab1e-5c50-4931-b7a7-8c47a38d9f10';

/* ─── Helpers ─── */
function fDate(iso) {
  try {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}
function timeLeft(end, now = new Date()) {
  const ms = Math.max(0, new Date(end) - now);
  const mins = Math.round(ms / 60000);
  if (mins <= 0) return '0 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} j`;
}
function fCallStatus(s) {
  return { pending: 'envoyée', open: 'ouverte', matched: 'match ✓', closed: 'fermée', canceled: 'annulée' }[s] || s || '—';
}
function fResStatus(s) {
  return { pending: 'en attente', accepted: 'acceptée', refused: 'refusée',
    rejected: 'refusée', returned: 'rendu', canceled: 'annulée', done: 'terminée' }[s] || s || '—';
}

/* ─── Navigation helper ─── */
function useSmartNav(navigation) {
  return useCallback((routeName, params) => {
    let nav = navigation;
    while (nav) {
      const names = nav.getState?.()?.routeNames;
      if (Array.isArray(names) && names.includes(routeName)) {
        nav.navigate(routeName, params); return;
      }
      nav = nav.getParent?.();
    }
    navigation.navigate(routeName, params);
  }, [navigation]);
}

/* ─── Accordéon ─── */
function Accordion({ title, icon, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => {
    try { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); } catch {}
    setOpen((v) => !v);
  };
  return (
    <View style={SS.acc}>
      <TouchableOpacity style={SS.accHead} onPress={toggle} activeOpacity={0.88}>
        <View style={SS.accIcon}>
          <MaterialCommunityIcons name={icon} size={15} color={colors.mint} />
        </View>
        <Text style={SS.accTitle}>{title}</Text>
        {!!badge && badge > 0 && (
          <View style={SS.accBadge}>
            <Text style={SS.accBadgeTxt}>{badge}</Text>
          </View>
        )}
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18} color={colors.subtext} style={{ marginLeft: 'auto' }}
        />
      </TouchableOpacity>
      {open && <View style={SS.accBody}>{children}</View>}
    </View>
  );
}

/* ═══════════════════════════════════════════
   SCREEN
═══════════════════════════════════════════ */
export default function ProfileScreen({ navigation }) {
  const navTo = useSmartNav(navigation);

  /* ── Profil ── */
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [me,            setMe]            = useState(null);
  const [profile,       setProfile]       = useState(null);
  const [notifEnabled,  setNotifEnabled]  = useState(false);
  const [notifToggling, setNotifToggling] = useState(false);

  /* ── Modale pseudo (accessible depuis header) ── */
  const [pseudoModal, setPseudoModal] = useState(false);
  const [pseudoDraft, setPseudoDraft] = useState('');

  /* ── Stats ── */
  const [circlesCount, setCirclesCount] = useState(0);
  const [itemsCount,   setItemsCount]   = useState(0);

  /* ── Réservations ── */
  const [pendingIn, setPendingIn] = useState([]);
  const [borrowing, setBorrowing] = useState([]);
  const [lending,   setLending]   = useState([]);
  const [history,   setHistory]   = useState([]);
  const [actingId,  setActingId]  = useState(null);

  /* ── Archive ── */
  const [archivedIds, setArchivedIds] = useState(() => new Set());

  /* ── Ondes ── */
  const [calls, setCalls] = useState([]);

  const goToAuth = useCallback(() => {
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Auth' }] }));
  }, [navigation]);

  /* ── Archive persistence ── */
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(ARCHIVE_KEY);
        setArchivedIds(new Set((raw ? JSON.parse(raw) : []).map(String)));
      } catch {}
    })();
  }, []);

  const persistArchive = useCallback(async (next) => {
    try { await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify([...next])); } catch {}
  }, []);

  const toggleArchive = useCallback((row) => {
    if (!DONE_STATUSES.includes(row.status)) return;
    const id = String(row.id);
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      persistArchive(next);
      return next;
    });
  }, [persistArchive]);

  /* ── Notif in-app ── */
  const sendNotif = useCallback(async (payload) => {
    try {
      await supabase.from('notifications').insert({
        ...payload, created_at: new Date().toISOString(), read: false,
      });
    } catch {}
  }, []);

  /* ── Load ── */
  const load = useCallback(async () => {
    if (!hasSupabaseConfig()) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: { user }, error: uErr } = await supabase.auth.getUser();
      if (uErr || !user) { goToAuth(); return; }
      setMe(user);

      const { data: prof } = await supabase
        .from('profiles').select('public_name, notifications_enabled, push_token')
        .eq('id', user.id).single();
      const safe = prof || {};
      setProfile(safe);
      setPseudoDraft((safe.public_name || '').toString());
      setNotifEnabled(typeof safe.notifications_enabled === 'boolean' ? safe.notifications_enabled : false);

      const [{ count: cc }, { count: ic }] = await Promise.all([
        supabase.from('circle_members').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('items').select('*', { count: 'exact', head: true }).eq('owner_id', user.id),
      ]);
      setCirclesCount(cc || 0);
      setItemsCount(ic || 0);

      let rows = [];
      try {
        const { data, error } = await supabase
          .from('reservations').select('*')
          .or(`borrower_id.eq.${user.id},owner_id.eq.${user.id}`)
          .order('created_at', { ascending: false });
        if (!error) rows = data || [];
      } catch {}
      if (!rows.length) {
        try {
          const { data } = await supabase
            .from('reservations').select('*')
            .or(`renter_id.eq.${user.id},owner_id.eq.${user.id}`)
            .order('created_at', { ascending: false });
          rows = data || [];
        } catch {}
      }

      // Enrich titles
      try {
        const ids = [...new Set(rows.map((r) => r.item_id).filter(Boolean).map(String))];
        if (ids.length) {
          const { data: items } = await supabase.from('items').select('id,title').in('id', ids);
          if (items?.length) {
            const map = new Map(items.map((it) => [String(it.id), it.title]));
            rows = rows.map((r) => ({
              ...r,
              item_title: (r.item_id ? map.get(String(r.item_id)) : null) || r.item_title || 'Objet',
            }));
          }
        }
      } catch {}

      rows = rows.map((r) => ({ ...r, borrower_id: r.borrower_id ?? r.renter_id ?? null }));

      const now = new Date();
      const uid = user.id;
      const snap = archivedIds;

      setPendingIn(rows.filter((r) => String(r.owner_id) === uid && r.status === 'pending'));
      setBorrowing(
        rows.filter((r) => String(r.borrower_id) === uid && r.status === 'accepted')
          .map((r) => ({
            ...r,
            overdue: r.end_at ? new Date(r.end_at) < now : false,
            remaining: r.end_at ? timeLeft(r.end_at, now) : '—',
          }))
          .sort((a, b) => (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1))
      );
      setLending(rows.filter((r) => String(r.owner_id) === uid && r.status === 'accepted'));
      setHistory(
        rows.filter((r) => DONE_STATUSES.includes(r.status) && !snap.has(String(r.id))).slice(0, 20)
      );

      const { data: myCalls } = await supabase
        .from('calls').select('id,message,status,created_at')
        .eq('author_id', user.id).order('created_at', { ascending: false }).limit(4);
      setCalls(myCalls || []);

    } catch (e) {
      console.log('[ProfileScreen] load error:', e?.message || e);
    } finally {
      setLoading(false);
    }
  }, [goToAuth, archivedIds]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    load();
    return unsub;
  }, [navigation, load]);

  /* ── Actions réservations ── */
  const accept = useCallback(async (row) => {
    setActingId(row.id);
    try {
      await supabase.from('reservations').update({ status: 'accepted' }).eq('id', row.id);
      if (row.item_id) {
        await supabase.from('reservations').update({ status: 'refused' })
          .eq('item_id', row.item_id).eq('status', 'pending').neq('id', row.id);
      }
      if (row.borrower_id) await sendNotif({
        user_id: row.borrower_id, type: 'reservation_accepted',
        title: 'Réservation acceptée',
        body: `Ta demande pour "${row.item_title}" a été acceptée.`,
        data: { reservation_id: row.id },
      });
      await load();
    } catch (e) { console.log('[accept]', e?.message); }
    finally { setActingId(null); }
  }, [load, sendNotif]);

  const refuse = useCallback(async (row) => {
    setActingId(row.id);
    try {
      await supabase.from('reservations').update({ status: 'refused' }).eq('id', row.id);
      if (row.borrower_id) await sendNotif({
        user_id: row.borrower_id, type: 'reservation_refused',
        title: 'Réservation refusée',
        body: `Ta demande pour "${row.item_title}" a été refusée.`,
        data: { reservation_id: row.id },
      });
      await load();
    } catch (e) { console.log('[refuse]', e?.message); }
    finally { setActingId(null); }
  }, [load, sendNotif]);

  /* ── Pseudo ── */
  const canSave = useMemo(() => {
    const clean = pseudoDraft.trim();
    return !!clean && clean.length >= 3 && clean !== (profile?.public_name || '');
  }, [pseudoDraft, profile?.public_name]);

  const savePseudo = useCallback(async () => {
    const clean = pseudoDraft.trim();
    if (!clean || clean.length < 3) { Alert.alert('Pseudo', 'Au moins 3 caractères.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('update_my_public_name', { p_name: clean });
      if (error) {
        const { error: e2 } = await supabase.from('profiles')
          .update({ public_name: clean }).eq('id', me.id);
        if (e2) throw e2;
      }
      setPseudoModal(false);
      await load();
    } catch (e) { Alert.alert('Pseudo', e?.message || 'Mise à jour impossible.'); }
    finally { setSaving(false); }
  }, [pseudoDraft, me?.id, load]);

  /* ── Notifications ── */
  const registerForPush = useCallback(async () => {
    let status = (await Notifications.getPermissionsAsync()).status;
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') {
      Alert.alert('Notifications', "Active les notifications dans les Réglages.", [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Réglages', onPress: () => Linking.openSettings() },
      ]);
      throw new Error('Permission refusée.');
    }
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default', importance: Notifications.AndroidImportance.MAX,
      });
    }
    const resp = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    if (!resp?.data) throw new Error('Token push indisponible.');
    return resp.data;
  }, []);

  const onToggleNotif = useCallback(async (next) => {
    if (notifToggling || !me?.id) return;
    setNotifToggling(true);
    try {
      if (next) {
        const token = await registerForPush();
        const { error } = await supabase.from('profiles')
          .update({ notifications_enabled: true, push_token: token }).eq('id', me.id);
        if (error && String(error.code) !== '42703') throw error;
        setNotifEnabled(true);
      } else {
        const { error } = await supabase.from('profiles')
          .update({ notifications_enabled: false, push_token: null }).eq('id', me.id);
        if (error && String(error.code) !== '42703') throw error;
        setNotifEnabled(false);
      }
    } catch (e) {
      setNotifEnabled(!next);
      Alert.alert('Notifications', e?.message || 'Erreur.');
    } finally { setNotifToggling(false); }
  }, [notifToggling, me?.id, registerForPush]);

  /* ── Compte ── */
  const signOut = useCallback(async () => {
    Alert.alert('Déconnexion', 'Confirmer ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Se déconnecter', style: 'destructive',
        onPress: async () => {
          try {
            if (hasSupabaseConfig()) await supabase.auth.signOut();
            goToAuth();
          } catch (e) { Alert.alert('Erreur', e.message); }
        },
      },
    ]);
  }, [goToAuth]);

  const deleteAccount = useCallback(() => {
    Alert.alert('Supprimer le compte', 'Action définitive. Confirmer ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          try {
            if (hasSupabaseConfig()) await supabase.auth.signOut();
            goToAuth();
          } catch (e) { Alert.alert('Erreur', e.message); }
        },
      },
    ]);
  }, [goToAuth]);

  /* ── Derived ── */
  const overdueCount = useMemo(() => borrowing.filter((r) => r.overdue).length, [borrowing]);
  const urgenceCount = pendingIn.length + overdueCount;
  const historyActive = useMemo(
    () => history.filter((r) => !archivedIds.has(String(r.id))),
    [history, archivedIds]
  );
  const archivedList = useMemo(
    () => history.filter((r) => archivedIds.has(String(r.id))),
    [history, archivedIds]
  );

  /* ── Loading ── */
  if (loading) {
    return (
      <SafeAreaView style={SS.safe} edges={['top', 'left', 'right']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.mint} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={SS.safe} edges={['top', 'left', 'right']}>

      {/* ════════════════════════════════
          HEADER FIXE — toujours visible
      ════════════════════════════════ */}
      <View style={SS.header}>

        {/* Identité */}
        <View style={SS.headerTop}>
          <View style={SS.avatar}>
            <MaterialCommunityIcons name="account-circle-outline" size={28} color={colors.mint} />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <TouchableOpacity
              onPress={() => setPseudoModal(true)}
              activeOpacity={0.8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
            >
              <Text style={SS.displayName} numberOfLines={1}>
                {profile?.public_name || 'Pseudo non défini'}
              </Text>
              <MaterialCommunityIcons name="pencil-outline" size={13} color={colors.subtext} />
            </TouchableOpacity>
            <Text style={SS.displayMeta} numberOfLines={1}>
              {(me?.id || '—').slice(0, 8)}…
            </Text>
          </View>

          {urgenceCount > 0 && (
            <View style={SS.urgenceDot}>
              <Text style={SS.urgenceDotTxt}>{urgenceCount}</Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={SS.statsRow}>
          <StatChip icon="account-group-outline" value={circlesCount} label="cercle"
            onPress={() => navTo('Circle')} />
          <StatChip icon="cube-outline" value={itemsCount} label="objet"
            onPress={() => navTo('Circle', { tab: 'mine' })} />
        </View>

        {/* Actions compte — toujours visibles */}
        <View style={SS.headerActions}>
          <View style={SS.notifRow}>
            <MaterialCommunityIcons name="bell-outline" size={15} color={colors.mint} />
            <Text style={SS.notifLabel}>Notifications</Text>
            {notifToggling
              ? <ActivityIndicator size="small" color={colors.mint} />
              : <Switch
                  value={notifEnabled}
                  onValueChange={onToggleNotif}
                  trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(29,255,194,0.4)' }}
                  thumbColor={notifEnabled ? colors.mint : colors.subtext}
                />
            }
          </View>

          <TouchableOpacity style={SS.signOutBtn} onPress={signOut} activeOpacity={0.88}>
            <MaterialCommunityIcons name="logout" size={15} color={colors.text} />
            <Text style={SS.signOutTxt}>Se déconnecter</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ════════════════════════════════
          ACTIVITÉ — scrollable
      ════════════════════════════════ */}
      <ScrollView
        contentContainerStyle={SS.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Urgences */}
        {(pendingIn.length > 0 || overdueCount > 0) && (
          <View style={SS.urgenceSection}>
            <View style={SS.sectionLabel}>
              <MaterialCommunityIcons name="alert-circle-outline" size={13} color={colors.danger} />
              <Text style={[SS.sectionLabelTxt, { color: colors.danger }]}>À traiter</Text>
            </View>

            {overdueCount > 0 && (
              <View style={[SS.resRow, SS.resRowDanger]}>
                <MaterialCommunityIcons name="clock-alert-outline" size={14} color={colors.danger} />
                <Text style={{ color: '#ff9a9a', fontWeight: '800', fontSize: 13, flex: 1 }}>
                  {overdueCount === 1 ? '1 objet en retard' : `${overdueCount} objets en retard`}
                </Text>
              </View>
            )}

            {pendingIn.map((r) => (
              <View key={r.id} style={SS.pendingCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <MaterialCommunityIcons name="account-clock-outline" size={13} color={colors.mint} />
                  <Text style={SS.pendingTitle} numberOfLines={1}>{r.item_title || 'Objet'}</Text>
                  <Text style={SS.pendingDate}>{fDate(r.start_at)}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[SS.actionBtn, SS.btnAccept, !!actingId && { opacity: 0.5 }]}
                    disabled={!!actingId} activeOpacity={0.88}
                    onPress={() => accept(r)}
                  >
                    {actingId === r.id
                      ? <ActivityIndicator size="small" color={colors.bg} />
                      : <><MaterialCommunityIcons name="check" size={14} color={colors.bg} />
                          <Text style={SS.btnTxt}>Accepter</Text></>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[SS.actionBtn, SS.btnRefuse, !!actingId && { opacity: 0.5 }]}
                    disabled={!!actingId} activeOpacity={0.88}
                    onPress={() => refuse(r)}
                  >
                    <MaterialCommunityIcons name="close" size={14} color={colors.text} />
                    <Text style={[SS.btnTxt, { color: colors.text }]}>Refuser</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* En cours */}
        {(borrowing.length > 0 || lending.length > 0) && (
          <Accordion icon="progress-clock" title="En cours"
            badge={borrowing.length + lending.length} defaultOpen>
            {borrowing.length > 0 && (
              <>
                <Text style={SS.subHead}>Mes emprunts</Text>
                {borrowing.map((r) => (
                  <ResRow key={r.id} title={r.item_title}
                    meta={`Jusqu'au ${fDate(r.end_at)}`}
                    badge={r.overdue ? 'en retard' : `reste ${r.remaining}`}
                    danger={r.overdue} />
                ))}
              </>
            )}
            {lending.length > 0 && (
              <>
                <Text style={[SS.subHead, borrowing.length > 0 && { marginTop: 10 }]}>Mes prêts</Text>
                {lending.map((r) => (
                  <ResRow key={r.id} title={r.item_title}
                    meta={`Dès ${fDate(r.start_at)}`} badge="en cours" />
                ))}
              </>
            )}
          </Accordion>
        )}

        {/* Historique */}
        {(historyActive.length > 0 || archivedList.length > 0) && (
          <Accordion icon="history" title="Historique"
            badge={historyActive.length + archivedList.length} defaultOpen={false}>
            {historyActive.length > 0 && (
              <>
                <Text style={SS.subHead}>Terminées</Text>
                {historyActive.map((r) => (
                  <ResRow key={r.id} title={r.item_title}
                    meta={fDate(r.created_at)} badge={fResStatus(r.status)}
                    archivable onArchive={() => toggleArchive(r)} />
                ))}
              </>
            )}
            {archivedList.length > 0 && (
              <>
                <Text style={[SS.subHead, { marginTop: 10 }]}>Archivées</Text>
                {archivedList.map((r) => (
                  <ResRow key={r.id} title={r.item_title}
                    meta={fDate(r.created_at)} badge={fResStatus(r.status)}
                    archived onArchive={() => toggleArchive(r)} />
                ))}
              </>
            )}
          </Accordion>
        )}

        {/* Ondes */}
        {calls.length > 0 && (
          <Accordion icon="broadcast" title="Mes ondes" badge={calls.length} defaultOpen={false}>
            {calls.map((c) => (
              <ResRow key={c.id} title={c.message || 'Onde'}
                meta={fDate(c.created_at)} badge={fCallStatus(c.status)} />
            ))}
            <TouchableOpacity style={SS.accCta}
              onPress={() => navTo('Circle', { tab: 'calls' })}>
              <Text style={SS.accCtaTxt}>Voir toutes les ondes</Text>
              <MaterialCommunityIcons name="arrow-right" size={13} color={colors.mint} />
            </TouchableOpacity>
          </Accordion>
        )}

        {/* À propos + suppression */}
        <View style={SS.about}>
          <Text style={SS.aboutTitle}>À propos</Text>
          <Text style={SS.aboutTxt}>
            Une <Text style={SS.bold}>onde</Text> est une recherche dans ton cercle.{'\n'}
            Cercle ne prend aucune responsabilité pour les objets prêtés.{'\n'}
            Support : <Text style={SS.bold}>orastudio.org@gmail.com</Text>
          </Text>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }}
            onPress={async () => {
              const url = 'https://stunning-pothos-07a3d3.netlify.app';
              const can = await Linking.canOpenURL(url);
              if (can) await Linking.openURL(url);
            }}
          >
            <MaterialCommunityIcons name="shield-lock-outline" size={14} color={colors.subtext} />
            <Text style={{ color: colors.subtext, fontWeight: '700', fontSize: 13 }}>Confidentialité</Text>
            <MaterialCommunityIcons name="open-in-new" size={12} color={colors.subtext} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={deleteAccount} style={SS.deleteBtn} activeOpacity={0.88}>
          <MaterialCommunityIcons name="account-remove-outline" size={15} color={colors.danger} />
          <Text style={{ color: colors.danger, fontWeight: '900' }}>Supprimer mon compte</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ════════════════════════════════
          MODALE PSEUDO
      ════════════════════════════════ */}
      <Modal
        visible={pseudoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setPseudoModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <TouchableOpacity
            style={SS.modalOverlay}
            activeOpacity={1}
            onPress={() => setPseudoModal(false)}
          >
            <TouchableOpacity activeOpacity={1} style={SS.modalCard} onPress={() => {}}>
              <Text style={SS.modalTitle}>Modifier le pseudo</Text>
              <Text style={SS.modalSub}>Visible par les autres membres du cercle.</Text>
              <TextInput
                value={pseudoDraft}
                onChangeText={setPseudoDraft}
                placeholder="ex: clem-annecy"
                placeholderTextColor={colors.subtext}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                maxLength={32}
                style={SS.modalInput}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  style={[SS.modalBtn, { flex: 1, borderColor: colors.stroke, backgroundColor: 'transparent' }]}
                  onPress={() => setPseudoModal(false)}
                  activeOpacity={0.88}
                >
                  <Text style={{ color: colors.text, fontWeight: '800' }}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[SS.modalBtn, { flex: 1, backgroundColor: colors.mint, borderColor: colors.mint },
                    (!canSave || saving) && { opacity: 0.45 }]}
                  onPress={savePseudo}
                  disabled={!canSave || saving}
                  activeOpacity={0.88}
                >
                  {saving
                    ? <ActivityIndicator color={colors.bg} size="small" />
                    : <Text style={{ color: colors.bg, fontWeight: '900' }}>Enregistrer</Text>
                  }
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

/* ─── SUB-COMPONENTS ─── */

function StatChip({ icon, value, label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={SS.statChip}>
      <MaterialCommunityIcons name={icon} size={12} color={colors.mint} />
      <Text style={SS.statVal}>{value}</Text>
      <Text style={SS.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ResRow({ title, meta, badge, danger, archivable, archived, onArchive }) {
  return (
    <View style={[SS.resRow, archived && { opacity: 0.5 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={SS.resTitle} numberOfLines={1}>{title}</Text>
        {!!meta && <Text style={SS.resMeta}>{meta}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        {!!badge && (
          <View style={[SS.resBadge, danger && SS.resBadgeDanger]}>
            <Text style={[SS.resBadgeTxt, danger && { color: '#ffb3b3' }]}>{badge}</Text>
          </View>
        )}
        {(archivable || archived) && !!onArchive && (
          <TouchableOpacity onPress={onArchive} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons
              name={archived ? 'archive-arrow-up-outline' : 'archive-outline'}
              size={13} color={colors.subtext}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/* ─── STYLES ─── */
const SS = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  /* ── Header fixe ── */
  header: {
    backgroundColor: '#0d1422',
    borderBottomWidth: 1,
    borderBottomColor: colors.stroke,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 10 },
  avatar: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(29,255,194,0.08)',
    borderWidth: 1, borderColor: 'rgba(29,255,194,0.20)',
    alignItems: 'center', justifyContent: 'center',
  },
  displayName: { color: colors.text, fontWeight: '900', fontSize: 16 },
  displayMeta: { color: colors.subtext, fontSize: 11, marginTop: 1 },
  urgenceDot: {
    backgroundColor: colors.danger, borderRadius: 999,
    minWidth: 22, height: 22, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  urgenceDotTxt: { color: '#fff', fontWeight: '900', fontSize: 11 },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(29,255,194,0.07)',
    borderWidth: 1, borderColor: 'rgba(29,255,194,0.18)',
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  statVal:   { color: colors.mint, fontWeight: '900', fontSize: 13 },
  statLabel: { color: colors.subtext, fontWeight: '700', fontSize: 12 },

  headerActions: { gap: 8 },
  notifRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: colors.stroke,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
  },
  notifLabel: { color: colors.text, fontWeight: '700', flex: 1, fontSize: 14 },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderWidth: 1, borderColor: colors.stroke,
    borderRadius: 12, paddingVertical: 10,
    backgroundColor: 'transparent',
  },
  signOutTxt: { color: colors.text, fontWeight: '800', fontSize: 14 },

  /* ── Scroll ── */
  scroll: { padding: 14, paddingTop: 12 },

  /* Urgences */
  urgenceSection: {
    borderWidth: 1, borderColor: 'rgba(255,107,107,0.28)',
    backgroundColor: 'rgba(255,107,107,0.04)',
    borderRadius: 16, padding: 12, marginBottom: 10,
  },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sectionLabelTxt: { fontWeight: '900', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 },

  pendingCard: {
    backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 11,
    borderWidth: 1, borderColor: colors.stroke, padding: 10, marginBottom: 7,
  },
  pendingTitle: { color: colors.text, fontWeight: '800', fontSize: 13, flex: 1 },
  pendingDate:  { color: colors.subtext, fontSize: 11 },

  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, borderRadius: 10, paddingVertical: 9, borderWidth: 1,
  },
  btnAccept: { backgroundColor: colors.mint, borderColor: 'rgba(29,255,194,0.25)' },
  btnRefuse: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.stroke },
  btnTxt:    { fontWeight: '900', color: colors.bg, fontSize: 13 },

  /* Accordéon */
  acc: {
    borderWidth: 1, borderColor: colors.stroke,
    backgroundColor: colors.card, borderRadius: 15,
    marginBottom: 10, overflow: 'hidden',
  },
  accHead: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 13, paddingVertical: 12,
  },
  accIcon: {
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: 'rgba(29,255,194,0.09)',
    borderWidth: 1, borderColor: 'rgba(29,255,194,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  accTitle:    { color: colors.text, fontWeight: '900', fontSize: 14 },
  accBadge:    { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  accBadgeTxt: { color: colors.subtext, fontWeight: '900', fontSize: 11 },
  accBody:     { paddingHorizontal: 13, paddingBottom: 13 },
  accCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 9, marginTop: 4,
    borderTopWidth: 1, borderTopColor: colors.stroke,
  },
  accCtaTxt: { color: colors.mint, fontWeight: '800', fontSize: 13 },

  subHead: {
    color: colors.subtext, fontWeight: '800', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 7,
  },

  /* Rows */
  resRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 10, borderWidth: 1, borderColor: colors.stroke, marginBottom: 6,
  },
  resRowDanger: { borderColor: 'rgba(255,107,107,0.25)', backgroundColor: 'rgba(255,107,107,0.07)' },
  resTitle:    { color: colors.text, fontWeight: '700', fontSize: 13 },
  resMeta:     { color: colors.subtext, fontSize: 11, marginTop: 2 },
  resBadge:    { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: colors.stroke },
  resBadgeTxt: { color: colors.subtext, fontWeight: '800', fontSize: 10 },
  resBadgeDanger: { backgroundColor: 'rgba(255,107,107,0.12)', borderColor: 'rgba(255,107,107,0.25)' },

  /* À propos */
  about: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.stroke,
    borderRadius: 14, padding: 14, marginBottom: 10,
  },
  aboutTitle: { color: colors.text, fontWeight: '900', marginBottom: 8 },
  aboutTxt:   { color: colors.subtext, lineHeight: 20, fontSize: 13 },
  bold:       { color: colors.text, fontWeight: '800' },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 13, paddingVertical: 13, marginBottom: 8,
    borderWidth: 1, borderColor: '#4a2124', backgroundColor: '#2b1416',
  },

  /* Modale pseudo */
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  modalCard: {
    width: '100%', maxWidth: 420,
    backgroundColor: '#111827',
    borderWidth: 1, borderColor: colors.stroke,
    borderRadius: 18, padding: 18,
  },
  modalTitle: { color: colors.text, fontWeight: '900', fontSize: 17, marginBottom: 4 },
  modalSub:   { color: colors.subtext, fontSize: 13, marginBottom: 14 },
  modalInput: {
    backgroundColor: 'rgba(255,255,255,0.06)', color: colors.text,
    borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.stroke, fontSize: 15,
  },
  modalBtn: {
    borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
});
