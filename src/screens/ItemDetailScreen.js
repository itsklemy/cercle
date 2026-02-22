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
import { supabase } from "../lib/supabase";
import { colors as themeColors } from "../theme/colors";
import { Ionicons } from "@expo/vector-icons";

/* -------------------- Theme fallback (anti-crash) -------------------- */
const C = themeColors || {};
const colors = {
  bg: C.bg ?? "#0B0E14",
  text: C.text ?? "#F3F4F6",
  subtext: C.subtext ?? "#9AA3B2",
  mint: C.mint ?? "#1DFFC2",
  card: C.card ?? "rgba(255,255,255,0.04)",
  stroke: C.stroke ?? "rgba(255,255,255,0.10)",
  danger: C.danger ?? "#ff6b6b",
};

// ✅ Statuts autorisés par la DB
const RES_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REFUSED: "refused",
  RETURNED: "returned",
};

function fmtDateRange(startISO, endISO) {
  try {
    const s = new Date(startISO);
    const e = new Date(endISO);
    const sameDay = s.toDateString() === e.toDateString();
    const f = (d, withTime = true) =>
      d.toLocaleString("fr-FR", {
        dateStyle: "medium",
        timeStyle: withTime ? "short" : undefined,
      });
    return sameDay
      ? `${f(s)} → ${e.toLocaleTimeString("fr-FR", { timeStyle: "short" })}`
      : `${f(s)} → ${f(e)}`;
  } catch {
    return "—";
  }
}

