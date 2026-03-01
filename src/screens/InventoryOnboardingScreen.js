
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View, Text, TouchableOpacity, TextInput, ActivityIndicator,
  Alert, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, Share, Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

/* ─── TOKENS ─── */
const MINT    = "#1DFFC2";
const BG      = "#07090F";
const TEXT    = "#F0F2F7";
const SUBTEXT = "#5A6478";
const STROKE  = "rgba(255,255,255,0.08)";
const LEMON   = "#FFE66D";
const SKY     = "#85CCFF";
const GREEN   = "#6EE7B7";

/* ─── CONSTANTS ─── */
const ONBOARDING_KEY_PREFIX = "onboarding_done_v1_";
const PENDING_INVITE_KEY    = "pending_invite_v1";
const ITEMS_TABLE           = "items";
const onboardingKey         = (uid) => `${ONBOARDING_KEY_PREFIX}${String(uid || "")}`;

/* ─────────────────────────────────────────────
   3 CATÉGORIES PRIORITAIRES
   Objets chers, encombrants, utilisés 1x/an
   La vraie raison de télécharger l'app.
   Clés = exactement celles de CircleScreen/CATEGORIES
─────────────────────────────────────────────── */
const PRIORITY_CATS = [
  {
    key: "bricolage", label: "Bricolage & Travaux",
    icon: "hammer-screwdriver", color: SKY,
    items: [
      "Perceuse", "Visseuse", "Perforateur SDS", "Marteau piqueur",
      "Scie circulaire", "Scie sauteuse", "Ponceuse orbitale",
      "Niveau laser", "Compresseur", "Pistolet peinture",
      "Echelle coulissante", "Echafaudage", "Tresteaux",
      "Diable", "Sangles arrimage",
    ],
  },
  {
    key: "sport", label: "Outdoor & Camping",
    icon: "hiking", color: MINT,
    items: [
      "Tente 2 places", "Tente familiale", "Sac de couchage",
      "Matelas gonflable", "Rechaud camping", "Table pliante",
      "Chaises pliantes", "Hamac", "Parasol", "Glaciere",
      "Sac a dos rando", "Batons de marche",
      "Kayak", "Planche de paddle", "Velo pliant",
    ],
  },
  {
    key: "maison", label: "Maison & Quotidien",
    icon: "home-variant-outline", color: LEMON,
    items: [
      "Escabeau", "Aspirateur", "Robot aspirateur", "Nettoyeur vapeur",
      "Shampouineuse", "Table a repasser", "Rallonge electrique",
      "Ventilateur", "Chauffage appoint", "Climatiseur mobile",
      "Deshumidificateur", "Machine a coudre", "Pistolet colle",
    ],
  },
];

/* ─── HELPERS ─── */
const titlePretty = (s) => {
  const t = String(s || "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
};

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) { Alert.alert("Auth", "Connecte-toi d'abord."); return null; }
  return data.user;
}

function makeReadableCode(circleName) {
  const prefix = String(circleName || "CERCLE")
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/g, "")
    .slice(0, 7) || "CERCLE";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const suffix = Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  return `${prefix}-${suffix}`;
}

async function getOrCreateInviteCode(circleId, circleName) {
  try {
    const { data } = await supabase.from("circle_invites").select("code")
      .eq("circle_id", circleId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.code) return String(data.code);
    const user = await getCurrentUser();
    const code = makeReadableCode(circleName);
    if (!user) return code;
    const { data: ins, error } = await supabase.from("circle_invites")
      .insert({ circle_id: circleId, code, invited_by: user.id }).select("code").single();
    return error ? code : String(ins.code);
  } catch { return makeReadableCode(circleName); }
}

const buildInviteMessage = (circleName, code, itemTitles = []) => {
  const top = itemTitles.slice(0, 3);
  const objectLine = top.length > 0
    ? "\nJe mets a dispo : " + top.join(", ") + "\n"
    : "";
  return [
    "Je t'invite dans mon cercle \"" + circleName + "\" sur Cercle !",
    objectLine,
    "1. Telecharge l'app Cercle",
    "2. Appuie sur \"J'ai un code d'invitation\"",
    "3. Entre ce code : " + code,
    "",
    "C'est tout !",
  ].join("\n");
};

