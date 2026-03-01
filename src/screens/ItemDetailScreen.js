// src/screens/ItemDetailScreen.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Image,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Modal,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { colors as themeColors } from "../theme/colors";

/* ─────────────────────────────────────────────
   DESIGN TOKENS — alignés CircleScreen v3
───────────────────────────────────────────── */
const C = themeColors || {};
const colors = {
  bg:       C.bg      ?? "#07090F",
  text:     C.text    ?? "#F0F2F7",
  subtext:  C.subtext ?? "#7A8499",
  mint:     C.mint    ?? "#1DFFC2",
  card:     C.card    ?? "rgba(255,255,255,0.04)",
  stroke:   C.stroke  ?? "rgba(255,255,255,0.07)",
  danger:              "#FF5A5A",
  dangerDim:           "rgba(255,90,90,0.12)",
};

/* ─────────────────────────────────────────────
   CATÉGORIES — même table que CircleScreen v3
   (évite une dépendance circulaire, on duplique juste la lookup)
───────────────────────────────────────────── */
const CATEGORIES = [
  { key: "maison",      label: "Maison",      dot: "#FFB5B3", icon: "home-variant-outline" },
  { key: "jardin",      label: "Jardin",      dot: "#6EE7B7", icon: "flower-outline" },
  { key: "cuisine",     label: "Cuisine",     dot: "#FFE66D", icon: "silverware-fork-knife" },
  { key: "sport",       label: "Sport",       dot: "#85CCFF", icon: "basketball" },
  { key: "vehicule",    label: "Véhicule",    dot: "#85CCFF", icon: "car-outline" },
  { key: "bricolage",   label: "Bricolage",   dot: "#FFE66D", icon: "hammer-screwdriver" },
  { key: "chantiers",   label: "Chantiers",   dot: "#AD8CFF", icon: "hammer-wrench" },
  { key: "abonnements", label: "Abos",        dot: "#AD8CFF", icon: "credit-card-outline" },
  { key: "service",     label: "Service",     dot: "#1DFFC2", icon: "handshake-outline" },
  { key: "entretien",   label: "Entretien",   dot: "#1DFFC2", icon: "spray-bottle" },
  { key: "travail",     label: "Travail",     dot: "#FF4FD8", icon: "briefcase-outline" },
  { key: "animaux",     label: "Animaux",     dot: "#FFB5B3", icon: "paw-outline" },
  { key: "plantes",     label: "Plantes",     dot: "#6EE7B7", icon: "leaf" },
  { key: "dons",        label: "Dons",        dot: "#6EE7B7", icon: "gift-outline" },
  { key: "recette",     label: "Recette",     dot: "#FF4FD8", icon: "chef-hat" },
  { key: "utilitaire",  label: "Utilitaire",  dot: "#1DFFC2", icon: "tools" },
  { key: "other",       label: "Autre",       dot: "#7A8499", icon: "shape-outline" },
];

const catMeta = (k) =>
  CATEGORIES.find((c) => c.key === k) || { label: k || "Autre", dot: "#7A8499", icon: "shape-outline" };

/* ─────────────────────────────────────────────
   GRADIENT MEDIA — même que CardMedia CircleScreen v3
───────────────────────────────────────────── */
const POP = { mint: "#1DFFC2", sky: "#85CCFF", pink: "#FF4FD8", peach: "#FFB5B3", lemon: "#FFE66D", purple: "#AD8CFF" };
const CATEGORY_DA = {
  maison: { a: POP.peach, b: POP.lemon }, jardin: { a: POP.mint, b: POP.sky },
  cuisine: { a: POP.lemon, b: POP.peach }, recette: { a: POP.pink, b: POP.peach },
  sport: { a: POP.sky, b: POP.mint }, vehicule: { a: POP.sky, b: POP.purple },
  utilitaire: { a: POP.mint, b: POP.purple }, bricolage: { a: POP.lemon, b: POP.purple },
  chantiers: { a: POP.purple, b: POP.sky }, service: { a: POP.mint, b: POP.peach },
  entretien: { a: POP.mint, b: POP.lemon }, travail: { a: POP.pink, b: POP.sky },
  animaux: { a: POP.peach, b: POP.pink }, plantes: { a: POP.mint, b: POP.lemon },
  dons: { a: POP.mint, b: POP.peach }, abonnements: { a: POP.purple, b: POP.pink },
  other: { a: POP.sky, b: POP.peach },
};
const daForCat = (k) => CATEGORY_DA[k] || CATEGORY_DA.other;

