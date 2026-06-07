import React, { useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator, Image, Platform,
  KeyboardAvoidingView, Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CommonActions } from "@react-navigation/native";
import { supabase } from "../lib/supabase";

/* ─── TOKENS ─── */
const MINT    = "#5CFFB0";
const BG      = "#07090F";
const CARD    = "#0D1018";
const TEXT    = "#F0F2F7";
const SUBTEXT = "#5A6478";
const STROKE  = "rgba(255,255,255,0.08)";
const MINT_DIM= "rgba(92,255,176,0.10)";
const MINT_BDR= "rgba(92,255,176,0.22)";

const ONBOARDING_KEY_PREFIX = "onboarding_done_v1_";
const onboardingKey = (uid) => `${ONBOARDING_KEY_PREFIX}${String(uid || "")}`;

/* ─── Decode base64 helper ─── */
function decodeBase64ToUint8Array(b64) {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = String(b64 || "").replace(/[^A-Za-z0-9+/=]/g, "");
  const bytes = [];
  let i = 0;
  while (i < clean.length) {
    const e1 = alpha.indexOf(clean[i++]), e2 = alpha.indexOf(clean[i++]);
    const e3 = alpha.indexOf(clean[i++]), e4 = alpha.indexOf(clean[i++]);
    bytes.push((e1 << 2) | (e2 >> 4));
    if (e3 !== 64 && e3 !== -1) bytes.push(((e2 & 15) << 4) | (e3 >> 2));
    if (e4 !== 64 && e4 !== -1) bytes.push(((e3 & 3) << 6) | e4);
  }
  return new Uint8Array(bytes);
}

