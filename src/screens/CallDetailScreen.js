import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  Share,
  Linking,
  ScrollView,
  Modal,
  TouchableWithoutFeedback,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ExpoLinking from "expo-linking";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

const CALL_TTL_HOURS = 7; // cohérent avec CircleScreen

async function getUserOrAlert() {
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;
  if (error) {
    Alert.alert("Auth", "Erreur utilisateur");
    return null;
  }
  if (!user) {
    Alert.alert("Auth", "Connecte-toi d’abord.");
    return null;
  }
  return user;
}

const fmtRemaining = (createdAtIso) => {
  try {
    const created = new Date(createdAtIso).getTime();
    const expires = created + CALL_TTL_HOURS * 3600 * 1000;
    const diff = expires - Date.now();
    if (!Number.isFinite(diff)) return null;
    if (diff <= 0) return "Expirée";

    const totalMin = Math.floor(diff / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;

    if (h <= 0) return `Encore ${m} min`;
    if (m === 0) return `Encore ${h} h`;
    return `Encore ${h} h ${m} min`;
  } catch {
    return null;
  }
};

const fmtDateTime = (iso) => {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

// Invite link (Expo Go dev + prod web)
const getInviteLinkForEnv = (codeOrUrl) => {
  const raw = String(codeOrUrl || "").trim();
  if (!raw) return null;

  let code = raw;
  try {
    if (raw.includes("/invite/")) {
      code = raw.split("/invite/")[1]?.split(/[?#]/)[0]?.trim() || raw;
    } else if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      const seg = (u.pathname || "").split("/").filter(Boolean);
      code = (seg[seg.length - 1] || "").trim();
    }
  } catch {}

  if (__DEV__) {
    return ExpoLinking.createURL(`invite/${code}`);
  }
  return `https://cercle.app/invite/${code}`;
};

// ✅ IMPORTANT : utilise ta table circle_iinvites + invited_by NOT NULL
async function getOrCreateCircleInviteCode(circleId) {
  const user = await getUserOrAlert();
  if (!user) return null;

  // 1) récupérer un code existant (si created_at existe)
  const existing = await supabase
    .from("circle_invites")
    .select("code, created_at")
    .eq("circle_id", circleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing.error && existing.data?.code) return String(existing.data.code);

  // 2) sinon créer
  const code = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 24);

  const ins = await supabase
    .from("circle_invites")
    .insert({
      circle_id: circleId,
      code,
      invited_by: user.id, // ✅ obligatoire
    })
    .select("code")
    .single();

  if (ins.error) {
    Alert.alert("Invitation", ins.error.message || "Impossible de créer une invitation.");
    return null;
  }

  return String(ins.data.code);
}

export default function CallDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets?.() || { top: 0, bottom: 0 };
  const params = route?.params || {};
  const callId = params.callId;
  const callFromList = params.call;

  const [call, setCall] = useState(callFromList || null);
  const [loading, setLoading] = useState(!callFromList);
  const [busy, setBusy] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  // ✅ pour “partager dans un cercle”
  const [circles, setCircles] = useState([]);
  const [shareCirclesOpen, setShareCirclesOpen] = useState(false);
  const [shareCircleIds, setShareCircleIds] = useState([]);
  const [sharingToCircles, setSharingToCircles] = useState(false);

  useEffect(() => {
    (async () => {
      const u = await getUserOrAlert();
      if (u) setCurrentUserId(u.id);
    })();
  }, []);

  const isAuthor = useMemo(() => {
    if (!call || !currentUserId) return false;
    return String(call.author_id) === String(currentUserId);
  }, [call, currentUserId]);

  const displayCategory = useMemo(() => call?.category || "Général", [call]);
  const displayStatus = useMemo(() => String(call?.status || "open").toUpperCase(), [call]);
  const remainingLabel = useMemo(() => (call?.created_at ? fmtRemaining(call.created_at) : null), [call?.created_at]);

  // fetch call
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (callFromList) return;
      if (!callId) {
        Alert.alert("Onde", "Détails indisponibles (ID manquant).");
        navigation.goBack();
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await supabase.from("calls").select("*").eq("id", callId).single();
        if (error) {
          Alert.alert("Erreur", "Impossible de charger l'onde.");
          if (mounted) setCall(null);
        } else {
          if (mounted) setCall(data || null);
        }
      } catch (e) {
        Alert.alert("Erreur", "Impossible de charger l'onde.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [callId, callFromList, navigation]);

  // ✅ fetch circles for “share into circle”
  useEffect(() => {
    let mounted = true;
    (async () => {
      const user = await getUserOrAlert();
      if (!user) return;

      try {
        const [{ data: owned }, { data: memberOf }] = await Promise.all([
          supabase.from("circles").select("*").eq("owner_id", user.id).order("created_at", { ascending: true }),
          supabase.from("circle_members").select("circle_id, circles!inner(*)").eq("user_id", user.id),
        ]);

        const list = [
          ...(owned || []),
          ...((memberOf || []).map((r) => r.circles)).filter(Boolean),
        ];

        const uniq = Array.from(new Map(list.map((c) => [String(c.id), c])).values());
        if (mounted) setCircles(uniq);
      } catch {
        if (mounted) setCircles([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const onHelp = useCallback(async () => {
    if (!call) return;
    const user = await getUserOrAlert();
    if (!user) return;

    setBusy(true);
    try {
      if (call?.join_url) {
        const ok = await Linking.canOpenURL(call.join_url);
        if (ok) {
          await Linking.openURL(call.join_url);
          return;
        }
      }

      const payload = {
        call_id: call.id,
        user_id: user.id,
        status: "accepted",
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("call_responses").insert([payload]);
      if (error) {
        Alert.alert("Je peux aider", "Impossible d’enregistrer ta réponse.");
      } else {
        Alert.alert("Je peux aider", "C’est noté ✅ L’auteur verra ta participation.");
      }
    } catch (e) {
      Alert.alert("Je peux aider", e?.message || "Impossible d’envoyer ta réponse.");
    } finally {
      setBusy(false);
    }
  }, [call]);

  const onDelete = useCallback(async () => {
    if (!call) return;
    const user = await getUserOrAlert();
    if (!user) return;

    if (String(call.author_id) !== String(user.id)) {
      Alert.alert("Suppression", "Tu ne peux supprimer que tes ondes.");
      return;
    }

    Alert.alert("Supprimer", "Supprimer cette onde ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            const { error } = await supabase.from("calls").delete().eq("id", call.id).eq("author_id", user.id);
            if (error) {
              Alert.alert("Suppression", error.message || "Impossible de supprimer.");
              return;
            }
            Alert.alert("Suppression", "Onde supprimée ✅");
            navigation.goBack();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, [call, navigation]);

  // ✅ Partage vers contacts = invite link + code (comme tes autres invites)
  const shareInviteToContacts = useCallback(async () => {
    if (!call) return;

    try {
      const code = await getOrCreateCircleInviteCode(call.circle_id);
      if (!code) return;

      const inviteUrl = getInviteLinkForEnv(code);
      const remaining = call.created_at ? fmtRemaining(call.created_at) : null;

      const message =
        `Onde sur Cercle\n\n` +
        `${call.title?.trim() || "Onde"}\n` +
        `${call.message || ""}\n\n` +
        (remaining ? `${remaining} • Émise le ${fmtDateTime(call.created_at)}\n\n` : "") +
        `👉 Rejoins le cercle pour voir l’onde :\n${inviteUrl}\n\n` +
        `Code : ${code}\n` +
        `Dans l’app : Cercle → “Rejoindre avec un code”`;

      await Share.share({ message });
    } catch (e) {
      Alert.alert("Partager", e?.message || "Impossible de partager pour le moment.");
    }
  }, [call]);

  // ✅ Share into another circle = copy call as current user
  const copyCallToCircles = useCallback(async () => {
    if (!call) return;
    const user = await getUserOrAlert();
    if (!user) return;

    const dests = (shareCircleIds || [])
      .map(String)
      .filter(Boolean)
      .filter((id) => String(id) !== String(call.circle_id));

    if (!dests.length) {
      Alert.alert("Partager", "Choisis au moins un cercle.");
      return;
    }

    setSharingToCircles(true);
    try {
      let ok = 0;
      let ko = 0;

      for (const cid of dests) {
        const payload = {
          circle_id: cid,
          author_id: user.id, // ✅ toi, puisque tu “repartages”
          title: call.title || null,
          category: call.category || "other",
          message: call.message || "",
          status: "open",
          photo: call.photo ?? call.image_url ?? null,
          needed_at: call.needed_at ?? null,
        };

        const { error } = await supabase.from("calls").insert(payload);
        if (error) ko++;
        else ok++;
      }

      setShareCirclesOpen(false);
      setShareCircleIds([]);
      Alert.alert("Partager", `Cercles: ${ok} ok${ko ? ` / ${ko} échec` : ""}`);
    } finally {
      setSharingToCircles(false);
    }
  }, [call, shareCircleIds]);

  // ✅ bouton share = choisir “contacts” ou “cercles”
  const onShare = useCallback(() => {
    Alert.alert("Partager l’onde", "Choisis une option", [
      { text: "Annuler", style: "cancel" },
      { text: "À mes contacts (invitation)", onPress: shareInviteToContacts },
      {
        text: "Dans un cercle",
        onPress: () => {
          setShareCircleIds([]);
          setShareCirclesOpen(true);
        },
      },
    ]);
  }, [shareInviteToContacts]);

  if (loading) {
    return (
      <SafeAreaView style={[s.safe, { paddingTop: Math.max(10, insets.top) }]}>
        <View style={s.center}>
          <ActivityIndicator />
          <Text style={{ color: colors.subtext, marginTop: 8 }}>Chargement…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!call) {
    return (
      <SafeAreaView style={[s.safe, { paddingTop: Math.max(10, insets.top) }]}>
        <View style={s.center}>
          <Text style={s.title}>Onde introuvable</Text>
          <Text style={s.meta}>Cette onde est introuvable ou a été supprimée.</Text>

          <TouchableOpacity onPress={() => navigation.goBack()} style={[s.secondary, { marginTop: 14 }]} activeOpacity={0.9}>
            <Text style={s.secondaryTxt}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safe, { paddingTop: Math.max(6, insets.top) }]} edges={["top", "left", "right"]}>
      {/* Header fixe */}
      <View style={[s.topHeader, { paddingTop: 6 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.iconBtn} activeOpacity={0.9}>
          <MaterialCommunityIcons name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.headerTitle} numberOfLines={1}>
            {call.title?.trim() || "Onde"}
          </Text>
          <Text style={s.headerSub} numberOfLines={1}>
            {displayCategory} • {displayStatus}
            {remainingLabel ? ` • ${remainingLabel}` : ""}
          </Text>
        </View>

        <TouchableOpacity onPress={onShare} style={s.iconBtn} activeOpacity={0.9}>
          <MaterialCommunityIcons name="share-variant-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.wrap}
        contentContainerStyle={{ paddingBottom: Math.max(16, insets.bottom + 14) }}
        showsVerticalScrollIndicator={false}
      >
        {/* Meta “émise le …” */}
        {!!call.created_at && (
          <Text style={[s.meta, { marginTop: 2 }]}>Émise le {fmtDateTime(call.created_at)}</Text>
        )}
        {!!call.needed_at && (
          <Text style={[s.meta, { marginTop: 6 }]}>Besoin : {String(call.needed_at)}</Text>
        )}

        {/* Media (utilise photo si dispo dans ta DB) */}
        <View style={[s.media, { marginTop: 12 }]}>
          {call.photo || call.image_url ? (
            <Image
              source={{ uri: call.photo || call.image_url }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          ) : (
            <View style={s.mediaPh}>
              <MaterialCommunityIcons name="image-off-outline" size={22} color={colors.subtext} />
              <Text style={{ color: colors.subtext, marginTop: 6 }}>Pas d’image</Text>
            </View>
          )}
        </View>

        <Text style={s.message}>{call.message || ""}</Text>

        <View style={s.actions}>
          {!isAuthor ? (
            <TouchableOpacity onPress={onHelp} style={s.primary} disabled={busy} activeOpacity={0.92}>
              <Text style={s.primaryTxt}>{busy ? "…" : "Je peux aider"}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={onDelete}
              style={[
                s.primary,
                { backgroundColor: "rgba(255,80,80,0.18)", borderWidth: 1, borderColor: "rgba(255,80,80,0.30)" },
              ]}
              disabled={busy}
              activeOpacity={0.92}
            >
              <Text style={[s.primaryTxt, { color: "#ffdddd" }]}>{busy ? "…" : "Supprimer"}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={onShare} style={s.secondary} activeOpacity={0.92}>
            <Text style={s.secondaryTxt}>Partager</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ✅ Modal “Partager dans un cercle” */}
      <Modal
        visible={shareCirclesOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShareCirclesOpen(false)}
      >
        <View style={s.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setShareCirclesOpen(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>

          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Partager dans un cercle</Text>
            <Text style={s.modalSub}>Choisis où copier cette onde :</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, marginTop: 12 }}>
              {(circles || [])
                .filter((c) => String(c.id) !== String(call.circle_id))
                .map((c) => {
                  const id = String(c.id);
                  const selected = shareCircleIds.map(String).includes(id);
                  return (
                    <TouchableOpacity
                      key={`dest-${id}`}
                      onPress={() => {
                        setShareCircleIds((prev) => {
                          const p = prev.map(String);
                          return p.includes(id) ? p.filter((x) => x !== id) : [...p, id];
                        });
                      }}
                      style={[s.pill, selected && s.pillActive]}
                      activeOpacity={0.9}
                    >
                      <Text style={[s.pillTxt, selected && s.pillTxtActive]} numberOfLines={1}>
                        {c.name || `Cercle ${id.slice(0, 6)}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>

            <View style={{ height: 14 }} />

            <TouchableOpacity
              disabled={sharingToCircles || shareCircleIds.length === 0}
              onPress={copyCallToCircles}
              style={[
                s.modalPrimary,
                { opacity: sharingToCircles || shareCircleIds.length === 0 ? 0.7 : 1 },
              ]}
              activeOpacity={0.92}
            >
              {sharingToCircles ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={s.modalPrimaryTxt}>Copier ({shareCircleIds.length || 0})</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShareCirclesOpen(false)}
              style={s.modalSecondary}
              activeOpacity={0.92}
            >
              <Text style={s.modalSecondaryTxt}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: colors.bg,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  headerSub: { color: colors.subtext, marginTop: 2, fontSize: 12, fontWeight: "700" },

  wrap: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },

  title: { color: colors.text, fontWeight: "900", fontSize: 18, textAlign: "center" },
  meta: { color: colors.subtext, marginTop: 8, textAlign: "left", lineHeight: 20 },

  media: {
    width: "100%",
    height: 240,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  mediaPh: { flex: 1, alignItems: "center", justifyContent: "center" },

  message: { color: colors.text, marginTop: 14, lineHeight: 20, fontWeight: "600" },

  actions: { flexDirection: "row", gap: 10, marginTop: 18 },
  primary: {
    backgroundColor: colors.mint,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryTxt: { color: colors.bg, textAlign: "center", fontWeight: "900" },
  secondary: {
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  secondaryTxt: { color: colors.text, textAlign: "center", fontWeight: "800" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.bg,
    padding: 14,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingBottom: 18,
  },
  modalTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  modalSub: { color: colors.subtext, marginTop: 6 },

  pill: {
    height: 40,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  pillActive: { borderColor: "rgba(29,255,194,0.30)", backgroundColor: "rgba(29,255,194,0.14)" },
  pillTxt: { color: colors.text, fontWeight: "800" },
  pillTxtActive: { color: colors.mint },

  modalPrimary: {
    backgroundColor: colors.mint,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryTxt: { color: colors.bg, fontWeight: "900" },
  modalSecondary: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  modalSecondaryTxt: { color: colors.text, fontWeight: "800" },
});
