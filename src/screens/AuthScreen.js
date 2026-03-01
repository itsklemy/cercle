
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CommonActions } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import { useResponsive } from "../hooks/useResponsive";

/* ─── TOKENS ─── */
const MINT    = "#1DFFC2";
const BG      = "#07090F";
const CARD    = "#0D1018";
const TEXT    = "#F0F2F7";
const SUBTEXT = "#5A6478";
const STROKE  = "rgba(255,255,255,0.08)";

/* ─── CONSTANTS ─── */
const EMAIL_REDIRECT        = "https://magnificent-queijadas-68f4f6.netlify.app/confirm";
const ONBOARDING_KEY_PREFIX = "onboarding_done_v1_";
export const PENDING_INVITE_KEY = "pending_invite_v1";
const onboardingKeyForUser  = (uid) => `${ONBOARDING_KEY_PREFIX}${String(uid || "")}`;

const validEmail  = (s = "") => /\S+@\S+\.\S+/.test(s);
const normalEmail = (s = "") => s.trim().toLowerCase();

/* ─── CHAMP ANIMÉ ─── */
function Field({ label, value, onChangeText, placeholder, secureTextEntry,
  keyboardType, textContentType, autoComplete, returnKeyType, onSubmitEditing, inputRef }) {
  const border = useRef(new Animated.Value(0)).current;
  const onFocus = () => Animated.timing(border, { toValue: 1, duration: 180, useNativeDriver: false }).start();
  const onBlur  = () => Animated.timing(border, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  const borderColor = border.interpolate({
    inputRange: [0, 1], outputRange: [STROKE, "rgba(29,255,194,0.45)"],
  });
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={S.label}>{label}</Text>
      <Animated.View style={[S.inputWrap, { borderColor }]}>
        <TextInput
          ref={inputRef} value={value} onChangeText={onChangeText}
          placeholder={placeholder} placeholderTextColor={SUBTEXT}
          secureTextEntry={secureTextEntry} keyboardType={keyboardType}
          textContentType={textContentType} autoComplete={autoComplete}
          autoCapitalize="none" autoCorrect={false} style={S.input}
          onFocus={onFocus} onBlur={onBlur}
          returnKeyType={returnKeyType} onSubmitEditing={onSubmitEditing}
        />
      </Animated.View>
    </View>
  );
}