/* ─── Upload avatar ─── */
async function uploadAvatar(asset, userId) {
  if (!asset?.uri) return null;
  try {
    let body, contentType = asset.mimeType || "image/jpeg";
    if (asset.base64) {
      body = decodeBase64ToUint8Array(asset.base64).buffer;
    } else {
      const b64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      body = decodeBase64ToUint8Array(b64).buffer;
    }
    const ext  = contentType.split("/")[1] || "jpg";
    const path = `public/${userId}/avatar_${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("items")
      .upload(path, body, { upsert: true, contentType });
    if (error) throw error;
    const { data } = supabase.storage.from("items").getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (e) {
    Alert.alert("Photo", e?.message || "Envoi impossible.");
    return null;
  }
}

/* ─── STEPS ─── */
const STEPS = ["photo", "infos", "done"];

export default function ProOnboardingScreen({ navigation }) {
  const [step,        setStep]        = useState(0);
  const [avatar,      setAvatar]      = useState(null); // { uri, base64, mimeType }
  const [companyName, setCompanyName] = useState("");
  const [activity,    setActivity]    = useState("");
  const [siret,       setSiret]       = useState("");
  const [saving,      setSaving]      = useState(false);

  const fadeAnim  = useRef(new Animated.Value(1)).current;

  const animStep = useCallback((next) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      setStep(next);
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
  }, [fadeAnim]);

  /* ── Pick avatar ── */
  const pickAvatar = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Photos", "Autorise l'accès à la photothèque.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.85, allowsEditing: true, aspect: [1,1],
      base64: true, mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!res.canceled && res.assets?.[0]) setAvatar(res.assets[0]);
  }, []);

  /* ── Save & finish ── */
  const handleSave = useCallback(async () => {
    if (!companyName.trim()) {
      Alert.alert("Profil Pro", "Le nom de l'entreprise est requis.");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expirée.");

      let avatarUrl = null;
      if (avatar) avatarUrl = await uploadAvatar(avatar, user.id);

      /* Upsert profile avec infos Pro */
      const { error } = await supabase.from("profiles").upsert({
        id:            user.id,
        public_name:   companyName.trim(),
        user_mode:     "pro",
        activity:      activity.trim() || null,
        siret:         siret.trim() || null,
        avatar_url:    avatarUrl,
      }, { onConflict: "id" });

      if (error) throw error;

      await AsyncStorage.setItem(onboardingKey(user.id), "1");

      animStep(2); /* → done */
    } catch (e) {
      Alert.alert("Erreur", e?.message || "Sauvegarde impossible.");
    } finally {
      setSaving(false);
    }
  }, [companyName, activity, siret, avatar, animStep]);

  const goToApp = useCallback(() => {
    navigation.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: "AppTabs" }] })
    );
  }, [navigation]);

  /* ─────────────── RENDER ─────────────── */
  return (
    <SafeAreaView style={S.safe} edges={["top","left","right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <Animated.View style={{ flex: 1, opacity: fadeAnim }}>

          {/* ── Step 0 : Photo ── */}
          {step === 0 && (
            <ScrollView contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false}>
              <View style={S.header}>
                <View style={S.badge}>
                  <MaterialCommunityIcons name="briefcase-outline" size={20} color={MINT} />
                  <Text style={S.badgeTxt}>Espace Pro</Text>
                </View>
                <Text style={S.h1}>Logo ou photo{"\n"}de profil</Text>
                <Text style={S.sub}>Visible par les membres de ton Cercle Pro.</Text>
              </View>

              <TouchableOpacity onPress={pickAvatar} style={S.avatarWrap} activeOpacity={0.85}>
                {avatar ? (
                  <Image source={{ uri: avatar.uri }} style={S.avatarImg} />
                ) : (
                  <View style={S.avatarPlaceholder}>
                    <MaterialCommunityIcons name="camera-plus" size={32} color={MINT} />
                    <Text style={{ color: MINT, fontWeight: "700", marginTop: 10, fontSize: 14 }}>
                      Choisir une photo
                    </Text>
                  </View>
                )}
                {avatar && (
                  <View style={S.avatarOverlay}>
                    <MaterialCommunityIcons name="camera" size={20} color={TEXT} />
                  </View>
                )}
              </TouchableOpacity>

              <View style={S.footer}>
                <TouchableOpacity
                  onPress={() => animStep(1)}
                  style={[S.primaryBtn, { backgroundColor: MINT }]}
                  activeOpacity={0.88}
                >
                  <Text style={[S.primaryTxt, { color: BG }]}>
                    {avatar ? "Continuer →" : "Passer cette étape →"}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* ── Step 1 : Infos ── */}
          {step === 1 && (
            <ScrollView
              contentContainerStyle={S.scroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <TouchableOpacity onPress={() => animStep(0)} style={S.back}>
                <MaterialCommunityIcons name="arrow-left" size={18} color={SUBTEXT} />
                <Text style={S.backTxt}>Retour</Text>
              </TouchableOpacity>

              <View style={S.header}>
                <View style={S.badge}>
                  <MaterialCommunityIcons name="briefcase-outline" size={20} color={MINT} />
                  <Text style={S.badgeTxt}>Espace Pro</Text>
                </View>
                <Text style={S.h1}>Ton entreprise</Text>
                <Text style={S.sub}>Ces infos sont visibles dans ton Cercle Pro.</Text>
              </View>

              {/* Aperçu avatar si choisi */}
              {avatar && (
                <View style={{ alignItems: "center", marginBottom: 20 }}>
                  <Image source={{ uri: avatar.uri }}
                    style={{ width: 64, height: 64, borderRadius: 20, borderWidth: 2, borderColor: MINT_BDR }} />
                </View>
              )}

              <View style={S.fields}>
                <Text style={S.label}>Nom de l'entreprise *</Text>
                <TextInput
                  value={companyName}
                  onChangeText={setCompanyName}
                  placeholder="Ex : Rinaldi Paysages"
                  placeholderTextColor={SUBTEXT}
                  style={S.input}
                  returnKeyType="next"
                  autoFocus
                />

                <Text style={[S.label, { marginTop: 16 }]}>Activité</Text>
                <TextInput
                  value={activity}
                  onChangeText={setActivity}
                  placeholder="Ex : Paysagiste, BTP, Location matériel…"
                  placeholderTextColor={SUBTEXT}
                  style={S.input}
                  returnKeyType="next"
                />

                <Text style={[S.label, { marginTop: 16 }]}>SIRET (optionnel)</Text>
                <TextInput
                  value={siret}
                  onChangeText={setSiret}
                  placeholder="Ex : 123 456 789 00012"
                  placeholderTextColor={SUBTEXT}
                  style={S.input}
                  keyboardType="numeric"
                  returnKeyType="done"
                />

                <View style={S.infoBox}>
                  <MaterialCommunityIcons name="information-outline" size={14} color={SUBTEXT} />
                  <Text style={S.infoTxt}>
                    Le SIRET n'est pas vérifié pour l'instant. Il sera utilisé pour la facturation Pro.
                  </Text>
                </View>
              </View>

              <View style={S.footer}>
                <TouchableOpacity
                  onPress={handleSave}
                  disabled={saving}
                  style={[S.primaryBtn, { backgroundColor: MINT, opacity: saving ? 0.7 : 1 }]}
                  activeOpacity={0.88}
                >
                  {saving
                    ? <ActivityIndicator color={BG} />
                    : <Text style={[S.primaryTxt, { color: BG }]}>Créer mon Cercle Pro ✓</Text>
                  }
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* ── Step 2 : Done ── */}
          {step === 2 && (
            <View style={[S.scroll, { flex: 1, justifyContent: "center", alignItems: "center" }]}>
              <View style={S.doneRing}>
                <MaterialCommunityIcons name="check-circle" size={48} color={MINT} />
              </View>
              <Text style={[S.h1, { textAlign: "center", marginTop: 20 }]}>
                {companyName || "Ton espace Pro"}{"\n"}est prêt !
              </Text>
              <Text style={[S.sub, { textAlign: "center", marginTop: 8, marginBottom: 40 }]}>
                Ajoute tes outils et services.{"\n"}Tes clients te trouveront par géolocalisation.
              </Text>
              <TouchableOpacity
                onPress={goToApp}
                style={[S.primaryBtn, { backgroundColor: MINT, width: "100%" }]}
                activeOpacity={0.88}
              >
                <Text style={[S.primaryTxt, { color: BG }]}>Accéder à mon Cercle Pro →</Text>
              </TouchableOpacity>
            </View>
          )}

        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: { padding: 20, paddingBottom: 40 },

  back:    { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 },
  backTxt: { color: SUBTEXT, fontWeight: "700", fontSize: 14 },

  header:   { marginBottom: 28 },
  badge:    { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14,
              backgroundColor: MINT_DIM, borderWidth: 1, borderColor: MINT_BDR,
              borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, alignSelf: "flex-start" },
  badgeTxt: { color: MINT, fontWeight: "700", fontSize: 13 },
  h1:       { color: TEXT, fontSize: 26, fontWeight: "900", letterSpacing: -0.4, lineHeight: 34 },
  sub:      { color: SUBTEXT, fontSize: 14, lineHeight: 20, marginTop: 8 },

  avatarWrap: {
    width: 160, height: 160, borderRadius: 32, alignSelf: "center",
    marginBottom: 32, overflow: "hidden",
    borderWidth: 2, borderColor: MINT_BDR, backgroundColor: MINT_DIM,
  },
  avatarImg:         { width: "100%", height: "100%" },
  avatarPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  avatarOverlay:     {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", paddingVertical: 8,
  },

  fields: { gap: 0 },
  label:  { color: SUBTEXT, fontSize: 12, fontWeight: "700", marginBottom: 6, letterSpacing: 0.5 },
  input:  {
    backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: STROKE,
    color: TEXT, fontSize: 15, paddingHorizontal: 14, paddingVertical: 13,
  },

  infoBox: {
    flexDirection: "row", gap: 8, marginTop: 16, padding: 12,
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: STROKE,
  },
  infoTxt: { color: SUBTEXT, fontSize: 12, lineHeight: 18, flex: 1 },

  footer: { marginTop: 28 },
  primaryBtn: {
    height: 52, borderRadius: 14, alignItems: "center",
    justifyContent: "center", flexDirection: "row", gap: 8,
  },
  primaryTxt: { fontWeight: "900", fontSize: 15 },

  doneRing: {
    width: 96, height: 96, borderRadius: 30,
    backgroundColor: MINT_DIM, borderWidth: 1, borderColor: MINT_BDR,
    alignItems: "center", justifyContent: "center",
  },
});