/* ─────────────────────────────────────────────
   STATUTS RÉSERVATION
───────────────────────────────────────────── */
const RES_STATUS = {
  PENDING:  "pending",
  ACCEPTED: "accepted",
  REFUSED:  "refused",
  RETURNED: "returned",
};

/* ─────────────────────────────────────────────
   HELPERS DATE
───────────────────────────────────────────── */
function fmtDateRange(startISO, endISO) {
  try {
    const s = new Date(startISO);
    const e = new Date(endISO);
    const sameDay = s.toDateString() === e.toDateString();
    const f = (d, withTime = true) =>
      d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: withTime ? "short" : undefined });
    return sameDay
      ? `${f(s)} → ${e.toLocaleTimeString("fr-FR", { timeStyle: "short" })}`
      : `${f(s)} → ${f(e)}`;
  } catch { return "—"; }
}

function fmtShort(d) {
  try { return new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return "—"; }
}

function applySafeEnd(newStart, currentEnd) {
  if (!(newStart instanceof Date) || !(currentEnd instanceof Date)) return currentEnd;
  return currentEnd.getTime() <= newStart.getTime()
    ? new Date(newStart.getTime() + 3600 * 1000)
    : currentEnd;
}

/* ─────────────────────────────────────────────
   HELPER NOTIFICATIONS
───────────────────────────────────────────── */
async function sendInAppNotificationSafe(payload) {
  try {
    await supabase.from("notifications").insert({
      ...payload,
      created_at: new Date().toISOString(),
      read: false,
    });
  } catch {}
}