/* ─── SCREEN ─── */
export default function AuthScreen({ navigation, route }) {
  useResponsive();

  const initialStep =
    route?.params?.mode === "signin" ? "signin" :
    route?.params?.mode === "signup" ? "signup" :
    route?.params?.mode === "code"   ? "code"   : "choice";

  const [step,            setStep]           = useState(initialStep);
  const [email,           setEmail]          = useState("");
  const [password,        setPassword]       = useState("");
  const [inviteCode,      setInviteCode]     = useState(route?.params?.prefillCode || "");
  const [busy,            setBusy]           = useState(false);
  const [hasConfig,       setHasConfig]      = useState(true);
  const [needsConfirm,    setNeedsConfirm]   = useState(false);
  const [signupSubmitted, setSignupSubmitted] = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const passRef   = useRef(null);

  const animateIn = useCallback(() => {
    fadeAnim.setValue(0); slideAnim.setValue(24);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 85, friction: 11, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => { animateIn(); }, [step]);

  const resetUI = () => { setNeedsConfirm(false); setSignupSubmitted(false); };

  const ensureProfileRow = useCallback(async (userId) => {
    try {
      if (!userId) return;
      await supabase.from("profiles")
        .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: false })
        .select("id").single();
    } catch {}
  }, []);

  /* ─────────────────────────────────────────
     goToNext — routing post-auth
     Lit l'état onboarding + code en attente
  ───────────────────────────────────────── */
  const goToNext = useCallback(async () => {
    try {
      const { data: sessData } = await supabase.auth.getSession();
      const userId = sessData?.session?.user?.id;
      if (!userId) {
        navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "Auth" }] }));
        return;
      }

      const done = await AsyncStorage.getItem(onboardingKeyForUser(userId));
      const hasDoneOnboarding = done === "1" || done === "true";

      let pendingCode = "";
      try { pendingCode = (await AsyncStorage.getItem(PENDING_INVITE_KEY)) || ""; } catch {}

      if (!hasDoneOnboarding) {
        // Parcours [1] ou [2] → onboarding, le pending code sera consommé là-bas
        navigation.dispatch(CommonActions.reset({
          index: 0,
          routes: [{ name: "InventoryOnboardingScreen", params: { pendingCode } }],
        }));
        return;
      }

      // Parcours [3] : user existant avec code → rejoindre directement
      if (pendingCode.trim()) {
        try {
          await supabase.rpc("join_circle_by_token_or_code_v2", { p_code: pendingCode.trim() });
        } catch {}
        try { await AsyncStorage.removeItem(PENDING_INVITE_KEY); } catch {}
      }

      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "AppTabs" }] }));
    } catch {
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "AppTabs" }] }));
    }
  }, [navigation]);

  /* ─── Setup ─── */
  useEffect(() => {
    const ok = hasSupabaseConfig();
    setHasConfig(ok);
    if (!ok) return;

    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (sess?.session?.user?.id) {
          await ensureProfileRow(sess.session.user.id);
          await goToNext();
        }
      } catch {}
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (session?.user?.id) {
        await ensureProfileRow(session.user.id);
        await goToNext();
      }
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, [ensureProfileRow, goToNext]);

  useEffect(() => {
    const m = route?.params?.mode;
    if (m) { setStep(m); resetUI(); }
    if (route?.params?.prefillCode) setInviteCode(route.params.prefillCode);
  }, [route?.params?.mode, route?.params?.prefillCode]);

  /* ─── Errors ─── */
  const humanizeError = (err) => {
    const msg  = String(err?.message || "").toLowerCase();
    const code = String(err?.error_code || err?.code || "").toLowerCase();
    if (code.includes("user_already_exists") || msg.includes("already registered"))
      return "Un compte existe déjà avec cet email.";
    if (code === "invalid_credentials" || msg.includes("invalid login"))
      return "Email ou mot de passe incorrect.";
    if (msg.includes("email not confirmed") || code.includes("email_not_confirmed")) {
      setNeedsConfirm(true); return "Email non confirmé — vérifie tes mails.";
    }
    if (err?.status === 429 || msg.includes("rate limit"))
      return "Trop de tentatives — attends quelques minutes.";
    if (msg.includes("network") || msg.includes("fetch"))
      return "Pas de connexion internet.";
    return err?.message || "Une erreur est survenue.";
  };

  /* ─── Sign In ─── */
  const signIn = async () => {
    const e = normalEmail(email);
    if (!validEmail(e)) return Alert.alert("Email", "Adresse invalide.");
    if ((password || "").length < 6) return Alert.alert("Mot de passe", "6 caractères minimum.");
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: e, password });
      if (error) throw error;
      const userId = data?.user?.id || data?.session?.user?.id;
      if (userId) { await ensureProfileRow(userId); await goToNext(); }
    } catch (err) { Alert.alert("Connexion", humanizeError(err)); }
    finally { setBusy(false); }
  };

  /* ─── Sign Up ─── */
  const signUp = async () => {
    const e = normalEmail(email);
    if (!validEmail(e)) return Alert.alert("Email", "Adresse invalide.");
    if ((password || "").length < 6) return Alert.alert("Mot de passe", "6 caractères minimum.");
    setBusy(true); resetUI();
    try {
      const { data, error } = await supabase.auth.signUp({
        email: e, password, options: { emailRedirectTo: EMAIL_REDIRECT },
      });
      if (error) throw error;
      if (data?.session?.user?.id) {
        await ensureProfileRow(data.session.user.id);
        await goToNext();
        return;
      }
      setNeedsConfirm(true);
      setSignupSubmitted(true);
      setPassword("");
    } catch (err) { Alert.alert("Inscription", humanizeError(err)); }
    finally { setBusy(false); }
  };

  /* ─── Resend ─── */
  const resend = async () => {
    const e = normalEmail(email);
    if (!validEmail(e)) return Alert.alert("Email", "Saisis ton email d'abord.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup", email: e, options: { emailRedirectTo: EMAIL_REDIRECT },
      });
      if (error) throw error;
      Alert.alert("Email renvoyé ✓", "Vérifie tes spams.");
    } catch (err) { Alert.alert("Renvoi", humanizeError(err)); }
    finally { setBusy(false); }
  };

  /* ─── Code d'invitation (parcours [2]) ─── */
  const handleCode = async () => {
    const code = String(inviteCode || "").trim().toUpperCase();
    if (!code) return Alert.alert("Code", "Saisis le code d'invitation.");
    try { await AsyncStorage.setItem(PENDING_INVITE_KEY, code); } catch {}
    resetUI();
    setStep("signup");
  };

  /* ─── RENDER ─── */
  const inChoice = step === "choice";
  const inCode   = step === "code";
  const inSignin = step === "signin";
  const inSignup = step === "signup";

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={S.scroll}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View style={[S.inner, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* Logo */}
          <View style={S.logoWrap}>
            <View style={S.logoMark}>
              <MaterialCommunityIcons name="account-group" size={28} color={MINT} />
            </View>
            <Text style={S.appName}>Cercle</Text>
            <Text style={S.tagline}>Moins acheter. Mieux vivre ensemble.</Text>
          </View>

          <View style={S.card}>

            {/* ══ CHOICE ══ */}
            {inChoice && <>
              <Text style={S.cardTitle}>Bienvenue</Text>
              <Text style={S.cardSub}>Partage et emprunte dans ton cercle de confiance.</Text>

              <TouchableOpacity style={[S.primaryBtn, { marginTop: 24 }]}
                onPress={() => { resetUI(); setStep("signup"); }}
                activeOpacity={0.88} disabled={!hasConfig}>
                <Text style={S.primaryTxt}>Créer un compte</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[S.secondaryBtn, { marginTop: 10 }]}
                onPress={() => { resetUI(); setStep("signin"); }}
                activeOpacity={0.88} disabled={!hasConfig}>
                <Text style={S.secondaryTxt}>J'ai déjà un compte</Text>
              </TouchableOpacity>

              <View style={S.separator}>
                <View style={S.sepLine} /><Text style={S.sepTxt}>ou</Text><View style={S.sepLine} />
              </View>

              {/* Parcours [2] — toujours visible */}
              <TouchableOpacity style={S.codeBtn} onPress={() => setStep("code")} activeOpacity={0.88}>
                <MaterialCommunityIcons name="key-outline" size={16} color={MINT} />
                <Text style={S.codeTxt}>J'ai un code d'invitation</Text>
              </TouchableOpacity>
            </>}

            {/* ══ CODE ══ */}
            {inCode && <>
              <TouchableOpacity onPress={() => setStep("choice")} style={S.backBtn}>
                <MaterialCommunityIcons name="arrow-left" size={18} color={SUBTEXT} />
                <Text style={S.backTxt}>Retour</Text>
              </TouchableOpacity>
              <Text style={S.cardTitle}>Code d'invitation</Text>
              <Text style={S.cardSub}>Saisis le code reçu par SMS. On crée ton compte ensuite.</Text>

              <Field label="Code d'invitation" value={inviteCode}
                onChangeText={(v) => setInviteCode(v.toUpperCase())}
                placeholder="Ex: FAMILLE-7K2X"
                textContentType="oneTimeCode" returnKeyType="done"
                onSubmitEditing={handleCode} />

              <TouchableOpacity
                style={[S.primaryBtn, { marginTop: 20, opacity: inviteCode.trim() ? 1 : 0.4 }]}
                onPress={handleCode} activeOpacity={0.88} disabled={!inviteCode.trim()}>
                <Text style={S.primaryTxt}>Continuer →</Text>
              </TouchableOpacity>

              <Text style={S.hint}>Le code est sauvegardé. Tu rejoindras le cercle après inscription.</Text>
            </>}

            {/* ══ SIGNIN ══ */}
            {inSignin && <>
              <TouchableOpacity onPress={() => setStep("choice")} style={S.backBtn}>
                <MaterialCommunityIcons name="arrow-left" size={18} color={SUBTEXT} />
                <Text style={S.backTxt}>Retour</Text>
              </TouchableOpacity>
              <Text style={S.cardTitle}>Connexion</Text>

              <Field label="Email" value={email} onChangeText={setEmail}
                placeholder="toi@mail.com" keyboardType="email-address"
                textContentType="emailAddress" autoComplete="email"
                returnKeyType="next" onSubmitEditing={() => passRef.current?.focus()} />

              <Field label="Mot de passe" value={password} onChangeText={setPassword}
                placeholder="••••••••" secureTextEntry
                textContentType="password" autoComplete="password"
                returnKeyType="done" onSubmitEditing={signIn} inputRef={passRef} />

              {needsConfirm && (
                <View style={S.infoBox}>
                  <MaterialCommunityIcons name="email-outline" size={16} color={MINT} />
                  <View style={{ flex: 1 }}>
                    <Text style={S.infoTitle}>Email non confirmé</Text>
                    <Text style={S.infoSub}>Vérifie tes mails et spams.</Text>
                    <TouchableOpacity onPress={resend} disabled={busy} style={{ marginTop: 6 }}>
                      <Text style={{ color: MINT, fontWeight: "800", fontSize: 13 }}>Renvoyer →</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <TouchableOpacity style={[S.primaryBtn, { marginTop: 20, opacity: busy ? 0.7 : 1 }]}
                onPress={signIn} activeOpacity={0.88} disabled={busy || !hasConfig}>
                {busy ? <ActivityIndicator color={BG} /> : <Text style={S.primaryTxt}>Se connecter</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={S.switchBtn}
                onPress={() => { resetUI(); setStep("signup"); }} disabled={busy}>
                <Text style={S.switchTxt}>
                  Pas de compte ? <Text style={{ color: MINT }}>Créer un compte</Text>
                </Text>
              </TouchableOpacity>
            </>}

            {/* ══ SIGNUP ══ */}
            {inSignup && !signupSubmitted && <>
              <TouchableOpacity onPress={() => setStep("choice")} style={S.backBtn}>
                <MaterialCommunityIcons name="arrow-left" size={18} color={SUBTEXT} />
                <Text style={S.backTxt}>Retour</Text>
              </TouchableOpacity>
              <Text style={S.cardTitle}>Créer un compte</Text>

              {!!inviteCode.trim() && (
                <View style={S.infoBox}>
                  <MaterialCommunityIcons name="key" size={16} color={MINT} />
                  <View style={{ flex: 1 }}>
                    <Text style={S.infoTitle}>Code <Text style={{ color: MINT }}>{inviteCode}</Text> enregistré</Text>
                    <Text style={S.infoSub}>Tu rejoindras le cercle automatiquement après inscription.</Text>
                  </View>
                </View>
              )}

              <Field label="Email" value={email} onChangeText={setEmail}
                placeholder="toi@mail.com" keyboardType="email-address"
                textContentType="emailAddress" autoComplete="email"
                returnKeyType="next" onSubmitEditing={() => passRef.current?.focus()} />

              <Field label="Mot de passe" value={password} onChangeText={setPassword}
                placeholder="••••••••" secureTextEntry
                textContentType="newPassword" autoComplete="password-new"
                returnKeyType="done" onSubmitEditing={signUp} inputRef={passRef} />

              <TouchableOpacity style={[S.primaryBtn, { marginTop: 20, opacity: busy ? 0.7 : 1 }]}
                onPress={signUp} activeOpacity={0.88} disabled={busy || !hasConfig}>
                {busy ? <ActivityIndicator color={BG} /> : <Text style={S.primaryTxt}>Créer mon compte →</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={S.switchBtn}
                onPress={() => { resetUI(); setStep("signin"); }} disabled={busy}>
                <Text style={S.switchTxt}>
                  Déjà un compte ? <Text style={{ color: MINT }}>Se connecter</Text>
                </Text>
              </TouchableOpacity>
            </>}

            {/* ══ EMAIL ENVOYÉ ══ */}
            {inSignup && signupSubmitted && <>
              <View style={{ alignItems: "center", gap: 10, paddingVertical: 4 }}>
                <View style={S.confirmIcon}>
                  <MaterialCommunityIcons name="email-check-outline" size={32} color={MINT} />
                </View>
                <Text style={S.cardTitle}>Vérifie tes mails</Text>
                <Text style={S.cardSub}>
                  Lien envoyé à{"\n"}
                  <Text style={{ color: TEXT, fontWeight: "700" }}>{normalEmail(email)}</Text>
                </Text>
                {!!inviteCode.trim() && (
                  <View style={[S.infoBox, { width: "100%" }]}>
                    <MaterialCommunityIcons name="key" size={14} color={MINT} />
                    <Text style={{ color: SUBTEXT, fontSize: 12, flex: 1, lineHeight: 17 }}>
                      Code <Text style={{ color: MINT, fontWeight: "900" }}>{inviteCode}</Text> sauvegardé — tu rejoindras le cercle après confirmation.
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity style={[S.primaryBtn, { marginTop: 24 }]}
                onPress={() => { resetUI(); setStep("signin"); }}>
                <Text style={S.primaryTxt}>J'ai confirmé → Me connecter</Text>
              </TouchableOpacity>

              <TouchableOpacity style={{ alignItems: "center", paddingVertical: 12 }}
                onPress={resend} disabled={busy}>
                <Text style={{ color: SUBTEXT, fontWeight: "700", fontSize: 14 }}>Renvoyer l'email</Text>
              </TouchableOpacity>
            </>}

          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ─── STYLES ─── */
const S = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", padding: 20, paddingVertical: 48 },
  inner:  { width: "100%", maxWidth: 440, alignSelf: "center" },

  logoWrap: { alignItems: "center", marginBottom: 32 },
  logoMark: {
    width: 60, height: 60, borderRadius: 20,
    backgroundColor: "rgba(29,255,194,0.10)",
    borderWidth: 1, borderColor: "rgba(29,255,194,0.22)",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  appName: { color: TEXT, fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  tagline: { color: SUBTEXT, fontSize: 14, marginTop: 4 },

  card:      { backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: STROKE, padding: 20 },
  cardTitle: { color: TEXT, fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  cardSub:   { color: SUBTEXT, fontSize: 14, marginTop: 6, lineHeight: 20 },

  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backTxt: { color: SUBTEXT, fontWeight: "700", fontSize: 14 },

  label:    { color: SUBTEXT, fontSize: 13, fontWeight: "700", marginBottom: 6 },
  inputWrap: { borderRadius: 13, borderWidth: 1, overflow: "hidden" },
  input:    { backgroundColor: "rgba(255,255,255,0.04)", color: TEXT, fontSize: 15, paddingHorizontal: 14, paddingVertical: 13 },

  primaryBtn:  { backgroundColor: MINT, borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center" },
  primaryTxt:  { color: BG, fontWeight: "900", fontSize: 16 },
  secondaryBtn: {
    borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: STROKE, backgroundColor: "rgba(255,255,255,0.04)",
  },
  secondaryTxt: { color: TEXT, fontWeight: "800", fontSize: 15 },

  switchBtn: { alignItems: "center", paddingVertical: 14 },
  switchTxt: { color: SUBTEXT, fontSize: 14 },

  separator: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 18 },
  sepLine:   { flex: 1, height: 1, backgroundColor: STROKE },
  sepTxt:    { color: SUBTEXT, fontSize: 12, fontWeight: "700" },

  codeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(29,255,194,0.22)",
    backgroundColor: "rgba(29,255,194,0.06)",
  },
  codeTxt: { color: MINT, fontWeight: "800", fontSize: 14 },

  infoBox: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: "rgba(29,255,194,0.06)", borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(29,255,194,0.18)", padding: 12, marginTop: 14,
  },
  infoTitle: { color: TEXT, fontWeight: "800", fontSize: 13, marginBottom: 2 },
  infoSub:   { color: SUBTEXT, fontSize: 12, lineHeight: 16 },

  confirmIcon: {
    width: 68, height: 68, borderRadius: 22,
    backgroundColor: "rgba(29,255,194,0.10)",
    borderWidth: 1, borderColor: "rgba(29,255,194,0.22)",
    alignItems: "center", justifyContent: "center",
  },

  hint: { color: SUBTEXT, fontSize: 12, textAlign: "center", marginTop: 12, lineHeight: 18 },
});
