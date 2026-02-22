import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

const OFFICIAL_GREEN = "#1DFFC2";

const colors = {
  bg: "#0B0E14",
  card: "rgba(255,255,255,0.05)",
  card2: "rgba(255,255,255,0.08)",
  text: "#F3F4F6",
  subtext: "#9AA3B2",
  stroke: "rgba(255,255,255,0.10)",
  brand: OFFICIAL_GREEN,
};

// ✅ clé onboarding PAR UTILISATEUR (sinon ça bug quand tu changes de compte)
const ONBOARDING_DONE_KEY_PREFIX = "onboarding_done_v1_";
const onboardingKeyForUser = (userId) => `${ONBOARDING_DONE_KEY_PREFIX}${String(userId || "")}`;

// ✅ table feed
const ITEMS_TABLE = "items";

// ✅ presets EXACTS (repris de ton InventoryUpdate)
const PRESETS = {
  maison: [
    "Escabeau",
    "Aspirateur",
    "Nettoyeur vapeur",
    "Shampouineuse",
    "Nettoyeur de vitres",
    "Table a repasser",
    "Defroisseur vapeur",
    "Rallonge electrique",
    "Ventilateur",
    "Chauffage d appoint",
    "Radiateur bain d huile",
    "Climatiseur mobile",
    "Deshumidificateur",
    "Humidificateur",
    "Machine a coudre",
    "Pistolet a colle",
  ],
  travaux: [
    "Betonniere",
    "Marteau piqueur",
    "Burineur",
    "Perforateur SDS",
    "Scie circulaire",
    "Ponceuse",
    "Niveau laser",
    "Compresseur",
    "Poste a souder",
    "Echafaudage",
    "Echelle coulissante",
    "Tretaux",
    "Table de chantier",
    "Diable",
    "Chariot de manutention",
    "Sangles d arrimage",
  ],
  outdoor: [
    "Tente",
    "Sac de couchage",
    "Matelas gonflable",
    "Lampe camping",
    "Lampe frontale",
    "Rechaud",
    "Table pliante",
    "Chaise pliante",
    "Hamac",
    "Sac a dos rando",
    "Batons de marche",
    "Jerrican d eau",
    "Masque et tuba",
    "Parasol",
    "Lampe torche",
    "Batterie externe",
  ],
};

const titlePretty = (s) => {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
};

async function getUserOrAlert() {
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;
  if (error || !user) {
    Alert.alert("Auth", "Connecte-toi d’abord.");
    return null;
  }
  return user;
}

