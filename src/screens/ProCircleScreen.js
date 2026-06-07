/**
 * ProCircleScreen.js — v5 "Marketplace Pro"
 *
 * BUGS CORRIGÉS :
 *  ✓ owner_id null → essai owner_id puis fallback created_by
 *  ✓ Publication sans photo fonctionne
 *  ✓ Clavier visible sur formulaires (KeyboardAvoidingView correct)
 *
 * UX REFAITE :
 *  ✓ Hero : Emprunter / Louer / Mutualiser immédiatement visibles
 *  ✓ 3 tabs : Explorer / Mes annonces / Marques
 *  ✓ Onglet Marques : abonnement Pro 10€/mois + Cercle Officiel marques
 *  ✓ Publication 3 étapes guidées, photos optionnelles, catégories en grille
 *  ✓ Détail item : carousel, Modifier/Supprimer si propriétaire, Réserver sinon
 *  ✓ Géoloc silencieuse au mount
 */

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, StyleSheet, Image, Modal,
  TextInput, KeyboardAvoidingView, Platform, RefreshControl,
  Share, Animated, Dimensions, Pressable,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect }         from "@react-navigation/native";
import { useBottomTabBarHeight }  from "@react-navigation/bottom-tabs";
import * as ImagePicker           from "expo-image-picker";
import * as Location              from "expo-location";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient }         from "expo-linear-gradient";

import { supabase }                            from "../lib/supabase";
import { sendPush }                            from "../notifications/pushClient";
import { getCircleMemberTokens, getUserToken } from "../notifications/pushTargets";

/* ─── TOKENS ─── */
const BG     = "#07090F";
const MINT   = "#5CFFB0";
const BLUE   = "#85CCFF";
const PINK   = "#FFB5B3";
const GOLD   = "#FFE66D";
const PURPLE = "#C4B5FD";
const TEXT   = "#F0F2F7";
const MUTED  = "#7A8499";
const CARD   = "rgba(255,255,255,0.05)";
const CARD2  = "rgba(255,255,255,0.08)";
const LINE   = "rgba(255,255,255,0.08)";
const { width: SW } = Dimensions.get("window");

const toDim = (hex) => hex + "18";
const toBdr = (hex) => hex + "40";

/* ─── CATÉGORIES ─── */
const CATS = [
  { key:"tools", label:"Outils", icon:"hammer-wrench", color:MINT },
  { key:"vehicles", label:"Véhicules", icon:"truck-outline", color:BLUE },
  { key:"construction", label:"BTP / chantier", icon:"excavator", color:GOLD },
  { key:"garden", label:"Jardin", icon:"tree-outline", color:MINT },
  { key:"home", label:"Maison", icon:"home-outline", color:PINK },
  { key:"kitchen", label:"Cuisine", icon:"silverware-fork-knife", color:PINK },
  { key:"baby", label:"Bébé / enfant", icon:"baby-face-outline", color:BLUE },
  { key:"sports", label:"Sport", icon:"dumbbell", color:BLUE },
  { key:"events", label:"Événementiel", icon:"party-popper", color:PINK },
  { key:"camping", label:"Camping / outdoor", icon:"tent", color:MINT },
  { key:"electronics", label:"Électronique", icon:"laptop", color:PURPLE },
  { key:"clothing", label:"Vêtements", icon:"tshirt-crew-outline", color:PINK },
  { key:"services", label:"Services", icon:"handshake-outline", color:PURPLE },
  { key:"other", label:"Autre", icon:"dots-horizontal-circle-outline", color:MUTED },
];
const ALL_CATS = [{ key:"all", label:"Tout", icon:"view-grid-outline", color:MUTED }, ...CATS];
const catMeta  = (k) => CATS.find(c => c.key === k) || CATS[0];

/* ─── TARIFICATION ─── */
const RATES = { tools:.025, vehicles:.018, construction:.02, garden:.022, events:.03, services:.015 };
const calcPrice = (val, cat) => {
  const v = parseFloat(String(val || "").replace(",", "."));
  if (!v || v <= 0) return null;
  const r   = RATES[cat] || .02;
  const day = Math.max(5, Math.round(v * r));
  return { day, weekly: Math.round(day*7*.8), monthly: Math.round(day*30*.65), caution: Math.round(v*.25) };
};

/* ─── HELPERS ─── */
const fmtRel = (iso) => {
  if (!iso) return "";
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1)  return "À l instant";
  if (h < 24) return h + "h";
  const d = Math.floor(h / 24);
  return d === 1 ? "Hier" : d + "j";
};
const haversineKm = (a, b) => {
  if (!a?.lat || !b?.lat) return null;
  const R = 6371, toR = x => x * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const x = Math.sin(dLat/2)**2 + Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLng/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x)) * 10) / 10;
};
const initials = (name) => {
  const p = String(name || "").trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
};

/* ─── AUTH ─── */
async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

/* BUG FIX : essai owner_id puis fallback created_by */
async function getOrCreateProCircle(userId) {
  const { data: mems } = await supabase
    .from("circle_members").select("circle_id").eq("user_id", userId);
  const ids = (mems || []).map(m => m.circle_id);
  if (ids.length) {
    const { data: circles } = await supabase
      .from("circles").select("*").in("id", ids).eq("type", "pro");
    if (circles?.length) return circles[0];
  }
  // Essai 1 : owner_id
  const { data: c1, error: e1 } = await supabase
    .from("circles").insert({ name: "Mon Cercle Pro", type: "pro", owner_id: userId })
    .select("*").single();
  if (!e1 && c1) {
    await supabase.from("circle_members")
      .insert({ circle_id: c1.id, user_id: userId, role: "owner" });
    return c1;
  }
  // Fallback : created_by
  const { data: c2, error: e2 } = await supabase
    .from("circles").insert({ name: "Mon Cercle Pro", type: "pro", created_by: userId })
    .select("*").single();
  if (e2) throw new Error(e2.message);
  await supabase.from("circle_members")
    .insert({ circle_id: c2.id, user_id: userId, role: "owner" });
  return c2;
}

/* Upload photos — essai bucket items puis pro-items */
async function uploadPhotos(assets, userId) {
  const urls = [];
  for (const asset of assets) {
    try {
      const ext  = (asset.uri.split(".").pop() || "jpg").split("?")[0];
      const path = "public/" + userId + "/" + Date.now() + "_" + Math.random().toString(36).slice(2) + "." + ext;
      const blob = await fetch(asset.uri).then(r => r.blob());
      for (const bucket of ["items", "pro-items"]) {
        const { error } = await supabase.storage
          .from(bucket).upload(path, blob, { contentType: asset.mimeType || "image/jpeg", upsert: true });
        if (!error) {
          const { data } = supabase.storage.from(bucket).getPublicUrl(path);
          if (data?.publicUrl) { urls.push(data.publicUrl); break; }
        }
      }
    } catch (e) { console.log("[upload]", e?.message); }
  }
  return urls;
}

