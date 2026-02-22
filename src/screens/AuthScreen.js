import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../theme/colors";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import { useResponsive } from "../hooks/useResponsive";
import { CommonActions } from "@react-navigation/native";

// Email redirect
const EMAIL_REDIRECT = "https://magnificent-queijadas-68f4f6.netlify.app/confirm";

// Onboarding flag (par user)
const ONBOARDING_DONE_KEY_PREFIX = "onboarding_done_v1_";
const onboardingKeyForUser = (userId) =>
  `${ONBOARDING_DONE_KEY_PREFIX}${String(userId || "")}`;

// ✅ Mets EXACTEMENT la même clé que dans InviteScreen
const PENDING_INVITE_KEY = "pending_invite_v1";

export default function AuthScreen({ navigation, route }) {
  useResponsive();

  // step: "choice" | "signin" | "signup"
  const initialStep =
    route?.params?.mode === "signin"
      ? "signin"
      : route?.params?.mode === "signup"
      ? "signup"
      : "choice";

  const [step, setStep] = useState(initialStep);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [hasConfig, setHasConfig] = useState(true);

  // Confirmation UI
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [signupEmailSent, setSignupEmailSent] = useState(false);

  // ✅ Pour rendre le flow “création -> email envoyé” ultra clair
  const [signupSubmitted, setSignupSubmitted] = useState(false);

  const validEmail = (s = "") => /\S+@\S+\.\S+/.test(s);
  const normalizeEmail = (s = "") => s.trim().toLowerCase();

  const resetConfirmUI = () => {
    setNeedsConfirm(false);
    setSignupEmailSent(false);
    setSignupSubmitted(false);
  };

  const ensureProfileRow = useCallback(async (userId) => {
    try {
      if (!userId) return;

      const { error } = await supabase
        .from("profiles")
        .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: false })
        .select("id")
        .single();

      if (error && String(error.code) === "42P01") return;
      if (error) console.log("[Auth] ensureProfileRow error:", error);
    } catch (e) {
      console.log("[Auth] ensureProfileRow catch:", e?.message || e);
    }
  }, []);

  // ✅ Navigation post-auth: InventoryOnboarding si pas fait, sinon AppTabs
  // IMPORTANT: ceci ne s’exécute qu’après connexion (session existante).
  const goToNext = useCallback(async () => {
    try {
      const { data: sessData } = await supabase.auth.getSession();
      const userId = sessData?.session?.user?.id;

      if (!userId) {
        navigation.dispatch(
          CommonActions.reset({ index: 0, routes: [{ name: "Auth" }] })
        );
        return;
      }

      const key = onboardingKeyForUser(userId);
      const done = await AsyncStorage.getItem(key);
      const hasDone = done === "1" || done === "true";

      let pendingInviteRaw = "";
      try {
        pendingInviteRaw = (await AsyncStorage.getItem(PENDING_INVITE_KEY)) || "";
      } catch {}

      if (!hasDone) {
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [
              { name: "InventoryOnboardingScreen", params: { pendingInviteRaw } },
            ],
          })
        );
        return;
      }

      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "AppTabs" }],
        })
      );
    } catch (e) {
      console.log("[goToNext] error:", e?.message || e);
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "AppTabs" }],
        })
      );
    }
  }, [navigation]);

  const humanizeError = (err) => {
    const msg = String(err?.message || "").toLowerCase();
    const code = String(err?.error_code || err?.code || "").toLowerCase();

    if (code.includes("user_already_exists") || msg.includes("already registered")) {
      return "Un compte existe déjà avec cet email.";
    }
    if (code === "invalid_credentials" || msg.includes("invalid login")) {
      return "Identifiants incorrects.";
    }
    if (msg.includes("email not confirmed") || code.includes("email_not_confirmed")) {
      setNeedsConfirm(true);
      return "Email non confirmé. Confirme ton email puis réessaie.";
    }
    if (err?.status === 429 || msg.includes("rate limit")) {
      return "Trop de tentatives : réessaie dans quelques minutes.";
    }
    if (msg.includes("network request failed") || msg.includes("failed to fetch")) {
      return "Problème de connexion internet.";
    }
    return err?.message || "Une erreur est survenue.";
  };

  // Route param mode -> step
  useEffect(() => {
    const m = route?.params?.mode;
    if (m === "signin" || m === "signup") {
      setStep(m);
      resetConfirmUI();
    }
  }, [route?.params?.mode]);

  // Config + auto-session
  useEffect(() => {
    const ok = hasSupabaseConfig();
    setHasConfig(ok);

    if (!ok) {
      Alert.alert(
        "Configuration requise",
        "Renseigne SUPABASE_URL et SUPABASE_ANON_KEY dans app.config.js"
      );
      return;
    }

    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const session = sess?.session;
        if (session?.user?.id) {
          await ensureProfileRow(session.user.id);
          await goToNext();
        }
      } catch {}
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user?.id) {
        await ensureProfileRow(session.user.id);
        await goToNext();
      }
    });

    return () => sub?.subscription?.unsubscribe?.();
  }, [ensureProfileRow, goToNext]);

  // ✅ Connexion
  const signIn = async () => {
    const e = normalizeEmail(email);
    if (!validEmail(e)) return Alert.alert("Email invalide", "Entre une adresse valide.");
    if ((password || "").length < 6)
      return Alert.alert("Mot de passe trop court", "6 caractères minimum.");

    setBusy(true);
    // En connexion, on ne reset pas needsConfirm si on veut afficher le bloc, mais on reset l’état signup
    setSignupEmailSent(false);
    setSignupSubmitted(false);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: e,
        password,
      });
      if (error) throw error;

      const userId = data?.user?.id || data?.session?.user?.id;
      if (userId) {
        await ensureProfileRow(userId);
        await goToNext();
      } else {
        Alert.alert("Connexion", "Impossible de récupérer la session. Réessaie.");
      }
    } catch (err) {
      Alert.alert("Connexion", humanizeError(err));
    } finally {
      setBusy(false);
    }
  };

  // ✅ Création de compte
  // IMPORTANT: on NE lance PAS InventoryOnboarding ici si confirm email ON.
  // On force la validation email AVANT onboarding, comme demandé.
  const signUp = async () => {
    const e = normalizeEmail(email);
    if (!validEmail(e)) return Alert.alert("Email invalide", "Entre une adresse valide.");
    if ((password || "").length < 6)
      return Alert.alert("Mot de passe trop court", "6 caractères minimum.");

    setBusy(true);
    resetConfirmUI();

    try {
      const { data, error } = await supabase.auth.signUp({
        email: e,
        password,
        options: { emailRedirectTo: EMAIL_REDIRECT },
      });
      if (error) throw error;

      // Si confirmation désactivée → session directe → goToNext (et donc onboarding)
      if (data?.session?.user?.id) {
        await ensureProfileRow(data.session.user.id);
        await goToNext();
        return;
      }

      // ✅ Confirmation requise → on reste ici, on n’ouvre PAS l’onboarding
      setNeedsConfirm(true);
      setSignupEmailSent(true);
      setSignupSubmitted(true);

      // Optionnel: vider le mdp (évite confusion)
      setPassword("");

      Alert.alert("Compte créé", "Un email de confirmation vient d’être envoyé.");
    } catch (err) {
      Alert.alert("Création de compte", humanizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const resendConfirmation = async () => {
    const e = normalizeEmail(email);
    if (!validEmail(e)) {
      return Alert.alert("Email invalide", "Renseigne ton email pour renvoyer la confirmation.");
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: e,
        options: { emailRedirectTo: EMAIL_REDIRECT },
      });
      if (error) throw error;
      Alert.alert("Email renvoyé", "Regarde tes mails (spams inclus).");
    } catch (err) {
      Alert.alert("Renvoi impossible", humanizeError(err));
    } finally {
      setBusy(false);
    }
  };

  // ---------------- UI ----------------
  const inChoice = step === "choice";
  const inSignin = step === "signin";
  const inSignup = step === "signup";

  const screenTitle = inChoice ? "Bienvenue" : inSignin ? "Connexion" : "Créer un compte";
  const screenHelper = inChoice
    ? "Choisis une option."
    : inSignin
    ? "Entre ton email et ton mot de passe."
    : signupSubmitted
    ? "Confirme ton email, puis connecte-toi."
    : "Entre ton email et ton mot de passe.";

  const primaryLabel = inSignin ? "Se connecter" : "Créer mon compte";
  const onPrimary = () => (inSignin ? signIn() : signUp());

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.h1}>{screenTitle}</Text>
          <Text style={styles.helper}>{screenHelper}</Text>

          {/* ✅ ÉTAPE 1 : CHOIX — 2 boutons identiques (même taille + fond vert) */}
          {inChoice && (
            <View style={{ marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  resetConfirmUI();
                  setStep("signin");
                }}
                style={[styles.choiceBtn, (busy || !hasConfig) && { opacity: 0.6 }]}
                activeOpacity={0.9}
                disabled={busy || !hasConfig}
              >
                <Text style={styles.choiceTxt}>J’ai déjà un compte</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  resetConfirmUI();
                  setStep("signup");
                }}
                style={[styles.choiceBtn, (busy || !hasConfig) && { opacity: 0.6 }]}
                activeOpacity={0.9}
                disabled={busy || !hasConfig}
              >
                <Text style={styles.choiceTxt}>Créer un compte</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ✅ ÉTAPE 2 : FORM (connexion ou création) */}
          {!inChoice && (
            <>
              {/* Formulaire affiché tant qu’on n’a pas soumis le signup,
                  ou toujours en signin */}
              {(inSignin || !signupSubmitted) && (
                <>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    placeholder="toi@mail.com"
                    placeholderTextColor={colors.subtext}
                    autoCapitalize="none"
                    textContentType="emailAddress"
                    autoComplete="email"
                    autoCorrect={false}
                  />

                  <Text style={styles.label}>Mot de passe</Text>
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholder="••••••••"
                    placeholderTextColor={colors.subtext}
                    textContentType="password"
                    autoComplete="password"
                  />

                  <TouchableOpacity
                    onPress={onPrimary}
                    style={[styles.cta, (busy || !hasConfig) && { opacity: 0.6 }]}
                    activeOpacity={0.9}
                    disabled={busy || !hasConfig}
                  >
                    {busy ? (
                      <ActivityIndicator color={colors.bg} />
                    ) : (
                      <Text style={styles.ctaTxt}>{primaryLabel}</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* ✅ Après création: bloc confirmation clair + actions utiles */}
              {inSignup && signupSubmitted && (
                <View style={styles.confirmBox}>
                  <Text style={styles.confirmTitle}>Email de confirmation envoyé</Text>
                  <Text style={styles.confirmText}>
                    Confirme ton email (spams inclus), puis reviens te connecter.
                  </Text>

                  <TouchableOpacity
                    onPress={resendConfirmation}
                    style={styles.resendBtn}
                    disabled={busy || !hasConfig}
                  >
                    <Text style={styles.resendTxt}>Renvoyer l’email</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      // On garde l’email saisi, on passe en connexion
                      setStep("signin");
                      setNeedsConfirm(false);
                      // on laisse signupSubmitted à false en signin
                      setSignupSubmitted(false);
                      setSignupEmailSent(false);
                    }}
                    style={styles.smallGhost}
                    disabled={busy}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.smallGhostTxt}>J’ai confirmé → Me connecter</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ✅ En signin: si email pas confirmé -> bloc + renvoi */}
              {inSignin && needsConfirm && (
                <View style={styles.confirmBox}>
                  <Text style={styles.confirmTitle}>Email non confirmé</Text>
                  <Text style={styles.confirmText}>
                    Confirme ton email puis reconnecte-toi.
                  </Text>

                  <TouchableOpacity
                    onPress={resendConfirmation}
                    style={styles.resendBtn}
                    disabled={busy || !hasConfig}
                  >
                    <Text style={styles.resendTxt}>Renvoyer l’email</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ✅ Switch simple (pas de “revenir aux choix”) */}
              <View style={styles.switchRow}>
                <TouchableOpacity
                  onPress={() => {
                    resetConfirmUI();
                    setStep(inSignin ? "signup" : "signin");
                  }}
                  disabled={busy}
                  activeOpacity={0.9}
                >
                  <Text style={styles.switchTxt}>
                    {inSignin ? "Créer un compte" : "J’ai déjà un compte"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  kav: { flex: 1, backgroundColor: colors.bg },

  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 16,
  },

  card: {
    backgroundColor: "#0F1220",
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 18,
    padding: 16,
  },

  h1: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 6,
  },
  helper: {
    color: colors.subtext,
    textAlign: "center",
    marginBottom: 10,
  },

  // ✅ Choice buttons: IDENTIQUES + fond vert + même taille
  choiceBtn: {
    backgroundColor: colors.mint,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    marginBottom: 12,
  },
  choiceTxt: {
    color: colors.bg,
    fontWeight: "900",
    fontSize: 17,
  },

  label: { color: colors.subtext, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: "#151826",
    borderColor: colors.stroke,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
  },

  cta: {
    marginTop: 18,
    backgroundColor: colors.mint,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    minHeight: 56,
    justifyContent: "center",
  },
  ctaTxt: { color: colors.bg, fontWeight: "900", fontSize: 17 },

  confirmBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: "#151826",
  },
  confirmTitle: { color: colors.text, fontWeight: "900", marginBottom: 6 },
  confirmText: { color: colors.subtext, marginBottom: 10 },

  resendBtn: { alignItems: "center", paddingVertical: 8 },
  resendTxt: { color: colors.mint, fontWeight: "900" },

  smallGhost: {
    marginTop: 6,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.stroke,
    alignItems: "center",
  },
  smallGhostTxt: { color: colors.text, fontWeight: "900" },

  switchRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "center",
  },
  switchTxt: {
    color: colors.subtext,
    fontWeight: "800",
    paddingVertical: 6,
  },
});
