// src/screens/DashboardScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
  Modal,
  Platform,
  LayoutAnimation,
  UIManager,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors as themeColors } from "../theme/colors";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import { useResponsive } from "../hooks/useResponsive";

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

const CIRCLE_ROUTE_CANDIDATES = ["Circle", "CircleScreen", "Circles"]; // dans ton App.js: Tab = "Circle"
const RESERVATIONS_ROUTE_CANDIDATES = ["MyReservations", "Reservations", "ReservationsScreen"]; // dans ton App.js: Stack = "MyReservations"

// Android LayoutAnimation enable
if (Platform.OS === "android" && UIManager?.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function DashboardScreen({ navigation }) {
  const { contentMax } = useResponsive?.() || {};

  const [pendingCount, setPendingCount] = useState(0);
  const [itemsCount, setItemsCount] = useState(0);

  const [toReturn, setToReturn] = useState([]);
  const [toGiveOrPickup, setToGiveOrPickup] = useState([]);

  const [calls, setCalls] = useState([]);
  const [callsCount, setCallsCount] = useState(0);

  // fallback si la route n’existe pas vraiment -> modale
  const [reservationsModalOpen, setReservationsModalOpen] = useState(false);
  const [reservationsAll, setReservationsAll] = useState([]);

  // Accordéons
  const [openKey, setOpenKey] = useState("return"); // 'return' | 'give' | 'calls' | 'shortcuts'

  const animateLayout = () => {
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch {}
  };

  const toggle = (key) => {
    animateLayout();
    setOpenKey((prev) => (prev === key ? null : key));
  };

  /* -------------------- NAVIGATION ROBUSTE (Tab -> Stack) -------------------- */
  // Cherche le navigator (tabs/stack/parent) qui connaît routeName
  const findNavWithRoute = useCallback(
    (routeName) => {
      let nav = navigation;
      while (nav && typeof nav.getState === "function") {
        const state = nav.getState?.();
        const names = state?.routeNames;
        if (Array.isArray(names) && names.includes(routeName)) return nav;
        nav = nav.getParent?.();
      }
      return null;
    },
    [navigation]
  );

  const navigateAny = useCallback(
    (routes, params) => {
      for (const r of routes) {
        const navTarget = findNavWithRoute(r);
        if (navTarget) {
          navTarget.navigate(r, params);
          return true;
        }
      }
      return false;
    },
    [findNavWithRoute]
  );

  const openCircleTab = useCallback(
    (tab) => {
      // tab attendu: 'browse' | 'calls' | 'mine'
      const ok = navigateAny(CIRCLE_ROUTE_CANDIDATES, { tab });
      if (!ok) {
        Alert.alert(
          "Navigation",
          "Impossible d’ouvrir l’écran Cercle. Vérifie que la route Tab 'Circle' existe."
        );
      }
    },
    [navigateAny]
  );

  const openReservations = useCallback(
    (filter) => {
      const ok = navigateAny(RESERVATIONS_ROUTE_CANDIDATES, { filter, view: "list" });
      if (!ok) setReservationsModalOpen(true);
    },
    [navigateAny]
  );

  const openOndes = useCallback(() => openCircleTab("calls"), [openCircleTab]);
  const openMine = useCallback(() => openCircleTab("mine"), [openCircleTab]);
  const openCircles = useCallback(() => openCircleTab("browse"), [openCircleTab]);

  const openUrl = useCallback(async (url) => {
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) throw new Error("URL non supportée");
      await Linking.openURL(url);
    } catch {
      Alert.alert("Lien", "Impossible d’ouvrir ce lien.");
    }
  }, []);

  /* -------------------- Data loading -------------------- */
  useEffect(() => {
    const load = async () => {
      if (!hasSupabaseConfig?.()) return;

      const { data: uData, error: uErr } = await supabase.auth.getUser();
      const user = uData?.user;
      if (uErr || !user) return;

      // Mes annonces count
      try {
        const { count: itemsOwned, error } = await supabase
          .from("items")
          .select("*", { count: "exact", head: true })
          .eq("owner_id", user.id);
        if (!error) setItemsCount(itemsOwned || 0);
      } catch {}

      // Reservations (table)
      let allRes = [];
      try {
        const res = await supabase
          .from("reservations")
          .select("id,item_id,item_title,owner_id,borrower_id,start_at,end_at,status,created_at")
          .or(`borrower_id.eq.${user.id},owner_id.eq.${user.id}`)
          .order("start_at", { ascending: true });

        allRes = res?.data || [];
      } catch {
        allRes = [];
      }

      setReservationsAll(allRes || []);
      setPendingCount((allRes || []).filter((r) => r.status === "pending").length);

      // Noms visibles (optionnel)
      let namesMap = {};
      try {
        const rpcRes = await supabase.rpc("visible_member_names");
        const visibleNames = rpcRes?.data;
        if (Array.isArray(visibleNames)) {
          for (const u of visibleNames) namesMap[u.id] = u.name || "—";
        }
      } catch {}

      const now = new Date();

      // À rendre (je suis borrower)
      const mineToReturn = (allRes || [])
        .filter((r) => r.borrower_id === user.id && r.status === "accepted")
        .map((r) => {
          const end = new Date(r.end_at);
          return {
            id: r.id,
            item_title: r.item_title || "Objet",
            other_name: namesMap[r.owner_id] || "—",
            start_at: r.start_at,
            end_at: r.end_at,
            overdue: end < now,
            remaining: timeLeftLabel(end, now),
          };
        })
        .sort((a, b) => {
          if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
          return new Date(a.end_at) - new Date(b.end_at);
        });

      setToReturn(mineToReturn);

      // À remettre / à récupérer (je suis owner)
      const mineGive = (allRes || [])
        .filter((r) => r.owner_id === user.id && (r.status === "accepted" || r.status === "pending"))
        .map((r) => {
          const start = new Date(r.start_at);
          return {
            id: r.id,
            item_title: r.item_title || "Objet",
            other_name: namesMap[r.borrower_id] || "—",
            start_at: r.start_at,
            status: r.status,
            when: start > now ? startsInLabel(start, now) : "en cours",
          };
        })
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
          return new Date(a.start_at) - new Date(b.start_at);
        });

      setToGiveOrPickup(mineGive);

      // Mes ondes (aperçu) - optionnel si table "calls" existe
      try {
        const { data: myCalls, error: callsErr, count: cnt } = await supabase
          .from("calls")
          .select("id,message,status,created_at,needed_at", { count: "exact" })
          .eq("author_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5);

        if (!callsErr) {
          setCalls(myCalls || []);
          setCallsCount(cnt || (myCalls?.length || 0));
        }
      } catch {}
    };

    const unsub = navigation.addListener("focus", load);
    load();
    return unsub;
  }, [navigation]);

  /* -------------------- Derived -------------------- */
  const overdueCount = useMemo(() => (toReturn || []).filter((x) => x.overdue).length, [toReturn]);
  const topReturn = useMemo(() => (toReturn || []).slice(0, 3), [toReturn]);
  const topGive = useMemo(() => (toGiveOrPickup || []).slice(0, 3), [toGiveOrPickup]);

  /* -------------------- Render -------------------- */
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.wrap, contentMax && { alignItems: "center" }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.inner, contentMax && { width: contentMax }]}>
        {/* HERO */}
        <View style={styles.hero}>
          <View style={styles.heroHeadRow}>
            <Text style={styles.kicker}>Prête. Emprunte. Partage.</Text>
            <MaterialCommunityIcons name="hand-heart" size={18} color={colors.bg} />
          </View>

          <Text style={styles.heroTitle}>Le bon plan, c’est ton cercle</Text>

          <Text style={styles.heroBody}>
            Crée ou rejoins un cercle de confiance.{"\n"}
            Partage ce que tu as, trouve ce qu’il te faut.{"\n"}
            Gratuit ou payant — réserve en 1 clic.
          </Text>

          {/* Actions principales */}
          <View style={styles.actionsRow}>
            <PrimaryAction icon="account-multiple-outline" label="Cercles" onPress={openCircles} />
            <PrimaryAction icon="broadcast" label="Ondes" badge={callsCount} onPress={openOndes} />
            <PrimaryAction icon="cube-outline" label="Mes annonces" badge={itemsCount} onPress={openMine} />
            <PrimaryAction
              icon="clipboard-text-clock-outline"
              label="Réservations"
              badge={pendingCount}
              onPress={() => openReservations("all")}
            />
          </View>
        </View>

        {/* À rendre */}
        <View style={[styles.heroCard, overdueCount > 0 && styles.heroCardDanger]}>
          <View style={styles.heroRow}>
            <View style={styles.heroIcon}>
              <MaterialCommunityIcons
                name={overdueCount > 0 ? "alert-circle-outline" : "package-variant-closed"}
                size={18}
                color={overdueCount > 0 ? colors.danger : colors.mint}
              />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.heroCardTitle}>
                {(toReturn || []).length === 0 ? "Aucun retour à prévoir" : "Retours à prévoir"}
              </Text>
              <Text style={styles.heroCardSub} numberOfLines={2}>
                {(toReturn || []).length === 0
                  ? "Tes emprunts apparaîtront ici."
                  : overdueCount > 0
                  ? "Un petit message au cercle peut éviter les tensions."
                  : "Tu vois ici tes retours à venir, simplement."}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => openReservations(overdueCount > 0 ? "overdue" : "ongoing")}
              activeOpacity={0.9}
              style={styles.heroBtn}
            >
              <Text style={styles.heroBtnTxt}>Voir</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          {(toReturn || []).length > 0 && (
            <View style={{ marginTop: 10 }}>
              {topReturn.map((r) => (
                <MiniRow
                  key={r.id}
                  icon={r.overdue ? "clock-alert-outline" : "clock-outline"}
                  title={r.item_title}
                  meta={`Chez ${r.other_name}`}
                  badge={r.overdue ? "en retard" : `reste ${r.remaining}`}
                  danger={r.overdue}
                />
              ))}
              {(toReturn || []).length > 3 && (
                <Text style={styles.moreHint}>+{(toReturn || []).length - 3} autre(s)</Text>
              )}
            </View>
          )}
        </View>

        {/* Sections */}
        <Accordion
          title="Remises & récupérations"
          subtitle={pendingCount > 0 ? `${pendingCount} demande(s) en attente` : "Organisation entre proches"}
          icon="handshake-outline"
          open={openKey === "give"}
          onToggle={() => toggle("give")}
        >
          {topGive.length === 0 ? (
            <Text style={styles.emptyTxt}>Rien à organiser pour l’instant.</Text>
          ) : (
            <>
              {topGive.map((r) => (
                <MiniRow
                  key={r.id}
                  icon={r.status === "pending" ? "account-clock-outline" : "calendar-check-outline"}
                  title={r.item_title}
                  meta={`Avec ${r.other_name}`}
                  badge={r.status === "pending" ? "en attente" : r.when}
                />
              ))}

              <View style={{ height: 10 }} />

              <TouchableOpacity
                style={styles.secondaryBtn}
                activeOpacity={0.9}
                onPress={() => openReservations(pendingCount > 0 ? "pending" : "all")}
              >
                <MaterialCommunityIcons name="format-list-bulleted" size={16} color={colors.text} />
                <Text style={styles.secondaryBtnTxt}>Voir tout</Text>
              </TouchableOpacity>
            </>
          )}
        </Accordion>

        <Accordion
          title="Mes ondes"
          subtitle={callsCount ? `${callsCount} au total` : "Demandes d’aide du cercle"}
          icon="broadcast"
          open={openKey === "calls"}
          onToggle={() => toggle("calls")}
        >
          {!calls || calls.length === 0 ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.emptyTxt}>Aucune onde publiée.</Text>
              <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.9} onPress={openOndes}>
                <MaterialCommunityIcons name="plus" size={16} color={colors.text} />
                <Text style={styles.secondaryBtnTxt}>Créer / voir les ondes</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {calls.map((c) => (
                <TouchableOpacity key={c.id} style={styles.rowCard} activeOpacity={0.9} onPress={openOndes}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <MaterialCommunityIcons name="radio-tower" size={18} color={colors.mint} />
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {"  "}
                      {trimToOneLine(c.message || "Onde")}
                    </Text>
                  </View>
                  <Text style={styles.rowMeta}>
                    {formatCallStatus(c.status)} — {timeAgo(new Date(c.created_at))}
                    {c.needed_at ? ` · pour ${fmtDateTime(new Date(c.needed_at))}` : ""}
                  </Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.9} onPress={openOndes}>
                <MaterialCommunityIcons name="arrow-right" size={16} color={colors.text} />
                <Text style={styles.secondaryBtnTxt}>Ouvrir les ondes</Text>
              </TouchableOpacity>
            </>
          )}
        </Accordion>

        <Accordion
          title="Raccourcis"
          subtitle="Actions rapides"
          icon="flash-outline"
          open={openKey === "shortcuts"}
          onToggle={() => toggle("shortcuts")}
        >
          <View style={styles.shortcutsGrid}>
            <QuickCard icon="account-multiple-outline" title="Ouvrir mes cercles" onPress={openCircles} />
            <QuickCard icon="broadcast" title="Voir les ondes" onPress={openOndes} />
            <QuickCard icon="cube-outline" title="Mes annonces" onPress={openMine} />
            <QuickCard icon="clipboard-text-clock-outline" title="Mes réservations" onPress={() => openReservations("all")} />
          </View>
        </Accordion>

        <View style={{ height: 18 }} />
      </View>

      {/* -------- MODALE fallback : Mes réservations -------- */}
      <Modal
        visible={reservationsModalOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setReservationsModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Mes réservations</Text>
              <TouchableOpacity
                onPress={() => setReservationsModalOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Impossible d’ouvrir l’écran “MyReservations” via la navigation (route non trouvée).
            </Text>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {(reservationsAll || []).length === 0 ? (
                <Text style={styles.emptyTxt}>Aucune réservation.</Text>
              ) : (
                reservationsAll.slice(0, 30).map((r) => (
                  <View key={r.id} style={[styles.rowCard, { marginBottom: 10 }]}>
                    <Text style={[styles.rowTitle, { marginBottom: 4 }]} numberOfLines={1}>
                      {r.item_title || "Objet"}
                    </Text>
                    <Text style={styles.rowMeta}>
                      Statut : <Text style={styles.bold}>{formatResStatus(r.status)}</Text>
                    </Text>
                    <Text style={styles.rowMeta}>
                      {r.start_at ? `Début : ${fmtDateTime(new Date(r.start_at))}` : "—"}{" "}
                      {r.end_at ? ` · Fin : ${fmtDateTime(new Date(r.end_at))}` : ""}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.secondaryBtn, { marginTop: 10 }]}
              activeOpacity={0.9}
              onPress={() => {
                setReservationsModalOpen(false);
                Alert.alert(
                  "À vérifier",
                  "Ton App.js a bien une route Stack 'MyReservations'. Si tu vois encore cette modale, c’est que le Dashboard n’est pas dans le même arbre de navigation (ou que la route a un nom différent)."
                );
              }}
            >
              <MaterialCommunityIcons name="information-outline" size={16} color={colors.text} />
              <Text style={styles.secondaryBtnTxt}>Pourquoi je vois cette modale ?</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

/* -------------------- UI components -------------------- */

function PrimaryAction({ icon, label, onPress, badge }) {
  return (
    <TouchableOpacity style={styles.primaryAction} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.primaryActionIcon}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.mint} />
      </View>
      <Text style={styles.primaryActionTxt} numberOfLines={1}>
        {label}
      </Text>
      {!!badge && badge > 0 && (
        <View style={styles.primaryBadge}>
          <Text style={styles.primaryBadgeTxt}>{badge > 99 ? "99+" : String(badge)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function Accordion({ title, subtitle, icon, open, onToggle, children }) {
  return (
    <View style={styles.accWrap}>
      <TouchableOpacity style={styles.accHead} activeOpacity={0.9} onPress={onToggle}>
        <View style={styles.accIcon}>
          <MaterialCommunityIcons name={icon} size={18} color={colors.mint} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.accTitle} numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={styles.accSub} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={22} color={colors.subtext} />
      </TouchableOpacity>

      {open ? <View style={styles.accBody}>{children}</View> : null}
    </View>
  );
}

function MiniRow({ icon, title, meta, badge, danger }) {
  return (
    <View style={styles.miniRow}>
      <MaterialCommunityIcons name={icon} size={18} color={danger ? colors.danger : colors.mint} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.miniTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.miniMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {!!badge && (
        <View style={[styles.pill, danger && styles.pillDanger]}>
          <Text style={[styles.pillTxt, danger && styles.pillTxtDanger]}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

function QuickCard({ icon, title, onPress }) {
  return (
    <TouchableOpacity style={styles.quickCard} activeOpacity={0.9} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.mint} />
      <Text style={styles.quickTxt} numberOfLines={2}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

/* -------------------- Utils -------------------- */

function fmtDateTime(d) {
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function timeLeftLabel(end, now = new Date()) {
  const ms = Math.max(0, end - now);
  const mins = Math.round(ms / 60000);
  if (mins <= 0) return "0 min";
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} j`;
}

function startsInLabel(start, now = new Date()) {
  const ms = start - now;
  if (ms <= 0) return "en cours";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `dans ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `dans ${hours} h`;
  const days = Math.round(hours / 24);
  return `dans ${days} j`;
}

function timeAgo(date) {
  const ms = Date.now() - date.getTime();
  if (ms < 60e3) return "à l’instant";
  const mins = Math.floor(ms / 60e3);
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

function trimToOneLine(s = "") {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
}

function formatCallStatus(s) {
  if (!s) return "envoyée";
  const map = { pending: "envoyée", open: "ouverte", matched: "match", closed: "fermée", canceled: "annulée" };
  return map[s] || s;
}

function formatResStatus(s) {
  const map = {
    pending: "en attente",
    accepted: "acceptée",
    rejected: "refusée",
    refused: "refusée",
    canceled: "annulée",
    done: "terminée",
    returned: "rendu",
  };
  return map[s] || s || "—";
}

/* -------------------- Styles -------------------- */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  wrap: { padding: 16, paddingBottom: 16 },
  inner: { width: "100%" },

  hero: {
    backgroundColor: "#0f1627",
    borderWidth: 1,
    borderColor: "#21314d",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
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
  heroBody: { color: colors.subtext, lineHeight: 20, marginTop: 6 },

  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  primaryAction: {
    width: "48%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1f2a42",
    backgroundColor: "#10192b",
    padding: 12,
    overflow: "hidden",
  },
  primaryActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(29,255,194,0.10)",
    borderWidth: 1,
    borderColor: "rgba(29,255,194,0.20)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  primaryActionTxt: { color: colors.text, fontWeight: "900" },
  primaryBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: colors.mint,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  primaryBadgeTxt: { color: colors.bg, fontWeight: "900", fontSize: 11 },

  heroCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    marginBottom: 10,
  },
  heroCardDanger: {
    borderColor: "rgba(255,107,107,0.35)",
    backgroundColor: "rgba(255,107,107,0.06)",
  },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.20)",
    borderWidth: 1,
    borderColor: colors.stroke,
  },
  heroCardTitle: { color: colors.text, fontWeight: "900" },
  heroCardSub: { color: colors.subtext, marginTop: 2, fontWeight: "700" },
  heroBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  heroBtnTxt: { color: colors.text, fontWeight: "900" },

  miniRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: "rgba(0,0,0,0.18)",
    marginBottom: 8,
  },
  miniTitle: { color: colors.text, fontWeight: "900" },
  miniMeta: { color: colors.subtext, marginTop: 2, fontWeight: "700" },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  pillTxt: { color: colors.text, fontWeight: "900", fontSize: 12 },
  pillDanger: { borderColor: "rgba(255,107,107,0.35)", backgroundColor: "rgba(255,107,107,0.10)" },
  pillTxtDanger: { color: "#ffb3b3" },
  moreHint: { color: colors.subtext, fontWeight: "800", marginTop: 2, textAlign: "right" },

  accWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: "rgba(255,255,255,0.03)",
    marginTop: 10,
    overflow: "hidden",
  },
  accHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  accIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(29,255,194,0.10)",
    borderWidth: 1,
    borderColor: "rgba(29,255,194,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  accTitle: { color: colors.text, fontWeight: "900" },
  accSub: { color: colors.subtext, marginTop: 2, fontWeight: "700" },
  accBody: { paddingHorizontal: 12, paddingBottom: 12 },

  emptyTxt: { color: colors.subtext, fontWeight: "700", paddingVertical: 6 },

  rowCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.stroke,
  },
  rowTitle: { color: colors.text, fontWeight: "800", flex: 1 },
  rowMeta: { color: colors.subtext, marginTop: 2 },
  bold: { color: colors.text, fontWeight: "900" },

  secondaryBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    width: "100%",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.stroke,
  },
  secondaryBtnTxt: { color: colors.text, fontWeight: "900" },

  shortcutsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickCard: {
    width: "48%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  quickTxt: { color: colors.text, fontWeight: "900" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.bg,
    padding: 14,
  },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  modalTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  modalSub: { color: colors.subtext, marginBottom: 10, fontWeight: "700" },
});