/* ═══════════════════════════════════════════════════════════
   SCREEN PRINCIPAL
═══════════════════════════════════════════════════════════ */
export default function ProCircleScreen({ navigation }) {
  const insets  = useSafeAreaInsets();
  const tabBarH = useBottomTabBarHeight();

  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId,     setUserId]     = useState(null);
  const [profile,    setProfile]    = useState(null);
  const [circle,     setCircle]     = useState(null);
  const [members,    setMembers]    = useState([]);
  const [items,      setItems]      = useState([]);
  const [calls,      setCalls]      = useState([]);
  const [catFilter,  setCatFilter]  = useState("all");
  const [tab,        setTab]        = useState("feed");
  const [userLoc,    setUserLoc]    = useState(null);
  const [locLoading, setLocLoading] = useState(false);

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishMode, setPublishMode] = useState("rent");
  const [detailItem,  setDetailItem]  = useState(null);
  const [bookingItem, setBookingItem] = useState(null);
  const [needOpen,    setNeedOpen]    = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [editItem,    setEditItem]    = useState(null);

  /* géoloc silencieuse */
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
          setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch {}
    })();
  }, []);

  const requestLocation = useCallback(async () => {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Localisation", "Active la géolocalisation dans les réglages.");
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserLoc(loc);
      return loc;
    } catch { return null; }
    finally { setLocLoading(false); }
  }, []);

  const load = useCallback(async (opts = {}) => {
    const { silent = false } = opts;
    if (!silent) setLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data: prof } = await supabase.from("profiles")
        .select("id,public_name,avatar_url,activity,user_mode")
        .eq("id", user.id).single();
      setProfile(prof || null);

      const pro = await getOrCreateProCircle(user.id);
      setCircle(pro);

      const { data: mems } = await supabase.from("circle_members")
        .select("user_id,role").eq("circle_id", pro.id);
      const mIds   = (mems || []).map(m => m.user_id);
      const profMap = new Map();
      if (mIds.length) {
        const { data: profs } = await supabase.from("profiles")
          .select("id,public_name,avatar_url,activity").in("id", mIds);
        (profs || []).forEach(p => profMap.set(p.id, p));
      }
      setMembers((mems || []).map(m => ({
        ...m,
        ...(profMap.get(m.user_id) || {}),
        public_name: profMap.get(m.user_id)?.public_name || "Membre",
      })));

      let q = supabase.from("items").select("*")
        .eq("circle_id", pro.id)
        .order("created_at", { ascending: false });
      if (catFilter !== "all") q = q.eq("category", catFilter);
      const { data: itemData } = await q;

      const enriched = (itemData || []).map((it, idx) => {
        const owner  = profMap.get(it.owner_id);
        const loc    = { lat: it.latitude || null, lng: it.longitude || null };
        const photos = Array.isArray(it.photos) && it.photos.length
          ? it.photos : (it.photo ? [it.photo] : []);
        return {
          ...it, photos,
          owner_name:     owner?.public_name || "Membre",
          owner_avatar:   owner?.avatar_url  || null,
          owner_activity: owner?.activity    || "Professionnel",
          _dist:          haversineKm(userLoc, loc),
          _mx:            10 + ((idx * 23) % 76),
          _my:            10 + ((idx * 17) % 68),
        };
      });
      setItems(enriched);

      const { data: callData } = await supabase.from("calls")
        .select("*").eq("circle_id", pro.id)
        .order("created_at", { ascending: false }).limit(20);
      setCalls((callData || []).map(c => ({
        ...c, author_name: profMap.get(c.author_id)?.public_name || "Membre",
      })));
    } catch (e) { console.log("[ProCircle]", e?.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [catFilter, userLoc]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load({ silent: true }); }, [load]));

  const feedItems = useMemo(() =>
    [...items].sort((a, b) => (a._dist ?? Infinity) - (b._dist ?? Infinity)), [items]);
  const myItems  = useMemo(() =>
    items.filter(it => String(it.owner_id) === String(userId)), [items, userId]);
  const mutItems = useMemo(() =>
    items.filter(it => it.listing_type === "mutualize"), [items]);

  const handleSaveItem = useCallback(async (payload) => {
    const user = await getCurrentUser();
    if (!user || !circle?.id) { Alert.alert("Erreur", "Session ou cercle introuvable."); return; }
    try {
      let photoUrls = [];
      if (payload.photos?.length) photoUrls = await uploadPhotos(payload.photos, user.id);
      const row = {
        owner_id: user.id, circle_id: circle.id,
        title: payload.title, description: payload.description || null,
        category: payload.category, photos: photoUrls,        is_free: !payload.priceDay,
        price_amount: payload.priceDay   || null, price_unit: "jour",
        caution_amount: payload.caution  || null,
        address_label: payload.address   || null, city: payload.city || null,
        latitude: payload.lat            || null, longitude: payload.lng || null,
        is_pro_item: true, listing_type: payload.mode,
        insurance_required: payload.insurance || false,
        deposit_percent: 30, booking_enabled: true, status: "available",
      };
      if (payload.editId) {
        const { error } = await supabase.from("items")
          .update(row).eq("id", payload.editId).eq("owner_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("items").insert(row);
        if (error) throw error;
        try {
          const tokens  = await getCircleMemberTokens(circle.id, user.id);
          const me      = await getUserToken(user.id);
          const targets = (tokens || []).filter(t => t && t !== me);
          if (targets.length) await sendPush({
            to: targets,
            title: payload.mode === "mutualize" ? "Nouvelle mutualisation 🤝" : "Nouveau matériel 📦",
            body:  payload.title + " · " + (payload.city || "Autour de vous"),
            data:  { type: "pro_item_added", circleId: circle.id },
          });
        } catch {}
      }
      setPublishOpen(false); setEditItem(null); load({ silent: true });
    } catch (e) { Alert.alert("Publication", e?.message || "Impossible de publier."); }
  }, [circle?.id, load]);

  const handleDeleteItem = useCallback(async (item) => {
    Alert.alert("Retirer cette annonce ?", "Elle sera définitivement supprimée.", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => {
        const user = await getCurrentUser(); if (!user) return;
        await supabase.from("items").delete().eq("id", item.id).eq("owner_id", user.id);
        setDetailItem(null); load({ silent: true });
      }},
    ]);
  }, [load]);

  const handleSaveNeed = useCallback(async (payload) => {
    const user = await getCurrentUser();
    if (!user || !circle?.id) return;
    try {
      const { error } = await supabase.from("calls").insert({
        circle_id: circle.id, author_id: user.id,
        title: payload.message.slice(0, 80), message: payload.message,
        category: payload.category, status: "open",
      });
      if (error) throw error;
      try {
        const tokens  = await getCircleMemberTokens(circle.id, user.id);
        const me      = await getUserToken(user.id);
        const targets = (tokens || []).filter(t => t && t !== me);
        if (targets.length) await sendPush({
          to: targets,
          title: "Demande dans " + (circle.name || "le Cercle Pro") + " 📡",
          body:  payload.message.slice(0, 80),
          data:  { type: "pro_need", circleId: circle.id },
        });
      } catch {}
      setNeedOpen(false); load({ silent: true });
    } catch (e) { Alert.alert("Demande", e?.message || "Erreur."); }
  }, [circle?.id, load]);

  if (loading) return (
    <SafeAreaView style={S.safe}>
      <View style={S.center}>
        <ActivityIndicator color={MINT} size="large" />
        <Text style={[S.muted, { marginTop: 12 }]}>Chargement…</Text>
      </View>
    </SafeAreaView>
  );

  const bottomPad = 80 + tabBarH;

  return (
    <SafeAreaView style={S.safe} edges={["top","left","right"]}>
      <View style={[S.root, { paddingBottom: Math.max(12, insets.bottom) }]}>

        <Header
          profile={profile} circle={circle} memberCount={members.length}
          hasLoc={!!userLoc} locLoading={locLoading}
          onLoc={requestLocation}
          onMembers={() => setMembersOpen(true)}
          onInvite={() => Share.share({ message: "Rejoins " + (circle?.name || "Mon Cercle Pro") + " sur Cercle." })}
        />

        <TabBar tab={tab} setTab={setTab} myCount={myItems.length} />

        {tab === "feed" && (
          <ScrollView showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} tintColor={MINT}
              onRefresh={() => { setRefreshing(true); load(); }} />}
            contentContainerStyle={{ paddingBottom: bottomPad }}>

            <HeroActions
              onRent={() => { setPublishMode("rent"); setPublishOpen(true); }}
              onNeed={() => setNeedOpen(true)}
              onMutualize={() => { setPublishMode("mutualize"); setPublishOpen(true); }}
            />

            <MiniMap items={feedItems} userLoc={userLoc}
              onOpen={setDetailItem} onLocate={requestLocation} locLoading={locLoading} />

            <CatFilter value={catFilter} onChange={setCatFilter} />

            {feedItems.length > 0 ? (
              <>
                <SHead title={feedItems.length + " disponible" + (feedItems.length > 1 ? "s" : "")}
                  sub={userLoc ? "Trié par distance" : "Activer la géoloc →"}
                  onSub={userLoc ? null : requestLocation} />
                {feedItems.map(it => (
                  <ItemCard key={it.id} item={it}
                    isMine={String(it.owner_id) === String(userId)}
                    onPress={() => setDetailItem(it)} />
                ))}
              </>
            ) : (
              <EmptyState
                onRent={() => { setPublishMode("rent"); setPublishOpen(true); }}
                onNeed={() => setNeedOpen(true)} />
            )}

            {mutItems.length > 0 && (
              <>
                <SHead title="Mutualisations" sub="Achats groupés en cours" />
                {mutItems.map(it => <MutualCard key={it.id} item={it} onPress={() => setDetailItem(it)} />)}
              </>
            )}

            {calls.length > 0 && (
              <>
                <SHead title="Demandes du cercle" sub="+ Demander" onSub={() => setNeedOpen(true)} />
                {calls.map(c => (
                  <NeedCard key={c.id} call={c}
                    isMine={String(c.author_id) === String(userId)}
                    onReply={() => Alert.alert("Répondre", "Connecte le fil de discussion.")} />
                ))}
              </>
            )}
          </ScrollView>
        )}

        {tab === "mine" && (
          <ScrollView showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} tintColor={MINT}
              onRefresh={() => { setRefreshing(true); load(); }} />}
            contentContainerStyle={{ paddingBottom: bottomPad }}>
            <TouchableOpacity style={S.publishBig}
              onPress={() => { setPublishMode("rent"); setPublishOpen(true); }}>
              <MaterialCommunityIcons name="plus-circle-outline" size={22} color={BG} />
              <Text style={S.publishBigTxt}>Publier du matériel</Text>
            </TouchableOpacity>
            {myItems.length === 0 ? (
              <View style={[S.center, { paddingTop: 40 }]}>
                <MaterialCommunityIcons name="package-variant-closed" size={40} color={MUTED} />
                <Text style={[S.muted, { marginTop: 12, textAlign: "center" }]}>
                  Tu n'as aucune annonce.{"\n"}Publie ton premier matériel !
                </Text>
              </View>
            ) : myItems.map(it => (
              <ItemCard key={it.id} item={it} isMine
                onPress={() => setDetailItem(it)} />
            ))}
          </ScrollView>
        )}

        {tab === "brands" && (
          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: bottomPad }}>
            <BrandsTab />
          </ScrollView>
        )}

        <MainFAB
          bottom={Math.max(16, insets.bottom + tabBarH + 16)}
          onRent={() => { setPublishMode("rent"); setPublishOpen(true); }}
          onNeed={() => setNeedOpen(true)}
          onMutualize={() => { setPublishMode("mutualize"); setPublishOpen(true); }}
        />
      </View>

      <PublishModal
        visible={publishOpen} mode={publishMode} editItem={editItem}
        userLoc={userLoc} onLocate={requestLocation}
        onClose={() => { setPublishOpen(false); setEditItem(null); }}
        onSave={handleSaveItem}
      />
      <NeedModal visible={needOpen} onClose={() => setNeedOpen(false)} onSave={handleSaveNeed} />
      <DetailModal
        visible={!!detailItem} item={detailItem} userId={userId}
        onClose={() => setDetailItem(null)}
        onBook={it => { setDetailItem(null); setBookingItem(it); }}
        onEdit={it => { setDetailItem(null); setEditItem(it); setPublishMode("rent"); setPublishOpen(true); }}
        onDelete={handleDeleteItem}
      />
      <BookModal visible={!!bookingItem} item={bookingItem} onClose={() => setBookingItem(null)} />
      <MembersModal visible={membersOpen} members={members} onClose={() => setMembersOpen(false)} />
    </SafeAreaView>
  );
}

