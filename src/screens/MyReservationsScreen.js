// src/screens/MyReservationsScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors as themeColors } from "../theme/colors";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import { useResponsive } from "../hooks/useResponsive";
import AsyncStorage from "@react-native-async-storage/async-storage";

/* -------------------- Local archive storage -------------------- */
const ARCHIVE_KEY = "cercle_archived_reservation_ids_v1";

/* -------------------- Theme fallback (anti-crash) -------------------- */
const C = themeColors || {};
const colors = {
  bg: C.bg ?? "#0B0E14",
  text: C.text ?? "#F3F4F6",
  subtext: C.subtext ?? "#9AA3B2",
  mint: C.mint ?? "#1DFFC2",
  card: C.card ?? "rgba(255,255,255,0.04)",
  stroke: C.stroke ?? "rgba(255,255,255,0.10)",
  success: C.success ?? "#36d399",
  danger: C.danger ?? "#ff6b6b",
};

const FILTERS = [
  { key: "all", label: "Toutes", icon: "format-list-bulleted" },
  { key: "pending", label: "En attente", icon: "account-clock-outline" },
  { key: "active", label: "En cours", icon: "progress-clock" },
  { key: "done", label: "Terminées", icon: "check-circle-outline" },
];

export default function MyReservationsScreen({ navigation }) {
  const { contentMax } = useResponsive?.() || {};
  const insets = useSafeAreaInsets();

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterKey, setFilterKey] = useState("all");
  const [userId, setUserId] = useState(null);

  // ✅ désactive les boutons pendant une action
  const [actingId, setActingId] = useState(null);

  // ✅ Archive locale
  const [archivedIds, setArchivedIds] = useState(() => new Set());
  const [showArchived, setShowArchived] = useState(false);

  // charge archives depuis AsyncStorage
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
    try {
      await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(Array.from(nextSet)));
    } catch {}
  }, []);

  const isDoneStatus = useCallback((s) => {
    return ["returned", "done", "canceled", "refused", "rejected"].includes(s);
  }, []);

  const archiveReservation = useCallback(
    async (row) => {
      if (!row?.id) return;
      if (!isDoneStatus(row.status)) {
        Alert.alert("Archive", "Tu peux archiver uniquement une réservation terminée/refusée/annulée.");
        return;
      }
      const id = String(row.id);
      const next = new Set(archivedIds);
      next.add(id);
      setArchivedIds(next);
      await persistArchived(next);
    },
    [archivedIds, persistArchived, isDoneStatus]
  );

  const unarchiveReservation = useCallback(
    async (row) => {
      if (!row?.id) return;
      const id = String(row.id);
      const next = new Set(archivedIds);
      next.delete(id);
      setArchivedIds(next);
      await persistArchived(next);
    },
    [archivedIds, persistArchived]
  );

  const fPrice = useCallback(
    (n) => Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0),
    []
  );

  const fDate = useCallback((iso) => {
    try {
      if (!iso) return "—";
      const d = new Date(iso);
      return d.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso || "—";
    }
  }, []);

  const normalizeRow = useCallback((r) => {
    const start = r.start_at ?? r.starts_at ?? null;
    const end = r.end_at ?? r.ends_at ?? null;

    return {
      ...r,
      start_at: start,
      end_at: end,
      borrower_id: r.borrower_id ?? r.renter_id ?? null,
      owner_id: r.owner_id ?? null,
      item_id: r.item_id ?? null,
      item_title: r.item_title ?? "Objet",
      price_per_day: r.price_per_day ?? null,
      status: r.status ?? "pending",
      created_at: r.created_at ?? null,
    };
  }, []);

  // ✅ Notif in-app best-effort
  const sendInAppNotificationSafe = useCallback(async (payload) => {
    try {
      await supabase.from("notifications").insert({
        ...payload,
        created_at: new Date().toISOString(),
        read: false,
      });
    } catch {}
  }, []);

  const load = useCallback(async () => {
    if (!hasSupabaseConfig?.()) {
      setUserId(null);
      setList([]);
      return;
    }

    const { data: uData } = await supabase.auth.getUser();
    const user = uData?.user;

    if (!user) {
      setUserId(null);
      setList([]);
      return;
    }
    setUserId(user.id);

    // Essai 1 : borrower_id / owner_id
    let rows = [];
    try {
      const res1 = await supabase
        .from("reservations")
        .select("*")
        .or(`borrower_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      if (!res1?.error) rows = res1?.data || [];
    } catch {}

    // Essai 2 (fallback) : renter_id / owner_id
    if ((rows || []).length === 0) {
      try {
        const res2 = await supabase
          .from("reservations")
          .select("*")
          .or(`renter_id.eq.${user.id},owner_id.eq.${user.id}`)
          .order("created_at", { ascending: false });

        if (!res2?.error) rows = res2?.data || [];
      } catch {}
    }

    const normalized = (rows || []).map(normalizeRow);

    // ✅ enrich titles from items (best-effort)
    try {
      const ids = Array.from(
        new Set((normalized || []).map((r) => r.item_id).filter(Boolean).map(String))
      );

      if (ids.length > 0) {
        const { data: itemsData, error: itemsErr } = await supabase
          .from("items")
          .select("id,title,price_cents,price_unit")
          .in("id", ids);

        if (!itemsErr && itemsData) {
          const map = new Map(itemsData.map((it) => [String(it.id), it]));
          const enriched = normalized.map((r) => {
            const it = r.item_id ? map.get(String(r.item_id)) : null;

            let price_per_day = r.price_per_day ?? null;
            if (!price_per_day && it?.price_cents && it?.price_unit === "day") {
              price_per_day = it.price_cents / 100;
            }

            return {
              ...r,
              item_title: it?.title || r.item_title || "Objet",
              price_per_day,
            };
          });

          setList(enriched);
          return;
        }
      }
    } catch {}

    setList(normalized);
  }, [normalizeRow]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const counts = useMemo(() => {
    const all = list?.length || 0;
    const pending = (list || []).filter((r) => r.status === "pending").length;
    const done = (list || []).filter((r) =>
      ["returned", "done", "canceled", "refused", "rejected"].includes(r.status)
    ).length;

    const now = new Date();
    const active = (list || []).filter((r) => {
      if (r.status !== "accepted") return false;
      const s = r.start_at ? new Date(r.start_at) : null;
      const e = r.end_at ? new Date(r.end_at) : null;
      if (!s || !e) return true;
      return s <= now && now <= e;
    }).length;

    return { all, pending, active, done };
  }, [list]);

  const filtered = useMemo(() => {
    const base = (list || []).filter((r) => {
      const archived = archivedIds.has(String(r.id));
      return showArchived ? archived : !archived;
    });

    if (filterKey === "all") return base;
    if (filterKey === "pending") return base.filter((r) => r.status === "pending");

    if (filterKey === "active") {
      const now = new Date();
      return base.filter((r) => {
        if (r.status !== "accepted") return false;
        const s = r.start_at ? new Date(r.start_at) : null;
        const e = r.end_at ? new Date(r.end_at) : null;
        if (!s || !e) return true;
        return s <= now && now <= e;
      });
    }

    if (filterKey === "done") {
      return base.filter((r) =>
        ["returned", "done", "canceled", "refused", "rejected"].includes(r.status)
      );
    }

    return base;
  }, [list, filterKey, archivedIds, showArchived]);

  const Empty = useMemo(() => {
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIcon}>
          <MaterialCommunityIcons name="clipboard-text-clock-outline" size={22} color={colors.mint} />
        </View>

        <Text style={styles.emptyTitle}>Retrouve tes réservations ici</Text>
        <Text style={styles.emptySub}>
          Tes demandes, leurs statuts et tes réservations en cours apparaîtront automatiquement.
        </Text>

        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.primaryBtn}
          onPress={() => navigation.navigate("AppTabs", { screen: "Circle" })}
        >
          <MaterialCommunityIcons name="account-group-outline" size={16} color={colors.bg} />
          <Text style={styles.primaryBtnTxt}>Aller au Cercle</Text>
        </TouchableOpacity>
      </View>
    );
  }, [navigation]);

  // ✅ Owner actions : update uniquement status
  const acceptReservation = useCallback(
    async (row) => {
      if (!row?.id || !row?.item_id) return;
      setActingId(row.id);
      try {
        const { error: e1 } = await supabase.from("reservations").update({ status: "accepted" }).eq("id", row.id);
        if (e1) throw e1;

        const { error: e2 } = await supabase
          .from("reservations")
          .update({ status: "refused" })
          .eq("item_id", row.item_id)
          .eq("status", "pending")
          .neq("id", row.id);
        if (e2) console.log("[MyReservations] refuse others err:", e2);

        if (row.borrower_id) {
          await sendInAppNotificationSafe({
            user_id: row.borrower_id,
            type: "reservation_accepted",
            title: "Réservation acceptée",
            body: `Ta demande pour "${row.item_title || "un objet"}" a été acceptée.`,
            data: { reservation_id: row.id, item_id: row.item_id },
          });
        }

        await load();
      } catch (e) {
        console.log("[MyReservations] accept error:", e);
      } finally {
        setActingId(null);
      }
    },
    [load, sendInAppNotificationSafe]
  );

  const refuseReservation = useCallback(
    async (row) => {
      if (!row?.id) return;
      setActingId(row.id);
      try {
        const { error } = await supabase.from("reservations").update({ status: "refused" }).eq("id", row.id);
        if (error) throw error;

        if (row.borrower_id) {
          await sendInAppNotificationSafe({
            user_id: row.borrower_id,
            type: "reservation_refused",
            title: "Réservation refusée",
            body: `Ta demande pour "${row.item_title || "un objet"}" a été refusée.`,
            data: { reservation_id: row.id, item_id: row.item_id },
          });
        }

        await load();
      } catch (e) {
        console.log("[MyReservations] refuse error:", e);
      } finally {
        setActingId(null);
      }
    },
    [load, sendInAppNotificationSafe]
  );

  const openDetail = useCallback(
    (row) => {
      const id = row?.item_id;
      if (!id) return;
      navigation.navigate("ItemDetail", { itemId: id, title: row?.item_title || "Annonce" });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }) => {
      const isOwner = !!userId && String(item.owner_id) === String(userId);
      const showOwnerActions = isOwner && item.status === "pending";
      const roleLabel = isOwner ? "Demande reçue" : "Demande envoyée";
      const isDone = isDoneStatus(item.status);

      return (
        <TouchableOpacity activeOpacity={0.9} onPress={() => openDetail(item)}>
          <View style={styles.card}>
            <View style={styles.cardTopRow}>
              <Text style={styles.title} numberOfLines={1}>
                {item.item_title || "Objet"}
              </Text>
              <Badge label={formatStatus(item.status)} tone={toneFromStatus(item.status)} />
            </View>

            <Text style={styles.meta}>
              {roleLabel} • {fDate(item.start_at)} → {fDate(item.end_at)}
            </Text>

            <View style={styles.row}>
              {item.price_per_day ? (
                <Badge label={`${fPrice(item.price_per_day)}/j`} tone="ok" />
              ) : (
                <Badge label="Gratuit" tone="info" />
              )}
            </View>

            {showOwnerActions ? (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.actionBtn, styles.actionBtnAccept, actingId === item.id && { opacity: 0.6 }]}
                  disabled={actingId === item.id}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    acceptReservation(item);
                  }}
                >
                  <MaterialCommunityIcons name="check" size={16} color={colors.bg} />
                  <Text style={styles.actionBtnTxt}>Accepter</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.actionBtn, styles.actionBtnRefuse, actingId === item.id && { opacity: 0.6 }]}
                  disabled={actingId === item.id}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    refuseReservation(item);
                  }}
                >
                  <MaterialCommunityIcons name="close" size={16} color={colors.text} />
                  <Text style={[styles.actionBtnTxt, { color: colors.text }]}>Refuser</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* ✅ Archive / Désarchive (uniquement terminé/refusé/annulé) */}
            {isDone ? (
              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                {!showArchived ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={[
                      styles.actionBtn,
                      { backgroundColor: "rgba(255,255,255,0.04)", borderColor: colors.stroke },
                    ]}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      archiveReservation(item);
                    }}
                  >
                    <MaterialCommunityIcons name="archive-outline" size={16} color={colors.text} />
                    <Text style={[styles.actionBtnTxt, { color: colors.text }]}>Archiver</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={[
                      styles.actionBtn,
                      { backgroundColor: "rgba(255,255,255,0.04)", borderColor: colors.stroke },
                    ]}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      unarchiveReservation(item);
                    }}
                  >
                    <MaterialCommunityIcons name="archive-arrow-up-outline" size={16} color={colors.text} />
                    <Text style={[styles.actionBtnTxt, { color: colors.text }]}>Désarchiver</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [
      userId,
      actingId,
      openDetail,
      fDate,
      fPrice,
      acceptReservation,
      refuseReservation,
      isDoneStatus,
      showArchived,
      archiveReservation,
      unarchiveReservation,
    ]
  );

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="small" color={colors.mint} />
      </View>
    );
  }

  // ✅ layout: SafeArea gère le haut, on ajoute juste un petit padding “soft”
  const softTop = Math.max(8, Math.floor(insets.top * 0.15));

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={[styles.container, contentMax && { alignItems: "center" }, { paddingTop: softTop }]}>
        <View style={[styles.inner, contentMax && { width: contentMax }]}>
          {/* ✅ Header visuel garanti (pas mangé) */}
          <View style={styles.screenHeader}>
            <View style={styles.screenHeaderLeft}>
              <Text style={styles.screenHeaderTitle}>Mes réservations</Text>
              <Text style={styles.screenHeaderSub}>Demandes reçues et envoyées</Text>
            </View>
            <View style={styles.screenHeaderIcon}>
              <MaterialCommunityIcons name="calendar-clock-outline" size={18} color={colors.mint} />
            </View>
          </View>

          {/* Hero (inchangé) */}
          <View style={styles.hero}>
            <View style={styles.heroHeadRow}>
              <Text style={styles.kicker}>Mes réservations</Text>
              <MaterialCommunityIcons name="calendar-clock-outline" size={18} color={colors.bg} />
            </View>

            <Text style={styles.heroTitle}>Tout au même endroit</Text>
            <Text style={styles.heroBody}>Suis tes demandes et tes réservations en cours, sans te perdre.</Text>
          </View>

          {/* ✅ Toggle Archivées / Actives */}
          <TouchableOpacity
            activeOpacity={0.9}
            style={[
              styles.filterChip,
              showArchived && styles.filterChipOn,
              { alignSelf: "flex-start", marginBottom: 10 },
            ]}
            onPress={() => setShowArchived((v) => !v)}
          >
            <MaterialCommunityIcons
              name={showArchived ? "archive" : "archive-outline"}
              size={14}
              color={showArchived ? colors.bg : colors.text}
            />
            <Text style={[styles.filterTxt, showArchived && styles.filterTxtOn]}>
              {showArchived ? "Archivées" : "Actives"}
            </Text>
          </TouchableOpacity>

          {/* Filtres (inchangés) */}
          <View style={styles.filtersRow}>
            {FILTERS.map((f) => {
              const selected = f.key === filterKey;
              const badge =
                f.key === "all"
                  ? counts.all
                  : f.key === "pending"
                  ? counts.pending
                  : f.key === "active"
                  ? counts.active
                  : counts.done;

              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterChip, selected && styles.filterChipOn]}
                  activeOpacity={0.9}
                  onPress={() => setFilterKey(f.key)}
                >
                  <MaterialCommunityIcons name={f.icon} size={14} color={selected ? colors.bg : colors.text} />
                  <Text style={[styles.filterTxt, selected && styles.filterTxtOn]}>{f.label}</Text>
                  <View style={[styles.filterBadge, selected && styles.filterBadgeOn]}>
                    <Text style={[styles.filterBadgeTxt, selected && styles.filterBadgeTxtOn]}>
                      {badge > 99 ? "99+" : String(badge)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(it) => String(it.id)}
            renderItem={renderItem}
            ListEmptyComponent={Empty}
            contentContainerStyle={[styles.listContent, filtered.length === 0 && { flexGrow: 1 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mint} />}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

/* -------------------- Small UI -------------------- */

function Badge({ label, tone = "neutral" }) {
  const bg =
    tone === "ok" ? "#10241c" : tone === "danger" ? "#2b1416" : tone === "info" ? "#0f1c2a" : "#1b2130";
  const fg =
    tone === "ok" ? colors.success : tone === "danger" ? colors.danger : tone === "info" ? colors.mint : colors.subtext;

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeTxt, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function toneFromStatus(s) {
  if (s === "accepted") return "ok";
  if (s === "pending") return "info";
  if (s === "returned" || s === "done") return "neutral";
  if (s === "refused" || s === "rejected") return "danger";
  return "neutral";
}

function formatStatus(s) {
  const map = {
    pending: "en attente",
    accepted: "acceptée",
    refused: "refusée",
    rejected: "refusée",
    returned: "rendu",
    canceled: "annulée",
    done: "terminée",
  };
  return map[s] || s || "—";
}

/* -------------------- Styles -------------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  inner: { width: "100%" },

  screenHeader: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  screenHeaderLeft: { flex: 1, minWidth: 0 },
  screenHeaderTitle: { color: colors.text, fontWeight: "900", fontSize: 18 },
  screenHeaderSub: { color: colors.subtext, fontWeight: "700", marginTop: 2 },
  screenHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(29,255,194,0.10)",
    borderWidth: 1,
    borderColor: "rgba(29,255,194,0.20)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  hero: {
    backgroundColor: "#0f1627",
    borderWidth: 1,
    borderColor: "#21314d",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    overflow: "hidden",
  },
  heroHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  kicker: {
    color: colors.bg,
    backgroundColor: colors.mint,
    fontWeight: "900",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    overflow: "hidden",
  },
  heroTitle: { color: colors.text, fontWeight: "900", fontSize: 20, marginTop: 6 },
  heroBody: { color: colors.subtext, lineHeight: 20, marginTop: 6, fontWeight: "700" },

  filtersRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 6 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  filterChipOn: { backgroundColor: colors.mint, borderColor: "rgba(29,255,194,0.25)" },
  filterTxt: { color: colors.text, fontWeight: "900" },
  filterTxtOn: { color: colors.bg },
  filterBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderWidth: 1,
    borderColor: colors.stroke,
  },
  filterBadgeOn: { backgroundColor: "rgba(0,0,0,0.18)", borderColor: "rgba(0,0,0,0.25)" },
  filterBadgeTxt: { color: colors.text, fontWeight: "900", fontSize: 11 },
  filterBadgeTxtOn: { color: colors.bg },

  listContent: { paddingVertical: 8, paddingBottom: 12 },

  card: {
    backgroundColor: colors.card,
    borderColor: colors.stroke,
    borderWidth: 1,
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
  },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { color: colors.text, fontWeight: "900", fontSize: 16, flex: 1 },
  meta: { color: colors.subtext, marginTop: 6, fontWeight: "700" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },

  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, maxWidth: "100%" },
  badgeTxt: { fontWeight: "900" },

  actionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
  },
  actionBtnAccept: {
    backgroundColor: colors.mint,
    borderColor: "rgba(29,255,194,0.25)",
  },
  actionBtnRefuse: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: colors.stroke,
  },
  actionBtnTxt: { fontWeight: "900", color: colors.bg },

  emptyWrap: {
    flex: 1,
    minHeight: 380,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(29,255,194,0.10)",
    borderWidth: 1,
    borderColor: "rgba(29,255,194,0.20)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: { color: colors.text, fontWeight: "900", fontSize: 16, textAlign: "center" },
  emptySub: {
    color: colors.subtext,
    fontWeight: "700",
    marginTop: 6,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 360,
  },

  primaryBtn: {
    marginTop: 14,
    backgroundColor: colors.mint,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(29,255,194,0.25)",
    width: "100%",
    maxWidth: 360,
  },
  primaryBtnTxt: { color: colors.bg, fontWeight: "900" },
});
