
import React, { useEffect, useRef, useState } from "react";
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
  Modal,
} from "react-native";
import { CommonActions } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import { colors as themeColors } from "../theme/colors";

const ONBOARDING_KEY_PREFIX = "onboarding_done_v1_";
const PENDING_INVITE_KEY    = "pending_invite_v1";
const PENDING_USER_MODE_KEY = "pending_user_mode";
const onboardingKeyForUser  = (uid) => `${ONBOARDING_KEY_PREFIX}${String(uid || "")}`;

const C = themeColors || {};
const colors = {
  bg:     C.bg     ?? "#0B0E14",
  text:   C.text   ?? "#F3F4F6",
  subtext:C.subtext?? "#9AA3B2",
  mint:   C.mint   ?? "#5CFFB0",
  card:   C.card   ?? "rgba(255,255,255,0.04)",
  stroke: C.stroke ?? "rgba(255,255,255,0.10)",
};

const MINT_DIM = "rgba(92,255,176,0.10)";
const MINT_BDR = "rgba(92,255,176,0.22)";

function getRootNav(navigation) {
  let nav = navigation;
  try {
    let parent = nav?.getParent?.();
    while (parent) { nav = parent; parent = nav.getParent?.(); }
  } catch {}
  return nav || navigation;
}

export default function SplashScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const navigatingRef = useRef(false);

  // ── NOUVEAU : modale de choix du mode ──
  const [modeModalVisible, setModeModalVisible] = useState(false);
  const [pendingUserId,    setPendingUserId]    = useState(null);
  const [pendingCode,      setPendingCode]      = useState("");

  const root = () => getRootNav(navigation);

  const resetToAuth       = () => root()?.dispatch(CommonActions.reset({ index:0, routes:[{name:"Auth"}] }));
  const resetToAppTabs    = () => root()?.dispatch(CommonActions.reset({ index:0, routes:[{name:"AppTabs"}] }));
  const resetToOnboarding = (code="") => root()?.dispatch(CommonActions.reset({
    index:0, routes:[{name:"InventoryOnboardingScreen", params:{pendingCode:code}}]
  }));
  const resetToProOnboarding = () => root()?.dispatch(CommonActions.reset({
    index:0, routes:[{name:"ProOnboardingScreen"}]
  }));

  // ── Choisir le mode (appelé depuis la modale) ──
  const handleModeChoice = async (mode) => {
    setModeModalVisible(false);
    if (!pendingUserId) return;
    try {
      await AsyncStorage.setItem(PENDING_USER_MODE_KEY, mode);
      await supabase.from("profiles").upsert(
        { id: pendingUserId, user_mode: mode },
        { onConflict: "id" }
      );
    } catch {}
    if (mode === "pro") {
      resetToProOnboarding();
    } else {
      resetToOnboarding(pendingCode);
    }
  };

  const onStart = async () => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    try {
      if (!hasSupabaseConfig() || !supabase?.auth?.getSession) {
        resetToAuth(); return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) { resetToAuth(); return; }

      const user = data?.session?.user;
      if (!user?.id) { resetToAuth(); return; }

      // ── Lire le profil pour connaître user_mode ──
      const { data: prof } = await supabase.from("profiles")
        .select("user_mode").eq("id", user.id).single();
      const userMode = prof?.user_mode || null;

      const done = await AsyncStorage.getItem(onboardingKeyForUser(user.id));
      const hasDoneOnboarding = done === "1" || done === "true";

      let code = "";
      try { code = (await AsyncStorage.getItem(PENDING_INVITE_KEY)) || ""; } catch {}

      if (!hasDoneOnboarding) {
        // ── Pas encore d'onboarding ──
        if (!userMode) {
          // Mode inconnu → afficher la modale de choix
          setPendingUserId(user.id);
          setPendingCode(code);
          setModeModalVisible(true);
          navigatingRef.current = false;
          return;
        } else if (userMode === "pro") {
          resetToProOnboarding();
        } else {
          resetToOnboarding(code);
        }
        return;
      }

      // ── Onboarding déjà fait ──
      if (code.trim()) {
        try {
          await supabase.rpc("join_circle_by_token_or_code_v2", { p_code: code.trim() });
        } catch {}
        try { await AsyncStorage.removeItem(PENDING_INVITE_KEY); } catch {}
      }

      resetToAppTabs();
    } catch (e) {
      Alert.alert("Erreur","Impossible de démarrer automatiquement. Connecte-toi manuellement.");
      resetToAuth();
    } finally { navigatingRef.current = false; }
  };

  useEffect(() => { const t = setTimeout(() => onStart(), 650); return () => clearTimeout(t); }, []);

  const openLink = async (url) => {
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) throw new Error("unsupported");
      await Linking.openURL(url);
    } catch { Alert.alert("Lien","Impossible d'ouvrir ce lien."); }
  };

  const padTop    = Math.max(insets.top, 16);
  const padBottom = Math.max(insets.bottom, 14);

  return (
    <SafeAreaView style={[styles.safe,{paddingTop:padTop,paddingBottom:padBottom}]} edges={["top","bottom"]}>
      <View pointerEvents="none" style={styles.haloA}/>
      <View pointerEvents="none" style={styles.haloB}/>
      <View pointerEvents="none" style={styles.haloC}/>

      <View style={styles.wrap}>
        <View style={{height:8}}/>

        <View style={styles.heroCard}>
          <View style={styles.logoWrap}>
            <Image source={require("../../assets/icon.png")} style={styles.logo} resizeMode="contain"/>
          </View>
          <Text style={styles.title}>Cercle</Text>
          <Text style={styles.subtitle}>Prête. Emprunte. Partage.</Text>
          <View style={styles.divider}/>
          <Text style={styles.body}>L'entraide entre proches,{"\n"}simple et transparente.</Text>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.mint}/>
            <Text style={styles.loadingTxt}>Chargement…</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity activeOpacity={0.9} style={styles.btn} onPress={onStart}>
            <Text style={styles.btnTxt}>Commencer</Text>
          </TouchableOpacity>

          <View style={styles.linksRow}>
            <TouchableOpacity onPress={()=>openLink("https://dapper-paletas-dd86e0.netlify.app")}>
              <Text style={styles.link}>CGU</Text>
            </TouchableOpacity>
            <Text style={styles.dot}>•</Text>
            <TouchableOpacity onPress={()=>openLink("https://dapper-paletas-dd86e0.netlify.app")}>
              <Text style={styles.link}>Confidentialité</Text>
            </TouchableOpacity>
            <Text style={styles.dot}>•</Text>
            <TouchableOpacity onPress={()=>openLink("mailto:orastudio.org@gmail.com")}>
              <Text style={styles.link}>Support</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.micro}>
            {Platform.OS==="ios"?"Disponible sur iPhone":"Disponible sur Android"} · Version bêta
          </Text>
        </View>
      </View>

      {/* ── MODALE CHOIX MODE ── */}
      <Modal visible={modeModalVisible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalLogo}>
              <MaterialCommunityIcons name="account-group" size={28} color={colors.mint}/>
            </View>
            <Text style={styles.modalTitle}>Comment tu utilises Cercle ?</Text>
            <Text style={styles.modalSub}>
              Choisis ton profil. Tu pourras le changer dans les réglages.
            </Text>

            {/* Particulier */}
            <TouchableOpacity onPress={()=>handleModeChoice("particulier")}
              style={styles.modeBtn} activeOpacity={0.88}>
              <View style={styles.modeIcon}>
                <MaterialCommunityIcons name="home-heart" size={22} color={colors.mint}/>
              </View>
              <View style={{flex:1}}>
                <Text style={styles.modeName}>Particulier</Text>
                <Text style={styles.modeSub}>Partage objets avec proches, cercles fermés, gratuit</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.subtext}/>
            </TouchableOpacity>

            {/* Pro */}
            <TouchableOpacity onPress={()=>handleModeChoice("pro")}
              style={[styles.modeBtn,styles.modeBtnPro]} activeOpacity={0.88}>
              <View style={[styles.modeIcon,{backgroundColor:MINT_DIM,borderColor:MINT_BDR}]}>
                <MaterialCommunityIcons name="briefcase-outline" size={22} color={colors.mint}/>
              </View>
              <View style={{flex:1}}>
                <Text style={[styles.modeName,{color:colors.mint}]}>Pro — Auto-entrepreneur</Text>
                <Text style={styles.modeSub}>Catalogue d'outils/services, location payante, géoloc</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.mint}/>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex:1, backgroundColor:colors.bg },
  wrap: { flex:1, paddingHorizontal:16, justifyContent:"space-between" },

  haloA: { position:"absolute", top:-140, left:-120, width:320, height:320, borderRadius:320, backgroundColor:"rgba(29,255,194,0.16)", opacity:0.9 },
  haloB: { position:"absolute", bottom:-180, right:-140, width:420, height:420, borderRadius:420, backgroundColor:"rgba(29,255,194,0.10)" },
  haloC: { position:"absolute", top:120, right:-80, width:240, height:240, borderRadius:240, backgroundColor:"rgba(255,255,255,0.06)" },

  heroCard: { alignSelf:"center", width:"100%", maxWidth:520, borderRadius:22, padding:18,
              backgroundColor:"rgba(255,255,255,0.04)", borderWidth:1, borderColor:colors.stroke },
  logoWrap: { width:56, height:56, borderRadius:18, backgroundColor:"rgba(29,255,194,0.10)",
              borderWidth:1, borderColor:"rgba(29,255,194,0.22)", alignItems:"center",
              justifyContent:"center", marginBottom:10 },
  logo:     { width:34, height:34, borderRadius:10 },
  title:    { color:colors.text, fontSize:32, fontWeight:"900" },
  subtitle: { color:colors.subtext, marginTop:6, fontWeight:"800" },
  divider:  { height:1, backgroundColor:colors.stroke, marginVertical:14 },
  body:     { color:colors.text, opacity:0.92, lineHeight:20, fontWeight:"700" },
  loadingRow:{ flexDirection:"row", alignItems:"center", gap:10, marginTop:14 },
  loadingTxt:{ color:colors.subtext, fontWeight:"800" },

  footer:   { paddingTop:14, paddingBottom:4, gap:10 },
  btn:      { backgroundColor:colors.mint, paddingVertical:13, borderRadius:14,
              alignItems:"center", borderWidth:1, borderColor:"rgba(29,255,194,0.25)" },
  btnTxt:   { color:colors.bg, fontWeight:"900", fontSize:16 },
  linksRow: { flexDirection:"row", justifyContent:"center", alignItems:"center", gap:10, flexWrap:"wrap" },
  link:     { color:colors.subtext, textDecorationLine:"underline", fontWeight:"800" },
  dot:      { color:colors.subtext, opacity:0.7 },
  micro:    { textAlign:"center", color:colors.subtext, opacity:0.75, fontWeight:"700" },

  /* Modale mode */
  modalBg:    { flex:1, backgroundColor:"rgba(0,0,0,0.6)", alignItems:"center", justifyContent:"center", padding:20 },
  modalCard:  { width:"100%", maxWidth:420, backgroundColor:"#0D1018",
                borderRadius:24, borderWidth:1, borderColor:"rgba(255,255,255,0.10)", padding:20 },
  modalLogo:  { width:52, height:52, borderRadius:16, backgroundColor:"rgba(92,255,176,0.10)",
                borderWidth:1, borderColor:"rgba(92,255,176,0.22)", alignItems:"center",
                justifyContent:"center", marginBottom:14 },
  modalTitle: { color:colors.text, fontSize:20, fontWeight:"900", marginBottom:6 },
  modalSub:   { color:colors.subtext, fontSize:13, lineHeight:20, marginBottom:20 },

  modeBtn:    { flexDirection:"row", alignItems:"center", gap:12, padding:14,
                borderRadius:16, borderWidth:1, borderColor:"rgba(255,255,255,0.08)",
                backgroundColor:"rgba(255,255,255,0.03)", marginBottom:10 },
  modeBtnPro: { borderColor:"rgba(92,255,176,0.22)", backgroundColor:"rgba(92,255,176,0.06)" },
  modeIcon:   { width:44, height:44, borderRadius:14, backgroundColor:"rgba(255,255,255,0.06)",
                borderWidth:1, borderColor:"rgba(255,255,255,0.10)", alignItems:"center", justifyContent:"center" },
  modeName:   { color:colors.text, fontWeight:"800", fontSize:15, marginBottom:3 },
  modeSub:    { color:colors.subtext, fontSize:12, lineHeight:17 },
});