/* ═══════ HEADER ═══════ */
function Header({ profile, circle, memberCount, hasLoc, locLoading, onLoc, onMembers, onInvite }) {
  return (
    <View style={S.header}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={S.proBadge}><Text style={S.proBadgeTxt}>PRO</Text></View>
          <Text style={S.headerName} numberOfLines={1}>{circle?.name || "Mon Cercle Pro"}</Text>
        </View>
        <Text style={S.muted} numberOfLines={1}>
          {profile?.activity || "Espace professionnel"} · {memberCount} membre{memberCount > 1 ? "s" : ""}
        </Text>
      </View>
      <TouchableOpacity style={S.hBtn} onPress={onLoc} disabled={locLoading}>
        {locLoading
          ? <ActivityIndicator size="small" color={MINT} />
          : <MaterialCommunityIcons name={hasLoc ? "map-marker-check" : "map-marker-outline"} size={20} color={hasLoc ? MINT : MUTED} />
        }
      </TouchableOpacity>
      <TouchableOpacity style={S.hBtn} onPress={onMembers}>
        <MaterialCommunityIcons name="account-group-outline" size={20} color={MUTED} />
      </TouchableOpacity>
      <TouchableOpacity style={S.hBtn} onPress={onInvite}>
        <MaterialCommunityIcons name="account-plus-outline" size={20} color={MINT} />
      </TouchableOpacity>
    </View>
  );
}

