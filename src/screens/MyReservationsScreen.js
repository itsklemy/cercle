import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors as themeColors } from "../theme/colors";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import { useResponsive } from "../hooks/useResponsive";
import AsyncStorage from "@react-native-async-storage/async-storage";

/* ─── Archive storage ─── */
const ARCHIVE_KEY = "cercle_archived_reservation_ids_v1";

/* ─── Theme ─── */
const C = themeColors || {};
const colors = {
  bg:      C.bg      ?? "#0B0E14",
  text:    C.text    ?? "#F3F4F6",
  subtext: C.subtext ?? "#9AA3B2",
  mint:    C.mint    ?? "#1DFFC2",
  card:    C.card    ?? "rgba(255,255,255,0.04)",
  stroke:  C.stroke  ?? "rgba(255,255,255,0.10)",
  success: C.success ?? "#36d399",
  danger:  C.danger  ?? "#ff6b6b",
};

/* ─── Filtres — 5 chips dans une seule row ─── */
const FILTERS = [
  { key: "all",      label: "Toutes",      icon: "format-list-bulleted"       },
  { key: "pending",  label: "En attente",  icon: "account-clock-outline"      },
  { key: "active",   label: "En cours",    icon: "progress-clock"             },
  { key: "done",     label: "Terminées",   icon: "check-circle-outline"       },
  { key: "archived", label: "Archivées",   icon: "archive-outline"            },
];

const DONE_STATUSES = ["returned", "done", "canceled", "refused", "rejected"];

/* ─── Helpers ─── */
function formatStatus(s) {
  return { pending: "en attente", accepted: "acceptée", refused: "refusée",
    rejected: "refusée", returned: "rendu", canceled: "annulée", done: "terminée" }[s] || s || "—";
}
function toneFromStatus(s) {
  if (s === "accepted") return "ok";
  if (s === "pending")  return "info";
  if (["refused", "rejected"].includes(s)) return "danger";
  return "neutral";
}
function fDate(iso) {
  try {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso || "—"; }
}
function fPrice(n) {
  return Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);
}

