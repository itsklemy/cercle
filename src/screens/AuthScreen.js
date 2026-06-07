
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Animated, TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import { useResponsive } from "../hooks/useResponsive";
import { CommonActions } from "@react-navigation/native";

WebBrowser.maybeCompleteAuthSession();

/* ─── TOKENS ─── */
const MINT    = "#5CFFB0";
const BG      = "#07090F";
const CARD    = "#0D1018";
const TEXT    = "#F0F2F7";
const SUBTEXT = "#5A6478";
const STROKE  = "rgba(255,255,255,0.08)";
const MINT_DIM = "rgba(92,255,176,0.08)";
const MINT_BDR = "rgba(92,255,176,0.22)";

/* ─── CONSTANTS ─── */
const AUTH_REDIRECT         = "cercle://auth/callback";
const ONBOARDING_KEY_PREFIX = "onboarding_done_v1_";
export const PENDING_INVITE_KEY    = "pending_invite_v1";
const PENDING_USER_MODE_KEY = "pending_user_mode";
const OAUTH_PENDING_KEY     = "oauth_pending_v1";

const onboardingKeyForUser = (uid) => `${ONBOARDING_KEY_PREFIX}${String(uid||"")}`;
const isAuthCallbackUrl    = (url) => typeof url==="string" && url.startsWith(AUTH_REDIRECT);

/* ─── Field animé ─── */
function Field({ label, value, onChangeText, placeholder, onSubmitEditing }) {
  const border = useRef(new Animated.Value(0)).current;
  const onFocus = () => Animated.timing(border,{toValue:1,duration:180,useNativeDriver:false}).start();
  const onBlur  = () => Animated.timing(border,{toValue:0,duration:180,useNativeDriver:false}).start();
  const borderColor = border.interpolate({ inputRange:[0,1], outputRange:[STROKE,"rgba(92,255,176,0.45)"] });
  return (
    <View style={{marginTop:16}}>
      <Text style={S.label}>{label}</Text>
      <Animated.View style={[S.inputWrap,{borderColor}]}>
        <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder}
          placeholderTextColor={SUBTEXT} textContentType="oneTimeCode"
          autoCapitalize="characters" autoCorrect={false} style={S.input}
          onFocus={onFocus} onBlur={onBlur} returnKeyType="done"
          onSubmitEditing={onSubmitEditing}/>
      </Animated.View>
    </View>
  );
}