/* ─── CHIP ANIMÉ ─── */
function Chip({ label, selected, onPress, color }) {
  const scale = useRef(new Animated.Value(1)).current;
  const tap = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.91, duration: 60, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 230, friction: 8, useNativeDriver: true }),
    ]).start();
    onPress();
  };
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity onPress={tap} activeOpacity={0.85}
        style={[SS.chip, selected && { backgroundColor: color + "18", borderColor: color + "50" }]}>
        {selected && <MaterialCommunityIcons name="check" size={11} color={color} />}
        <Text style={[SS.chipTxt, selected && { color: TEXT, fontWeight: "900" }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

/* ─── SCREEN ─── */
export default function InventoryOnboardingScreen({ navigation, route }) {
  const [step,       setStep]      = useState(1);
  const [checking,   setChecking]  = useState(true);
  const [circleName, setCircleName] = useState("Mon cercle");
  const [saving,     setSaving]    = useState(false);
  const [sharing,    setSharing]   = useState(false);

  const [selections, setSelections] = useState(
    Object.fromEntries(PRIORITY_CATS.map((c) => [c.key, []]))
  );
  const [customItems,  setCustomItems]  = useState(
    Object.fromEntries(PRIORITY_CATS.map((c) => [c.key, []]))
  );
  const [customDrafts, setCustomDrafts] = useState(
    Object.fromEntries(PRIORITY_CATS.map((c) => [c.key, ""]))
  );

  const [createdId,  setCreatedId]  = useState(null);
  const [inviteCode, setInviteCode] = useState(null);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(28)).current;

  const animateIn = useCallback(() => {
    fadeAnim.setValue(0); slideAnim.setValue(28);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 340, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 11, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  useEffect(() => { animateIn(); }, [step, animateIn]);

  useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        if (!user) { setChecking(false); return; }
        const done = await AsyncStorage.getItem(onboardingKey(user.id));
        if (done === "1" || done === "true") {
          navigation.reset({ index: 0, routes: [{ name: "AppTabs" }] });
          return;
        }
      } catch {}
      setChecking(false);
    })();
  }, [navigation]);

  const toggle = useCallback((catKey, label) => {
    setSelections((prev) => {
      const curr = prev[catKey] || [];
      return {
        ...prev,
        [catKey]: curr.includes(label) ? curr.filter((x) => x !== label) : [...curr, label],
      };
    });
  }, []);

  const addCustom = useCallback((catKey) => {
    const draft = titlePretty(customDrafts[catKey] || "");
    if (!draft) return;
    setCustomItems((prev) => {
      const curr = prev[catKey] || [];
      return curr.includes(draft) ? prev : { ...prev, [catKey]: [...curr, draft] };
    });
    setSelections((prev) => {
      const curr = prev[catKey] || [];
      return curr.includes(draft) ? prev : { ...prev, [catKey]: [...curr, draft] };
    });
    setCustomDrafts((prev) => ({ ...prev, [catKey]: "" }));
  }, [customDrafts]);

  const removeCustom = useCallback((catKey, label) => {
    setCustomItems((prev) => ({ ...prev, [catKey]: (prev[catKey] || []).filter((x) => x !== label) }));
    setSelections((prev)  => ({ ...prev, [catKey]: (prev[catKey] || []).filter((x) => x !== label) }));
  }, []);

  const totalSelected = useMemo(
    () => Object.values(selections).reduce((s, a) => s + a.length, 0),
    [selections]
  );

  const selectedTitles = useMemo(
    () => Object.values(selections).flat().filter(Boolean),
    [selections]
  );

  const createCircle = useCallback(async (name) => {
    const user = await getCurrentUser();
    if (!user) return null;
    const clean = String(name || "").trim();
    if (!clean) { Alert.alert("Cercle", "Donne un nom a ton cercle."); return null; }
    try {
      const { data: rpc, error: rpcErr } = await supabase.rpc("create_circle", { p_name: clean });
      const rpcId = typeof rpc === "string" ? rpc : rpc?.id;
      if (!rpcErr && rpcId) return String(rpcId);
      const { data: ins, error: insErr } = await supabase
        .from("circles").insert({ name: clean, owner_id: user.id }).select("id").single();
      if (insErr) throw insErr;
      return String(ins?.id || "");
    } catch (e) { Alert.alert("Cercle", e?.message || "Creation impossible."); return null; }
  }, []);

  const insertItems = useCallback(async ({ circleId, userId }) => {
    const rows = [];
    for (const cat of PRIORITY_CATS) {
      for (const label of (selections[cat.key] || [])) {
        rows.push({
          owner_id: userId, circle_id: circleId,
          title: titlePretty(label), description: "",
          category: cat.key, photo: null, is_free: true,
        });
      }
    }
    if (rows.length < 3) {
      Alert.alert("Objets", "Selectionne au moins 3 objets.");
      return false;
    }
    let { error } = await supabase.from(ITEMS_TABLE).insert(rows);
    if (error && /schema|column|unknown|does not exist/i.test(error?.message || "")) {
      const legacy = rows.map(({ owner_id, circle_id, title, description, category }) =>
        ({ owner_id, circle_id, title, description, category, photo: null })
      );
      ({ error } = await supabase.from(ITEMS_TABLE).insert(legacy));
    }
    if (error) { Alert.alert("Objets", error.message || "Ajout impossible."); return false; }
    return true;
  }, [selections]);

  const consumePendingInvite = useCallback(async () => {
    try {
      const raw = route?.params?.pendingCode
        || (await AsyncStorage.getItem(PENDING_INVITE_KEY)) || "";
      if (!raw.trim()) return;
      await supabase.rpc("join_circle_by_token_or_code_v2", { p_code: raw.trim() });
      await AsyncStorage.removeItem(PENDING_INVITE_KEY);
    } catch {}
  }, [route?.params?.pendingCode]);

  const onValidate = useCallback(async () => {
    if (saving || totalSelected < 3) return;
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const circleId = await createCircle(circleName);
      if (!circleId) return;
      const ok = await insertItems({ circleId, userId: user.id });
      if (!ok) return;
      await consumePendingInvite();
      const code = await getOrCreateInviteCode(circleId, circleName);
      setCreatedId(circleId);
      setInviteCode(code);
      setStep(2);
    } finally { setSaving(false); }
  }, [saving, totalSelected, circleName, createCircle, insertItems, consumePendingInvite]);

  const shareInvitation = useCallback(async () => {
    if (!inviteCode) return;
    setSharing(true);
    try {
      await Share.share({
        message: buildInviteMessage(circleName, inviteCode, selectedTitles),
        title: "Rejoins " + circleName + " sur Cercle",
      });
    } catch {}
    finally { setSharing(false); }
  }, [inviteCode, circleName, selectedTitles]);

  const goToCircle = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      if (user?.id) await AsyncStorage.setItem(onboardingKey(user.id), "1");
    } catch {}
    navigation.reset({
      index: 0,
      routes: [{
        name: "AppTabs",
        params: {
          screen: "Circle",
          params: { circleId: createdId, justCreated: true, refreshKey: Date.now() },
        },
      }],
    });
  }, [navigation, createdId]);

  const onSkip = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      if (user?.id) await AsyncStorage.setItem(onboardingKey(user.id), "1");
    } catch {}
    navigation.reset({ index: 0, routes: [{ name: "AppTabs" }] });
  }, [navigation]);

  if (checking) {
    return (
      <SafeAreaView style={SS.safe}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={MINT} />
        </View>
      </SafeAreaView>
    );
  }

  /* ── ETAPE 1 : Nom + objets ── */
  if (step === 1) return (
    <SafeAreaView style={SS.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>

        <Animated.View style={[SS.topBar, { opacity: fadeAnim }]}>
          <View style={{ flex: 1 }}>
            <Text style={SS.h1}>{"Qu'as-tu a partager ?"}</Text>
            <Text style={SS.sub}>{"Selectionne au moins 3 objets."}</Text>
          </View>
          {totalSelected >= 3 && (
            <View style={SS.readyBadge}>
              <MaterialCommunityIcons name="check" size={11} color={BG} />
              <Text style={SS.readyBadgeTxt}>{totalSelected}</Text>
            </View>
          )}
        </Animated.View>

        <ScrollView showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 130 }}>

          {/* Nom du cercle */}
          <View style={SS.nameSection}>
            <Text style={SS.sectionLabel}>Nom de ton cercle</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 7, marginBottom: 10 }}>
              {["Famille", "Colocs", "Voisins", "Amis", "Quartier"].map((s) => (
                <TouchableOpacity key={s} onPress={() => setCircleName(s)}
                  style={[SS.suggChip, circleName === s && SS.suggChipActive]}>
                  <Text style={[SS.suggTxt, circleName === s && { color: MINT, fontWeight: "900" }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput value={circleName} onChangeText={setCircleName}
              placeholder="Nom personnalise" placeholderTextColor={SUBTEXT}
              style={SS.nameInput} autoCorrect={false} returnKeyType="done"
              selectTextOnFocus />
          </View>

          {/* Catégories */}
          <View style={{ paddingHorizontal: 16 }}>
            {PRIORITY_CATS.map((cat) => {
              const catSel    = selections[cat.key] || [];
              const catCustom = customItems[cat.key] || [];
              const draft     = customDrafts[cat.key] || "";
              return (
                <View key={cat.key} style={{ marginBottom: 28 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <View style={[SS.catIcon, { backgroundColor: cat.color + "18" }]}>
                      <MaterialCommunityIcons name={cat.icon} size={16} color={cat.color} />
                    </View>
                    <Text style={SS.catLabel}>{cat.label}</Text>
                    {catSel.length > 0 && (
                      <Text style={{ color: cat.color, fontWeight: "900", fontSize: 13 }}>
                        {catSel.length + " ok"}
                      </Text>
                    )}
                  </View>

                  <View style={SS.chips}>
                    {cat.items.map((label) => (
                      <Chip key={cat.key + "-" + label} label={label}
                        selected={catSel.includes(label)}
                        onPress={() => toggle(cat.key, label)}
                        color={cat.color} />
                    ))}
                    {catCustom.map((label) => (
                      <TouchableOpacity key={"custom-" + label}
                        onPress={() => removeCustom(cat.key, label)}
                        style={[SS.chip, {
                          backgroundColor: cat.color + "18",
                          borderColor: cat.color + "50",
                          flexDirection: "row", gap: 5,
                        }]}>
                        <Text style={{ color: cat.color, fontWeight: "900", fontSize: 12 }}>{label}</Text>
                        <MaterialCommunityIcons name="close" size={12} color={cat.color} />
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={[SS.addRow, { borderColor: cat.color + "22" }]}>
                    <TextInput
                      value={draft}
                      onChangeText={(v) => setCustomDrafts((p) => ({ ...p, [cat.key]: v }))}
                      placeholder="Ajouter un objet..."
                      placeholderTextColor={SUBTEXT}
                      style={SS.addInput}
                      returnKeyType="done"
                      onSubmitEditing={() => addCustom(cat.key)}
                    />
                    {!!draft.trim() && (
                      <TouchableOpacity onPress={() => addCustom(cat.key)}
                        style={[SS.addBtn, { backgroundColor: cat.color }]}>
                        <MaterialCommunityIcons name="plus" size={16} color={BG} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={SS.footer}>
          <TouchableOpacity onPress={onValidate}
            disabled={saving || totalSelected < 3}
            style={[SS.primaryBtn, (saving || totalSelected < 3) && { opacity: 0.42 }]}
            activeOpacity={0.88}>
            {saving ? <ActivityIndicator color={BG} /> : (
              <Text style={SS.primaryTxt}>
                {totalSelected < 3
                  ? "Selectionne encore " + (3 - totalSelected) + " objet" + (3 - totalSelected > 1 ? "s" : "")
                  : "Creer \"" + circleName + "\" avec " + totalSelected + " objet" + (totalSelected > 1 ? "s" : "") + " >"}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={onSkip} style={{ alignItems: "center", paddingVertical: 12 }}>
            <Text style={{ color: SUBTEXT, fontSize: 14, fontWeight: "600" }}>{"Passer cette etape"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  /* ── ETAPE 2 : Succes + invitation ── */
  return (
    <SafeAreaView style={SS.safe} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={[SS.scroll, { alignItems: "center" }]}
        showsVerticalScrollIndicator={false}>
        <Animated.View style={{
          width: "100%", opacity: fadeAnim,
          transform: [{ translateY: slideAnim }], alignItems: "center",
        }}>
          <View style={SS.successRing}>
            <MaterialCommunityIcons name="check-circle" size={44} color={MINT} />
          </View>

          <Text style={[SS.h1, { textAlign: "center", marginTop: 16 }]}>
            {'"' + circleName + '" est pret !'}
          </Text>
          <Text style={[SS.sub, { textAlign: "center" }]}>
            {totalSelected + " objet" + (totalSelected > 1 ? "s" : "") + " dans ton inventaire."}
            {"\nInvite tes proches pour qu'ils en profitent."}
          </Text>

          {/* Recap objets */}
          {selectedTitles.length > 0 && (
            <View style={SS.itemsRecap}>
              {selectedTitles.slice(0, 5).map((t, i) => (
                <View key={i} style={SS.itemsRecapRow}>
                  <MaterialCommunityIcons name="check" size={13} color={MINT} />
                  <Text style={SS.itemsRecapTxt}>{t}</Text>
                </View>
              ))}
              {selectedTitles.length > 5 && (
                <Text style={{ color: SUBTEXT, fontSize: 12, marginTop: 4 }}>
                  {"+ " + (selectedTitles.length - 5) + " autres"}
                </Text>
              )}
            </View>
          )}

          {/* Code */}
          {!!inviteCode && (
            <View style={SS.codeCard}>
              <Text style={SS.codeLabel}>{"Code d'invitation"}</Text>
              <Text style={SS.codeValue}>{inviteCode}</Text>
              <Text style={SS.codeSub}>
                {"Tes proches ouvrent Cercle, appuient sur\n\"J'ai un code\" et tapent ce code."}
              </Text>
            </View>
          )}

          <TouchableOpacity onPress={shareInvitation} disabled={sharing}
            style={[SS.primaryBtn, { width: "100%", marginTop: 24, opacity: sharing ? 0.7 : 1 }]}
            activeOpacity={0.88}>
            {sharing ? <ActivityIndicator color={BG} /> : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MaterialCommunityIcons name="share-variant" size={18} color={BG} />
                <Text style={SS.primaryTxt}>{"Inviter mes proches"}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={goToCircle}
            style={[SS.ghostBtn, { width: "100%", marginTop: 12 }]} activeOpacity={0.88}>
            <Text style={SS.ghostTxt}>{"Acceder a mon cercle >"}</Text>
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─── STYLES ─── */
const SS = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: { padding: 20, paddingTop: 36, paddingBottom: 48 },

  topBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12,
  },
  h1:  { color: TEXT, fontSize: 22, fontWeight: "900", letterSpacing: -0.3, lineHeight: 28 },
  sub: { color: SUBTEXT, fontSize: 14, lineHeight: 20, marginTop: 4 },

  readyBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: MINT, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  readyBadgeTxt: { color: BG, fontSize: 13, fontWeight: "900" },

  nameSection: {
    paddingHorizontal: 16, paddingBottom: 20,
    borderBottomWidth: 1, borderBottomColor: STROKE, marginBottom: 20,
  },
  sectionLabel:   { color: SUBTEXT, fontSize: 12, fontWeight: "700", letterSpacing: 0.8, marginBottom: 8 },
  suggChip:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: STROKE, backgroundColor: "rgba(255,255,255,0.04)" },
  suggChipActive: { borderColor: "rgba(29,255,194,0.35)", backgroundColor: "rgba(29,255,194,0.08)" },
  suggTxt:        { color: SUBTEXT, fontWeight: "700", fontSize: 13 },
  nameInput: {
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 13,
    borderWidth: 1, borderColor: STROKE,
    color: TEXT, fontSize: 17, fontWeight: "900",
    paddingHorizontal: 14, paddingVertical: 13, letterSpacing: -0.2,
  },

  catIcon:  { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  catLabel: { color: TEXT, fontWeight: "900", fontSize: 15, flex: 1 },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip:  {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 8, paddingHorizontal: 11, borderRadius: 999,
    borderWidth: 1, borderColor: STROKE, backgroundColor: "rgba(255,255,255,0.03)",
  },
  chipTxt: { color: SUBTEXT, fontWeight: "700", fontSize: 13 },

  addRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1, backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 12, paddingVertical: 2,
  },
  addInput: { flex: 1, color: TEXT, fontSize: 14, paddingVertical: 10 },
  addBtn:   { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },

  footer: { padding: 16, paddingBottom: 20, borderTopWidth: 1, borderTopColor: STROKE },

  primaryBtn: {
    backgroundColor: MINT, borderRadius: 14, height: 52,
    alignItems: "center", justifyContent: "center",
  },
  primaryTxt: { color: BG, fontWeight: "900", fontSize: 15 },
  ghostBtn:   { height: 46, alignItems: "center", justifyContent: "center" },
  ghostTxt:   { color: SUBTEXT, fontWeight: "700", fontSize: 14 },

  successRing: {
    width: 82, height: 82, borderRadius: 26,
    backgroundColor: "rgba(29,255,194,0.10)",
    borderWidth: 1, borderColor: "rgba(29,255,194,0.25)",
    alignItems: "center", justifyContent: "center",
  },

  itemsRecap: {
    width: "100%", marginTop: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: STROKE,
    borderRadius: 16, padding: 14, gap: 8,
  },
  itemsRecapRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemsRecapTxt: { color: TEXT, fontSize: 14, fontWeight: "700" },

  codeCard: {
    width: "100%", marginTop: 20,
    backgroundColor: "rgba(29,255,194,0.06)",
    borderWidth: 1, borderColor: "rgba(29,255,194,0.22)",
    borderRadius: 20, padding: 20, alignItems: "center", gap: 8,
  },
  codeLabel: { color: SUBTEXT, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  codeValue: { color: MINT, fontSize: 26, fontWeight: "900", letterSpacing: 3 },
  codeSub:   { color: SUBTEXT, fontSize: 13, textAlign: "center", lineHeight: 18 },
});