/* ═══════ TAB BAR ═══════ */
function TabBar({ tab, setTab, myCount }) {
  const tabs = [
    { key: "feed",   label: "Explorer",  icon: "compass-outline" },
    { key: "mine",   label: "Mes annonces" + (myCount > 0 ? " (" + myCount + ")" : ""), icon: "package-variant-closed" },
    { key: "brands", label: "Marques",   icon: "storefront-outline" },
  ];
  return (
    <View style={S.tabBar}>
      {tabs.map(t => {
        const active = tab === t.key;
        return (
          <TouchableOpacity key={t.key} onPress={() => setTab(t.key)}
            style={[S.tabItem, active && S.tabItemActive]}>
            <MaterialCommunityIcons name={t.icon} size={15} color={active ? MINT : MUTED} />
            <Text style={[S.tabTxt, active && { color: MINT }]} numberOfLines={1}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ═══════ HERO 3 ACTIONS ═══════ */
function HeroActions({ onRent, onNeed, onMutualize }) {
  const actions = [
    { label: "Emprunter",  sub: "Trouver du matériel",  icon: "magnify",               color: BLUE,   onPress: () => {} },
    { label: "Louer",      sub: "Rentabiliser le mien", icon: "cash-multiple",          color: MINT,   onPress: onRent },
    { label: "Mutualiser", sub: "Achat groupé",          icon: "account-group-outline",  color: PURPLE, onPress: onMutualize },
  ];
  return (
    <View style={S.hero}>
      <LinearGradient colors={[toDim(MINT), toDim(BLUE), "transparent"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Text style={S.heroEye}>Que veux-tu faire ?</Text>
      <View style={S.heroRow}>
        {actions.map((a, i) => (
          <TouchableOpacity key={i} onPress={a.onPress} activeOpacity={0.82}
            style={[S.heroCard, { borderColor: toBdr(a.color), backgroundColor: toDim(a.color) }]}>
            <MaterialCommunityIcons name={a.icon} size={24} color={a.color} />
            <Text style={[S.heroCardLabel, { color: a.color }]}>{a.label}</Text>
            <Text style={S.heroCardSub}>{a.sub}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity onPress={onNeed} style={S.needBanner}>
        <MaterialCommunityIcons name="bullhorn-outline" size={16} color={GOLD} />
        <Text style={S.needBannerTxt}>Publier une demande — notifier tout le cercle</Text>
        <MaterialCommunityIcons name="chevron-right" size={16} color={GOLD} />
      </TouchableOpacity>
    </View>
  );
}

/* ═══════ MINI MAP ═══════ */
function MiniMap({ items, userLoc, onOpen, onLocate, locLoading }) {
  return (
    <View style={S.mapWrap}>
      <View style={S.mapInner}>
        {[25, 50, 75].map(p => <View key={"h" + p} style={[S.mapLine,  { top:  p + "%" }]} />)}
        {[33, 66].map(p   => <View key={"v" + p} style={[S.mapLineV, { left: p + "%" }]} />)}
        {userLoc && <View style={S.userPin}><View style={S.userPinCore} /></View>}
        {items.slice(0, 8).map(it => (
          <TouchableOpacity key={it.id} onPress={() => onOpen(it)}
            style={[S.bubble, { left: it._mx + "%", top: it._my + "%" }]}>
            {it.photos[0]
              ? <Image source={{ uri: it.photos[0] }} style={StyleSheet.absoluteFill} />
              : <MaterialCommunityIcons name={catMeta(it.category).icon} size={14} color={BG} />
            }
            {it.price_amount != null && (
              <View style={S.bubblePrice}>
                <Text style={S.bubblePriceTxt}>{it.price_amount}€</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
        {!userLoc && (
          <TouchableOpacity style={S.locBanner} onPress={onLocate} disabled={locLoading}>
            {locLoading
              ? <ActivityIndicator size="small" color={MINT} />
              : <MaterialCommunityIcons name="crosshairs-gps" size={16} color={MINT} />
            }
            <Text style={[S.muted, { color: MINT, fontSize: 12 }]}>Activer la géolocalisation</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/* ═══════ CAT FILTER ═══════ */
function CatFilter({ value, onChange }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
      {ALL_CATS.map(c => {
        const active = value === c.key;
        return (
          <TouchableOpacity key={c.key} onPress={() => onChange(c.key)}
            style={[S.pill, active && { backgroundColor: toDim(c.color), borderColor: toBdr(c.color) }]}>
            <MaterialCommunityIcons name={c.icon} size={13} color={active ? c.color : MUTED} />
            <Text style={[S.pillTxt, active && { color: c.color }]}>{c.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/* ═══════ ITEM CARD ═══════ */
function ItemCard({ item, isMine, onPress }) {
  const meta   = catMeta(item.category);
  const photos = item.photos?.length ? item.photos : (item.photo ? [item.photo] : []);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={S.itemCard}>
      <View style={S.itemPhoto}>
        {photos[0]
          ? <Image source={{ uri: photos[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: toDim(meta.color), alignItems: "center", justifyContent: "center" }]}>
              <MaterialCommunityIcons name={meta.icon} size={36} color={meta.color} />
            </View>
        }
        <LinearGradient colors={["transparent", "rgba(7,9,15,0.75)"]} style={S.itemGrad} />
        <View style={[S.catTag, { backgroundColor: toDim(meta.color), borderColor: toBdr(meta.color) }]}>
          <MaterialCommunityIcons name={meta.icon} size={11} color={meta.color} />
          <Text style={[S.catTagTxt, { color: meta.color }]}>{meta.label}</Text>
        </View>
        {item._dist != null && (
          <View style={S.distTag}><Text style={S.distTagTxt}>{item._dist} km</Text></View>
        )}
        {photos.length > 1 && (
          <View style={S.photoCountTag}>
            <MaterialCommunityIcons name="image-multiple" size={11} color={TEXT} />
            <Text style={S.photoCountTxt}>{photos.length}</Text>
          </View>
        )}
        {isMine && <View style={S.mineTag}><Text style={S.mineTxt}>Mon annonce</Text></View>}
        <View style={S.itemPriceOverlay}>
          <Text style={S.itemTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={S.itemPrice}>{item.price_amount ? item.price_amount + "€/j" : "Gratuit"}</Text>
        </View>
      </View>
      <View style={S.itemInfo}>
        <View style={S.itemInfoRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={12} color={MUTED} />
          <Text style={S.muted} numberOfLines={1}>{item.city || item.address_label || "Lieu non précisé"}</Text>
        </View>
        <View style={S.itemInfoRow}>
          <View style={S.ownerDot}>
            <Text style={{ color: MINT, fontWeight: "900", fontSize: 10 }}>{initials(item.owner_name)}</Text>
          </View>
          <Text style={S.muted} numberOfLines={1}>{item.owner_name} · {fmtRel(item.created_at)}</Text>
          <View style={{ flex: 1 }} />
          {item.caution_amount > 0 && (
            <Text style={[S.muted, { fontSize: 11 }]}>Caution {item.caution_amount}€</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ═══════ MUTUAL CARD ═══════ */
function MutualCard({ item, onPress }) {
  const n     = item.mutualize_count  || 1;
  const tgt   = item.mutualize_target || 4;
  const pct   = Math.min(1, n / tgt);
  const share = item.price_amount ? Math.round(item.price_amount / tgt) : null;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88}
      style={[S.itemCard, { borderColor: toBdr(PURPLE) }]}>
      <View style={[S.itemPhoto, { backgroundColor: toDim(PURPLE), alignItems: "center", justifyContent: "center" }]}>
        {item.photos?.[0]
          ? <Image source={{ uri: item.photos[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <MaterialCommunityIcons name="account-group-outline" size={40} color={PURPLE} />
        }
        <LinearGradient colors={["transparent", "rgba(7,9,15,0.75)"]} style={S.itemGrad} />
        <View style={[S.catTag, { backgroundColor: toDim(PURPLE), borderColor: toBdr(PURPLE) }]}>
          <MaterialCommunityIcons name="account-group-outline" size={11} color={PURPLE} />
          <Text style={[S.catTagTxt, { color: PURPLE }]}>Mutualisation</Text>
        </View>
        <View style={S.itemPriceOverlay}>
          <Text style={S.itemTitle} numberOfLines={1}>{item.title}</Text>
          {share && <Text style={[S.itemPrice, { color: PURPLE }]}>{share}€/membre</Text>}
        </View>
      </View>
      <View style={S.itemInfo}>
        <View style={S.mutBar}><View style={[S.mutBarFill, { width: (pct * 100) + "%" }]} /></View>
        <Text style={S.muted}>{n}/{tgt} intéressés · {Math.round(pct * 100)}% atteint</Text>
      </View>
    </TouchableOpacity>
  );
}

/* ═══════ NEED CARD ═══════ */
function NeedCard({ call, isMine, onReply }) {
  const meta = catMeta(call.category);
  return (
    <View style={S.needCard}>
      <View style={[S.needDot, { backgroundColor: meta.color }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={S.needMsg} numberOfLines={3}>{call.message || call.title}</Text>
        <Text style={S.muted}>{call.author_name} · {fmtRel(call.created_at)}</Text>
      </View>
      {!isMine && (
        <TouchableOpacity onPress={onReply}
          style={[S.replyBtn, { borderColor: toBdr(meta.color) }]}>
          <Text style={[S.muted, { color: meta.color, fontWeight: "700" }]}>Répondre</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ═══════ BRANDS TAB ═══════ */
function BrandsTab() {
  return (
    <View style={{ paddingBottom: 20 }}>
      <View style={S.subCard}>
        <LinearGradient colors={[toDim(MINT), toDim(BLUE)]}
          style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <View style={[S.subIcon, { backgroundColor: MINT }]}>
            <MaterialCommunityIcons name="crown-outline" size={20} color={BG} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: TEXT, fontWeight: "900", fontSize: 18 }}>Abonnement Pro</Text>
            <Text style={S.muted}>Accès complet à l'espace professionnel</Text>
          </View>
          <View style={S.pricePill}><Text style={S.pricePillTxt}>10€/mois</Text></View>
        </View>
        {[
          "Cercle Pro dédié séparé de ta vie privée",
          "Publication matériel avec tarif automatique",
          "Réservations + caution + assurance",
          "Carte géolocalisée des membres",
          "Notifications push en temps réel",
          "Accès aux cercles Marques & Fournisseurs",
        ].map((f, i) => (
          <View key={i} style={S.featureRow}>
            <MaterialCommunityIcons name="check-circle" size={16} color={MINT} />
            <Text style={{ color: TEXT, fontSize: 14 }}>{f}</Text>
          </View>
        ))}
        <TouchableOpacity style={S.subBtn}
          onPress={() => Alert.alert("Abonnement", "Branchement Stripe Billing à finaliser.")}>
          <Text style={S.subBtnTxt}>S'abonner pour 10€/mois</Text>
        </TouchableOpacity>
      </View>

      <View style={[S.subCard, { borderColor: toBdr(GOLD), marginTop: 14 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <View style={[S.subIcon, { backgroundColor: GOLD }]}>
            <MaterialCommunityIcons name="storefront-outline" size={20} color={BG} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: TEXT, fontWeight: "900", fontSize: 18 }}>Cercle Officiel</Text>
            <Text style={S.muted}>Pour marques et fournisseurs</Text>
          </View>
        </View>
        <Text style={[S.muted, { lineHeight: 20, marginBottom: 12 }]}>
          Crée un Cercle Officiel vérifié pour proposer tes produits, offres de location,
          assurances partenaires et démonstrations locales aux pros du réseau.
        </Text>
        {[
          { icon: "tag-outline",          label: "Offres et remises exclusives pros" },
          { icon: "shield-check-outline", label: "Badge marque vérifiée" },
          { icon: "chart-line",           label: "Statistiques d'engagement" },
          { icon: "broadcast",            label: "Notifications ciblées par zone" },
        ].map((f, i) => (
          <View key={i} style={S.featureRow}>
            <MaterialCommunityIcons name={f.icon} size={16} color={GOLD} />
            <Text style={{ color: TEXT, fontSize: 14 }}>{f.label}</Text>
          </View>
        ))}
        <TouchableOpacity style={[S.subBtn, { backgroundColor: GOLD }]}
          onPress={() => Alert.alert("Cercle Officiel", "Contacte le support pour ouvrir un Cercle Marque.")}>
          <Text style={[S.subBtnTxt, { color: BG }]}>Créer mon Cercle Officiel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ═══════ EMPTY STATE ═══════ */
function EmptyState({ onRent, onNeed }) {
  return (
    <View style={S.emptyWrap}>
      <MaterialCommunityIcons name="store-outline" size={44} color={MUTED} />
      <Text style={S.emptyTitle}>Le cercle est vide</Text>
      <Text style={[S.muted, { textAlign: "center", marginBottom: 20, lineHeight: 20 }]}>
        Sois le premier à publier du matériel{"\n"}ou à lancer une demande.
      </Text>
      <TouchableOpacity onPress={onRent} style={S.emptyBtn}>
        <MaterialCommunityIcons name="plus-circle-outline" size={18} color={BG} />
        <Text style={[S.emptyBtnTxt, { color: BG }]}>Publier du matériel</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onNeed}
        style={[S.emptyBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: toBdr(GOLD), marginTop: 10 }]}>
        <MaterialCommunityIcons name="bullhorn-outline" size={18} color={GOLD} />
        <Text style={[S.emptyBtnTxt, { color: GOLD }]}>Faire une demande</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ═══════ FAB ANIMÉ ═══════ */
function MainFAB({ bottom, onRent, onNeed, onMutualize }) {
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const toggle = () => {
    Animated.spring(anim, { toValue: open ? 0 : 1, useNativeDriver: true, tension: 120, friction: 8 }).start();
    setOpen(v => !v);
  };
  const rot   = anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] });
  const fabActions = [
    { icon: "cash-multiple",         color: MINT,   label: "Louer mon matériel",   fn: () => { setOpen(false); anim.setValue(0); onRent(); } },
    { icon: "bullhorn-outline",      color: GOLD,   label: "Publier une demande",  fn: () => { setOpen(false); anim.setValue(0); onNeed(); } },
    { icon: "account-group-outline", color: PURPLE, label: "Mutualiser",            fn: () => { setOpen(false); anim.setValue(0); onMutualize(); } },
  ];
  return (
    <View style={[S.fabWrap, { bottom }]} pointerEvents="box-none">
      {open && fabActions.map((a, i) => (
        <Animated.View key={i} style={{ opacity: anim, transform: [{ scale: anim }] }}>
          <TouchableOpacity onPress={a.fn} style={S.fabRow}>
            <View style={[S.fabLbl, { borderColor: toBdr(a.color) }]}>
              <Text style={[S.muted, { color: a.color }]}>{a.label}</Text>
            </View>
            <View style={[S.fabMini, { backgroundColor: a.color }]}>
              <MaterialCommunityIcons name={a.icon} size={18} color={BG} />
            </View>
          </TouchableOpacity>
        </Animated.View>
      ))}
      <TouchableOpacity onPress={toggle} style={S.fab} activeOpacity={0.85}>
        <Animated.View style={{ transform: [{ rotate: rot }] }}>
          <MaterialCommunityIcons name="plus" size={28} color={BG} />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

/* ═══════ SECTION HEAD ═══════ */
function SHead({ title, sub, onSub }) {
  return (
    <View style={S.shead}>
      <Text style={S.sheadTitle}>{title}</Text>
      {sub && (
        <TouchableOpacity onPress={onSub} disabled={!onSub}>
          <Text style={[S.muted, onSub && { color: MINT }]}>{sub}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ═══════ PUBLISH MODAL ═══════ */
function PublishModal({ visible, mode, editItem, userLoc, onLocate, onClose, onSave }) {
  const [step,      setStep]      = useState(0);
  const [photos,    setPhotos]    = useState([]);
  const [title,     setTitle]     = useState("");
  const [desc,      setDesc]      = useState("");
  const [category,  setCategory]  = useState("tools");
  const [value,     setValue]     = useState("");
  const [city,      setCity]      = useState("");
  const [address,   setAddress]   = useState("");
  const [insurance, setInsurance] = useState(false);
  const [lat,       setLat]       = useState(null);
  const [lng,       setLng]       = useState(null);
  const [locating,  setLocating]  = useState(false);
  const [saving,    setSaving]    = useState(false);

  const pricing = useMemo(() => calcPrice(value, category), [value, category]);

  useEffect(() => {
    if (!visible) return;
    if (editItem) {
      setPhotos([]); setTitle(editItem.title || ""); setDesc(editItem.description || "");
      setCategory(editItem.category || "tools");
      setValue(editItem.price_amount ? String(editItem.price_amount) : "");
      setCity(editItem.city || ""); setAddress(editItem.address_label || "");
      setInsurance(editItem.insurance_required || false);
      setLat(editItem.latitude || null); setLng(editItem.longitude || null);
    } else {
      setPhotos([]); setTitle(""); setDesc(""); setCategory("tools");
      setValue(""); setCity(""); setAddress(""); setInsurance(false);
      setLat(null); setLng(null);
    }
    setStep(0); setSaving(false);
  }, [visible, editItem]);

  const pickPhotos = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Photos", "Autorise l'accès à ta photothèque."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [ImagePicker.MediaType.Image],      allowsMultipleSelection: true, selectionLimit: 6, quality: 0.8,
    });
    if (!res.canceled) setPhotos(prev => [...prev, ...res.assets].slice(0, 6));
  };

  const autoGeocode = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLat(pos.coords.latitude); setLng(pos.coords.longitude);
      const [geo] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      if (geo) {
        setCity(geo.city || geo.subregion || geo.region || "");
        setAddress(geo.street ? geo.street + ", " + (geo.city || "") : "");
      }
    } catch {}
    finally { setLocating(false); }
  };

  const canNext = [
    true,
    title.trim().length > 1,
    city.trim().length > 0 || !!lat,
  ];

  const submit = async () => {
    if (step < 2) { if (canNext[step]) setStep(s => s + 1); return; }
    setSaving(true);
    await onSave({
      photos, title: title.trim(), description: desc.trim() || null, category,
      priceDay: pricing?.day || null, caution: pricing?.caution || null,
      city, address, lat, lng, insurance,
      mode: mode || "rent", editId: editItem?.id || null,
    });
    setSaving(false);
  };

  const STEPS = ["Photos", "Infos & catégorie", "Lieu & tarif"];

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent
      presentationStyle="overFullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <Pressable style={S.modalOverlay} onPress={onClose} />
        <View style={S.modalSheet}>
          <View style={S.handle} />
          <View style={S.modalHead}>
            <TouchableOpacity onPress={() => step > 0 ? setStep(s => s - 1) : onClose()}>
              <MaterialCommunityIcons name={step > 0 ? "arrow-left" : "close"} size={22} color={MUTED} />
            </TouchableOpacity>
            <Text style={S.modalTitle}>
              {editItem ? "Modifier l'annonce" : mode === "mutualize" ? "Proposer une mutualisation" : "Publier du matériel"}
            </Text>
            <Text style={S.stepCounter}>{step + 1}/{STEPS.length}</Text>
          </View>
          <View style={S.stepBar}>
            {STEPS.map((_, i) => (
              <View key={i} style={[S.stepSeg, { backgroundColor: i <= step ? MINT : LINE, flex: 1 }]} />
            ))}
          </View>
          <Text style={[S.muted, { marginHorizontal: 20, marginBottom: 8, fontSize: 13 }]}>{STEPS[step]}</Text>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}>

            {step === 0 && (
              <View>
                <Text style={[S.muted, { marginBottom: 14, lineHeight: 20 }]}>
                  Photos optionnelles — les annonces avec photos reçoivent 3x plus de demandes.
                </Text>
                <View style={S.photoGrid}>
                  {photos.map((a, i) => (
                    <View key={i} style={S.photoThumb}>
                      <Image source={{ uri: a.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      {i === 0 && <View style={S.photoPrimBadge}><Text style={S.photoPrimTxt}>Principale</Text></View>}
                      <TouchableOpacity style={S.photoX}
                        onPress={() => setPhotos(p => p.filter((_, j) => j !== i))}>
                        <MaterialCommunityIcons name="close-circle" size={22} color={TEXT} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {photos.length < 6 && (
                    <TouchableOpacity style={S.photoAdd} onPress={pickPhotos}>
                      <MaterialCommunityIcons name="camera-plus-outline" size={28} color={MINT} />
                      <Text style={[S.muted, { color: MINT, marginTop: 6, fontSize: 12 }]}>
                        {photos.length === 0 ? "Ajouter des photos" : "+" + (6 - photos.length)}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {step === 1 && (
              <View>
                <Text style={S.label}>Nom du matériel *</Text>
                <TextInput value={title} onChangeText={setTitle} autoFocus
                  placeholder={mode === "mutualize" ? "Ex : Mini-pelle 1,5T" : "Ex : Perceuse Bosch, Camion benne…"}
                  placeholderTextColor={MUTED} style={S.input} returnKeyType="next" />
                <Text style={S.label}>Description (optionnel)</Text>
                <TextInput value={desc} onChangeText={setDesc} multiline
                  placeholder="État, marque, accessoires inclus…"
                  placeholderTextColor={MUTED}
                  style={[S.input, { height: 72, textAlignVertical: "top" }]} />
                <Text style={S.label}>Catégorie</Text>
                <View style={S.catGrid}>
                  {CATS.map(c => {
                    const active = category === c.key;
                    return (
                      <TouchableOpacity key={c.key} onPress={() => setCategory(c.key)}
                        style={[S.catGridItem, active && { backgroundColor: toDim(c.color), borderColor: toBdr(c.color) }]}>
                        <MaterialCommunityIcons name={c.icon} size={22} color={active ? c.color : MUTED} />
                        <Text style={[S.catGridTxt, active && { color: c.color }]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {step === 2 && (
              <View>
                <Text style={S.label}>Valeur d'achat estimée (€)</Text>
                <TextInput value={value} onChangeText={setValue} keyboardType="decimal-pad"
                  placeholder="Ex : 850" placeholderTextColor={MUTED} style={S.input} />
                {pricing && (
                  <View style={S.pricingBox}>
                    <Text style={[S.label, { color: GOLD, marginTop: 0 }]}>Tarif calculé automatiquement</Text>
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                      {[{ p: "Jour", v: pricing.day }, { p: "Semaine", v: pricing.weekly }, { p: "Mois", v: pricing.monthly }].map(r => (
                        <View key={r.p} style={S.pricingChip}>
                          <Text style={S.pricingVal}>{r.v}€</Text>
                          <Text style={[S.muted, { fontSize: 11 }]}>{r.p}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={[S.muted, { marginTop: 8 }]}>Caution suggérée : {pricing.caution}€</Text>
                  </View>
                )}
                <TouchableOpacity style={S.toggleRow} onPress={() => setInsurance(v => !v)}>
                  <View style={[S.toggleBox, insurance && { backgroundColor: MINT }]}>
                    {insurance && <MaterialCommunityIcons name="check" size={14} color={BG} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: TEXT, fontWeight: "700" }}>Demander une assurance pro</Text>
                    <Text style={S.muted}>RC pro, Kbis ou attestation employeur</Text>
                  </View>
                </TouchableOpacity>
                <Text style={[S.label, { marginTop: 12 }]}>Localisation</Text>
                <TouchableOpacity style={[S.locBtn, lat != null && { borderColor: toBdr(MINT), backgroundColor: toDim(MINT) }]}
                  onPress={autoGeocode} disabled={locating}>
                  {locating
                    ? <ActivityIndicator size="small" color={MINT} />
                    : <MaterialCommunityIcons name={lat ? "map-marker-check" : "crosshairs-gps"} size={18} color={lat ? MINT : MUTED} />
                  }
                  <Text style={[S.muted, lat != null && { color: MINT }]}>
                    {lat != null ? "Position détectée ✓" : "Détecter automatiquement"}
                  </Text>
                </TouchableOpacity>
                <TextInput value={city} onChangeText={setCity}
                  placeholder="Ville visible par les membres *" placeholderTextColor={MUTED}
                  style={[S.input, { marginTop: 8 }]} />
                <TextInput value={address} onChangeText={setAddress}
                  placeholder="Adresse exacte (confidentielle)" placeholderTextColor={MUTED}
                  style={[S.input, { marginTop: 8 }]} />
              </View>
            )}
          </ScrollView>

          <View style={S.modalFooter}>
            <TouchableOpacity onPress={submit} disabled={saving || !canNext[step]}
              style={[S.cta, !canNext[step] && { opacity: 0.4 }]}>
              {saving
                ? <ActivityIndicator color={BG} />
                : <Text style={S.ctaTxt}>
                    {step < 2
                      ? "Continuer →"
                      : editItem
                        ? "Enregistrer ✓"
                        : mode === "mutualize"
                          ? "Lancer la mutualisation ✓"
                          : "Publier l'annonce ✓"}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ═══════ NEED MODAL ═══════ */
function NeedModal({ visible, onClose, onSave }) {
  const [msg,      setMsg]      = useState("");
  const [category, setCategory] = useState("tools");
  const [saving,   setSaving]   = useState(false);

  useEffect(() => { if (visible) { setMsg(""); setCategory("tools"); setSaving(false); } }, [visible]);

  const submit = async () => {
    if (!msg.trim()) { Alert.alert("", "Écris ce que tu cherches."); return; }
    setSaving(true);
    await onSave({ message: msg.trim(), category });
    setSaving(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent
      presentationStyle="overFullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={S.modalOverlay} onPress={onClose} />
        <View style={S.modalSheet}>
          <View style={S.handle} />
          <View style={S.modalHead}>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={MUTED} />
            </TouchableOpacity>
            <Text style={S.modalTitle}>Publier une demande</Text>
            <View style={{ width: 30 }} />
          </View>
          <View style={[S.infoBanner, { borderColor: toBdr(GOLD), backgroundColor: toDim(GOLD) }]}>
            <MaterialCommunityIcons name="bullhorn-outline" size={16} color={GOLD} />
            <Text style={[S.muted, { color: GOLD, flex: 1 }]}>Tous les membres seront notifiés instantanément.</Text>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}>
            <Text style={S.label}>Ce que tu cherches</Text>
            <TextInput value={msg} onChangeText={setMsg} multiline autoFocus
              placeholder={"Ex : Nacelle pour vendredi à Annecy 🙏\nDurée 1 journée, livraison si possible"}
              placeholderTextColor={MUTED}
              style={[S.input, { height: 110, textAlignVertical: "top" }]} />
            <Text style={S.label}>Catégorie</Text>
            <View style={S.catGrid}>
              {CATS.map(c => {
                const active = category === c.key;
                return (
                  <TouchableOpacity key={c.key} onPress={() => setCategory(c.key)}
                    style={[S.catGridItem, active && { backgroundColor: toDim(c.color), borderColor: toBdr(c.color) }]}>
                    <MaterialCommunityIcons name={c.icon} size={22} color={active ? c.color : MUTED} />
                    <Text style={[S.catGridTxt, active && { color: c.color }]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          <View style={S.modalFooter}>
            <TouchableOpacity onPress={submit} disabled={saving || !msg.trim()}
              style={[S.cta, { backgroundColor: GOLD }, !msg.trim() && { opacity: 0.4 }]}>
              {saving ? <ActivityIndicator color={BG} /> : <Text style={S.ctaTxt}>Envoyer la demande 📡</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ═══════ DETAIL MODAL ═══════ */
function DetailModal({ visible, item, userId, onClose, onBook, onEdit, onDelete }) {
  const [photoIdx, setPhotoIdx] = useState(0);
  useEffect(() => { if (visible) setPhotoIdx(0); }, [visible]);
  if (!item) return null;

  const isMine  = String(item.owner_id) === String(userId);
  const photos  = item.photos?.length ? item.photos : (item.photo ? [item.photo] : []);
  const meta    = catMeta(item.category);
  const deposit = item.price_amount ? Math.round(item.price_amount * 0.3) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent
      presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <View style={[S.modalSheet, { maxHeight: "95%" }]}>
          <View style={{ height: 260, position: "relative" }}>
            {photos[photoIdx]
              ? <Image source={{ uri: photos[photoIdx] }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
              : <View style={{ width: "100%", height: "100%", backgroundColor: toDim(meta.color), alignItems: "center", justifyContent: "center" }}>
                  <MaterialCommunityIcons name={meta.icon} size={60} color={meta.color} />
                </View>
            }
            <LinearGradient colors={["transparent", "rgba(7,9,15,0.85)"]} style={StyleSheet.absoluteFill} />
            <TouchableOpacity style={S.detailClose} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color={TEXT} />
            </TouchableOpacity>
            {photos.length > 1 && (
              <View style={S.detailDots}>
                {photos.map((_, i) => (
                  <TouchableOpacity key={i} onPress={() => setPhotoIdx(i)}
                    style={[S.dot, { backgroundColor: i === photoIdx ? TEXT : "rgba(255,255,255,0.4)" }]} />
                ))}
              </View>
            )}
            <View style={{ position: "absolute", bottom: 14, left: 16, right: 16 }}>
              <Text style={{ color: TEXT, fontWeight: "900", fontSize: 20 }}>{item.title}</Text>
              <Text style={S.muted}>{item.city || item.address_label || "Lieu non précisé"}</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 20, paddingBottom: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <View style={[S.catTag, { backgroundColor: toDim(meta.color), borderColor: toBdr(meta.color) }]}>
                <MaterialCommunityIcons name={meta.icon} size={12} color={meta.color} />
                <Text style={[S.catTagTxt, { color: meta.color }]}>{meta.label}</Text>
              </View>
              <Text style={{ color: GOLD, fontWeight: "900", fontSize: 20 }}>
                {item.price_amount ? item.price_amount + "€/jour" : "Gratuit"}
              </Text>
              {item._dist != null && <Text style={[S.muted, { marginLeft: "auto" }]}>{item._dist} km</Text>}
            </View>

            <View style={S.ownerRow}>
              <View style={S.ownerAvatar}>
                {item.owner_avatar
                  ? <Image source={{ uri: item.owner_avatar }} style={{ width: "100%", height: "100%" }} />
                  : <Text style={{ color: MINT, fontWeight: "900", fontSize: 14 }}>{initials(item.owner_name)}</Text>
                }
              </View>
              <View>
                <Text style={{ color: TEXT, fontWeight: "700" }}>{item.owner_name}</Text>
                <Text style={S.muted}>{item.owner_activity}</Text>
              </View>
            </View>

            {!!item.description && (
              <Text style={[S.muted, { marginTop: 10, lineHeight: 20 }]}>{item.description}</Text>
            )}

            {item.price_amount > 0 && (
              <View style={[S.pricingBox, { marginTop: 14 }]}>
                <Text style={[S.label, { color: GOLD, marginTop: 0 }]}>Récapitulatif financier</Text>
                {[
                  { label: "Location / jour",  val: item.price_amount + "€" },
                  { label: "Acompte (30%)",     val: deposit ? deposit + "€" : "—" },
                  { label: "Caution",           val: item.caution_amount ? item.caution_amount + "€" : "—" },
                  { label: "Assurance requise", val: item.insurance_required ? "Oui" : "Non" },
                ].map(r => (
                  <View key={r.label} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                    <Text style={S.muted}>{r.label}</Text>
                    <Text style={{ color: TEXT, fontWeight: "700" }}>{r.val}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={S.modalFooter}>
            {isMine ? (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity onPress={() => onEdit(item)}
                  style={[S.cta, { flex: 1, backgroundColor: CARD2, borderWidth: 1, borderColor: LINE }]}>
                  <MaterialCommunityIcons name="pencil-outline" size={18} color={TEXT} />
                  <Text style={[S.ctaTxt, { color: TEXT }]}>Modifier</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onDelete(item)}
                  style={[S.cta, { flex: 1, backgroundColor: "rgba(255,90,90,0.12)", borderWidth: 1, borderColor: "rgba(255,90,90,0.3)" }]}>
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FF5A5A" />
                  <Text style={[S.ctaTxt, { color: "#FF5A5A" }]}>Supprimer</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => onBook(item)} style={S.cta}>
                <Text style={S.ctaTxt}>
                  {item.price_amount ? "Réserver · acompte " + deposit + "€" : "Emprunter gratuitement →"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ═══════ BOOK MODAL ═══════ */
function BookModal({ visible, item, onClose }) {
  if (!item) return null;
  const deposit = Math.round(Number(item.price_amount || 0) * 0.3);
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent
      presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <View style={S.modalSheet}>
          <View style={S.handle} />
          <View style={S.modalHead}>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={MUTED} />
            </TouchableOpacity>
            <Text style={S.modalTitle}>Réserver</Text>
            <View style={{ width: 30 }} />
          </View>
          <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
            <Text style={{ color: TEXT, fontWeight: "900", fontSize: 18, marginBottom: 4 }}>{item.title}</Text>
            <Text style={[S.muted, { marginBottom: 20 }]}>Auprès de {item.owner_name}</Text>
            {[
              { icon: "calendar-outline",      color: BLUE,   title: "Choisir les dates",             sub: "Confirmé par le propriétaire" },
              { icon: "credit-card-outline",   color: GOLD,   title: "Acompte " + deposit + "€",      sub: "30% · sécurisé via Stripe" },
              { icon: "shield-lock-outline",   color: MINT,   title: "Caution " + (item.caution_amount || "—") + "€", sub: "Bloquée · libérée au retour" },
              { icon: "file-document-outline", color: PURPLE, title: "Documents",                     sub: item.insurance_required ? "RC pro ou assurance requise" : "Aucun document demandé" },
            ].map((s, i) => (
              <View key={i} style={S.bookStep}>
                <View style={[S.bookStepIcon, { backgroundColor: toDim(s.color), borderColor: toBdr(s.color) }]}>
                  <MaterialCommunityIcons name={s.icon} size={20} color={s.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: TEXT, fontWeight: "700" }}>{s.title}</Text>
                  <Text style={S.muted}>{s.sub}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={S.modalFooter}>
            <TouchableOpacity style={S.cta}
              onPress={() => Alert.alert("Paiement", "Branchement Stripe à finaliser.")}>
              <Text style={S.ctaTxt}>Continuer vers le paiement →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ═══════ MEMBERS MODAL ═══════ */
function MembersModal({ visible, members, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent
      presentationStyle="overFullScreen" onRequestClose={onClose}>
      <Pressable style={S.modalOverlay} onPress={onClose} />
      <View style={S.modalSheet}>
        <View style={S.handle} />
        <View style={S.modalHead}>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={22} color={MUTED} />
          </TouchableOpacity>
          <Text style={S.modalTitle}>{members.length} membre{members.length > 1 ? "s" : ""}</Text>
          <View style={{ width: 30 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
          {members.map((m, i) => (
            <View key={i} style={S.memberRow}>
              <View style={S.ownerAvatar}>
                {m.avatar_url
                  ? <Image source={{ uri: m.avatar_url }} style={{ width: "100%", height: "100%" }} />
                  : <Text style={{ color: MINT, fontWeight: "900", fontSize: 14 }}>{initials(m.public_name)}</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: TEXT, fontWeight: "700" }}>{m.public_name}</Text>
                <Text style={S.muted}>{m.activity || "Professionnel"}</Text>
              </View>
              {m.role === "owner" && (
                <View style={[S.catTag, { backgroundColor: toDim(MINT), borderColor: toBdr(MINT) }]}>
                  <Text style={[S.catTagTxt, { color: MINT }]}>Admin</Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════
   STYLES
═══════════════════════════════════════════════════════════ */
const S = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: BG },
  root:  { flex: 1, paddingHorizontal: 14 },
  center:{ flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: MUTED, fontSize: 12 },
  label: { color: MUTED, fontWeight: "800", fontSize: 12, marginBottom: 6, marginTop: 12 },

  header:      { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10 },
  headerName:  { color: TEXT, fontWeight: "900", fontSize: 16 },
  proBadge:    { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: MINT },
  proBadgeTxt: { color: BG, fontWeight: "900", fontSize: 9, letterSpacing: 0.8 },
  hBtn:        { width: 38, height: 38, borderRadius: 11, alignItems: "center",
                 justifyContent: "center", backgroundColor: CARD, borderWidth: 1, borderColor: LINE },

  tabBar:       { flexDirection: "row", borderRadius: 14, backgroundColor: CARD,
                  borderWidth: 1, borderColor: LINE, overflow: "hidden", marginBottom: 10 },
  tabItem:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                  gap: 5, paddingVertical: 10 },
  tabItemActive: { backgroundColor: CARD2 },
  tabTxt:       { color: MUTED, fontWeight: "700", fontSize: 11 },

  hero:          { borderRadius: 20, overflow: "hidden", padding: 16, marginBottom: 10,
                   borderWidth: 1, borderColor: LINE },
  heroEye:       { color: MUTED, fontSize: 12, fontWeight: "700", marginBottom: 10 },
  heroRow:       { flexDirection: "row", gap: 8, marginBottom: 12 },
  heroCard:      { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, gap: 4 },
  heroCardLabel: { fontWeight: "900", fontSize: 14 },
  heroCardSub:   { color: MUTED, fontSize: 11, lineHeight: 15 },
  needBanner:    { flexDirection: "row", alignItems: "center", gap: 8, padding: 12,
                   borderRadius: 12, backgroundColor: toDim(GOLD), borderWidth: 1, borderColor: toBdr(GOLD) },
  needBannerTxt: { color: GOLD, fontWeight: "700", fontSize: 13, flex: 1 },

  mapWrap:    { borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: LINE,
                marginBottom: 4, height: 180 },
  mapInner:   { flex: 1, backgroundColor: "rgba(133,204,255,0.06)", position: "relative" },
  mapLine:    { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.04)" },
  mapLineV:   { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "rgba(255,255,255,0.04)" },
  locBanner:  { position: "absolute", bottom: 10, left: 10, right: 10,
                flexDirection: "row", alignItems: "center", gap: 8, padding: 10,
                borderRadius: 12, backgroundColor: "rgba(7,9,15,0.85)", borderWidth: 1, borderColor: toBdr(MINT) },
  userPin:    { position: "absolute", left: "47%", top: "45%", width: 16, height: 16,
                borderRadius: 8, backgroundColor: toDim(MINT), alignItems: "center", justifyContent: "center" },
  userPinCore:{ width: 8, height: 8, borderRadius: 4, backgroundColor: MINT },
  bubble:     { position: "absolute", width: 42, height: 42, borderRadius: 21,
                backgroundColor: MINT, borderWidth: 2, borderColor: "rgba(0,0,0,0.3)",
                alignItems: "center", justifyContent: "center", overflow: "visible" },
  bubblePrice:{ position: "absolute", bottom: -14, left: "50%", transform: [{ translateX: -18 }],
                backgroundColor: BG, paddingHorizontal: 5, paddingVertical: 2,
                borderRadius: 6, borderWidth: 1, borderColor: LINE },
  bubblePriceTxt: { color: MINT, fontSize: 9, fontWeight: "900" },

  pill:    { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11,
             height: 30, borderRadius: 999, backgroundColor: CARD, borderWidth: 1, borderColor: LINE },
  pillTxt: { color: MUTED, fontWeight: "700", fontSize: 12 },

  shead:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                marginTop: 14, marginBottom: 8 },
  sheadTitle: { color: TEXT, fontWeight: "900", fontSize: 15 },

  itemCard:        { borderRadius: 18, overflow: "hidden", marginBottom: 12,
                     borderWidth: 1, borderColor: LINE, backgroundColor: CARD },
  itemPhoto:       { height: 190, position: "relative" },
  itemGrad:        { position: "absolute", bottom: 0, left: 0, right: 0, height: 100 },
  catTag:          { position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center",
                     gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  catTagTxt:       { fontSize: 11, fontWeight: "700" },
  distTag:         { position: "absolute", top: 10, right: 10, paddingHorizontal: 7,
                     paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(7,9,15,0.7)" },
  distTagTxt:      { color: TEXT, fontSize: 11, fontWeight: "700" },
  photoCountTag:   { position: "absolute", bottom: 46, right: 10, flexDirection: "row", alignItems: "center",
                     gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999,
                     backgroundColor: "rgba(7,9,15,0.7)" },
  photoCountTxt:   { color: TEXT, fontSize: 10, fontWeight: "700" },
  mineTag:         { position: "absolute", bottom: 46, left: 10, paddingHorizontal: 7,
                     paddingVertical: 3, borderRadius: 999, backgroundColor: MINT },
  mineTxt:         { color: BG, fontSize: 10, fontWeight: "900" },
  itemPriceOverlay:{ position: "absolute", bottom: 0, left: 0, right: 0,
                     flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
                     padding: 12 },
  itemTitle:       { color: TEXT, fontWeight: "900", fontSize: 15, flex: 1, paddingRight: 8 },
  itemPrice:       { color: GOLD, fontWeight: "900", fontSize: 15 },
  itemInfo:        { padding: 12, gap: 6 },
  itemInfoRow:     { flexDirection: "row", alignItems: "center", gap: 6 },
  ownerDot:        { width: 18, height: 18, borderRadius: 9, backgroundColor: toDim(MINT),
                     alignItems: "center", justifyContent: "center" },

  mutBar:     { height: 4, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2, marginVertical: 6 },
  mutBarFill: { height: 4, borderRadius: 2, backgroundColor: PURPLE },

  needCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14,
              borderRadius: 16, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, marginBottom: 10 },
  needDot:  { width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0 },
  needMsg:  { color: TEXT, fontWeight: "700", fontSize: 14, lineHeight: 20, marginBottom: 4 },
  replyBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },

  emptyWrap:   { alignItems: "center", paddingVertical: 40 },
  emptyTitle:  { color: TEXT, fontWeight: "900", fontSize: 18, marginTop: 12, marginBottom: 8 },
  emptyBtn:    { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20,
                 paddingVertical: 13, borderRadius: 14, backgroundColor: MINT },
  emptyBtnTxt: { fontWeight: "900", fontSize: 14 },

  publishBig:    { height: 52, backgroundColor: MINT, borderRadius: 14, flexDirection: "row",
                   alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 },
  publishBigTxt: { color: BG, fontWeight: "900", fontSize: 15 },

  fabWrap: { position: "absolute", right: 16, alignItems: "flex-end", gap: 10 },
  fab:     { width: 58, height: 58, borderRadius: 29, backgroundColor: MINT,
             alignItems: "center", justifyContent: "center",
             shadowColor: MINT, shadowOpacity: 0.4, shadowRadius: 12, elevation: 10 },
  fabMini: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  fabRow:  { flexDirection: "row", alignItems: "center", gap: 10 },
  fabLbl:  { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
             backgroundColor: "rgba(7,9,15,0.92)", borderWidth: 1 },

  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  modalSheet:   { backgroundColor: BG, borderTopLeftRadius: 28, borderTopRightRadius: 28,
                  borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: LINE },
  handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: LINE,
                  alignSelf: "center", marginTop: 10, marginBottom: 4 },
  modalHead:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  paddingHorizontal: 20, paddingVertical: 14 },
  modalTitle:   { color: TEXT, fontWeight: "900", fontSize: 17 },
  stepCounter:  { color: MUTED, fontSize: 13, fontWeight: "700", width: 30, textAlign: "right" },
  stepBar:      { flexDirection: "row", gap: 4, paddingHorizontal: 20, marginBottom: 8 },
  stepSeg:      { height: 3, borderRadius: 2 },
  infoBanner:   { flexDirection: "row", alignItems: "center", gap: 10, padding: 12,
                  borderRadius: 12, borderWidth: 1, marginHorizontal: 20, marginBottom: 8 },
  modalFooter:  { padding: 16, paddingBottom: 28, borderTopWidth: 1, borderTopColor: LINE },
  cta:          { height: 52, backgroundColor: MINT, borderRadius: 14,
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  ctaTxt:       { color: BG, fontWeight: "900", fontSize: 15 },

  input: { backgroundColor: CARD2, borderWidth: 1, borderColor: LINE, color: TEXT,
           borderRadius: 13, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, marginBottom: 4 },

  photoGrid:      { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoThumb:     { width: (SW - 40 - 16) / 3, aspectRatio: 1, borderRadius: 12,
                    overflow: "hidden", backgroundColor: CARD, borderWidth: 1, borderColor: LINE },
  photoPrimBadge: { position: "absolute", bottom: 0, left: 0, right: 0,
                    backgroundColor: "rgba(92,255,176,0.9)", padding: 3, alignItems: "center" },
  photoPrimTxt:   { color: BG, fontWeight: "900", fontSize: 9 },
  photoX:         { position: "absolute", top: 4, right: 4 },
  photoAdd:       { width: (SW - 40 - 16) / 3, aspectRatio: 1, borderRadius: 12,
                    borderWidth: 1, borderColor: toBdr(MINT), backgroundColor: toDim(MINT),
                    alignItems: "center", justifyContent: "center" },

  catGrid:     { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  catGridItem: { width: (SW - 40 - 16) / 3, aspectRatio: 1, borderRadius: 14,
                 borderWidth: 1, borderColor: LINE, backgroundColor: CARD,
                 alignItems: "center", justifyContent: "center", gap: 5 },
  catGridTxt:  { color: MUTED, fontWeight: "700", fontSize: 11, textAlign: "center" },

  pricingBox:  { backgroundColor: toDim(GOLD), borderWidth: 1, borderColor: toBdr(GOLD),
                 borderRadius: 14, padding: 14, marginTop: 8 },
  pricingChip: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 10, padding: 10, alignItems: "center" },
  pricingVal:  { color: GOLD, fontWeight: "900", fontSize: 18 },

  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13,
               borderRadius: 13, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, marginTop: 12 },
  toggleBox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: LINE,
               backgroundColor: CARD, alignItems: "center", justifyContent: "center" },

  locBtn: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13,
            borderRadius: 13, backgroundColor: CARD, borderWidth: 1, borderColor: LINE },

  detailClose: { position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: 17,
                 backgroundColor: "rgba(7,9,15,0.6)", alignItems: "center", justifyContent: "center" },
  detailDots:  { position: "absolute", bottom: 10, left: 0, right: 0,
                 flexDirection: "row", justifyContent: "center", gap: 5 },
  dot:         { width: 6, height: 6, borderRadius: 3 },

  ownerRow:    { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  ownerAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: toDim(MINT),
                 borderWidth: 1, borderColor: toBdr(MINT), alignItems: "center",
                 justifyContent: "center", overflow: "hidden" },

  bookStep:     { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  bookStepIcon: { width: 44, height: 44, borderRadius: 13, borderWidth: 1,
                  alignItems: "center", justifyContent: "center" },

  memberRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12,
               borderBottomWidth: 1, borderBottomColor: LINE },

  subCard:     { borderRadius: 20, borderWidth: 1, borderColor: toBdr(MINT),
                 backgroundColor: CARD, padding: 18, overflow: "hidden" },
  subIcon:     { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  pricePill:   { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                 backgroundColor: toDim(MINT), borderWidth: 1, borderColor: toBdr(MINT) },
  pricePillTxt:{ color: MINT, fontWeight: "900", fontSize: 13 },
  featureRow:  { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  subBtn:      { height: 50, backgroundColor: MINT, borderRadius: 14,
                 alignItems: "center", justifyContent: "center", marginTop: 16 },
  subBtnTxt:   { color: BG, fontWeight: "900", fontSize: 15 },
});