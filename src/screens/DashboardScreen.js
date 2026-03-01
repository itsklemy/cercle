import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  LayoutAnimation,
  UIManager,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors as themeColors } from "../theme/colors";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import { useResponsive } from "../hooks/useResponsive";

/* ─── Theme ─── */
const C = themeColors || {};
const colors = {
  bg:      C.bg      ?? "#0B0E14",
  text:    C.text    ?? "#F3F4F6",
  subtext: C.subtext ?? "#9AA3B2",
  mint:    C.mint    ?? "#1DFFC2",
  card:    C.card    ?? "rgba(255,255,255,0.04)",
  stroke:  C.stroke  ?? "rgba(255,255,255,0.10)",
  danger:  C.danger  ?? "#ff6b6b",
};

if (Platform.OS === "android" && UIManager?.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ─── Navigation helper ─── */
// Remonte l'arbre jusqu'à trouver un navigator qui connaît routeName.
function useSmartNav(navigation) {
  return useCallback((routeName, params) => {
    let nav = navigation;
    while (nav) {
      const names = nav.getState?.()?.routeNames;
      if (Array.isArray(names) && names.includes(routeName)) {
        nav.navigate(routeName, params);
        return;
      }
      nav = nav.getParent?.();
    }
    // Fallback : essai direct depuis le root
    navigation.navigate(routeName, params);
  }, [navigation]);
}

/* ─── Screen ─── */
export default function DashboardScreen({ navigation }) {
  const { contentMax } = useResponsive?.() || {};
  const navTo = useSmartNav(navigation);

  const [loading,        setLoading]        = useState(true);
  const [itemsCount,     setItemsCount]     = useState(0);
  const [circlesCount,   setCirclesCount]   = useState(0);
  const [pendingCount,   setPendingCount]   = useState(0);
  const [toReturn,       setToReturn]       = useState([]);
  const [toGive,         setToGive]         = useState([]);
  const [calls,          setCalls]          = useState([]);
  const [openKey,        setOpenKey]        = useState(null);

  const toggle = (key) => {
    try { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); } catch {}
    setOpenKey((p) => (p === key ? null : key));
  };

  /* ─── Load ─── */
  const load = useCallback(async () => {
    if (!hasSupabaseConfig?.()) { setLoading(false); return; }
    const { data: uData } = await supabase.auth.getUser();
    const user = uData?.user;
    if (!user) { setLoading(false); return; }

    setLoading(true);
    try {
      // Cercles
      const { count: cc } = await supabase
        .from("circle_members").select("*", { count: "exact", head: true })
        .eq("user_id", user.id);
      setCirclesCount(cc || 0);

      // Mes objets
      const { count: ic } = await supabase
        .from("items").select("*", { count: "exact", head: true })
        .eq("owner_id", user.id);
      setItemsCount(ic || 0);

      // Réservations
      const { data: allRes } = await supabase
        .from("reservations")
        .select("id,item_id,item_title,owner_id,borrower_id,start_at,end_at,status")
        .or(`borrower_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order("start_at", { ascending: true });

      const res = allRes || [];
      const now = new Date();

      setPendingCount(res.filter((r) => r.status === "pending").length);

      setToReturn(
        res
          .filter((r) => r.borrower_id === user.id && r.status === "accepted")
          .map((r) => ({
            id: r.id,
            title: r.item_title || "Objet",
            end_at: r.end_at,
            overdue: new Date(r.end_at) < now,
            remaining: timeLeftLabel(new Date(r.end_at), now),
          }))
          .sort((a, b) => (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1))
          .slice(0, 5)
      );

      setToGive(
        res
          .filter((r) => r.owner_id === user.id && ["accepted", "pending"].includes(r.status))
          .map((r) => ({
            id: r.id,
            title: r.item_title || "Objet",
            start_at: r.start_at,
            status: r.status,
            when: new Date(r.start_at) > now
              ? startsInLabel(new Date(r.start_at), now)
              : "en cours",
          }))
          .sort((a, b) => (a.status === "pending" ? -1 : 1))
          .slice(0, 5)
      );

      // Ondes récentes
      const { data: myCalls } = await supabase
        .from("calls")
        .select("id,message,status,created_at")
        .eq("author_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3);
      setCalls(myCalls || []);

    } catch (e) {
      console.log("[Dashboard] load error:", e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener("focus", load);
    load();
    return unsub;
  }, [navigation, load]);

  /* ─── Derived ─── */
  const overdueCount = useMemo(() => toReturn.filter((x) => x.overdue).length, [toReturn]);
  const isEmpty = circlesCount === 0 && itemsCount === 0;
  const isNew   = circlesCount > 0 && itemsCount === 0;

  /* ─── Render ─── */
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.wrap, contentMax && { alignItems: "center" }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.inner, contentMax && { width: contentMax }]}>

        {/* ── ÉTAT VIDE : nouveau user ── */}
        {!loading && isEmpty && (
          <EmptyState
            onOpenCircle={() => navTo("Circle")}
          />
        )}

        {/* ── ÉTAT CHARGEMENT ── */}
        {loading && (
          <View style={{ alignItems: "center", paddingVertical: 48 }}>
            <ActivityIndicator color={colors.mint} />
          </View>
        )}

        {/* ── CONTENU NORMAL ── */}
        {!loading && !isEmpty && (
          <>
            {/* Greeting + stats */}
            <View style={styles.statsRow}>
              <StatChip
                icon="account-group-outline"
                value={circlesCount}
                label="cercle"
                onPress={() => navTo("Circle")}
              />
              <StatChip
                icon="cube-outline"
                value={itemsCount}
                label="objet"
                onPress={() => navTo("Circle", { tab: "mine" })}
              />
              {pendingCount > 0 && (
                <StatChip
                  icon="clock-outline"
                  value={pendingCount}
                  label="en attente"
                  highlight
                  onPress={() => navTo("MyReservations", { filter: "pending" })}
                />
              )}
            </View>

            {/* Alerte retards — prioritaire */}
            {overdueCount > 0 && (
              <TouchableOpacity
                style={styles.alertBanner}
                activeOpacity={0.88}
                onPress={() => navTo("MyReservations", { filter: "overdue" })}
              >
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#ff6b6b" />
                <Text style={styles.alertTxt}>
                  {overdueCount === 1
                    ? "1 objet est en retard de retour"
                    : `${overdueCount} objets sont en retard de retour`}
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#ff6b6b" />
              </TouchableOpacity>
            )}

            {/* À rendre */}
            {toReturn.length > 0 && (
              <Section
                icon="package-variant-closed"
                title="À rendre"
                subtitle={`${toReturn.length} emprunt${toReturn.length > 1 ? "s" : ""} en cours`}
                open={openKey === "return"}
                onToggle={() => toggle("return")}
                onCta={() => navTo("MyReservations", { filter: "ongoing" })}
                ctaLabel="Tout voir"
              >
                {toReturn.map((r) => (
                  <ItemRow
                    key={r.id}
                    title={r.title}
                    badge={r.overdue ? "en retard" : `reste ${r.remaining}`}
                    danger={r.overdue}
                  />
                ))}
              </Section>
            )}

            {/* À remettre / récupérer */}
            {toGive.length > 0 && (
              <Section
                icon="handshake-outline"
                title="Remises à organiser"
                subtitle={
                  pendingCount > 0
                    ? `${pendingCount} demande${pendingCount > 1 ? "s" : ""} en attente`
                    : `${toGive.length} prêt${toGive.length > 1 ? "s" : ""} actif${toGive.length > 1 ? "s" : ""}`
                }
                open={openKey === "give"}
                onToggle={() => toggle("give")}
                onCta={() => navTo("MyReservations", { filter: "all" })}
                ctaLabel="Gérer"
              >
                {toGive.map((r) => (
                  <ItemRow
                    key={r.id}
                    title={r.title}
                    badge={r.status === "pending" ? "en attente" : r.when}
                    pending={r.status === "pending"}
                  />
                ))}
              </Section>
            )}

            {/* Mes ondes */}
            {calls.length > 0 && (
              <Section
                icon="broadcast"
                title="Mes ondes récentes"
                subtitle={`${calls.length} onde${calls.length > 1 ? "s" : ""}`}
                open={openKey === "calls"}
                onToggle={() => toggle("calls")}
                onCta={() => navTo("Circle", { tab: "calls" })}
                ctaLabel="Voir tout"
              >
                {calls.map((c) => (
                  <ItemRow
                    key={c.id}
                    title={trimStr(c.message || "Onde")}
                    badge={formatCallStatus(c.status)}
                  />
                ))}
              </Section>
            )}

            {/* Si user a un cercle mais pas d'objets → nudge */}
            {isNew && (
              <TouchableOpacity
                style={styles.nudge}
                activeOpacity={0.88}
                onPress={() => navTo("Circle", { tab: "mine" })}
              >
                <View style={styles.nudgeIcon}>
                  <MaterialCommunityIcons name="cube-outline" size={20} color={colors.mint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nudgeTitle}>Ajoute tes premiers objets</Text>
                  <Text style={styles.nudgeSub}>
                    Tes proches voient ce que tu as à prêter dans leur feed.
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.subtext} />
              </TouchableOpacity>
            )}

            {/* Actions rapides — une seule rangée, pas de doublon */}
            <View style={styles.quickRow}>
              <QuickAction
                icon="account-group-outline"
                label="Cercles"
                onPress={() => navTo("Circle")}
              />
              <QuickAction
                icon="broadcast"
                label="Ondes"
                onPress={() => navTo("Circle", { tab: "calls" })}
              />
              <QuickAction
                icon="clipboard-text-clock-outline"
                label="Réservations"
                badge={pendingCount}
                onPress={() => navTo("MyReservations", { filter: "all" })}
              />
            </View>
          </>
        )}

        <View style={{ height: 24 }} />
      </View>
    </ScrollView>
  );
}

/* ─── EMPTY STATE ─── */
function EmptyState({ onOpenCircle }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name="account-group-outline" size={36} color={colors.mint} />
      </View>
      <Text style={styles.emptyTitle}>Crée ton premier cercle</Text>
      <Text style={styles.emptySub}>
        {"Partage tes objets avec tes proches.\nEmprunte ce dont tu as besoin, sans acheter."}
      </Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={onOpenCircle} activeOpacity={0.88}>
        <MaterialCommunityIcons name="plus" size={18} color={colors.bg} />
        <Text style={styles.emptyBtnTxt}>Créer un cercle</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ─── STAT CHIP ─── */
function StatChip({ icon, value, label, onPress, highlight }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[styles.statChip, highlight && styles.statChipHL]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={15}
        color={highlight ? colors.bg : colors.mint}
      />
      <Text style={[styles.statVal, highlight && { color: colors.bg }]}>{value}</Text>
      <Text style={[styles.statLabel, highlight && { color: colors.bg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ─── SECTION / ACCORDÉON ─── */
function Section({ icon, title, subtitle, open, onToggle, onCta, ctaLabel, children }) {
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHead} onPress={onToggle} activeOpacity={0.88}>
        <View style={styles.sectionIcon}>
          <MaterialCommunityIcons name={icon} size={16} color={colors.mint} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
          {!!subtitle && <Text style={styles.sectionSub} numberOfLines={1}>{subtitle}</Text>}
        </View>
        <MaterialCommunityIcons
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.subtext}
        />
      </TouchableOpacity>

      {open && (
        <View style={styles.sectionBody}>
          {children}
          {!!onCta && (
            <TouchableOpacity style={styles.ctaBtn} onPress={onCta} activeOpacity={0.88}>
              <Text style={styles.ctaTxt}>{ctaLabel}</Text>
              <MaterialCommunityIcons name="arrow-right" size={15} color={colors.mint} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

/* ─── ITEM ROW ─── */
function ItemRow({ title, badge, danger, pending }) {
  return (
    <View style={styles.itemRow}>
      <Text style={styles.itemTitle} numberOfLines={1}>{title}</Text>
      {!!badge && (
        <View style={[
          styles.itemBadge,
          danger   && styles.itemBadgeDanger,
          pending  && styles.itemBadgePending,
        ]}>
          <Text style={[
            styles.itemBadgeTxt,
            danger  && { color: "#ffb3b3" },
            pending && { color: "#ffe29a" },
          ]}>
            {badge}
          </Text>
        </View>
      )}
    </View>
  );
}

/* ─── QUICK ACTION ─── */
function QuickAction({ icon, label, onPress, badge }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.quickIcon}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.mint} />
        {!!badge && badge > 0 && (
          <View style={styles.quickBadge}>
            <Text style={styles.quickBadgeTxt}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.quickLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ─── UTILS ─── */
function timeLeftLabel(end, now = new Date()) {
  const ms = Math.max(0, end - now);
  const mins = Math.round(ms / 60000);
  if (mins <= 0) return "0 min";
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} j`;
}

function startsInLabel(start, now = new Date()) {
  const ms = start - now;
  if (ms <= 0) return "en cours";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `dans ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `dans ${hours} h`;
  return `dans ${Math.round(hours / 24)} j`;
}

function trimStr(s = "", max = 60) {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function formatCallStatus(s) {
  const map = { pending: "envoyée", open: "ouverte", matched: "match ✓", closed: "fermée", canceled: "annulée" };
  return map[s] || s || "—";
}

/* ─── STYLES ─── */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  wrap:   { padding: 16, paddingTop: 20, paddingBottom: 16 },
  inner:  { width: "100%" },

  /* Empty */
  emptyWrap: {
    alignItems: "center", paddingVertical: 48, paddingHorizontal: 24, gap: 12,
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: "rgba(29,255,194,0.08)",
    borderWidth: 1, borderColor: "rgba(29,255,194,0.20)",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: "900", textAlign: "center" },
  emptySub:   { color: colors.subtext, fontSize: 14, lineHeight: 20, textAlign: "center" },
  emptyBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.mint, borderRadius: 14,
    paddingHorizontal: 20, paddingVertical: 14, marginTop: 8,
  },
  emptyBtnTxt: { color: colors.bg, fontWeight: "900", fontSize: 15 },

  /* Stats */
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  statChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(29,255,194,0.07)",
    borderWidth: 1, borderColor: "rgba(29,255,194,0.20)",
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
  },
  statChipHL: { backgroundColor: colors.mint, borderColor: colors.mint },
  statVal:   { color: colors.mint, fontWeight: "900", fontSize: 14 },
  statLabel: { color: colors.subtext, fontWeight: "700", fontSize: 13 },

  /* Alert */
  alertBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(255,107,107,0.08)",
    borderWidth: 1, borderColor: "rgba(255,107,107,0.30)",
    borderRadius: 14, padding: 14, marginBottom: 12,
  },
  alertTxt: { color: "#ff9a9a", fontWeight: "800", flex: 1 },

  /* Section */
  section: {
    borderWidth: 1, borderColor: colors.stroke,
    backgroundColor: colors.card,
    borderRadius: 16, marginBottom: 10, overflow: "hidden",
  },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  sectionIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: "rgba(29,255,194,0.10)",
    borderWidth: 1, borderColor: "rgba(29,255,194,0.20)",
    alignItems: "center", justifyContent: "center",
  },
  sectionTitle: { color: colors.text, fontWeight: "900", fontSize: 14 },
  sectionSub:   { color: colors.subtext, fontWeight: "700", fontSize: 12, marginTop: 1 },
  sectionBody:  { paddingHorizontal: 14, paddingBottom: 14, gap: 6 },

  ctaBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: 6, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: colors.stroke,
  },
  ctaTxt: { color: colors.mint, fontWeight: "800", fontSize: 13 },

  /* Item row */
  itemRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 9, paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderRadius: 10, borderWidth: 1, borderColor: colors.stroke,
  },
  itemTitle:    { color: colors.text, fontWeight: "700", fontSize: 13, flex: 1, marginRight: 8 },
  itemBadge:    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: colors.stroke },
  itemBadgeTxt: { color: colors.subtext, fontWeight: "800", fontSize: 11 },
  itemBadgeDanger:  { backgroundColor: "rgba(255,107,107,0.12)", borderColor: "rgba(255,107,107,0.30)" },
  itemBadgePending: { backgroundColor: "rgba(255,226,154,0.10)", borderColor: "rgba(255,226,154,0.25)" },

  /* Nudge */
  nudge: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1, borderColor: "rgba(29,255,194,0.22)",
    backgroundColor: "rgba(29,255,194,0.05)",
    borderRadius: 16, padding: 14, marginBottom: 14,
  },
  nudgeIcon: {
    width: 40, height: 40, borderRadius: 13,
    backgroundColor: "rgba(29,255,194,0.10)",
    borderWidth: 1, borderColor: "rgba(29,255,194,0.22)",
    alignItems: "center", justifyContent: "center",
  },
  nudgeTitle: { color: colors.text, fontWeight: "900", marginBottom: 2 },
  nudgeSub:   { color: colors.subtext, fontSize: 13, lineHeight: 18 },

  /* Quick actions */
  quickRow: {
    flexDirection: "row", gap: 10, marginTop: 14,
  },
  quickAction: {
    flex: 1, alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.stroke,
    borderRadius: 14, padding: 14, gap: 8,
  },
  quickIcon: { position: "relative" },
  quickLabel: { color: colors.text, fontWeight: "800", fontSize: 12, textAlign: "center" },
  quickBadge: {
    position: "absolute", top: -5, right: -10,
    backgroundColor: colors.mint, borderRadius: 999,
    paddingHorizontal: 5, paddingVertical: 2, minWidth: 18, alignItems: "center",
  },
  quickBadgeTxt: { color: colors.bg, fontWeight: "900", fontSize: 10 },
});