function fmtShort(d) {
  try {
    return new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

export default function ItemDetailScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const { itemId, title: headerTitle } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [item, setItem] = useState(null);
  const [owner, setOwner] = useState(null); // { id, public_name } (minimal)
  const [activeRes, setActiveRes] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  const [reserving, setReserving] = useState(false);

  // ✅ Dates choisies par l’utilisateur
  const [startAt, setStartAt] = useState(() => new Date());
  const [endAt, setEndAt] = useState(() => new Date(Date.now() + 24 * 3600 * 1000)); // +1 jour
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [androidStep, setAndroidStep] = useState(null); // "start" | "end" | null

  const hasValidDates = useMemo(() => {
    return startAt instanceof Date && endAt instanceof Date && endAt.getTime() > startAt.getTime();
  }, [startAt, endAt]);

  const iAmOwner = useMemo(() => {
    return !!item?.owner_id && !!currentUserId && String(item.owner_id) === String(currentUserId);
  }, [item?.owner_id, currentUserId]);

  // (optionnel) set title si jamais un header réapparaît
  useEffect(() => {
    if (!navigation?.setOptions) return;
    navigation.setOptions({ title: headerTitle || "Détail" });
  }, [headerTitle, navigation]);

  async function handleDeleteItem() {
    if (!item?.id) return;

    setReserving(true);
    try {
      const { data: udata, error: uerr } = await supabase.auth.getUser();
      if (uerr || !udata?.user) throw new Error("Connecte-toi d’abord.");
      const uid = udata.user.id;

      if (String(item.owner_id) !== String(uid)) {
        throw new Error("Tu ne peux supprimer que tes propres annonces.");
      }

      await supabase.from("reservations").delete().eq("item_id", item.id);

      const { error: delErr } = await supabase.from("items").delete().eq("id", item.id);
      if (delErr) throw delErr;

      Alert.alert("Supprimé", "L’annonce a été supprimée.");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Suppression", e?.message || "Impossible de supprimer pour le moment.");
    } finally {
      setReserving(false);
    }
  }

  function confirmDeleteItem() {
    Alert.alert("Supprimer l’annonce", "Tu es sûr(e) ? Cette action est irréversible.", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: handleDeleteItem },
    ]);
  }

  async function sendInAppNotificationSafe(notificationPayload) {
    // best-effort: si table/policy n’existe pas, on ignore sans casser le flow
    try {
      await supabase.from("notifications").insert({
        ...notificationPayload,
        created_at: new Date().toISOString(),
        read: false,
      });
    } catch {}
  }

  async function refreshActiveReservation(forItemId = itemId) {
    try {
      const nowIso = new Date().toISOString();
      const { data: resList, error: resErr } = await supabase
        .from("reservations")
        .select("id, status, start_at, end_at, borrower_id, owner_id")
        .eq("item_id", forItemId)
        .or(`status.eq.${RES_STATUS.PENDING},status.eq.${RES_STATUS.ACCEPTED}`)
        .gte("end_at", nowIso)
        .order("start_at", { ascending: true });

      if (!resErr) setActiveRes((resList || [])[0] || null);
    } catch {}
  }

  // charge item + owner + réservation active + user
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        const { data: udata } = await supabase.auth.getUser();
        const uid = udata?.user?.id || null;
        if (alive) setCurrentUserId(uid);

        const { data: itemData, error: itemErr } = await supabase
          .from("items")
          .select("id,title,description,photo,category,price_cents,price_unit,owner_id,created_at,circle_id")
          .eq("id", itemId)
          .single();

        if (itemErr) throw itemErr;
        if (alive) setItem(itemData);

        // ✅ owner : ta table n'a QUE public_name (d'après tes logs)
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("id, public_name")
          .eq("id", itemData.owner_id)
          .single();

        console.log("profiles owner_id:", itemData.owner_id);
        console.log("profiles result:", prof);
        console.log("profiles error:", profErr);

        if (!profErr && alive) setOwner(prof);

        // réservation active (pending/accepted)
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
          if (!resErr && alive) setActiveRes(first);

          // si c’est MA réservation, on pré-remplit les dates
          if (!resErr && alive && first && String(first.borrower_id) === String(uid)) {
            try {
              if (first.start_at) setStartAt(new Date(first.start_at));
              if (first.end_at) setEndAt(new Date(first.end_at));
            } catch {}
          }
        } catch {}
      } catch (e) {
        if (alive) setErr(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [itemId]);

  const priceStr = useMemo(() => {
    if (!item) return "";
    if (item.price_cents && item.price_unit) {
      const unit = item.price_unit === "day" ? "j" : item.price_unit === "week" ? "sem." : "mois";
      return `${(item.price_cents / 100).toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} €/${unit}`;
    }
    return "Gratuit";
  }, [item]);

  const iAmBorrowerOfActive = useMemo(() => {
    return (
      !!activeRes?.borrower_id &&
      !!currentUserId &&
      String(activeRes.borrower_id) === String(currentUserId)
    );
  }, [activeRes?.borrower_id, currentUserId]);

  const canReserve = useMemo(() => {
    if (!item || !currentUserId) return false;
    if (!item.circle_id || !item.owner_id) return false;
    if (iAmOwner) return false;
    if (activeRes) return false;
    if (!hasValidDates) return false;
    return true;
  }, [item, currentUserId, iAmOwner, activeRes, hasValidDates]);

  function applySafeEnd(newStart, currentEnd) {
    if (!(newStart instanceof Date) || !(currentEnd instanceof Date)) return currentEnd;
    if (currentEnd.getTime() <= newStart.getTime()) {
      return new Date(newStart.getTime() + 3600 * 1000);
    }
    return currentEnd;
  }

  function openDatePicker() {
    if (endAt.getTime() <= startAt.getTime()) {
      setEndAt(new Date(startAt.getTime() + 3600 * 1000));
    }
    if (Platform.OS === "android") setAndroidStep("start");
    else setDateModalOpen(true);
  }

  async function handleReserve() {
    if (!canReserve) {
      if (!hasValidDates) Alert.alert("Dates", "Choisis une date de fin après la date de début.");
      return;
    }

    setReserving(true);
    try {
      const { data: udata, error: uerr } = await supabase.auth.getUser();
      if (uerr || !udata?.user) throw new Error("Connecte-toi d’abord.");
      const borrowerId = udata.user.id;

      if (!item?.circle_id) throw new Error("circle_id manquant sur l’objet.");
      if (!item?.owner_id) throw new Error("owner_id manquant sur l’objet.");

      const payload = {
        circle_id: item.circle_id,
        item_id: item.id,
        owner_id: item.owner_id,
        borrower_id: borrowerId,
        status: RES_STATUS.PENDING,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        created_at: new Date().toISOString(),
      };

      const { error: insErr } = await supabase.from("reservations").insert(payload);
      if (insErr) throw insErr;

      await sendInAppNotificationSafe({
        user_id: item.owner_id,
        type: "reservation_request",
        title: "Nouvelle demande de réservation",
        body: `Demande pour : ${item.title}`,
        data: { item_id: item.id, start_at: payload.start_at, end_at: payload.end_at },
      });

      Alert.alert("Réservation", "Demande envoyée. Tu seras notifié(e) une fois validée.");
      await refreshActiveReservation(item.id);
    } catch (e) {
      Alert.alert("Réservation", e?.message || "Impossible de réserver pour le moment.");
    } finally {
      setReserving(false);
    }
  }

  async function handleCancelReservation() {
    if (!activeRes?.id) return;

    Alert.alert("Annuler", "Tu veux annuler ta demande de réservation ?", [
      { text: "Non", style: "cancel" },
      {
        text: "Oui, annuler",
        style: "destructive",
        onPress: async () => {
          setReserving(true);
          try {
            const { data: udata, error: uerr } = await supabase.auth.getUser();
            if (uerr || !udata?.user) throw new Error("Connecte-toi d’abord.");
            const uid = udata.user.id;

            if (String(activeRes.borrower_id) !== String(uid)) {
              throw new Error("Tu ne peux pas annuler la réservation de quelqu’un d’autre.");
            }

            const { error: upErr } = await supabase
              .from("reservations")
              .update({ status: RES_STATUS.REFUSED })
              .eq("id", activeRes.id);

            if (upErr) throw upErr;

            if (item?.owner_id) {
              await sendInAppNotificationSafe({
                user_id: item.owner_id,
                type: "reservation_cancelled",
                title: "Demande annulée",
                body: `Annulation pour : ${item?.title || "un objet"}`,
                data: { item_id: item?.id, reservation_id: activeRes.id },
              });
            }

            Alert.alert("Réservation", "Ta demande a été annulée.");
            setActiveRes(null);
          } catch (e) {
            Alert.alert("Réservation", e?.message || "Impossible d’annuler pour le moment.");
          } finally {
            setReserving(false);
          }
        },
      },
    ]);
  }

  const padTop = Math.max(insets.top, 12);
  const padBottom = Math.max(insets.bottom, 12);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
        <View style={styles.centerWrap}>
          <ActivityIndicator />
          <Text style={styles.muted}>Chargement…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (err || !item) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
        <View style={styles.centerWrap}>
          <Text style={styles.muted}>{err?.message || "Impossible de charger l’annonce."}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const reservedInfo = activeRes
    ? `Réservé (${fmtDateRange(activeRes.start_at, activeRes.end_at)})`
    : "Disponible";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      {/* Android pickers */}
      {Platform.OS === "android" && androidStep === "start" && (
        <DateTimePicker
          value={startAt}
          mode="datetime"
          is24Hour
          onChange={(_, d) => {
            setAndroidStep(null);
            if (!d) return;
            setStartAt(d);
            setEndAt((prev) => applySafeEnd(d, prev));
            setAndroidStep("end");
          }}
        />
      )}
      {Platform.OS === "android" && androidStep === "end" && (
        <DateTimePicker
          value={endAt}
          mode="datetime"
          is24Hour
          minimumDate={new Date(startAt.getTime() + 60 * 1000)}
          onChange={(_, d) => {
            setAndroidStep(null);
            if (!d) return;
            setEndAt(d);
          }}
        />
      )}

      {/* iOS modal pickers */}
      {Platform.OS === "ios" && (
        <Modal
          visible={dateModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setDateModalOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Choisir les dates</Text>

              <Text style={styles.modalLabel}>Début</Text>
              <DateTimePicker
                value={startAt}
                mode="datetime"
                display="spinner"
                locale="fr-FR"
                onChange={(_, d) => {
                  if (!d) return;
                  setStartAt(d);
                  setEndAt((prev) => applySafeEnd(d, prev));
                }}
              />

              <Text style={[styles.modalLabel, { marginTop: 10 }]}>Fin</Text>
              <DateTimePicker
                value={endAt}
                mode="datetime"
                display="spinner"
                locale="fr-FR"
                minimumDate={new Date(startAt.getTime() + 60 * 1000)}
                onChange={(_, d) => {
                  if (!d) return;
                  setEndAt(d);
                }}
              />

              <View style={styles.modalRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnGhost]}
                  onPress={() => setDateModalOpen(false)}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.modalBtnTxt, { color: colors.text }]}>Fermer</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: colors.mint }]}
                  onPress={() => {
                    if (!hasValidDates) {
                      Alert.alert("Dates", "Choisis une date de fin après la date de début.");
                      return;
                    }
                    setDateModalOpen(false);
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.modalBtnTxt, { color: colors.bg }]}>Valider</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalHint}>
                Plage : {fmtShort(startAt)} → {fmtShort(endAt)}
              </Text>
            </View>
          </View>
        </Modal>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.centeredContent,
          { paddingTop: padTop, paddingBottom: padBottom + 12 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {/* ✅ Overlay actions SUR l'image (croix + poubelle) */}
          <View style={[styles.overlayBar, { paddingTop: Math.max(insets.top, 10) }]}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
              style={styles.overlayBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>

            {iAmOwner ? (
              <TouchableOpacity
                onPress={confirmDeleteItem}
                activeOpacity={0.85}
                style={[styles.overlayBtn, styles.overlayBtnDanger]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>

          {item.photo ? (
            <Image source={{ uri: item.photo }} style={styles.heroImg} />
          ) : (
            <View style={[styles.heroImg, styles.heroPlaceholder]}>
              <Text style={styles.muted}>Pas de photo</Text>
            </View>
          )}

          <View style={{ padding: 14 }}>
            <Text style={styles.title}>{item.title}</Text>

            <View style={styles.rowBetween}>
              {item.category ? <Text style={styles.meta}>{item.category}</Text> : null}
              <Text style={styles.price}>{priceStr}</Text>
            </View>

            <View style={[styles.badge, activeRes ? styles.badgeBusy : styles.badgeFree]}>
              <Text style={styles.badgeTxt}>{reservedInfo}</Text>
            </View>

            <View style={styles.ownerRow}>
              {/* ✅ pas d'avatar_url en DB -> on met l'icône par défaut */}
              <Image source={require("../../assets/icon.png")} style={styles.ownerAvatar} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.ownerLabel}>Posté par</Text>
                <Text style={styles.ownerName} numberOfLines={1}>
                  {String(owner?.public_name || "").trim() ||
                    (item?.owner_id ? `Utilisateur (${String(item.owner_id).slice(0, 6)}…)` : "Utilisateur")}
                </Text>
              </View>
            </View>

            <Text style={styles.desc}>{item.description || "—"}</Text>

            {/* Choix des dates (seulement si dispo) */}
            {!activeRes && !iAmOwner ? (
              <View style={styles.dateBox}>
                <Text style={styles.dateLabel}>Dates choisies</Text>
                <Text style={styles.dateValue}>
                  {fmtShort(startAt)} → {fmtShort(endAt)}
                </Text>

                <TouchableOpacity onPress={openDatePicker} activeOpacity={0.9} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnTxt}>Choisir les dates</Text>
                </TouchableOpacity>

                {!hasValidDates ? (
                  <Text style={[styles.muted, { marginTop: 6, color: colors.danger }]}>
                    La fin doit être après le début.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Bouton principal : réserver ou annuler si c’est ma demande */}
            <TouchableOpacity
              disabled={reserving || (iAmOwner ? true : activeRes ? !iAmBorrowerOfActive : !canReserve)}
              onPress={iAmBorrowerOfActive ? handleCancelReservation : handleReserve}
              activeOpacity={0.9}
              style={[
                styles.primaryBtn,
                (reserving || (iAmOwner ? true : activeRes ? !iAmBorrowerOfActive : !canReserve)) && {
                  opacity: 0.6,
                },
                iAmBorrowerOfActive && styles.primaryBtnDanger,
              ]}
            >
              <Text style={styles.primaryBtnTxt}>
                {iAmOwner
                  ? "Tu es le propriétaire"
                  : activeRes && !iAmBorrowerOfActive
                  ? "Indisponible"
                  : reserving
                  ? iAmBorrowerOfActive
                    ? "Annulation…"
                    : "Réservation…"
                  : iAmBorrowerOfActive
                  ? "Annuler ma demande"
                  : "Réserver"}
              </Text>
            </TouchableOpacity>

            {!item.circle_id || !item.owner_id ? (
              <Text style={[styles.muted, { marginTop: 10 }]}>
                ⚠️ Données manquantes : circle_id / owner_id (réservation impossible)
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.bg },
  centeredContent: { alignItems: "center", paddingHorizontal: 16 },

  centerWrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  card: {
    width: "100%",
    maxWidth: 680,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: colors.card,
  },

  heroImg: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  heroPlaceholder: { alignItems: "center", justifyContent: "center" },

  /* ✅ Overlay actions sur l'image */
  overlayBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  overlayBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  overlayBtnDanger: {
    backgroundColor: "rgba(0,0,0,0.35)",
    borderColor: "rgba(255,107,107,0.45)",
  },

  title: { color: colors.text, fontWeight: "900", fontSize: 20 },

  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },

  meta: { color: colors.subtext, fontWeight: "700" },
  price: { color: colors.text, fontWeight: "900" },

  badge: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginTop: 10,
  },
  badgeFree: { backgroundColor: "rgba(50,205,50,0.18)" },
  badgeBusy: { backgroundColor: "rgba(255,99,71,0.20)" },
  badgeTxt: { color: colors.text, fontWeight: "800" },

  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  ownerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)" },
  ownerLabel: { color: colors.subtext, fontSize: 12 },
  ownerName: { color: colors.text, fontWeight: "800" },

  desc: { color: colors.text, marginTop: 14, lineHeight: 20 },

  dateBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  dateLabel: { color: colors.subtext, fontWeight: "800", fontSize: 12 },
  dateValue: { color: colors.text, marginTop: 6, fontWeight: "800" },

  secondaryBtn: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnTxt: { color: colors.text, fontWeight: "900" },

  primaryBtn: {
    marginTop: 14,
    backgroundColor: colors.mint,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  primaryBtnDanger: {
    backgroundColor: "rgba(255, 107, 107, 0.35)",
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.55)",
  },
  primaryBtnTxt: { color: colors.bg, fontWeight: "900", fontSize: 16 },

  muted: { color: colors.subtext, marginTop: 8, textAlign: "center" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 14,
  },
  modalTitle: { color: colors.text, fontWeight: "900", fontSize: 16, marginBottom: 8 },
  modalLabel: { color: colors.subtext, fontWeight: "800", marginTop: 6, marginBottom: 6 },
  modalRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  modalBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnGhost: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "transparent",
  },
  modalBtnTxt: { fontWeight: "900" },
  modalHint: { marginTop: 10, color: colors.subtext, textAlign: "center", fontWeight: "700" },
});
