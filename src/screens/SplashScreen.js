// src/screens/SplashScreen.js
import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Linking,
  Alert,
  Platform,
} from "react-native";
import { CommonActions } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import { colors as themeColors } from "../theme/colors";

/* -------------------- Theme fallback (anti-crash) -------------------- */
const C = themeColors || {};
const colors = {
  bg: C.bg ?? "#0B0E14",
  text: C.text ?? "#F3F4F6",
  subtext: C.subtext ?? "#9AA3B2",
  mint: C.mint ?? "#1DFFC2",
  card: C.card ?? "rgba(255,255,255,0.04)",
  stroke: C.stroke ?? "rgba(255,255,255,0.10)",
};

// safe root nav resolver
function getRootNav(navigation) {
  let nav = navigation;
  try {
    let parent = nav?.getParent?.();
    while (parent) {
      nav = parent;
      parent = nav.getParent?.();
    }
  } catch {}
  return nav || navigation;
}

export default function SplashScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const navigatingRef = useRef(false);

  const resetToAuth = (mode = "signin") => {
    const root = getRootNav(navigation);
    root?.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "Auth", params: { mode } }],
      })
    );
  };

  const resetToAppTabs = (initialTab = "Dashboard") => {
    const root = getRootNav(navigation);
    root?.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "AppTabs", params: { screen: initialTab } }],
      })
    );
  };

  const onStart = async () => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    try {
      if (!hasSupabaseConfig() || !supabase?.auth?.getSession) {
        resetToAuth("signin");
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        resetToAuth("signin");
        return;
      }

      const user = data?.session?.user;
      if (!user) {
        resetToAuth("signup");
        return;
      }

      resetToAppTabs("Dashboard");
    } catch (e) {
      Alert.alert("Erreur", "Impossible de démarrer automatiquement. Tu peux te connecter manuellement.");
      resetToAuth("signin");
    } finally {
      navigatingRef.current = false;
    }
  };

  useEffect(() => {
    const t = setTimeout(() => onStart(), 650);
    return () => clearTimeout(t);
  }, []);

  const openLink = async (url) => {
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) throw new Error("unsupported");
      await Linking.openURL(url);
    } catch {
      Alert.alert("Lien", "Impossible d’ouvrir ce lien.");
    }
  };

  const padTop = Math.max(insets.top, 16);
  const padBottom = Math.max(insets.bottom, 14);

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: padTop, paddingBottom: padBottom }]} edges={["top", "bottom"]}>
      {/* Background “soft identity” : halos mint */}
      <View pointerEvents="none" style={styles.haloA} />
      <View pointerEvents="none" style={styles.haloB} />
      <View pointerEvents="none" style={styles.haloC} />

      <View style={styles.wrap}>
        {/* Top spacer */}
        <View style={{ height: 8 }} />

        {/* Center card */}
        <View style={styles.heroCard}>
          <View style={styles.logoWrap}>
            <Image source={require("../../assets/icon.png")} style={styles.logo} resizeMode="contain" />
          </View>

          <Text style={styles.title}>Cercle</Text>
          <Text style={styles.subtitle}>Prête. Emprunte. Partage.</Text>

          <View style={styles.divider} />

          <Text style={styles.body}>
            L’entraide entre proches,{"\n"}simple et transparente.
          </Text>

          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.mint} />
            <Text style={styles.loadingTxt}>Chargement…</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity activeOpacity={0.9} style={styles.btn} onPress={onStart}>
            <Text style={styles.btnTxt}>Commencer</Text>
          </TouchableOpacity>

          <View style={styles.linksRow}>
            <TouchableOpacity onPress={() => openLink("https://dapper-paletas-dd86e0.netlify.app")}>
              <Text style={styles.link}>CGU</Text>
            </TouchableOpacity>

            <Text style={styles.dot}>•</Text>

            <TouchableOpacity onPress={() => openLink("https://dapper-paletas-dd86e0.netlify.app")}>
              <Text style={styles.link}>Confidentialité</Text>
            </TouchableOpacity>

            <Text style={styles.dot}>•</Text>

            <TouchableOpacity onPress={() => openLink("mailto:orastudio.org@gmail.com")}>
              <Text style={styles.link}>Support</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.micro}>
            {Platform.OS === "ios" ? "Disponible sur iPhone" : "Disponible sur Android"} · Version bêta
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  wrap: { flex: 1, paddingHorizontal: 16, justifyContent: "space-between" },

  /* --- Soft halos (identity) --- */
  haloA: {
    position: "absolute",
    top: -140,
    left: -120,
    width: 320,
    height: 320,
    borderRadius: 320,
    backgroundColor: "rgba(29,255,194,0.16)",
    opacity: 0.9,
  },
  haloB: {
    position: "absolute",
    bottom: -180,
    right: -140,
    width: 420,
    height: 420,
    borderRadius: 420,
    backgroundColor: "rgba(29,255,194,0.10)",
  },
  haloC: {
    position: "absolute",
    top: 120,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 240,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  heroCard: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 520,
    borderRadius: 22,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: colors.stroke,
  },

  logoWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(29,255,194,0.10)",
    borderWidth: 1,
    borderColor: "rgba(29,255,194,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  logo: { width: 34, height: 34, borderRadius: 10 },

  title: { color: colors.text, fontSize: 32, fontWeight: "900" },
  subtitle: { color: colors.subtext, marginTop: 6, fontWeight: "800" },

  divider: {
    height: 1,
    backgroundColor: colors.stroke,
    marginVertical: 14,
  },

  body: { color: colors.text, opacity: 0.92, lineHeight: 20, fontWeight: "700" },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  loadingTxt: { color: colors.subtext, fontWeight: "800" },

  footer: { paddingTop: 14, paddingBottom: 4, gap: 10 },

  btn: {
    backgroundColor: colors.mint,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(29,255,194,0.25)",
  },
  btnTxt: { color: colors.bg, fontWeight: "900", fontSize: 16 },

  linksRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10, flexWrap: "wrap" },
  link: { color: colors.subtext, textDecorationLine: "underline", fontWeight: "800" },
  dot: { color: colors.subtext, opacity: 0.7 },

  micro: { textAlign: "center", color: colors.subtext, opacity: 0.75, fontWeight: "700" },
});