/* ─── SCREEN ─── */
export default function AuthScreen({ navigation, route }) {
  useResponsive();
  const initialStep = route?.params?.mode==="code" ? "code" : "choice";
  const [step,            setStep]           = useState(initialStep);
  const [inviteCode,      setInviteCode]      = useState(route?.params?.prefillCode||"");
  const [busy,            setBusy]            = useState(false);
  const [hasConfig,       setHasConfig]       = useState(true);
  const [checkingSession, setCheckingSession] = useState(true);
  const [oauthReturning,  setOauthReturning]  = useState(false);
  // ── NOUVEAU : mode en cours de sélection ──
  const [pendingMode,     setPendingMode]     = useState("particulier");

  const oauthHandledRef = useRef(false);
  const routingRef      = useRef(false);
  const fadeAnim        = useRef(new Animated.Value(0)).current;
  const slideAnim       = useRef(new Animated.Value(24)).current;

  const animateIn = useCallback(() => {
    fadeAnim.setValue(0); slideAnim.setValue(24);
    Animated.parallel([
      Animated.timing(fadeAnim,{toValue:1,duration:350,useNativeDriver:true}),
      Animated.spring(slideAnim,{toValue:0,tension:85,friction:11,useNativeDriver:true}),
    ]).start();
  },[fadeAnim,slideAnim]);

  useEffect(()=>{ animateIn(); },[step,animateIn]);

  const humanizeError = (err) => {
    const msg = String(err?.message||"").toLowerCase();
    if (msg.includes("network")||msg.includes("fetch")) return "Pas de connexion internet.";
    if (msg.includes("rate limit")) return "Trop de tentatives — attends quelques minutes.";
    if (msg.includes("invalid")&&msg.includes("refresh")) return "Session expirée. Réessaie.";
    if (msg.includes("incomplète")) return "La connexion Google n'a pas pu être finalisée.";
    return err?.message||"Une erreur est survenue.";
  };

  const ensureProfileRow = useCallback(async (userId) => {
    try {
      if (!userId) return;
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      const fallbackName =
        user?.user_metadata?.full_name || user?.user_metadata?.name ||
        user?.email?.split("@")?.[0] || "Utilisateur";
      // ── Lire le pending mode et l'écrire dans le profil ──
      const mode = (await AsyncStorage.getItem(PENDING_USER_MODE_KEY)) || "particulier";
      await supabase.from("profiles").upsert(
        { id:userId, email:user?.email||null, public_name:fallbackName, user_mode:mode },
        { onConflict:"id", ignoreDuplicates:false }
      );
    } catch (e) { console.log("[AUTH] ensureProfileRow error =", e?.message||e); }
  },[]);

  const createSessionFromUrl = useCallback(async (url) => {
    try {
      if (!url||!isAuthCallbackUrl(url)) return false;
      const { params, errorCode } = QueryParams.getQueryParams(url);
      if (errorCode) throw new Error(errorCode);
      const { access_token, refresh_token } = params||{};
      if (!access_token||!refresh_token) return false;
      const { error } = await supabase.auth.setSession({access_token,refresh_token});
      if (error) throw error;
      return true;
    } catch (e) { console.log("[AUTH] createSessionFromUrl error =",e?.message||e); return false; }
  },[]);

  const routeAfterAuth = useCallback(async () => {
    if (routingRef.current) return;
    routingRef.current = true;
    try {
      const { data:sessData, error } = await supabase.auth.getSession();
      const session = sessData?.session;
      const userId  = session?.user?.id;
      if (!userId) throw new Error("Session absente après authentification.");

      await ensureProfileRow(userId);

      const done = await AsyncStorage.getItem(onboardingKeyForUser(userId));
      const hasDone = done==="1"||done==="true";

      let pendingCode = "";
      try { pendingCode = (await AsyncStorage.getItem(PENDING_INVITE_KEY))||""; } catch {}

      // ── Lire le mode enregistré ──
      const mode = (await AsyncStorage.getItem(PENDING_USER_MODE_KEY))||"particulier";

      if (!hasDone) {
        // ── Pas encore d'onboarding : router selon le mode ──
        if (mode==="pro") {
          navigation.dispatch(CommonActions.reset({
            index:0, routes:[{name:"ProOnboardingScreen"}]
          }));
        } else {
          navigation.dispatch(CommonActions.reset({
            index:0, routes:[{name:"InventoryOnboardingScreen",params:{pendingCode}}]
          }));
        }
        return;
      }

      // ── Onboarding fait ──
      if (pendingCode.trim()) {
        try { await supabase.rpc("join_circle_by_token_or_code_v2",{p_code:pendingCode.trim()}); } catch {}
        try { await AsyncStorage.removeItem(PENDING_INVITE_KEY); } catch {}
      }
      try { await AsyncStorage.removeItem(PENDING_USER_MODE_KEY); } catch {}

      navigation.dispatch(CommonActions.reset({index:0,routes:[{name:"AppTabs"}]}));
    } catch (e) {
      Alert.alert("Connexion",humanizeError(e));
    } finally { routingRef.current=false; setOauthReturning(false); setCheckingSession(false); }
  },[navigation,ensureProfileRow]);

  const finishOAuthLogin = useCallback(async (url) => {
    setOauthReturning(true);
    try {
      const ok = await createSessionFromUrl(url);
      if (!ok) throw new Error("Connexion incomplète. Réessaie.");
      try { await AsyncStorage.removeItem(OAUTH_PENDING_KEY); } catch {}
      await routeAfterAuth();
    } catch (e) {
      Alert.alert("Connexion",humanizeError(e));
    } finally { setOauthReturning(false); setCheckingSession(false); }
  },[createSessionFromUrl,routeAfterAuth]);

  useEffect(()=>{
    const ok = hasSupabaseConfig(); setHasConfig(ok);
    if (!ok) { setCheckingSession(false); return; }
    let mounted = true;
    const boot = async () => {
      try {
        const pendingOAuth = (await AsyncStorage.getItem(OAUTH_PENDING_KEY))==="1";
        const initialUrl   = await Linking.getInitialURL();
        const isAuthUrl    = isAuthCallbackUrl(initialUrl);
        if (!mounted) return;
        if (pendingOAuth&&isAuthUrl) {
          oauthHandledRef.current=true; await finishOAuthLogin(initialUrl); return;
        }
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        if (data?.session?.user?.id) { await routeAfterAuth(); return; }
      } catch (e) { console.log("[AUTH] boot error =",e?.message||e); }
      finally { if (mounted) { setCheckingSession(false); setOauthReturning(false); } }
    };
    boot();
    const linkSub = Linking.addEventListener("url",async({url})=>{
      if (!isAuthCallbackUrl(url)||oauthHandledRef.current) return;
      oauthHandledRef.current=true; await finishOAuthLogin(url);
    });
    const { data:sub } = supabase.auth.onAuthStateChange((event)=>{
      if (!mounted) return;
      if (event==="SIGNED_OUT") { setCheckingSession(false); setOauthReturning(false); }
    });
    return ()=>{ mounted=false; linkSub?.remove?.(); sub?.subscription?.unsubscribe?.(); };
  },[finishOAuthLogin,routeAfterAuth]);

  useEffect(()=>{
    if (route?.params?.mode==="code") setStep("code");
    if (route?.params?.prefillCode)   setInviteCode(route.params.prefillCode);
  },[route?.params?.mode,route?.params?.prefillCode]);

  /* ─── GOOGLE OAUTH ─── */
  const signInWithGoogle = useCallback(async (codeToSave, modeToSave) => {
    if (!hasConfig||busy) return;
    if (codeToSave?.trim()) {
      try { await AsyncStorage.setItem(PENDING_INVITE_KEY,codeToSave.trim()); } catch {}
    }
    // ── Sauvegarder le mode avant l'OAuth ──
    const mode = modeToSave || pendingMode || "particulier";
    try { await AsyncStorage.setItem(PENDING_USER_MODE_KEY,mode); } catch {}

    setBusy(true); setOauthReturning(true); setCheckingSession(true);
    try {
      oauthHandledRef.current=false;
      await AsyncStorage.setItem(OAUTH_PENDING_KEY,"1");
      const { data,error } = await supabase.auth.signInWithOAuth({
        provider:"google",
        options:{redirectTo:AUTH_REDIRECT,skipBrowserRedirect:true},
      });
      if (error) throw error;
      if (!data?.url) throw new Error("URL Google introuvable.");
      const result = await WebBrowser.openAuthSessionAsync(data.url,AUTH_REDIRECT);
      if (result.type==="success"&&result.url) {
        oauthHandledRef.current=true; await finishOAuthLogin(result.url); return;
      }
      if (result.type==="dismiss"||result.type==="cancel") {
        await AsyncStorage.removeItem(OAUTH_PENDING_KEY); return;
      }
      await AsyncStorage.removeItem(OAUTH_PENDING_KEY);
      throw new Error("Connexion Google incomplète.");
    } catch (err) {
      try { await AsyncStorage.removeItem(OAUTH_PENDING_KEY); } catch {}
      Alert.alert("Google",humanizeError(err));
    } finally { setBusy(false); setOauthReturning(false); setCheckingSession(false); }
  },[busy,finishOAuthLogin,hasConfig,pendingMode]);

  /* ─── RENDER ─── */
  if (checkingSession||oauthReturning) {
    return (
      <View style={[S.loaderScreen,{backgroundColor:BG}]}>
        <ActivityIndicator color={MINT}/>
        <Text style={S.loaderText}>Connexion…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{flex:1,backgroundColor:BG}}
      behavior={Platform.OS==="ios"?"padding":undefined}>
      <ScrollView contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Animated.View style={[S.inner,{opacity:fadeAnim,transform:[{translateY:slideAnim}]}]}>

          {/* Logo */}
          <View style={S.logoWrap}>
            <View style={S.logoMark}>
              <MaterialCommunityIcons name="account-group" size={28} color={MINT}/>
            </View>
            <Text style={S.appName}>Cercle</Text>
          </View>

          <View style={S.card}>

            {/* ── STEP: choice ── */}
            {step==="choice"&&(
              <>
                <Text style={S.cardTitle}>Connexion</Text>
                <Text style={S.cardSub}>Continue avec Google pour accéder à ton compte.</Text>

                {/* ── NOUVEAU : Choix du mode ── */}
                <View style={S.modeRow}>
                  {[
                    {m:"particulier",icon:"home-heart",label:"Particulier"},
                    {m:"pro",        icon:"briefcase-outline",  label:"Pro"},
                  ].map(opt=>(
                    <TouchableOpacity key={opt.m} onPress={()=>setPendingMode(opt.m)}
                      style={[S.modeChip, pendingMode===opt.m&&S.modeChipActive]}
                      activeOpacity={0.85}>
                      <MaterialCommunityIcons name={opt.icon} size={16}
                        color={pendingMode===opt.m?MINT:SUBTEXT}/>
                      <Text style={[S.modeChipTxt, pendingMode===opt.m&&{color:MINT}]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[S.primaryBtn,{marginTop:16,opacity:busy?0.7:1}]}
                  onPress={()=>signInWithGoogle(null,pendingMode)}
                  activeOpacity={0.88} disabled={!hasConfig||busy}>
                  {busy ? <ActivityIndicator color={BG}/> : (
                    <View style={S.rowCenter}>
                      <MaterialCommunityIcons name="google" size={18} color={BG}/>
                      <Text style={[S.primaryTxt,{marginLeft:10}]}>Continuer avec Google</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <View style={S.separator}>
                  <View style={S.sepLine}/><Text style={S.sepTxt}>ou</Text><View style={S.sepLine}/>
                </View>

                <TouchableOpacity style={S.codeBtn} onPress={()=>setStep("code")} disabled={busy} activeOpacity={0.88}>
                  <MaterialCommunityIcons name="key-outline" size={16} color={MINT}/>
                  <Text style={S.codeTxt}>J'ai un code d'invitation</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── STEP: code ── */}
            {step==="code"&&(
              <>
                <TouchableOpacity onPress={()=>setStep("choice")} style={S.backBtn}>
                  <MaterialCommunityIcons name="arrow-left" size={18} color={SUBTEXT}/>
                  <Text style={S.backTxt}>Retour</Text>
                </TouchableOpacity>
                <Text style={S.cardTitle}>Code d'invitation</Text>
                <Text style={S.cardSub}>
                  Saisis ton code puis connecte-toi — tu rejoindras automatiquement le cercle.
                </Text>
                <Field label="Code d'invitation" value={inviteCode}
                  onChangeText={(v)=>setInviteCode(v.toUpperCase())}
                  placeholder="Ex: FAMILLE-7K2X"
                  onSubmitEditing={()=>signInWithGoogle(inviteCode,pendingMode)}/>
                <TouchableOpacity
                  style={[S.primaryBtn,{marginTop:20,opacity:inviteCode.trim()&&!busy?1:0.4}]}
                  onPress={()=>signInWithGoogle(inviteCode,pendingMode)}
                  activeOpacity={0.88} disabled={!inviteCode.trim()||busy}>
                  {busy ? <ActivityIndicator color={BG}/> : (
                    <View style={S.rowCenter}>
                      <MaterialCommunityIcons name="google" size={18} color={BG}/>
                      <Text style={[S.primaryTxt,{marginLeft:10}]}>Continuer avec Google</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </>
            )}

          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const S = StyleSheet.create({
  loaderScreen: { flex:1, alignItems:"center", justifyContent:"center" },
  loaderText:   { color:SUBTEXT, marginTop:10, fontSize:14 },
  scroll:       { flexGrow:1, justifyContent:"center", padding:20, paddingVertical:48 },
  inner:        { width:"100%", maxWidth:440, alignSelf:"center" },

  logoWrap: { alignItems:"center", marginBottom:32 },
  logoMark: { width:60, height:60, borderRadius:20, backgroundColor:"rgba(92,255,176,0.10)",
              borderWidth:1, borderColor:"rgba(92,255,176,0.22)", alignItems:"center",
              justifyContent:"center", marginBottom:12 },
  appName:  { color:TEXT, fontSize:30, fontWeight:"900", letterSpacing:-0.5 },

  card:      { backgroundColor:CARD, borderRadius:22, borderWidth:1, borderColor:STROKE, padding:20 },
  cardTitle: { color:TEXT, fontSize:22, fontWeight:"900", letterSpacing:-0.3 },
  cardSub:   { color:SUBTEXT, fontSize:14, marginTop:6, lineHeight:20 },

  /* ── Mode selector ── */
  modeRow:       { flexDirection:"row", gap:8, marginTop:16 },
  modeChip:      { flex:1, flexDirection:"row", alignItems:"center", justifyContent:"center",
                   gap:7, paddingVertical:10, borderRadius:12,
                   borderWidth:1, borderColor:STROKE, backgroundColor:"rgba(255,255,255,0.03)" },
  modeChipActive:{ borderColor:MINT_BDR, backgroundColor:MINT_DIM },
  modeChipTxt:   { color:SUBTEXT, fontWeight:"700", fontSize:13 },

  backBtn:  { flexDirection:"row", alignItems:"center", gap:6, marginBottom:16 },
  backTxt:  { color:SUBTEXT, fontWeight:"700", fontSize:14 },
  label:    { color:SUBTEXT, fontSize:13, fontWeight:"700", marginBottom:6 },
  inputWrap:{ borderRadius:13, borderWidth:1, overflow:"hidden" },
  input:    { backgroundColor:"rgba(255,255,255,0.04)", color:TEXT, fontSize:15,
              paddingHorizontal:14, paddingVertical:13 },

  primaryBtn: { backgroundColor:MINT, borderRadius:14, height:52,
                alignItems:"center", justifyContent:"center" },
  primaryTxt: { color:BG, fontWeight:"900", fontSize:16 },

  separator:  { flexDirection:"row", alignItems:"center", gap:10, marginVertical:18 },
  sepLine:    { flex:1, height:1, backgroundColor:STROKE },
  sepTxt:     { color:SUBTEXT, fontSize:12, fontWeight:"700" },

  codeBtn:    { flexDirection:"row", alignItems:"center", justifyContent:"center",
                gap:8, paddingVertical:14, borderRadius:14,
                borderWidth:1, borderColor:MINT_BDR, backgroundColor:MINT_DIM },
  codeTxt:    { color:MINT, fontWeight:"800", fontSize:14 },

  rowCenter:  { flexDirection:"row", alignItems:"center" },
});