/* ─────────────────────────────────────────────
   COMPOSANT INITIAUX AVATAR
───────────────────────────────────────────── */
function InitialsAvatar({ name, size = 36 }) {
  const s = String(name || "").trim();
  const parts = s.split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[1]?.[0] || "" : "")).toUpperCase() || "?";
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: "rgba(29,255,194,0.15)",
      alignItems: "center", justifyContent: "center",
      borderWidth: 1, borderColor: "rgba(29,255,194,0.30)",
    }}>
      <Text style={{ color: colors.mint, fontWeight: "900", fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

/* ─────────────────────────────────────────────
   SCREEN
───────────────────────────────────────────── */
export default function ItemDetailScreen() {
  const insets     = useSafeAreaInsets();
  const route      = useRoute();
  const navigation = useNavigation();
  const { itemId, title: headerTitle } = route.params || {};

  const [loading,       setLoading]       = useState(true);
  const [err,           setErr]           = useState(null);
  const [item,          setItem]          = useState(null);
  const [owner,         setOwner]         = useState(null);
  const [activeRes,     setActiveRes]     = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [reserving,     setReserving]     = useState(false);

  // Dates emprunt
  const [startAt,       setStartAt]       = useState(() => new Date());
  const [endAt,         setEndAt]         = useState(() => new Date(Date.now() + 24 * 3600 * 1000));
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [androidStep,   setAndroidStep]   = useState(null);

  const hasValidDates = useMemo(
    () => startAt instanceof Date && endAt instanceof Date && endAt.getTime() > startAt.getTime(),
    [startAt, endAt]
  );

  const iAmOwner = useMemo(
    () => !!item?.owner_id && !!currentUserId && String(item.owner_id) === String(currentUserId),
    [item?.owner_id, currentUserId]
  );

  const iAmBorrowerOfActive = useMemo(
    () => !!activeRes?.borrower_id && !!currentUserId && String(activeRes.borrower_id) === String(currentUserId),
    [activeRes?.borrower_id, currentUserId]
  );

  const canReserve = useMemo(() => {
    if (!item || !currentUserId) return false;
    if (!item.circle_id || !item.owner_id) return false;
    if (iAmOwner) return false;
    if (activeRes) return false;
    if (!hasValidDates) return false;
    return true;
  }, [item, currentUserId, iAmOwner, activeRes, hasValidDates]);

  /* ── Chargement ── */
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const { data: udata } = await supabase.auth.getUser();
        const uid = udata?.user?.id || null;
        if (alive) setCurrentUserId(uid);

        // Item — on sélectionne les colonnes réelles sauvées par AddItemModal v3
        const { data: itemData, error: itemErr } = await supabase
          .from("items")
          .select("id, title, description, photo, category, price_cents, price_unit, owner_id, created_at, circle_id")
          .eq("id", itemId)
          .single();

        if (itemErr) throw itemErr;
        if (alive) setItem(itemData);

        // Propriétaire — public_name uniquement
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, public_name")
          .eq("id", itemData.owner_id)
          .single();
        if (alive && prof) setOwner(prof);

        // Réservation active
        try {
          const nowIso = new Date().toISOString();
          const { data: resList, error: resErr } = await supabase
            .from("reservations")
            .select("id, status, start_at, end_at, borrower_id, owner_id")
            .eq("item_id", itemId)
            .or(`status.eq.${RES_STATUS.PENDING},status.eq.${RES_STATUS.ACCEPTED}`)
            .gte("end_at", nowIso)
            .order("start_at", { ascending: true });

          const first = (resList || [])[0] || null;
          if (!resErr && alive) {
            setActiveRes(first);
            // pré-remplir les dates si c'est MA réservation
            if (first && String(first.borrower_id) === String(uid)) {
              try {
                if (first.start_at) setStartAt(new Date(first.start_at));
                if (first.end_at)   setEndAt(new Date(first.end_at));
              } catch {}
            }
          }
        } catch {}
      } catch (e) {
        if (alive) setErr(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [itemId]);

  /* ── Refresh réservation ── */
  async function refreshActiveReservation(forItemId = itemId) {
    try {
      const nowIso = new Date().toISOString();
      const { data: resList, error } = await supabase
        .from("reservations")
        .select("id, status, start_at, end_at, borrower_id, owner_id")
        .eq("item_id", forItemId)
        .or(`status.eq.${RES_STATUS.PENDING},status.eq.${RES_STATUS.ACCEPTED}`)
        .gte("end_at", nowIso)
        .order("start_at", { ascending: true });
      if (!error) setActiveRes((resList || [])[0] || null);
    } catch {}
  }

  /* ── Prix lisible — colonnes DB réelles : price_cents / price_unit ── */
  const priceStr = useMemo(() => {
    if (!item) return "";
    if (!item.price_cents) return "Prêt gratuit";
    const unit = item.price_unit === "week" ? "sem." : item.price_unit === "month" ? "mois" : "jour";
    return `${(item.price_cents / 100).toLocaleString("fr-FR", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    })} €/${unit}`;
  }, [item]);

  /* ── Supprimer l'objet ── */
  async function handleDeleteItem() {
    if (!item?.id) return;
    setReserving(true);
    try {
      const { data: udata, error: uerr } = await supabase.auth.getUser();
      if (uerr || !udata?.user) throw new Error("Connecte-toi d'abord.");
      if (String(item.owner_id) !== String(udata.user.id))
        throw new Error("Tu ne peux supprimer que tes propres objets.");
      await supabase.from("reservations").delete().eq("item_id", item.id);
      const { error: delErr } = await supabase.from("items").delete().eq("id", item.id);
      if (delErr) throw delErr;
      Alert.alert("Retiré du vestiaire", "L'objet a bien été supprimé.");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Suppression", e?.message || "Impossible de supprimer pour le moment.");
    } finally { setReserving(false); }
  }

  function confirmDeleteItem() {
    Alert.alert("Retirer cet objet ?", "Il sera retiré du vestiaire pour tout le cercle.", [
      { text: "Annuler", style: "cancel" },
      { text: "Retirer", style: "destructive", onPress: handleDeleteItem },
    ]);
  }

  /* ── Réserver ── */
  async function handleReserve() {
    if (!canReserve) {
      if (!hasValidDates) Alert.alert("Dates", "Choisis une date de fin après la date de début.");
      return;
    }
    setReserving(true);
    try {
      const { data: udata, error: uerr } = await supabase.auth.getUser();
      if (uerr || !udata?.user) throw new Error("Connecte-toi d'abord.");
      const borrowerId = udata.user.id;
      if (!item?.circle_id) throw new Error("Données incomplètes (circle_id manquant).");
      if (!item?.owner_id)  throw new Error("Données incomplètes (owner_id manquant).");

      const { error: insErr } = await supabase.from("reservations").insert({
        circle_id:   item.circle_id,
        item_id:     item.id,
        owner_id:    item.owner_id,
        borrower_id: borrowerId,
        status:      RES_STATUS.PENDING,
        start_at:    startAt.toISOString(),
        end_at:      endAt.toISOString(),
        created_at:  new Date().toISOString(),
      });
      if (insErr) throw insErr;

      await sendInAppNotificationSafe({
        user_id: item.owner_id,
        type: "reservation_request",
        title: "Demande d'emprunt",
        body: `Quelqu'un veut emprunter : ${item.title}`,
        data: { item_id: item.id, start_at: startAt.toISOString(), end_at: endAt.toISOString() },
      });

      Alert.alert("Demande envoyée ✓", "Le propriétaire sera notifié. Tu seras prévenu(e) une fois confirmé.");
      await refreshActiveReservation(item.id);
    } catch (e) {
      Alert.alert("Emprunt", e?.message || "Impossible de soumettre la demande pour le moment.");
    } finally { setReserving(false); }
  }

  /* ── Annuler sa demande ── */
  async function handleCancelReservation() {
    if (!activeRes?.id) return;
    Alert.alert("Annuler l'emprunt ?", "Ta demande sera annulée.", [
      { text: "Non", style: "cancel" },
      { text: "Oui, annuler", style: "destructive", onPress: async () => {
        setReserving(true);
        try {
          const { data: udata, error: uerr } = await supabase.auth.getUser();
          if (uerr || !udata?.user) throw new Error("Connecte-toi d'abord.");
          if (String(activeRes.borrower_id) !== String(udata.user.id))
            throw new Error("Tu ne peux pas annuler la demande de quelqu'un d'autre.");
          const { error: upErr } = await supabase
            .from("reservations").update({ status: RES_STATUS.REFUSED }).eq("id", activeRes.id);
          if (upErr) throw upErr;
          await sendInAppNotificationSafe({
            user_id: item?.owner_id,
            type: "reservation_cancelled",
            title: "Demande annulée",
            body: `Annulation pour : ${item?.title || "un objet"}`,
            data: { item_id: item?.id, reservation_id: activeRes.id },
          });
          Alert.alert("Annulé", "Ta demande d'emprunt a été annulée.");
          setActiveRes(null);
        } catch (e) {
          Alert.alert("Emprunt", e?.message || "Impossible d'annuler pour le moment.");
        } finally { setReserving(false); }
      }},
    ]);
  }

  /* ── Date picker ── */
  function openDatePicker() {
    if (endAt.getTime() <= startAt.getTime())
      setEndAt(new Date(startAt.getTime() + 3600 * 1000));
    if (Platform.OS === "android") setAndroidStep("start");
    else setDateModalOpen(true);
  }

  /* ─────────── LOADING / ERROR ─────────── */
  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.centerWrap}>
          <ActivityIndicator color={colors.mint} />
          <Text style={styles.muted}>Chargement…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (err || !item) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.centerWrap}>
          <MaterialCommunityIcons name="alert-circle-outline" size={40} color={colors.subtext} />
          <Text style={[styles.muted, { marginTop: 12 }]}>
            {err?.message || "Impossible de charger cet objet."}
          </Text>
          <TouchableOpacity onPress={() => navigation.goBack()}
            style={[styles.secondaryBtn, { marginTop: 16, paddingHorizontal: 20 }]}>
            <Text style={styles.secondaryBtnTxt}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const meta = catMeta(item.category);
  const da   = daForCat(item.category);
  const isAvailable = !activeRes;

  /* ─────────── RENDER ─────────── */
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>

      {/* Android date pickers */}
      {Platform.OS === "android" && androidStep === "start" && (
        <DateTimePicker value={startAt} mode="datetime" is24Hour
          onChange={(_, d) => {
            setAndroidStep(null);
            if (!d) return;
            setStartAt(d); setEndAt((prev) => applySafeEnd(d, prev));
            setAndroidStep("end");
          }} />
      )}
      {Platform.OS === "android" && androidStep === "end" && (
        <DateTimePicker value={endAt} mode="datetime" is24Hour
          minimumDate={new Date(startAt.getTime() + 60 * 1000)}
          onChange={(_, d) => { setAndroidStep(null); if (d) setEndAt(d); }} />
      )}

      {/* iOS date modal */}
      {Platform.OS === "ios" && (
        <Modal visible={dateModalOpen} transparent animationType="fade"
          onRequestClose={() => setDateModalOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Période d'emprunt</Text>
              <Text style={styles.modalLabel}>Début</Text>
              <DateTimePicker value={startAt} mode="datetime" display="spinner" locale="fr-FR"
                onChange={(_, d) => {
                  if (!d) return;
                  setStartAt(d); setEndAt((prev) => applySafeEnd(d, prev));
                }} />
              <Text style={[styles.modalLabel, { marginTop: 10 }]}>Fin</Text>
              <DateTimePicker value={endAt} mode="datetime" display="spinner" locale="fr-FR"
                minimumDate={new Date(startAt.getTime() + 60 * 1000)}
                onChange={(_, d) => { if (d) setEndAt(d); }} />
              <View style={styles.modalRow}>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]}
                  onPress={() => setDateModalOpen(false)} activeOpacity={0.9}>
                  <Text style={[styles.modalBtnTxt, { color: colors.text }]}>Fermer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: colors.mint }]}
                  onPress={() => {
                    if (!hasValidDates) { Alert.alert("Dates", "La fin doit être après le début."); return; }
                    setDateModalOpen(false);
                  }} activeOpacity={0.9}>
                  <Text style={[styles.modalBtnTxt, { color: colors.bg }]}>Valider</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.modalHint}>
                {fmtShort(startAt)} → {fmtShort(endAt)}
              </Text>
            </View>
          </View>
        </Modal>
      )}

      <ScrollView style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: 0, paddingBottom: Math.max(insets.bottom, 24) + 12 }]}
        showsVerticalScrollIndicator={false}>

        {/* ── HERO IMAGE avec gradient catégorie ── */}
        <View style={styles.heroWrap}>
          {/* Fond gradient catégorie */}
          <LinearGradient colors={[da.a, da.b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill} />
          <View style={{ position: "absolute", width: 220, height: 220, borderRadius: 110,
            backgroundColor: "rgba(255,255,255,0.10)", top: -70, right: -70 }} />

          {/* Photo si disponible */}
          {!!item.photo && (
            <>
              <Image source={{ uri: item.photo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <LinearGradient colors={["rgba(0,0,0,0)", "rgba(7,9,15,0.72)"]}
                start={{ x: 0, y: 0.3 }} end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill} />
            </>
          )}

          {/* Bouton retour */}
          <TouchableOpacity onPress={() => navigation.goBack()}
            style={[styles.overlayBtn, { top: Math.max(insets.top, 14), left: 14 }]}
            activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>

          {/* Bouton supprimer (owner only) */}
          {iAmOwner && (
            <TouchableOpacity onPress={confirmDeleteItem}
              style={[styles.overlayBtn, styles.overlayBtnDanger, { top: Math.max(insets.top, 14), right: 14 }]}
              activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          )}

          {/* Badge catégorie en bas à gauche */}
          <View style={[styles.catBadge, { bottom: 14, left: 14 }]}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: meta.dot }} />
            <Text style={styles.catBadgeTxt}>{meta.label}</Text>
          </View>

          {/* Badge dispo en bas à droite */}
          <View style={[
            styles.availBadge,
            isAvailable ? styles.availBadgeOk : styles.availBadgeBusy,
            { bottom: 14, right: 14 },
          ]}>
            <View style={{ width: 6, height: 6, borderRadius: 3,
              backgroundColor: isAvailable ? "#1DFFC2" : "#FF8C69" }} />
            <Text style={[styles.availBadgeTxt, { color: isAvailable ? "#1DFFC2" : "#FF8C69" }]}>
              {isAvailable ? "Disponible" : "Emprunté"}
            </Text>
          </View>
        </View>

        {/* ── CONTENU ── */}
        <View style={styles.bodyPad}>

          {/* Titre + prix */}
          <View style={{ flexDirection: "row", alignItems: "flex-start",
            justifyContent: "space-between", gap: 12, marginTop: 16 }}>
            <Text style={styles.title} numberOfLines={3}>{item.title}</Text>
            <View style={[styles.pricePill, !item.price_cents
              ? { backgroundColor: "rgba(29,255,194,0.12)", borderColor: "rgba(29,255,194,0.30)" }
              : { backgroundColor: "rgba(255,230,109,0.12)", borderColor: "rgba(255,230,109,0.30)" }]}>
              <Text style={[styles.priceTxt, { color: !item.price_cents ? "#1DFFC2" : "#FFE66D" }]}>
                {priceStr}
              </Text>
            </View>
          </View>

          {/* Description */}
          {!!item.description && (
            <Text style={styles.desc}>{item.description}</Text>
          )}

          {/* ── Propriétaire ── */}
          <View style={styles.ownerRow}>
            <InitialsAvatar name={owner?.public_name || ""} size={38} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.ownerLabel}>Partagé par</Text>
              <Text style={styles.ownerName} numberOfLines={1}>
                {String(owner?.public_name || "").trim() ||
                  (item?.owner_id ? `Membre (…${String(item.owner_id).slice(-4)})` : "Membre du cercle")}
              </Text>
            </View>
            {iAmOwner && (
              <View style={styles.ownerBadge}>
                <Text style={styles.ownerBadgeTxt}>C'est toi ✓</Text>
              </View>
            )}
          </View>

          {/* ── Réservation active par quelqu'un d'autre ── */}
          {activeRes && !iAmBorrowerOfActive && (
            <View style={styles.busyBox}>
              <MaterialCommunityIcons name="clock-outline" size={16} color="#FF8C69" />
              <Text style={styles.busyTxt}>
                Emprunté · {fmtDateRange(activeRes.start_at, activeRes.end_at)}
              </Text>
            </View>
          )}

          {/* ── MA réservation en cours ── */}
          {activeRes && iAmBorrowerOfActive && (
            <View style={styles.myResBox}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#1DFFC2" />
              <Text style={styles.myResTxt}>
                Ta demande · {fmtDateRange(activeRes.start_at, activeRes.end_at)}
              </Text>
            </View>
          )}

          {/* ── Sélection dates (si dispo et pas owner) ── */}
          {!activeRes && !iAmOwner && (
            <View style={styles.dateBox}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <MaterialCommunityIcons name="calendar-range" size={16} color={colors.mint} />
                <Text style={styles.dateBoxTitle}>Période d'emprunt</Text>
              </View>
              <Text style={styles.dateValue}>
                {fmtShort(startAt)} → {fmtShort(endAt)}
              </Text>
              <TouchableOpacity onPress={openDatePicker} activeOpacity={0.9}
                style={styles.secondaryBtn}>
                <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.text} />
                <Text style={styles.secondaryBtnTxt}>Modifier les dates</Text>
              </TouchableOpacity>
              {!hasValidDates && (
                <Text style={[styles.muted, { color: colors.danger, marginTop: 6 }]}>
                  La fin doit être après le début.
                </Text>
              )}
            </View>
          )}

          {/* ── Infos owner ── */}
          {iAmOwner && (
            <View style={styles.ownerInfoBox}>
              <MaterialCommunityIcons name="information-outline" size={15} color={colors.subtext} />
              <Text style={styles.ownerInfoTxt}>
                Tu es le propriétaire de cet objet.
              </Text>
            </View>
          )}

          {/* ── Données manquantes ── */}
          {(!item.circle_id || !item.owner_id) && (
            <View style={[styles.ownerInfoBox, { borderColor: "rgba(255,90,90,0.25)" }]}>
              <MaterialCommunityIcons name="alert-outline" size={15} color={colors.danger} />
              <Text style={[styles.ownerInfoTxt, { color: colors.danger }]}>
                Données manquantes — emprunt impossible (circle_id / owner_id).
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── CTA FIXE EN BAS ── */}
      {!iAmOwner && (
        <View style={[styles.ctaBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            disabled={reserving || (activeRes ? !iAmBorrowerOfActive : !canReserve)}
            onPress={iAmBorrowerOfActive ? handleCancelReservation : handleReserve}
            activeOpacity={0.9}
            style={[
              styles.ctaBtn,
              iAmBorrowerOfActive
                ? { backgroundColor: colors.dangerDim, borderWidth: 1, borderColor: "rgba(255,90,90,0.40)" }
                : activeRes
                  ? { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.stroke }
                  : { backgroundColor: colors.mint },
              (reserving || (activeRes && !iAmBorrowerOfActive)) && { opacity: 0.55 },
            ]}>
            {reserving
              ? <ActivityIndicator color={iAmBorrowerOfActive ? colors.danger : colors.bg} />
              : <>
                  <MaterialCommunityIcons
                    name={iAmBorrowerOfActive ? "close-circle-outline" : activeRes ? "lock-outline" : "hand-extended-outline"}
                    size={18}
                    color={iAmBorrowerOfActive ? colors.danger : activeRes ? colors.subtext : colors.bg}
                  />
                  <Text style={[styles.ctaBtnTxt, {
                    color: iAmBorrowerOfActive ? colors.danger : activeRes ? colors.subtext : colors.bg,
                  }]}>
                    {activeRes && !iAmBorrowerOfActive
                      ? "Indisponible"
                      : iAmBorrowerOfActive
                        ? "Annuler ma demande"
                        : "Demander à emprunter"}
                  </Text>
                </>
            }
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────
   STYLES
───────────────────────────────────────────── */
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.bg },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 0 },

  centerWrap: {
    flex: 1, backgroundColor: colors.bg,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 24,
  },

  /* ── Hero ── */
  heroWrap: {
    width: "100%", aspectRatio: 1.1,
    backgroundColor: "rgba(255,255,255,0.04)",
    overflow: "hidden", position: "relative",
  },
  overlayBtn: {
    position: "absolute", zIndex: 50,
    width: 40, height: 40, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.40)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
  },
  overlayBtnDanger: {
    borderColor: "rgba(255,90,90,0.45)",
  },
  catBadge: {
    position: "absolute", zIndex: 10,
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
  },
  catBadgeTxt: { color: "rgba(255,255,255,0.92)", fontSize: 11, fontWeight: "700" },
  availBadge: {
    position: "absolute", zIndex: 10,
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
  },
  availBadgeOk:   { backgroundColor: "rgba(29,255,194,0.12)",  borderColor: "rgba(29,255,194,0.35)" },
  availBadgeBusy: { backgroundColor: "rgba(255,140,105,0.12)", borderColor: "rgba(255,140,105,0.35)" },
  availBadgeTxt:  { fontSize: 11, fontWeight: "800" },

  /* ── Body ── */
  bodyPad: { paddingHorizontal: 16 },

  title: { color: colors.text, fontWeight: "900", fontSize: 22, lineHeight: 28, flex: 1 },

  pricePill: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, alignSelf: "flex-start", flexShrink: 0, marginTop: 4,
  },
  priceTxt: { fontSize: 12, fontWeight: "900" },

  desc: { color: colors.subtext, marginTop: 10, lineHeight: 21, fontSize: 14 },

  /* ── Owner ── */
  ownerRow: {
    flexDirection: "row", alignItems: "center", gap: 12, marginTop: 18,
    paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  ownerLabel:     { color: colors.subtext, fontSize: 11, fontWeight: "600" },
  ownerName:      { color: colors.text, fontWeight: "800", fontSize: 14, marginTop: 2 },
  ownerBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: "rgba(29,255,194,0.12)", borderWidth: 1, borderColor: "rgba(29,255,194,0.30)" },
  ownerBadgeTxt:  { color: "#1DFFC2", fontSize: 12, fontWeight: "800" },

  /* ── États réservation ── */
  busyBox: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14,
    padding: 12, borderRadius: 14,
    backgroundColor: "rgba(255,140,105,0.08)", borderWidth: 1, borderColor: "rgba(255,140,105,0.25)",
  },
  busyTxt: { color: "#FF8C69", fontWeight: "700", fontSize: 13, flex: 1 },

  myResBox: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14,
    padding: 12, borderRadius: 14,
    backgroundColor: "rgba(29,255,194,0.08)", borderWidth: 1, borderColor: "rgba(29,255,194,0.25)",
  },
  myResTxt: { color: "#1DFFC2", fontWeight: "700", fontSize: 13, flex: 1 },

  /* ── Dates ── */
  dateBox: {
    marginTop: 16, padding: 14, borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  dateBoxTitle: { color: colors.text, fontWeight: "800", fontSize: 13 },
  dateValue:    { color: colors.mint, fontWeight: "800", fontSize: 14, marginBottom: 10 },

  /* ── Info boxes ── */
  ownerInfoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 14,
    padding: 12, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  ownerInfoTxt: { color: colors.subtext, fontSize: 13, lineHeight: 18, flex: 1 },

  /* ── Boutons ── */
  secondaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
    paddingVertical: 11, backgroundColor: "rgba(255,255,255,0.04)",
  },
  secondaryBtnTxt: { color: colors.text, fontWeight: "800" },

  /* ── CTA fixe bas ── */
  ctaBar: {
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: colors.bg,
  },
  ctaBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    height: 52, borderRadius: 16, paddingHorizontal: 20,
  },
  ctaBtnTxt: { fontWeight: "900", fontSize: 16 },

  /* ── Misc ── */
  muted: { color: colors.subtext, marginTop: 8, textAlign: "center" },

  /* ── Date modal ── */
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center", padding: 16,
  },
  modalCard: {
    width: "100%", maxWidth: 520, borderRadius: 20,
    backgroundColor: colors.bg, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)", padding: 16,
  },
  modalTitle:     { color: colors.text, fontWeight: "900", fontSize: 17, marginBottom: 10 },
  modalLabel:     { color: colors.subtext, fontWeight: "800", marginTop: 6, marginBottom: 6 },
  modalRow:       { flexDirection: "row", gap: 10, marginTop: 12 },
  modalBtn:       { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  modalBtnGhost:  { borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", backgroundColor: "transparent" },
  modalBtnTxt:    { fontWeight: "900" },
  modalHint:      { marginTop: 10, color: colors.subtext, textAlign: "center", fontWeight: "700", fontSize: 12 },
});