export default function InventoryOnboardingScreen({ navigation }) {
  // step 0: choix, 1: nom, 2: sélection items
  const [step, setStep] = useState(0);
  const [checking, setChecking] = useState(true);

  const [choice, setChoice] = useState(null); // "create" | "later"
  const [circleName, setCircleName] = useState("Mon cercle");

  const [selMaison, setSelMaison] = useState([]);
  const [selTravaux, setSelTravaux] = useState([]);
  const [selOutdoor, setSelOutdoor] = useState([]);

  const [saving, setSaving] = useState(false);

  // ✅ si onboarding déjà fait (pour CE USER) => Circle direct
  useEffect(() => {
    (async () => {
      try {
        const user = await getUserOrAlert();
        if (!user) {
          setChecking(false);
          return;
        }

        const done = await AsyncStorage.getItem(onboardingKeyForUser(user.id));
        const hasDone = done === "1" || done === "true";

        if (hasDone) {
          navigation.reset({
            index: 0,
            routes: [{ name: "AppTabs", params: { screen: "Circle" } }],
          });
          return;
        }
      } catch {}
      setChecking(false);
    })();
  }, [navigation]);

  const toggle = useCallback((setArr, label) => {
    setArr((prev) => {
      const has = prev.includes(label);
      if (has) return prev.filter((x) => x !== label);
      return [...prev, label];
    });
  }, []);

  const totalSelected = selMaison.length + selTravaux.length + selOutdoor.length;

  // ✅ UNIQUE sortie vers Circle : on marque onboarding done ICI (Passer & Valider passent forcément par là)
  const goToCircle = useCallback(
    async ({ circleId, justCreated }) => {
      try {
        const user = await getUserOrAlert();
        if (user?.id) {
          await AsyncStorage.setItem(onboardingKeyForUser(user.id), "1");
        }
      } catch {}

      navigation.reset({
        index: 0,
        routes: [
          {
            name: "AppTabs",
            params: {
              screen: "Circle",
              params: {
                circleId: circleId || null,
                justCreated: !!justCreated,
                refreshKey: Date.now(),
                lotfi: justCreated
                  ? "Félicitations, tu peux maintenant ajouter des membres dans ton cercle."
                  : null,
              },
            },
          },
        ],
      });
    },
    [navigation]
  );

  const onPass = useCallback(() => {
    goToCircle({ circleId: null, justCreated: false });
  }, [goToCircle]);

  const createCircleWithName = useCallback(async (name) => {
    const user = await getUserOrAlert();
    if (!user) return { circleId: null, userId: null };

    const clean = String(name || "").trim();
    if (!clean) {
      Alert.alert("Cercle", "Donne un nom à ton cercle.");
      return { circleId: null, userId: user.id };
    }

    try {
      // 1) RPC si dispo
      const { data: rpcData, error: rpcErr } = await supabase.rpc("create_circle", { p_name: clean });
      const newId = typeof rpcData === "string" ? rpcData : rpcData?.id;
      if (!rpcErr && newId) return { circleId: String(newId), userId: user.id };

      // 2) fallback insert
      const { data: inserted, error: insErr } = await supabase
        .from("circles")
        .insert({ name: clean, owner_id: user.id })
        .select("id")
        .single();

      if (insErr) throw insErr;
      return { circleId: String(inserted?.id || ""), userId: user.id };
    } catch (e) {
      Alert.alert("Cercle", e?.message || "Création impossible.");
      return { circleId: null, userId: user.id };
    }
  }, []);

  const insertSeedItems = useCallback(
  async ({ circleId, userId }) => {
    const rows = [
      ...selMaison.map((t) => ({
        owner_id: userId,
        circle_id: circleId,
        title: titlePretty(t),
        description: "",
        category: "maison",
        photo: null,
        is_free: true,
        price_amount: 0,
        price_note: null,
      })),
      ...selTravaux.map((t) => ({
        owner_id: userId,
        circle_id: circleId,
        title: titlePretty(t),
        description: "",
        category: "travaux",
        photo: null,
        is_free: true,
        price_amount: 0,
        price_note: null,
      })),
      ...selOutdoor.map((t) => ({
        owner_id: userId,
        circle_id: circleId,
        title: titlePretty(t),
        description: "",
        category: "outdoor",
        photo: null,
        is_free: true,
        price_amount: 0,
        price_note: null,
      })),
    ];

    if (rows.length < 3) {
      Alert.alert("Inventaire", "Choisis au moins 3 objets, toutes catégories confondues.");
      return false;
    }

    // 1) tentative “nouveau schéma”
    let { error } = await supabase.from(ITEMS_TABLE).insert(rows);

    // ✅ détecte aussi l’erreur “schema cache”
    const msg = String(error?.message || "").toLowerCase();
    const looksLikeMissingColumn =
      msg.includes("schema cache") ||
      msg.includes("could not find") ||
      msg.includes("does not exist") ||
      msg.includes("unknown") ||
      msg.includes("column");

    // 2) fallback “ancien schéma” (sans is_free / price_*)
    if (error && looksLikeMissingColumn) {
      const legacy = rows.map((r) => ({
        owner_id: r.owner_id,
        circle_id: r.circle_id,
        title: r.title,
        description: r.description,
        category: r.category,
        photo: null,
      }));

      const r2 = await supabase.from(ITEMS_TABLE).insert(legacy);
      error = r2.error;
    }

    if (error) {
      Alert.alert("Inventaire", error.message || "Impossible d’ajouter les objets.");
      return false;
    }

    return true;
  },
  [selMaison, selTravaux, selOutdoor]
);


  const onValidate = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { circleId, userId } = await createCircleWithName(circleName);
      if (!circleId || !userId) return;

      const ok = await insertSeedItems({ circleId, userId });
      if (!ok) return;

      await goToCircle({ circleId, justCreated: true });
    } finally {
      setSaving(false);
    }
  }, [saving, circleName, createCircleWithName, insertSeedItems, goToCircle]);

  const canGoStep1 = useMemo(() => choice === "create" || choice === "later", [choice]);
  const canGoStep2 = useMemo(() => String(circleName || "").trim().length > 0, [circleName]);

  if (checking) {
    return (
      <SafeAreaView style={S.safe}>
        <View style={S.center}>
          <ActivityIndicator />
          <Text style={S.sub}>Chargement…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={S.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={S.wrap}>
        <View style={S.card}>
          {step === 0 && (
            <>
              <Text style={S.title}>On lance ton premier cercle ?</Text>
              <Text style={S.sub}>2 minutes : un nom + 3 objets, et c’est prêt.</Text>

              <View style={{ height: 14 }} />

              <TouchableOpacity
                activeOpacity={0.92}
                onPress={() => setChoice("create")}
                style={[S.choiceCard, choice === "create" && S.choiceCardActive]}
              >
                <MaterialCommunityIcons name="plus-circle-outline" size={20} color={colors.text} />
                <View style={{ flex: 1 }}>
                  <Text style={S.choiceTitle}>Créer un cercle</Text>
                  <Text style={S.choiceSub}>On prépare ton feed</Text>
                </View>
                {choice === "create" && <MaterialCommunityIcons name="check" size={20} color={colors.brand} />}
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.92}
                onPress={() => setChoice("later")}
                style={[S.choiceCard, choice === "later" && S.choiceCardActive]}
              >
                <MaterialCommunityIcons name="arrow-right-circle-outline" size={20} color={colors.text} />
                <View style={{ flex: 1 }}>
                  <Text style={S.choiceTitle}>Passer</Text>
                  <Text style={S.choiceSub}>Je ferai ça plus tard</Text>
                </View>
                {choice === "later" && <MaterialCommunityIcons name="check" size={20} color={colors.brand} />}
              </TouchableOpacity>

              <View style={{ height: 16 }} />

              <TouchableOpacity
                disabled={!canGoStep1}
                activeOpacity={0.92}
                onPress={() => (choice === "later" ? onPass() : setStep(1))}
                style={[S.primaryBtn, !canGoStep1 && { opacity: 0.5 }]}
              >
                <Text style={S.primaryTxt}>{choice === "later" ? "Passer" : "Continuer"}</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 1 && (
            <>
              <Text style={S.title}>Nom du cercle</Text>
              <Text style={S.sub}>Simple et clair. Modifiable plus tard.</Text>

              <TextInput
                value={circleName}
                onChangeText={setCircleName}
                placeholder="Ex: Famille"
                placeholderTextColor={colors.subtext}
                style={S.input}
                autoCorrect={false}
                returnKeyType="done"
              />

              <View style={{ height: 14 }} />

              <TouchableOpacity
                disabled={!canGoStep2}
                activeOpacity={0.92}
                onPress={() => setStep(2)}
                style={[S.primaryBtn, !canGoStep2 && { opacity: 0.5 }]}
              >
                <Text style={S.primaryTxt}>Choisir 3 objets</Text>
              </TouchableOpacity>

              <TouchableOpacity activeOpacity={0.92} onPress={() => setStep(0)} style={S.linkBtn}>
                <Text style={S.linkTxt}>Retour</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 2 && (
            <>
              <Text style={S.title}>Choisis tes 3 premiers objets</Text>
              <Text style={S.sub}>Sélection rapide, tu complètes après si tu veux.</Text>

              <View style={{ height: 10 }} />

              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                <Text style={S.groupTitle}>Outdoor</Text>
                <View style={S.chips}>
                  {(PRESETS.outdoor || []).map((label) => {
                    const on = selOutdoor.includes(label);
                    return (
                      <TouchableOpacity
                        key={`outdoor-${label}`}
                        onPress={() => toggle(setSelOutdoor, label)}
                        activeOpacity={0.9}
                        style={[S.chip, on && S.chipOn]}
                      >
                        <Text style={[S.chipTxt, on && S.chipTxtOn]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={S.groupTitle}>Travaux</Text>
                <View style={S.chips}>
                  {(PRESETS.travaux || []).map((label) => {
                    const on = selTravaux.includes(label);
                    return (
                      <TouchableOpacity
                        key={`travaux-${label}`}
                        onPress={() => toggle(setSelTravaux, label)}
                        activeOpacity={0.9}
                        style={[S.chip, on && S.chipOn]}
                      >
                        <Text style={[S.chipTxt, on && S.chipTxtOn]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={S.groupTitle}>Maison</Text>
                <View style={S.chips}>
                  {(PRESETS.maison || []).map((label) => {
                    const on = selMaison.includes(label);
                    return (
                      <TouchableOpacity
                        key={`maison-${label}`}
                        onPress={() => toggle(setSelMaison, label)}
                        activeOpacity={0.9}
                        style={[S.chip, on && S.chipOn]}
                      >
                        <Text style={[S.chipTxt, on && S.chipTxtOn]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={{ height: 10 }} />
              </ScrollView>

              <View style={{ height: 12 }} />

              <TouchableOpacity
                disabled={saving}
                activeOpacity={0.92}
                onPress={onValidate}
                style={[S.primaryBtn, saving && { opacity: 0.7 }]}
              >
                {saving ? <ActivityIndicator color={colors.bg} /> : <Text style={S.primaryTxt}>Valider</Text>}
              </TouchableOpacity>

              <Text style={S.hint}>
                Sélection : <Text style={{ color: colors.brand, fontWeight: "900" }}>{totalSelected}</Text>
              </Text>

              <TouchableOpacity activeOpacity={0.92} onPress={() => setStep(1)} style={S.linkBtn}>
                <Text style={S.linkTxt}>Retour</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const cardBase = {
  borderWidth: 1,
  borderColor: colors.stroke,
  backgroundColor: colors.card,
};

const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  wrap: { flex: 1, padding: 16, justifyContent: "center" },

  center: { alignItems: "center", justifyContent: "center", gap: 10 },

  card: { borderRadius: 18, padding: 16, ...cardBase },

  title: { color: colors.text, fontWeight: "900", fontSize: 18, textAlign: "center" },
  sub: { color: colors.subtext, marginTop: 8, lineHeight: 18, textAlign: "center" },

  choiceCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    ...cardBase,
    marginTop: 10,
  },
  choiceCardActive: {
    borderColor: "rgba(29,255,194,0.35)",
    backgroundColor: "rgba(29,255,194,0.12)",
  },
  choiceTitle: { color: colors.text, fontWeight: "900" },
  choiceSub: { color: colors.subtext, marginTop: 2, fontWeight: "700" },

  input: {
    backgroundColor: "rgba(0,0,0,0.15)",
    color: colors.text,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
  },

  groupTitle: { color: colors.text, fontWeight: "900", marginTop: 12, marginBottom: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  chipOn: { borderColor: "rgba(29,255,194,0.35)", backgroundColor: "rgba(29,255,194,0.14)" },
  chipTxt: { color: colors.subtext, fontWeight: "800", fontSize: 12 },
  chipTxtOn: { color: colors.text },

  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
    width: "100%",
    marginTop: 10,
  },
  primaryTxt: { color: colors.bg, fontWeight: "900", fontSize: 16 },

  linkBtn: { alignItems: "center", paddingVertical: 10 },
  linkTxt: { color: colors.brand, fontWeight: "900" },

  hint: { color: colors.subtext, textAlign: "center", marginTop: 10, fontWeight: "800" },
});