/* ═══════════════════════════════════════════
   SCREEN
═══════════════════════════════════════════ */
export default function MyReservationsScreen({ navigation, route }) {
  const { contentMax } = useResponsive?.() || {};
  const insets = useSafeAreaInsets();

  const [list,       setList]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterKey,  setFilterKey]  = useState(route?.params?.filter ?? "all");
  const [userId,     setUserId]     = useState(null);
  const [actingId,   setActingId]   = useState(null);
  const [archivedIds, setArchivedIds] = useState(() => new Set());

  /* ─── Archive persistence ─── */
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(ARCHIVE_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        setArchivedIds(new Set((arr || []).map(String)));
      } catch {}
    })();
  }, []);

  const persistArchived = useCallback(async (nextSet) => {
    try { await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(Array.from(nextSet))); } catch {}
  }, []);

  const toggleArchive = useCallback(async (row) => {
    if (!row?.id) return;
    const isDone = DONE_STATUSES.includes(row.status);
    if (!isDone) return; // silencieux — le bouton n'est de toute façon visible que si isDone
    const id = String(row.id);
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      persistArchived(next);
      return next;
    });
  }, [persistArchived]);

  /* ─── Normalize ─── */
  const normalizeRow = useCallback((r) => ({
    ...r,
    start_at:    r.start_at    ?? r.starts_at  ?? null,
    end_at:      r.end_at      ?? r.ends_at    ?? null,
    borrower_id: r.borrower_id ?? r.renter_id  ?? null,
    item_title:  r.item_title  ?? "Objet",
    price_per_day: r.price_per_day ?? null,
    status:      r.status      ?? "pending",
  }), []);

  /* ─── In-app notif (best-effort) ─── */
  const sendNotif = useCallback(async (payload) => {
    try {
      await supabase.from("notifications").insert({
        ...payload, created_at: new Date().toISOString(), read: false,
      });
    } catch {}
  }, []);

  /* ─── Load ─── */
  const load = useCallback(async () => {
    if (!hasSupabaseConfig?.()) { setList([]); return; }
    const { data: uData } = await supabase.auth.getUser();
    const user = uData?.user;
    if (!user) { setList([]); return; }
    setUserId(user.id);

    let rows = [];
    try {
      const { data, error } = await supabase
        .from("reservations").select("*")
        .or(`borrower_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order("created_at", { ascending: false });
      if (!error) rows = data || [];
    } catch {}

    // fallback renter_id
    if (!rows.length) {
      try {
        const { data, error } = await supabase
          .from("reservations").select("*")
          .or(`renter_id.eq.${user.id},owner_id.eq.${user.id}`)
          .order("created_at", { ascending: false });
        if (!error) rows = data || [];
      } catch {}
    }

    let normalized = rows.map(normalizeRow);

    // Enrich titles from items
    try {
      const ids = [...new Set(normalized.map((r) => r.item_id).filter(Boolean).map(String))];
      if (ids.length) {
        const { data: items } = await supabase
          .from("items").select("id,title,price_cents,price_unit").in("id", ids);
        if (items?.length) {
          const map = new Map(items.map((it) => [String(it.id), it]));
          normalized = normalized.map((r) => {
            const it = r.item_id ? map.get(String(r.item_id)) : null;
            return {
              ...r,
              item_title: it?.title || r.item_title,
              price_per_day: r.price_per_day
                ?? (it?.price_cents && it?.price_unit === "day" ? it.price_cents / 100 : null),
            };
          });
        }
      }
    } catch {}

    setList(normalized);
  }, [normalizeRow]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { await load(); } finally { setLoading(false); }
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  /* ─── Actions ─── */
  const acceptReservation = useCallback(async (row) => {
    if (!row?.id) return;
    setActingId(row.id);
    try {
      await supabase.from("reservations").update({ status: "accepted" }).eq("id", row.id);
      // Refuser les autres demandes sur le même objet
      if (row.item_id) {
        await supabase.from("reservations")
          .update({ status: "refused" })
          .eq("item_id", row.item_id).eq("status", "pending").neq("id", row.id);
      }
      if (row.borrower_id) {
        await sendNotif({
          user_id: row.borrower_id, type: "reservation_accepted",
          title: "Réservation acceptée",
          body: `Ta demande pour "${row.item_title}" a été acceptée.`,
          data: { reservation_id: row.id, item_id: row.item_id },
        });
      }
      await load();
    } catch (e) { console.log("[Reservations] accept error:", e?.message); }
    finally { setActingId(null); }
  }, [load, sendNotif]);

  const refuseReservation = useCallback(async (row) => {
    if (!row?.id) return;
    setActingId(row.id);
    try {
      await supabase.from("reservations").update({ status: "refused" }).eq("id", row.id);
      if (row.borrower_id) {
        await sendNotif({
          user_id: row.borrower_id, type: "reservation_refused",
          title: "Réservation refusée",
          body: `Ta demande pour "${row.item_title}" a été refusée.`,
          data: { reservation_id: row.id, item_id: row.item_id },
        });
      }
      await load();
    } catch (e) { console.log("[Reservations] refuse error:", e?.message); }
    finally { setActingId(null); }
  }, [load, sendNotif]);

  /* ─── Counts ─── */
  const counts = useMemo(() => {
    const now = new Date();
    return {
      all:      list.length,
      pending:  list.filter((r) => r.status === "pending").length,
      active:   list.filter((r) => {
        if (r.status !== "accepted") return false;
        const s = r.start_at ? new Date(r.start_at) : null;
        const e = r.end_at   ? new Date(r.end_at)   : null;
        return !s || !e || (s <= now && now <= e);
      }).length,
      done:     list.filter((r) => DONE_STATUSES.includes(r.status) && !archivedIds.has(String(r.id))).length,
      archived: archivedIds.size,
    };
  }, [list, archivedIds]);

  /* ─── Filtered list ─── */
  const filtered = useMemo(() => {
    const now = new Date();
    return list.filter((r) => {
      const archived = archivedIds.has(String(r.id));
      if (filterKey === "archived") return archived;
      if (archived) return false; // masquer archivées dans les autres filtres
      if (filterKey === "all")     return true;
      if (filterKey === "pending") return r.status === "pending";
      if (filterKey === "done")    return DONE_STATUSES.includes(r.status);
      if (filterKey === "active") {
        if (r.status !== "accepted") return false;
        const s = r.start_at ? new Date(r.start_at) : null;
        const e = r.end_at   ? new Date(r.end_at)   : null;
        return !s || !e || (s <= now && now <= e);
      }
      return true;
    });
  }, [list, filterKey, archivedIds]);

  /* ─── Render item ─── */
  const renderItem = useCallback(({ item }) => {
    const isOwner     = !!userId && String(item.owner_id) === String(userId);
    const isPending   = item.status === "pending";
    const isDone      = DONE_STATUSES.includes(item.status);
    const isArchived  = archivedIds.has(String(item.id));
    const isActing    = actingId === item.id;

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          if (item.item_id) navigation.navigate("ItemDetail", { itemId: item.item_id, title: item.item_title });
        }}
      >
        <View style={styles.card}>

          {/* Titre + badge statut */}
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.item_title}</Text>
            <Badge label={formatStatus(item.status)} tone={toneFromStatus(item.status)} />
          </View>

          {/* Role + dates */}
          <Text style={styles.cardMeta}>
            {isOwner ? "Demande reçue" : "Demande envoyée"}
            {" · "}{fDate(item.start_at)}
            {item.end_at ? ` → ${fDate(item.end_at)}` : ""}
          </Text>

          {/* Prix */}
          <View style={{ flexDirection: "row", marginTop: 8 }}>
            <Badge
              label={item.price_per_day ? `${fPrice(item.price_per_day)}/j` : "Gratuit"}
              tone={item.price_per_day ? "ok" : "info"}
            />
          </View>

          {/* Boutons owner : accepter / refuser */}
          {isOwner && isPending && (
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.btnAccept, isActing && { opacity: 0.55 }]}
                disabled={isActing}
                activeOpacity={0.88}
                onPress={(e) => { e?.stopPropagation?.(); acceptReservation(item); }}
              >
                {isActing
                  ? <ActivityIndicator size="small" color={colors.bg} />
                  : <>
                      <MaterialCommunityIcons name="check" size={15} color={colors.bg} />
                      <Text style={styles.btnTxt}>Accepter</Text>
                    </>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.btnRefuse, isActing && { opacity: 0.55 }]}
                disabled={isActing}
                activeOpacity={0.88}
                onPress={(e) => { e?.stopPropagation?.(); refuseReservation(item); }}
              >
                <MaterialCommunityIcons name="close" size={15} color={colors.text} />
                <Text style={[styles.btnTxt, { color: colors.text }]}>Refuser</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Archiver / désarchiver (uniquement terminé) */}
          {isDone && (
            <TouchableOpacity
              style={styles.archiveBtn}
              activeOpacity={0.88}
              onPress={(e) => { e?.stopPropagation?.(); toggleArchive(item); }}
            >
              <MaterialCommunityIcons
                name={isArchived ? "archive-arrow-up-outline" : "archive-outline"}
                size={13}
                color={colors.subtext}
              />
              <Text style={styles.archiveTxt}>
                {isArchived ? "Désarchiver" : "Archiver"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [userId, actingId, archivedIds, navigation, acceptReservation, refuseReservation, toggleArchive]);

  /* ─── Empty ─── */
  const EmptyComponent = useMemo(() => (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name="clipboard-text-clock-outline" size={22} color={colors.mint} />
      </View>
      <Text style={styles.emptyTitle}>Aucune réservation</Text>
      <Text style={styles.emptySub}>
        Tes demandes et réservations en cours apparaîtront ici.
      </Text>
      <TouchableOpacity
        style={styles.primaryBtn}
        activeOpacity={0.88}
        onPress={() => navigation.navigate("AppTabs", { screen: "Circle" })}
      >
        <MaterialCommunityIcons name="account-group-outline" size={16} color={colors.bg} />
        <Text style={styles.primaryBtnTxt}>Aller au Cercle</Text>
      </TouchableOpacity>
    </View>
  ), [navigation]);

  /* ─── Loading ─── */
  if (loading) {
    return (
      <View style={[styles.safe, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.mint} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={[
        styles.container,
        contentMax && { alignItems: "center" },
        { paddingTop: Math.max(8, Math.floor(insets.top * 0.15)) },
      ]}>
        <View style={[styles.inner, contentMax && { width: contentMax }]}>

          {/* Header simple — un seul, pas de hero en doublon */}
          <Text style={styles.h1}>Réservations</Text>
          <Text style={styles.h1Sub}>Demandes reçues et envoyées</Text>

          {/* Filtres unifiés — 5 chips dont "Archivées" */}
          <View style={styles.filtersRow}>
            {FILTERS.map((f) => {
              const active = f.key === filterKey;
              const count  = counts[f.key] ?? 0;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.chip, active && styles.chipActive]}
                  activeOpacity={0.88}
                  onPress={() => setFilterKey(f.key)}
                >
                  <MaterialCommunityIcons
                    name={f.icon} size={13}
                    color={active ? colors.bg : colors.subtext}
                  />
                  <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>
                    {f.label}
                  </Text>
                  {count > 0 && (
                    <View style={[styles.chipBadge, active && styles.chipBadgeActive]}>
                      <Text style={[styles.chipBadgeTxt, active && styles.chipBadgeTxtActive]}>
                        {count > 99 ? "99+" : count}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(it) => String(it.id)}
            renderItem={renderItem}
            ListEmptyComponent={EmptyComponent}
            contentContainerStyle={[
              styles.listContent,
              filtered.length === 0 && { flexGrow: 1 },
            ]}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mint} />
            }
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

/* ─── BADGE ─── */
function Badge({ label, tone = "neutral" }) {
  const palettes = {
    ok:      { bg: "#10241c", fg: "#36d399" },
    danger:  { bg: "#2b1416", fg: "#ff6b6b" },
    info:    { bg: "#0f1c2a", fg: "#1DFFC2" },
    neutral: { bg: "#1b2130", fg: "#9AA3B2" },
  };
  const { bg, fg } = palettes[tone] || palettes.neutral;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeTxt, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/* ─── STYLES ─── */
const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  inner:     { width: "100%", flex: 1 },

  h1:    { color: colors.text, fontWeight: "900", fontSize: 20, marginBottom: 2 },
  h1Sub: { color: colors.subtext, fontWeight: "700", fontSize: 13, marginBottom: 14 },

  /* Filtres */
  filtersRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 7, paddingHorizontal: 11,
    borderRadius: 999, borderWidth: 1,
    borderColor: colors.stroke, backgroundColor: "rgba(255,255,255,0.04)",
  },
  chipActive:        { backgroundColor: colors.mint, borderColor: "rgba(29,255,194,0.25)" },
  chipTxt:           { color: colors.text, fontWeight: "800", fontSize: 12 },
  chipTxtActive:     { color: colors.bg },
  chipBadge:         { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.20)" },
  chipBadgeActive:   { backgroundColor: "rgba(0,0,0,0.18)" },
  chipBadgeTxt:      { color: colors.text, fontWeight: "900", fontSize: 10 },
  chipBadgeTxtActive:{ color: colors.bg },

  /* List */
  listContent: { paddingVertical: 4, paddingBottom: 24 },

  /* Card */
  card: {
    backgroundColor: colors.card, borderColor: colors.stroke,
    borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10,
  },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle:  { color: colors.text, fontWeight: "900", fontSize: 15, flex: 1 },
  cardMeta:   { color: colors.subtext, fontWeight: "700", fontSize: 12, marginTop: 5 },

  /* Badge */
  badge:    { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  badgeTxt: { fontWeight: "900", fontSize: 11 },

  /* Actions */
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderRadius: 12, paddingVertical: 10, borderWidth: 1,
  },
  btnAccept: { backgroundColor: colors.mint, borderColor: "rgba(29,255,194,0.25)" },
  btnRefuse: { backgroundColor: "rgba(255,255,255,0.04)", borderColor: colors.stroke },
  btnTxt:    { fontWeight: "900", color: colors.bg, fontSize: 13 },

  /* Archive */
  archiveBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    marginTop: 10, alignSelf: "flex-start",
    paddingVertical: 5, paddingHorizontal: 9,
    borderRadius: 8, borderWidth: 1, borderColor: colors.stroke,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  archiveTxt: { color: colors.subtext, fontWeight: "700", fontSize: 11 },

  /* Empty */
  emptyWrap: {
    flex: 1, minHeight: 340,
    alignItems: "center", justifyContent: "center",
    padding: 20, borderRadius: 18,
    borderWidth: 1, borderColor: colors.stroke,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  emptyIcon: {
    width: 44, height: 44, borderRadius: 16, marginBottom: 12,
    backgroundColor: "rgba(29,255,194,0.10)",
    borderWidth: 1, borderColor: "rgba(29,255,194,0.20)",
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { color: colors.text, fontWeight: "900", fontSize: 16, textAlign: "center" },
  emptySub:   {
    color: colors.subtext, fontWeight: "700", marginTop: 6,
    lineHeight: 20, textAlign: "center", maxWidth: 300,
  },
  primaryBtn: {
    marginTop: 16, backgroundColor: colors.mint,
    paddingVertical: 12, paddingHorizontal: 18,
    borderRadius: 14, flexDirection: "row",
    alignItems: "center", gap: 8, justifyContent: "center",
  },
  primaryBtnTxt: { color: colors.bg, fontWeight: "900" },
});