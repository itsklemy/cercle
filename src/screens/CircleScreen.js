import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  TextInput, RefreshControl, Platform, Alert, StyleSheet,
  Image, Modal, KeyboardAvoidingView, ScrollView,
  TouchableWithoutFeedback, Linking, AppState, Share,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Contacts from "expo-contacts";
import * as FileSystem from "expo-file-system";
import * as Clipboard from "expo-clipboard";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { InteractionManager } from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable } from "react-native";

import { supabase } from "../lib/supabase";
import { Log } from "../lib/remoteLogger";
import { useResponsive } from "../hooks/useResponsive";
import { colors as themeColors } from "../theme/colors";
import { sendPush } from "../notifications/pushClient";
import { getCircleMemberTokens, getUserToken } from "../notifications/pushTargets";

/* ─────────────────────────────────────────────
   DESIGN TOKENS
───────────────────────────────────────────── */
const C0 = themeColors || {};
const colors = {
  bg:         C0.bg      ?? "#07090F",
  card:       C0.card    ?? "rgba(255,255,255,0.04)",
  card2:                    "rgba(255,255,255,0.07)",
  text:       C0.text    ?? "#F0F2F7",
  subtext:    C0.subtext ?? "#7A8499",
  stroke:     C0.stroke  ?? "rgba(255,255,255,0.07)",
  mint:       C0.mint    ?? "#1DFFC2",
  mintDim:                  "rgba(29,255,194,0.12)",
  mintBorder:               "rgba(29,255,194,0.22)",
  danger:                   "#FF5A5A",
  dangerDim:                "rgba(255,90,90,0.10)",
};

const CIRCLE_PALETTES = [
  { primary: "#1DFFC2", dim: "rgba(29,255,194,0.15)",  border: "rgba(29,255,194,0.30)"  },
  { primary: "#FF4FD8", dim: "rgba(255,79,216,0.15)",  border: "rgba(255,79,216,0.30)"  },
  { primary: "#85CCFF", dim: "rgba(133,204,255,0.15)", border: "rgba(133,204,255,0.30)" },
  { primary: "#FFE66D", dim: "rgba(255,230,109,0.15)", border: "rgba(255,230,109,0.30)" },
  { primary: "#AD8CFF", dim: "rgba(173,140,255,0.15)", border: "rgba(173,140,255,0.30)" },
  { primary: "#FFB5B3", dim: "rgba(255,181,179,0.15)", border: "rgba(255,181,179,0.30)" },
  { primary: "#6EE7B7", dim: "rgba(110,231,183,0.15)", border: "rgba(110,231,183,0.30)" },
];

function getPaletteForCircle(circle) {
  if (!circle) return CIRCLE_PALETTES[0];
  const s = String(circle.id || circle.name || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CIRCLE_PALETTES[h % CIRCLE_PALETTES.length];
}

/* ─────────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────────── */
const PAGE_SIZE      = 20;
const CALL_TTL_HOURS = 24;
const STORAGE_BUCKET_ITEMS = "items";
const STORAGE_BUCKET_CALLS = "calls";

/* Catégories feed + filtre */
const CATEGORIES = [
  { key: "all",         label: "Tout",       dot: "#7A8499", icon: "view-grid-outline"      },
  { key: "maison",      label: "Maison",     dot: "#FFB5B3", icon: "home-variant-outline"   },
  { key: "jardin",      label: "Jardin",     dot: "#6EE7B7", icon: "flower-outline"         },
  { key: "cuisine",     label: "Cuisine",    dot: "#FFE66D", icon: "silverware-fork-knife"  },
  { key: "sport",       label: "Sport",      dot: "#85CCFF", icon: "basketball"             },
  { key: "vehicule",    label: "Véhicule",   dot: "#85CCFF", icon: "car-outline"            },
  { key: "bricolage",   label: "Bricolage",  dot: "#FFE66D", icon: "hammer-screwdriver"     },
  { key: "chantiers",   label: "Chantiers",  dot: "#AD8CFF", icon: "hammer-wrench"         },
  { key: "abonnements", label: "Abos",       dot: "#AD8CFF", icon: "credit-card-outline"   },
  { key: "service",     label: "Service",    dot: "#1DFFC2", icon: "handshake-outline"      },
  { key: "entretien",   label: "Entretien",  dot: "#1DFFC2", icon: "spray-bottle"           },
  { key: "travail",     label: "Travail",    dot: "#FF4FD8", icon: "briefcase-outline"      },
  { key: "animaux",     label: "Animaux",    dot: "#FFB5B3", icon: "paw-outline"            },
  { key: "plantes",     label: "Plantes",    dot: "#6EE7B7", icon: "leaf"                   },
  { key: "dons",        label: "Dons",       dot: "#6EE7B7", icon: "gift-outline"           },
  { key: "recette",     label: "Recette",    dot: "#FF4FD8", icon: "chef-hat"               },
  { key: "utilitaire",  label: "Utilitaire", dot: "#1DFFC2", icon: "tools"                  },
  { key: "other",       label: "Autre",      dot: "#7A8499", icon: "shape-outline"          },
];

/* Presets inventaire rapide — miroir de InventoryUpdateScreen */
const QUICK_PRESETS = {
  maison:      ["Escabeau","Échelle","Aspirateur","Balai vapeur","Ventilateur","Rallonge électrique","Fer à repasser","Table à repasser","Chauffage d'appoint","Climatiseur mobile","Étendoir à linge","Machine à coudre","Pistolet à colle"],
  cuisine:     ["Appareil à raclette","Appareil à fondue","Plancha","Crêpière","Gaufrier","Barbecue électrique","Robot de cuisine","Robot pâtissier","Blender","Machine à café","Airfryer","Autocuiseur","Sorbetière","Balance de cuisine","Glacière électrique"],
  bricolage:   ["Perceuse","Visseuse","Perforateur","Ponceuse","Scie sauteuse","Meuleuse","Boîte à outils","Marteau","Niveau","Serre-joints","Pistolet à silicone","Décapeur thermique"],
  chantiers:   ["Bétonnière","Marteau piqueur","Scie circulaire","Scie à onglet","Niveau laser","Compresseur","Échafaudage","Échelle coulissante","Diable","Sangles d'arrimage"],
  jardin:      ["Tondeuse","Coupe-bordures","Débroussailleuse","Taille-haie","Tronçonneuse","Souffleur","Pulvérisateur","Tuyau d'arrosage","Karcher","Brouette","Désherbeur"],
  sport:       ["Vélo","Trottinette","Roller","Raquettes de tennis","Raquettes de badminton","Tapis de yoga","Haltères","Kettlebell","Paddle gonflable","Planche de surf","Skis","Snowboard","Casque vélo"],
  vehicule:    ["Remorque","Porte-vélos","Barres de toit","Coffre de toit","Chaînes neige","Câbles de démarrage","Booster de démarrage","Compresseur portable","Cric"],
  animaux:     ["Cage de transport","Sac de transport","Laisse","Harnais","Brosse","Barrière","Gamelles"],
  service:     ["Aide déménagement","Montage meubles","Arrosage plantes","Garde animaux","Covoiturage","Garde d'enfants"],
  entretien:   ["Nettoyeur vapeur","Shampouineuse","Nettoyeur de vitres","Aspirateur de chantier"],
  abonnements: ["Netflix","Canal+","Spotify","Adobe","Microsoft 365","Parking"],
  travail:     ["Écran externe","Webcam","Micro USB","Hub USB-C","Clavier","Disque dur externe","SSD externe"],
  recette:     ["Livre de cuisine","Moules à gâteaux","Grand plat à gratin","Machine à pâtes","Machine sous vide"],
  plantes:     ["Pot grande taille","Substrat","Engrais","Arrosoir","Serre balcon"],
  dons:        ["Vêtements","Livres","Jouets","Électroménager","Mobilier","Vaisselle"],
  utilitaire:  ["Diable","Sangle","Caisse de rangement","Bâche","Câble électrique 10m","Multiprise"],
  other:       [],
};

const catMeta  = (k) => CATEGORIES.find((c) => c.key === k) || CATEGORIES[CATEGORIES.length - 1];
const labelCat = (k) => catMeta(k).label;

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const isoHoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

const fmtRelative = (iso) => {
  if (!iso) return "";
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return "À l'instant";
  if (h < 24) return `Il y a ${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "Hier" : `Il y a ${d}j`;
};

const normalizeTitleKey = (s) =>
  String(s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/['']/g, "'");

const titlePretty = (s) => {
  try { const t = String(s || "").trim(); return t.charAt(0).toUpperCase() + t.slice(1); }
  catch { return String(s || ""); }
};

const normalizeUrl = (u) => {
  if (!u) return null;
  const s = String(u).trim().replace(/\s+/g, "");
  if (!/^https?:\/\//i.test(s)) return s;
  try {
    return s.replace(/^https?:\/\/+/, (m) => m.slice(0, m.indexOf("//") + 2))
            .replace(/([^:])\/{2,}/g, "$1/");
  } catch { return s; }
};

function initialsFromName(name) {
  const s = String(name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[1]?.[0] || "" : "")).toUpperCase() || "?";
}

const normalizePhone = (raw) => {
  if (!raw) return null;
  let s = String(raw).trim().replace(/\u00A0/g, " ").replace(/[().-]/g, "").replace(/\s+/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (s.startsWith("+")) { const k = "+" + s.slice(1).replace(/[^\d]/g, ""); return k.length >= 8 ? k : null; }
  if (/^0\d{9}$/.test(s)) return `+33${s.slice(1)}`;
  if (/^[67]\d{8}$/.test(s)) return `+33${s}`;
  const d = s.replace(/[^\d]/g, "");
  if (d.length >= 10 && d.length <= 15) return `+${d}`;
  return null;
};

function decodeBase64ToUint8Array(b64) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = String(b64 || "").replace(/[^A-Za-z0-9+/=]/g, "");
  const bytes = [];
  let i = 0;
  while (i < clean.length) {
    const e1 = alphabet.indexOf(clean[i++]), e2 = alphabet.indexOf(clean[i++]);
    const e3 = alphabet.indexOf(clean[i++]), e4 = alphabet.indexOf(clean[i++]);
    bytes.push((e1 << 2) | (e2 >> 4));
    if (e3 !== 64 && e3 !== -1) bytes.push(((e2 & 15) << 4) | (e3 >> 2));
    if (e4 !== 64 && e4 !== -1) bytes.push(((e3 & 3) << 6) | e4);
  }
  return new Uint8Array(bytes);
}

function hoursSince(iso) {
  const t = iso ? new Date(iso).getTime() : 0;
  return t ? (Date.now() - t) / 3600000 : 999999;
}

const parseMoney = (s) => {
  const n = parseFloat(String(s || "").replace(",", "."));
  return isNaN(n) ? null : Math.round(n * 100) / 100;
};

/* ─────────────────────────────────────────────
   STORAGE
───────────────────────────────────────────── */
async function uploadToStorage(asset, bucket, userId) {
  if (!asset?.uri) return null;
  let contentType = asset.mime || "image/jpeg";
  const pathBase = `public/${userId}/${Date.now()}`;
  let body = null;
  try {
    if (asset.base64) {
      body = decodeBase64ToUint8Array(asset.base64).buffer;
    } else {
      const uri = String(asset.uri || "");
      const isLocal = uri.startsWith("file://") || (!uri.startsWith("http://") && !uri.startsWith("https://"));
      if (isLocal) {
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists) throw new Error("Fichier introuvable");
        const guess = (uri.split(".").pop() || "").toLowerCase();
        if (!asset.mime) contentType = guess === "png" ? "image/png" : guess === "webp" ? "image/webp" : "image/jpeg";
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        body = decodeBase64ToUint8Array(base64).buffer;
      } else {
        const resp = await fetch(uri);
        const b = await resp.blob();
        contentType = b.type || contentType;
        body = b;
      }
    }
    const ext  = contentType.split("/")[1] || "jpg";
    const path = `${pathBase}.${ext}`;
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, body, { upsert: true, contentType, cacheControl: "3600" });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    let finalUrl = pub?.publicUrl || null;
    if (!finalUrl) throw new Error("Aucune URL publique.");
    finalUrl = normalizeUrl(`${finalUrl}${finalUrl.includes("?") ? "&" : "?"}v=${Date.now()}`);
    return finalUrl;
  } catch (e) {
    Log?.error?.("storage", "upload", e);
    Alert.alert("Photo", `Envoi impossible : ${e?.message || e}`);
    return null;
  }
}

/* ─────────────────────────────────────────────
   AUTH
───────────────────────────────────────────── */
async function getUserOrAlert() {
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;
  if (error) { Alert.alert("Auth", "Erreur utilisateur"); return null; }
  if (!user)  { Alert.alert("Auth", "Connecte-toi d'abord."); return null; }
  return user;
}

/* ─────────────────────────────────────────────
   INVITE HELPERS
───────────────────────────────────────────── */
function makeReadableCode(circleName) {
  const prefix = String(circleName || "CERCLE").toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z]/g, "").slice(0, 7) || "CERCLE";
  const chars  = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const suffix = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${prefix}-${suffix}`;
}

async function getOrCreateCircleInviteCode(circleId, circleName = "") {
  const user = await getUserOrAlert();
  if (!user) return null;
  const existing = await supabase.from("circle_invites").select("code, created_at")
    .eq("circle_id", circleId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!existing.error && existing.data?.code) return String(existing.data.code);
  const code = makeReadableCode(circleName);
  const ins = await supabase.from("circle_invites").insert({ circle_id: circleId, code, invited_by: user.id }).select("code").single();
  if (ins.error) return makeReadableCode(circleName);
  return String(ins.data.code);
}

const formatInviteMessage = (circleName, code, itemTitles = []) => {
  const top = itemTitles.slice(0, 3);
  const objectLine = top.length > 0 ? `\nDans mon Cercle : ${top.join(", ")}\n` : "";
  return [
    `Je t'invite dans mon Cercle "${circleName}" sur Cercle `,
    objectLine,
    `   1. Télécharge l'app Cercle`,
    `   2. Appuie sur "J'ai un code d'invitation"`,
    `   3. Entre ce code : ${code}`,
    `\nC'est tout !`,
  ].join("\n");
};

async function ensureContactsPermissionHard({ onGoToSettings } = {}) {
  try {
    const current = await Contacts.getPermissionsAsync();
    if (current.status === "granted") return { ok: true };
    if (current.canAskAgain) {
      const req = await Contacts.requestPermissionsAsync();
      return { ok: req.status === "granted" };
    }
    Alert.alert("Contacts", "Active l'accès dans Réglages.", [
      { text: "Annuler", style: "cancel" },
      { text: "Réglages", onPress: () => { onGoToSettings?.(); Linking.openSettings(); } },
    ]);
    return { ok: false };
  } catch { return { ok: false }; }
}

async function loadDeviceContactsRaw() {
  const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers], pageSize: 2000 });
  const arr = (data || []).flatMap((c) => {
    const base = c.name || c.firstName || c.lastName || "Contact";
    return (c.phoneNumbers || []).map((p) => {
      const n = normalizePhone(p?.number);
      return n ? { id: `${c.id}-${p.id}`, name: base, phone: n } : null;
    }).filter(Boolean);
  });
  return Array.from(new Map(arr.map((x) => [`${x.name}::${x.phone}`, x])).values());
}

async function openComposerSMS(phone, message) {
  const p = String(phone || "").trim();
  if (!p) throw new Error("Numéro invalide");
  const body = encodeURIComponent(String(message || ""));
  const candidates = Platform.OS === "ios"
    ? [`sms:${p}&body=${body}`, `sms:${p}?body=${body}`]
    : [`sms:${p}?body=${body}`, `sms:${p}&body=${body}`];
  for (const url of candidates) {
    try { if (await Linking.canOpenURL(url)) { await Linking.openURL(url); return; } } catch {}
  }
  throw new Error("Impossible d'ouvrir Messages.");
}

async function shareItemToOtherCircles(item, destCircleIds, userId) {
  let ok = 0, ko = 0;
  const base = { owner_id: userId, title: item.title, description: item.description ?? null, category: item.category ?? "other", photo: item.photo ?? null };
  for (const cid of (destCircleIds || []).filter(Boolean)) {
    try { const { error } = await supabase.from("items").insert({ ...base, circle_id: cid }); if (error) throw error; ok++; }
    catch { ko++; }
  }
  return { ok, ko };
}

/* ─────────────────────────────────────────────
   HOOKS
───────────────────────────────────────────── */
function useCircles(wantedId) {
  const [circles, setCircles] = useState([]);
  const [active, setActive]   = useState(null);
  const [ready, setReady]     = useState(false);

  const loadCircles = useCallback(async (preferredId = null) => {
    const user = await getUserOrAlert();
    if (!user) return;
    setReady(false);
    try {
      const [{ data: owned }, { data: memberOf }] = await Promise.all([
        supabase.from("circles").select("*").eq("owner_id", user.id).order("created_at", { ascending: true }),
        supabase.from("circle_members").select("circle_id, circles!inner(*)").eq("user_id", user.id),
      ]);
      const list = [...(owned || []), ...((memberOf || []).map((r) => r.circles).filter(Boolean))];
      const uniq = Array.from(new Map(list.map((c) => [String(c.id), c])).values());
      setCircles(uniq);
      const targetId = preferredId || wantedId;
      setActive((targetId && uniq.find((c) => String(c.id) === String(targetId))) || uniq[0] || null);
    } finally { setReady(true); }
  }, [wantedId]);

  useEffect(() => { loadCircles(); }, [loadCircles]);
  return { circles, activeCircle: active, setActiveCircle: setActive, reload: loadCircles, ready };
}

function useMembers(circleId) {
  const [members, setMembers] = useState([]);
  const load = useCallback(async () => {
    if (!circleId) { setMembers([]); return; }
    try {
      const memRes = await supabase.from("circle_members").select("user_id").eq("circle_id", circleId);
      if (memRes.error) throw memRes.error;
      const ids = (memRes.data || []).map((x) => x.user_id).filter(Boolean);
      if (!ids.length) { setMembers([]); return; }
      const profRes = await supabase.from("profiles").select("id, public_name").in("id", ids);
      if (profRes.error) throw profRes.error;
      const map = new Map((profRes.data || []).map((p) => [String(p.id), p]));
      setMembers(ids.map((id) => ({ user_id: id, public_name: map.get(String(id))?.public_name || "Membre" }))
        .sort((a, b) => String(a.public_name).localeCompare(String(b.public_name))));
    } catch (e) { Log?.error?.("members", "load", e); setMembers([]); }
  }, [circleId]);
  useEffect(() => { load(); }, [load]);
  return { members, reload: load };
}

function useCalls(circleId) {
  const [calls, setCalls]  = useState([]);
  const channelRef = useRef(null);
  const rtTimerRef = useRef(null);
  const loadRef    = useRef(null);

  const load = useCallback(async () => {
    if (!circleId) return;
    try {
      const { data, error } = await supabase.from("calls")
        .select("id, circle_id, author_id, title, category, message, status, photo, created_at")
        .eq("circle_id", circleId).gte("created_at", isoHoursAgo(CALL_TTL_HOURS))
        .order("created_at", { ascending: false });
      if (error) { setCalls([]); return; }
      const rows = data || [];
      const authorIds = Array.from(new Set(rows.map((c) => c.author_id).filter(Boolean).map(String)));
      let nameById = new Map();
      if (authorIds.length) {
        const profRes = await supabase.from("profiles").select("id, public_name").in("id", authorIds);
        if (!profRes.error) nameById = new Map((profRes.data || []).map((p) => [String(p.id), p.public_name || "Membre"]));
      }
      setCalls(rows.map((c) => ({ ...c, author_name: nameById.get(String(c.author_id)) || "Membre" })));
    } catch {}
  }, [circleId]);

  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!circleId) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const ch = supabase.channel(`calls:${circleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls", filter: `circle_id=eq.${circleId}` },
        () => { if (rtTimerRef.current) clearTimeout(rtTimerRef.current); rtTimerRef.current = setTimeout(() => loadRef.current?.(), 200); })
      .subscribe();
    channelRef.current = ch;
    return () => { if (rtTimerRef.current) clearTimeout(rtTimerRef.current); if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [circleId]);

  return { calls, reload: load };
}

function useItems(circleId, filters, options = {}) {
  const { hasCategoryColumn = true, onCategoryMissing } = options;
  const [items, setItems]           = useState([]);
  const [page, setPage]             = useState(0);
  const [hasMore, setHasMore]       = useState(true);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ready, setReady]           = useState(false);
  const loadingMoreRef = useRef(false);
  const lastKeyRef     = useRef(null);
  const channelRef     = useRef(null);

  const loadPage = useCallback(async ({ resetFirst = false, isPullToRefresh = false } = {}) => {
    if (!circleId || loading) return;
    if (!resetFirst && (!hasMore || loadingMoreRef.current)) return;
    if (!resetFirst) loadingMoreRef.current = true;
    if (isPullToRefresh) setRefreshing(true); else setLoading(true);
    try {
      const nextOffset = resetFirst ? 0 : page * PAGE_SIZE;
      let q = supabase.from("items").select("*").eq("circle_id", circleId)
        .order("created_at", { ascending: false }).range(nextOffset, nextOffset + PAGE_SIZE - 1);
      if (hasCategoryColumn && filters?.category && filters.category !== "all")
        q = q.eq("category", filters.category);
      let data = [], error = null;
      try { const res = await q; data = res.data || []; error = res.error || null; } catch (e) { error = e; }
      if (error && (String(error.code) === "42703" || /column.*category.*does not exist/i.test(String(error.message)))) {
        onCategoryMissing?.();
        const res2 = await supabase.from("items").select("*").eq("circle_id", circleId)
          .order("created_at", { ascending: false }).range(nextOffset, nextOffset + PAGE_SIZE - 1);
        data = res2.data || [];
      } else if (error) { data = []; }
      const list = (data || []).map((it) => ({ ...it, photo: it.photo ?? it.image ?? it.photo_url ?? null }));
      const mergeUnique = (a, b) => { const map = new Map(); [...a, ...b].forEach((x) => map.set(String(x.id), x)); return Array.from(map.values()); };
      if (resetFirst) { setItems(list); setPage(1); } else { setItems((prev) => mergeUnique(prev, list)); setPage((prev) => prev + 1); }
      setHasMore(list.length >= PAGE_SIZE);
      setReady(true);
    } finally { setLoading(false); setRefreshing(false); loadingMoreRef.current = false; }
  }, [circleId, page, filters, loading, hasMore, hasCategoryColumn, onCategoryMissing]);

  useEffect(() => { setItems([]); setPage(0); setHasMore(true); setReady(false); }, [circleId]);
  useEffect(() => {
    if (!circleId) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const ch = supabase.channel(`items:${circleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `circle_id=eq.${circleId}` },
        () => loadPage({ resetFirst: true })).subscribe();
    channelRef.current = ch;
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [circleId, loadPage]);
  useEffect(() => {
    if (!circleId) return;
    const key = `${circleId}::${filters?.category || "all"}`;
    if (lastKeyRef.current === key && ready) return;
    lastKeyRef.current = key;
    loadPage({ resetFirst: true });
  }, [circleId, filters?.category, loadPage, ready]);

  const loadMore = useCallback(() => loadPage({ resetFirst: false }), [loadPage]);
  const refresh  = useCallback(() => loadPage({ resetFirst: true, isPullToRefresh: true }), [loadPage]);
  return { items, loading, refreshing, hasMore, loadMore, refresh, ready };
}

/* ─────────────────────────────────────────────
   COMPOSANTS VISUELS
───────────────────────────────────────────── */
const POP = { mint: "#1DFFC2", sky: "#85CCFF", pink: "#FF4FD8", peach: "#FFB5B3", lemon: "#FFE66D", purple: "#AD8CFF" };
const CATEGORY_DA = {
  maison: { a: POP.peach, b: POP.lemon }, jardin: { a: POP.mint, b: POP.sky },
  cuisine: { a: POP.lemon, b: POP.peach }, recette: { a: POP.pink, b: POP.peach },
  sport: { a: POP.sky, b: POP.mint }, vehicule: { a: POP.sky, b: POP.purple },
  utilitaire: { a: POP.mint, b: POP.purple }, bricolage: { a: POP.lemon, b: POP.purple },
  chantiers: { a: POP.purple, b: POP.sky }, service: { a: POP.mint, b: POP.peach },
  entretien: { a: POP.mint, b: POP.lemon }, travail: { a: POP.pink, b: POP.sky },
  animaux: { a: POP.peach, b: POP.pink }, plantes: { a: POP.mint, b: POP.lemon },
  dons: { a: POP.mint, b: POP.peach }, abonnements: { a: POP.purple, b: POP.pink }, other: { a: POP.sky, b: POP.peach },
};
const daForCat = (k) => CATEGORY_DA[String(k || "other")] || CATEGORY_DA.other;

function CardMedia({ category, photoUrl, height = "100%" }) {
  const da = daForCat(category);
  return (
    <View style={{ width: "100%", height, overflow: "hidden" }}>
      <LinearGradient colors={[da.a, da.b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.10)", top: -60, right: -60 }} />
      {!!photoUrl && (
        <>
          <Image source={{ uri: normalizeUrl(photoUrl) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(7,9,15,0.22)" }]} />
          <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.65)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        </>
      )}
    </View>
  );
}

function CatBadge({ category, style }) {
  const m = catMeta(category);
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.50)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" }, style]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: m.dot }} />
      <Text style={{ color: "rgba(255,255,255,0.90)", fontSize: 10, fontWeight: "700", letterSpacing: 0.3 }}>{m.label}</Text>
    </View>
  );
}

function AvatarStack({ ownersList, max = 3, palette }) {
  const list = (ownersList || []).slice(0, max);
  const pal  = palette || CIRCLE_PALETTES[0];
  return (
    <View style={{ flexDirection: "row" }}>
      {list.map((o, idx) => (
        <View key={`${o?.user_id || idx}`} style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.bg, backgroundColor: pal.dim, marginLeft: idx === 0 ? 0 : -8 }}>
          <Text style={{ color: pal.primary, fontSize: 9, fontWeight: "900" }}>{initialsFromName(o?.name || "?")}</Text>
        </View>
      ))}
      {(ownersList || []).length > max && (
        <View style={{ width: 24, height: 24, borderRadius: 12, marginLeft: -8, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1.5, borderColor: colors.bg }}>
          <Text style={{ color: colors.subtext, fontSize: 8, fontWeight: "900" }}>+{(ownersList || []).length - max}</Text>
        </View>
      )}
    </View>
  );
}

/* ── Card Feed 2 colonnes ── */
function FeedCard({ row, onPress, onShare, palette }) {
  const pal = palette || CIRCLE_PALETTES[0];
  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={S.feedCard}>
      <View style={{ height: 130, borderRadius: 16, overflow: "hidden" }}>
        <CardMedia category={row.category} photoUrl={row.photo || null} height="100%" />
        <CatBadge category={row.category} style={{ position: "absolute", top: 8, left: 8 }} />
        <View style={{ position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", flexDirection: "row", alignItems: "center", gap: 4 }}>
          <MaterialCommunityIcons name="account-multiple" size={11} color={pal.primary} />
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>{row.count || 0}</Text>
        </View>
      </View>
      <View style={{ padding: 10, flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: "900", fontSize: 14, lineHeight: 18 }} numberOfLines={2}>{row.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <AvatarStack ownersList={row.ownersList} palette={pal} />
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            {!!onShare && (
              <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); onShare(); }} style={{ padding: 4 }}>
                <MaterialCommunityIcons name="share-variant-outline" size={16} color={colors.subtext} />
              </TouchableOpacity>
            )}
            <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: pal.dim, borderWidth: 1, borderColor: pal.border }}>
              <Text style={{ color: pal.primary, fontSize: 11, fontWeight: "900" }}>Voir →</Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ── Card Onde — compacte, inline dans le feed ── */
function WaveRow({ c, onRespond, onDelete, isMine, palette }) {
  const pal = palette || CIRCLE_PALETTES[0];
  const age = Math.round((Date.now() - new Date(c.created_at).getTime()) / 3600000);
  return (
    <View style={[S.waveRow, { borderLeftColor: pal.primary }]}>
      <View style={[S.waveAvatar, { backgroundColor: pal.dim }]}>
        <Text style={{ color: pal.primary, fontSize: 10, fontWeight: "900" }}>{initialsFromName(c.author_name || "?")}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", lineHeight: 18 }} numberOfLines={2}>{c.message}</Text>
        <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 3 }}>{c.author_name} · {age < 1 ? "< 1h" : `${age}h`}</Text>
      </View>
      {!isMine ? (
        <TouchableOpacity onPress={onRespond} style={[S.waveCta, { borderColor: pal.border }]}>
          <Text style={[S.waveCtaTxt, { color: pal.primary }]}>Aider</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.danger} />
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ── Inventory Card (onglet "Mon inventaire") ── */
function InventoryCard({ item, onEdit, onShare, palette }) {
  const pal  = palette || CIRCLE_PALETTES[0];
  const meta = catMeta(item.category || "other");
  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onEdit} style={S.invCard}>
      <View style={{ width: 60, height: 60, borderRadius: 12, overflow: "hidden", flexShrink: 0 }}>
        <CardMedia category={item.category} photoUrl={item.photo || null} height="100%" />
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingLeft: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: meta.dot }} />
          <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: "700" }}>{meta.label}</Text>
        </View>
        <Text style={{ color: colors.text, fontWeight: "900", fontSize: 14, marginTop: 2 }} numberOfLines={1}>{item.title}</Text>
        <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>{fmtRelative(item.created_at)}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        {!!onShare && (
          <TouchableOpacity onPress={onShare} style={S.iconBtn}>
            <MaterialCommunityIcons name="share-variant-outline" size={15} color={colors.subtext} />
          </TouchableOpacity>
        )}
        <View style={[S.editPill, { backgroundColor: pal.dim, borderColor: pal.border }]}>
          <Text style={[S.editPillTxt, { color: pal.primary }]}>Modifier</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ── Empty Feed ── */
const GHOST_ITEMS = [
  { icon: "hammer-screwdriver", label: "Perceuse" }, { icon: "tent", label: "Tente" },
  { icon: "home-variant-outline", label: "Escabeau" }, { icon: "flower-outline", label: "Karcher" },
];
function EmptyFeedState({ palette, membersCount, onAddItem, onInvite }) {
  const pal   = palette || CIRCLE_PALETTES[0];
  const alone = membersCount <= 1;
  return (
    <View style={{ paddingTop: 8, paddingBottom: 32 }}>
      <Text style={{ color: colors.text, fontWeight: "900", fontSize: 17, marginBottom: 4 }}>
        {alone ? "Ton Cercle t'attend" : "Personne n'a encore ajouté d'objets"}
      </Text>
      <Text style={{ color: colors.subtext, fontSize: 14, lineHeight: 20, marginBottom: 20 }}>
        {alone ? "Ajoute tes objets et invite tes proches." : "Sois le premier à partager quelque chose."}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
        {GHOST_ITEMS.map((g, i) => (
          <View key={i} style={{ width: "47%", borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", backgroundColor: "rgba(255,255,255,0.03)", opacity: 0.4 + i * 0.1 }}>
            <View style={{ height: 72, alignItems: "center", justifyContent: "center", backgroundColor: `${pal.primary}10` }}>
              <MaterialCommunityIcons name={g.icon} size={28} color={pal.primary} />
            </View>
            <View style={{ padding: 10 }}>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 13 }}>{g.label}</Text>
            </View>
          </View>
        ))}
      </View>
      <TouchableOpacity onPress={onAddItem} activeOpacity={0.88}
        style={{ backgroundColor: pal.primary, borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
        <Text style={{ color: colors.bg, fontWeight: "900", fontSize: 15 }}>+ Ajouter mes objets</Text>
      </TouchableOpacity>
      {alone && (
        <TouchableOpacity onPress={onInvite} activeOpacity={0.88}
          style={{ borderRadius: 14, height: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: `${pal.primary}35`, backgroundColor: `${pal.primary}08`, flexDirection: "row", gap: 8 }}>
          <MaterialCommunityIcons name="account-plus-outline" size={18} color={pal.primary} />
          <Text style={{ color: pal.primary, fontWeight: "800", fontSize: 14 }}>Inviter mes proches</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ─────────────────────────────────────────────
   MODALE : INVENTAIRE RAPIDE
   Expérience checklist ultra-fluide :
   1. Grille de catégories → tap
   2. Liste d'objets → cocher
   3. Gratuit / payant
   4. Cercles de destination
   5. Valider → publié
───────────────────────────────────────────── */
function QuickInventorySheet({ visible, onClose, onSave, circles, activeCircleId, palette, existingTitles }) {
  const pal = palette || CIRCLE_PALETTES[0];

  const [step, setStep]             = useState("cats");   // "cats" | "items" | "price" | "dest"
  const [activeCat, setActiveCat]   = useState(null);
  const [sel, setSel]               = useState(new Set());  // Set de normalizeTitleKey
  const [customTitle, setCustomTitle] = useState("");
  const [isFree, setIsFree]         = useState(true);
  const [priceAmount, setPriceAmount] = useState("");
  const [pricePeriod, setPricePeriod] = useState("jour");
  const [destIds, setDestIds]       = useState([]);
  const [saving, setSaving]         = useState(false);

  const existingSet = useMemo(() => new Set((existingTitles || []).map(normalizeTitleKey)), [existingTitles]);

  useEffect(() => {
    if (visible) {
      setStep("cats"); setActiveCat(null); setSel(new Set()); setCustomTitle("");
      setIsFree(true); setPriceAmount(""); setPricePeriod("jour");
      setDestIds(activeCircleId ? [String(activeCircleId)] : []);
      setSaving(false);
    }
  }, [visible, activeCircleId]);

  const toggleItem = (title) => {
    const k = normalizeTitleKey(title);
    setSel((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  };

  const toggleDest = (id) => {
    const sid = String(id);
    setDestIds((prev) => prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]);
  };

  const countSel = sel.size + (customTitle.trim() ? 1 : 0);

  const catShortList = CATEGORIES.filter((c) => c.key !== "all");
  const preset = activeCat ? (QUICK_PRESETS[activeCat] || []) : [];

  const handleValidate = async () => {
    if (countSel === 0) { Alert.alert("Objets", "Coche au moins un objet."); return; }
    if (destIds.length === 0) { Alert.alert("Destination", "Choisis au moins un Cercle."); return; }
    setSaving(true);
    try {
      const titles = [];
      sel.forEach((k) => {
        const found = preset.find((t) => normalizeTitleKey(t) === k);
        titles.push(titlePretty(found || k));
      });
      if (customTitle.trim()) titles.push(titlePretty(customTitle.trim()));
      await onSave({
        titles, category: activeCat || "other", destIds,
        isFree, priceAmount: isFree ? null : parseMoney(priceAmount), pricePeriod: isFree ? null : pricePeriod,
      });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={S.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <View style={[S.addSheet, { maxHeight: "92%" }]}>

            {/* Header */}
            <View style={[S.RC, { justifyContent: "space-between", marginBottom: 4 }]}>
              <View style={[S.RC, { gap: 10 }]}>
                {step !== "cats" && (
                  <TouchableOpacity onPress={() => setStep(step === "items" ? "cats" : step === "price" ? "items" : "price")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialCommunityIcons name="chevron-left" size={22} color={pal.primary} />
                  </TouchableOpacity>
                )}
                <Text style={S.addSheetTitle}>
                  {step === "cats" ? "Quelle catégorie ?" : step === "items" ? labelCat(activeCat) : step === "price" ? "Conditions du prêt" : "Dans quel  ?"}
                </Text>
              </View>
              {countSel > 0 && step === "items" && (
                <View style={[S.selBadge, { backgroundColor: pal.dim, borderColor: pal.border }]}>
                  <Text style={{ color: pal.primary, fontSize: 12, fontWeight: "900" }}>{countSel} sélectionné{countSel > 1 ? "s" : ""}</Text>
                </View>
              )}
            </View>

            {/* ── STEP : Catégories ── */}
            {step === "cats" && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 8 }}>
                  {catShortList.map((c) => (
                    <TouchableOpacity key={c.key} onPress={() => { setActiveCat(c.key); setStep("items"); setSel(new Set()); }}
                      style={[S.catTile, { borderColor: colors.stroke }]} activeOpacity={0.82}>
                      <LinearGradient colors={[daForCat(c.key).a + "30", daForCat(c.key).b + "18"]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                      <MaterialCommunityIcons name={c.icon} size={22} color={c.dot} />
                      <Text style={S.catTileTxt}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}

            {/* ── STEP : Items à cocher ── */}
            {step === "items" && (
              <>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                  {preset.map((title) => {
                    const k = normalizeTitleKey(title);
                    const checked  = sel.has(k);
                    const existing = existingSet.has(k);
                    return (
                      <TouchableOpacity key={k} onPress={() => !existing && toggleItem(title)}
                        style={[S.checkRow, checked && { backgroundColor: pal.dim, borderColor: pal.border }, existing && { opacity: 0.35 }]}
                        activeOpacity={existing ? 1 : 0.82}>
                        <View style={[S.checkbox, checked && { backgroundColor: pal.primary, borderColor: pal.primary }]}>
                          {checked && <MaterialCommunityIcons name="check" size={13} color={colors.bg} />}
                        </View>
                        <Text style={[S.checkRowTxt, checked && { color: pal.primary }]} numberOfLines={1}>{title}</Text>
                        {existing && <Text style={{ color: colors.subtext, fontSize: 11 }}>Déjà ajouté</Text>}
                      </TouchableOpacity>
                    );
                  })}
                  {/* Champ libre */}
                  <View style={S.customRow}>
                    <MaterialCommunityIcons name="plus-circle-outline" size={20} color={colors.subtext} />
                    <TextInput value={customTitle} onChangeText={setCustomTitle}
                      placeholder="Ajouter un objet personnalisé…" placeholderTextColor={colors.subtext}
                      style={{ flex: 1, color: colors.text, fontSize: 14, paddingVertical: 4 }}
                      returnKeyType="done" />
                  </View>
                </ScrollView>
                <View style={S.addSheetFooter}>
                  <TouchableOpacity onPress={() => setStep("price")} disabled={countSel === 0}
                    style={[S.primaryBtn, { backgroundColor: pal.primary, opacity: countSel === 0 ? 0.4 : 1 }]}>
                    <Text style={[S.primaryBtnTxt, { color: colors.bg }]}>
                      Continuer {countSel > 0 ? `(${countSel})` : ""}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ── STEP : Conditions ── */}
            {step === "price" && (
              <>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                  <Text style={{ color: colors.subtext, fontSize: 13, marginTop: 4, marginBottom: 16, lineHeight: 18 }}>
                    Comment souhaites-tu prêter ces {countSel} objet{countSel > 1 ? "s" : ""} ?
                  </Text>
                  {[
                    { val: true,  icon: "handshake-outline", label: "Prêt gratuit", sub: "Tu prêtes sans contrepartie" },
                    { val: false, icon: "cash-multiple",     label: "Participation aux frais", sub: "Tu peux demander une contribution" },
                  ].map((opt) => (
                    <TouchableOpacity key={String(opt.val)} onPress={() => setIsFree(opt.val)}
                      style={[S.priceOption, isFree === opt.val && { backgroundColor: pal.dim, borderColor: pal.border }]}>
                      <View style={[S.priceOptionIcon, { backgroundColor: isFree === opt.val ? pal.dim : colors.card }]}>
                        <MaterialCommunityIcons name={opt.icon} size={20} color={isFree === opt.val ? pal.primary : colors.subtext} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[{ color: colors.text, fontWeight: "800", fontSize: 14 }, isFree === opt.val && { color: pal.primary }]}>{opt.label}</Text>
                        <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>{opt.sub}</Text>
                      </View>
                      {isFree === opt.val && <MaterialCommunityIcons name="check-circle" size={20} color={pal.primary} />}
                    </TouchableOpacity>
                  ))}
                  {!isFree && (
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                      <TextInput value={priceAmount} onChangeText={setPriceAmount}
                        placeholder="Montant (ex: 5)" placeholderTextColor={colors.subtext}
                        keyboardType="decimal-pad" style={[S.input, { flex: 1 }]} />
                      {["jour", "semaine", "mois"].map((p) => (
                        <TouchableOpacity key={p} onPress={() => setPricePeriod(p)}
                          style={[S.catChip, pricePeriod === p && { backgroundColor: pal.dim, borderColor: pal.border }]}>
                          <Text style={[S.catChipTxt, pricePeriod === p && { color: pal.primary }]}>/{p}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </ScrollView>
                <View style={S.addSheetFooter}>
                  <TouchableOpacity onPress={() => circles?.length > 1 ? setStep("dest") : handleValidate()}
                    disabled={saving}
                    style={[S.primaryBtn, { backgroundColor: pal.primary, opacity: saving ? 0.7 : 1 }]}>
                    {saving ? <ActivityIndicator color={colors.bg} /> : (
                      <Text style={[S.primaryBtnTxt, { color: colors.bg }]}>
                        {circles?.length > 1 ? "Choisir le Cercle →" : "Mettre à disposition ✓"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ── STEP : Destination ── */}
            {step === "dest" && (
              <>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                  <Text style={{ color: colors.subtext, fontSize: 13, marginTop: 4, marginBottom: 16 }}>
                    Ces objets seront visibles dans les Cercles sélectionnés.
                  </Text>
                  {(circles || []).map((c) => {
                    const cpal = getPaletteForCircle(c);
                    const sel  = destIds.includes(String(c.id));
                    return (
                      <TouchableOpacity key={c.id} onPress={() => toggleDest(c.id)}
                        style={[S.priceOption, sel && { backgroundColor: cpal.dim, borderColor: cpal.border }]}>
                        <View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: cpal.primary }]} />
                        <Text style={{ color: colors.text, fontWeight: "800", flex: 1, fontSize: 14 }} numberOfLines={1}>{c.name || ` ${c.id}`}</Text>
                        <MaterialCommunityIcons name={sel ? "check-circle" : "circle-outline"} size={20} color={sel ? cpal.primary : colors.subtext} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <View style={S.addSheetFooter}>
                  <TouchableOpacity onPress={handleValidate} disabled={saving || destIds.length === 0}
                    style={[S.primaryBtn, { backgroundColor: pal.primary, opacity: (saving || destIds.length === 0) ? 0.5 : 1 }]}>
                    {saving ? <ActivityIndicator color={colors.bg} /> : (
                      <Text style={[S.primaryBtnTxt, { color: colors.bg }]}>Mettre à disposition ✓</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}

          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   MODALE : INVITATION
   Un seul endroit, code lisible, share natif
───────────────────────────────────────────── */
function InviteModal({ visible, onClose, circle, myItems, palette }) {
  const pal = palette || CIRCLE_PALETTES[0];
  const [inviteCode, setInviteCode] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [copied,     setCopied]     = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contactsList, setContactsList] = useState([]);
  const [contactsSel,  setContactsSel]  = useState(new Set());
  const [contactsFilter, setContactsFilter] = useState("");
  const [contactsLoading, setContactsLoading] = useState(false);
  const [sendingContacts, setSendingContacts] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (visible && circle?.id) {
      setLoading(true);
      getOrCreateCircleInviteCode(circle.id, circle.name || "")
        .then(setInviteCode).finally(() => setLoading(false));
    } else { setInviteCode(null); }
  }, [visible, circle?.id]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active" || !pendingRef.current) return;
      const perm = await Contacts.getPermissionsAsync();
      if (perm.status === "granted") { pendingRef.current = false; openContactsInner(); }
    });
    return () => sub.remove();
  }, []);

  const openContactsInner = async () => {
    setContactsLoading(true);
    try { const list = await loadDeviceContactsRaw(); setContactsList(list); }
    catch { Alert.alert("Contacts", "Lecture impossible."); }
    finally { setContactsLoading(false); }
    setContactsFilter(""); setContactsSel(new Set()); setContactsOpen(true);
  };

  const handleOpenContacts = async () => {
    try { const v = await AsyncStorage.getItem("contacts_consent_v1"); if (v !== "granted") { setConsentOpen(true); return; } } catch { setConsentOpen(true); return; }
    const res = await ensureContactsPermissionHard({ onGoToSettings: () => { pendingRef.current = true; } });
    if (res.ok) openContactsInner();
  };

  const handleShare = async () => {
    if (!inviteCode) return;
    const titles = (myItems || []).map((it) => it.title).filter(Boolean).slice(0, 3);
    try { await Share.share({ message: formatInviteMessage(circle?.name || "mon ", inviteCode, titles) }); } catch {}
  };

  const handleCopy = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInviteContacts = async () => {
    const selected = contactsList.filter((c) => contactsSel.has(c.id));
    if (!selected.length) return;
    setSendingContacts(true);
    try {
      if (!inviteCode) return;
      let ok = 0, ko = 0;
      for (const c of selected) {
        const msg = formatInviteMessage(circle?.name || "mon ", inviteCode, (myItems || []).map((i) => i.title).slice(0, 2));
        try { await openComposerSMS(c.phone, msg); ok++; } catch { ko++; }
      }
      setContactsOpen(false); onClose();
      Alert.alert("Invitations envoyées ✓", `${ok} contact${ok > 1 ? "s" : ""}${ko ? ` · ${ko} échec` : ""}`);
    } finally { setSendingContacts(false); }
  };

  const filteredContacts = contactsList.filter((c) => !contactsFilter || c.name?.toLowerCase().includes(contactsFilter.toLowerCase()) || c.phone?.includes(contactsFilter));

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={onClose}>
        <View style={S.modalOverlay}>
          <TouchableWithoutFeedback onPress={onClose}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
          <View style={S.inviteSheet}>
            <Text style={[S.addSheetTitle, { marginBottom: 4 }]}>Inviter dans "{circle?.name}"</Text>
            <Text style={{ color: colors.subtext, fontSize: 13, marginBottom: 20 }}>Tes proches rejoignent en 30 secondes.</Text>
            {loading ? (
              <View style={{ alignItems: "center", padding: 28 }}><ActivityIndicator color={pal.primary} /></View>
            ) : inviteCode ? (
              <TouchableOpacity onPress={handleCopy} activeOpacity={0.85}
                style={[S.codeBlock, { backgroundColor: pal.dim, borderColor: pal.border }]}>
                <Text style={[S.codeTxt, { color: pal.primary }]}>{inviteCode}</Text>
                <View style={[S.RC, { gap: 6, marginTop: 8, justifyContent: "center" }]}>
                  <MaterialCommunityIcons name={copied ? "check" : "content-copy"} size={14} color={copied ? pal.primary : colors.subtext} />
                  <Text style={{ color: copied ? pal.primary : colors.subtext, fontSize: 12, fontWeight: "700" }}>{copied ? "Copié !" : "Appuie pour copier"}</Text>
                </View>
              </TouchableOpacity>
            ) : null}
            <Text style={{ color: colors.subtext, fontSize: 12, textAlign: "center", marginTop: 10, marginBottom: 20, lineHeight: 17 }}>
              {"Télécharge Cercle → \"J'ai un code\" → tape ce code"}
            </Text>
            <TouchableOpacity onPress={handleShare} style={[S.primaryBtn, { backgroundColor: pal.primary, marginBottom: 10 }]}>
              <MaterialCommunityIcons name="share-variant" size={18} color={colors.bg} />
              <Text style={[S.primaryBtnTxt, { color: colors.bg }]}>Envoyer l'invitation</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleOpenContacts} style={[S.secondaryBtn, { marginBottom: 6 }]}>
              <MaterialCommunityIcons name="contacts-outline" size={16} color={colors.text} />
              <Text style={S.secondaryBtnTxt}>Depuis mes contacts</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={S.ghostBtn}>
              <Text style={S.ghostBtnTxt}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Contacts picker */}
      <Modal visible={contactsOpen} transparent animationType="slide" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={() => setContactsOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={S.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setContactsOpen(false)}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
            <View style={[S.addSheet, { maxHeight: "85%" }]}>
              <Text style={S.addSheetTitle}>Choisir des contacts</Text>
              <View style={[S.searchRow, { marginBottom: 10 }]}>
                <MaterialCommunityIcons name="magnify" size={16} color={colors.subtext} />
                <TextInput value={contactsFilter} onChangeText={setContactsFilter} placeholder="Rechercher…" placeholderTextColor={colors.subtext} style={{ flex: 1, color: colors.text, paddingVertical: 6 }} />
                {!!contactsFilter && <TouchableOpacity onPress={() => setContactsFilter("")}><MaterialCommunityIcons name="close-circle" size={16} color={colors.subtext} /></TouchableOpacity>}
              </View>
              {contactsLoading ? <View style={{ alignItems: "center", padding: 24 }}><ActivityIndicator color={pal.primary} /></View>
                : <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                    {filteredContacts.map((c) => {
                      const isSel = contactsSel.has(c.id);
                      return (
                        <TouchableOpacity key={c.id} onPress={() => setContactsSel((prev) => { const n = new Set(prev); isSel ? n.delete(c.id) : n.add(c.id); return n; })}
                          style={[S.dropItem, isSel && { backgroundColor: pal.dim }]}>
                          <MaterialCommunityIcons name={isSel ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} size={20} color={isSel ? pal.primary : colors.subtext} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.text, fontWeight: "800" }} numberOfLines={1}>{c.name}</Text>
                            <Text style={{ color: colors.subtext, fontSize: 12 }}>{c.phone}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
              }
              <View style={S.addSheetFooter}>
                <TouchableOpacity onPress={handleInviteContacts} disabled={sendingContacts || contactsSel.size === 0}
                  style={[S.primaryBtn, { backgroundColor: pal.primary, opacity: (sendingContacts || contactsSel.size === 0) ? 0.5 : 1 }]}>
                  {sendingContacts ? <ActivityIndicator color={colors.bg} /> : <Text style={[S.primaryBtnTxt, { color: colors.bg }]}>Inviter {contactsSel.size > 0 ? `(${contactsSel.size})` : ""}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Consentement */}
      <Modal visible={consentOpen} transparent animationType="fade" statusBarTranslucent>
        <View style={[S.modalOverlay, { justifyContent: "center", paddingHorizontal: 24 }]}>
          <View style={[S.dropSheet, { borderRadius: 24, paddingBottom: 20 }]}>
            <Text style={S.dropTitle}>Accès aux contacts</Text>
            <Text style={{ color: colors.subtext, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>Pour inviter par SMS, l'app accède à ton répertoire pour sélectionner des contacts.</Text>
            <TouchableOpacity onPress={async () => { setConsentOpen(false); await AsyncStorage.setItem("contacts_consent_v1", "granted"); const res = await ensureContactsPermissionHard({ onGoToSettings: () => { pendingRef.current = true; } }); if (res.ok) openContactsInner(); }} style={[S.primaryBtn, { backgroundColor: pal.primary }]}>
              <Text style={[S.primaryBtnTxt, { color: colors.bg }]}>Autoriser</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setConsentOpen(false)} style={[S.ghostBtn, { marginTop: 8 }]}>
              <Text style={S.ghostBtnTxt}>Pas maintenant</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ─────────────────────────────────────────────
   MODALE : AJOUT OBJET PHOTO (objet unique avec photo)
───────────────────────────────────────────── */
function AddItemModal({ visible, onClose, onSave, circles, activeCircleId, palette, editItem }) {
  const pal = palette || CIRCLE_PALETTES[0];
  const [photo, setPhoto]         = useState(null);
  const [title, setTitle]         = useState("");
  const [itemDesc, setItemDesc]   = useState("");
  const [category, setCategory]   = useState("other");
  const [destIds, setDestIds]     = useState([]);
  const [itemIsFree, setItemIsFree] = useState(true);
  const [itemCost, setItemCost]   = useState("");
  const [itemPeriod, setItemPeriod] = useState("jour");
  const [saving, setSaving]       = useState(false);
  const [step, setStep]           = useState(1);

  useEffect(() => {
    if (visible) {
      if (editItem) {
        setPhoto(editItem.photo ? { uri: editItem.photo } : null); setTitle(editItem.title || ""); setItemDesc(editItem.description || "");
        setCategory(editItem.category || "other"); setItemIsFree(editItem.is_free !== false);
        setItemCost(editItem.total_cost ? String(editItem.total_cost) : ""); setItemPeriod(editItem.period || "jour");
        setDestIds([String(editItem.circle_id || activeCircleId || "")].filter(Boolean)); setStep(2);
      } else {
        setPhoto(null); setTitle(""); setItemDesc(""); setCategory("other"); setItemIsFree(true);
        setItemCost(""); setItemPeriod("jour"); setDestIds(activeCircleId ? [String(activeCircleId)] : []); setStep(1);
      }
      setSaving(false);
    }
  }, [visible, editItem, activeCircleId]);

  const pickPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Photos", "Autorise l'accès à la photothèque."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsMultipleSelection: false, base64: true, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!res.canceled && res.assets?.[0]?.uri) {
      const a = res.assets[0];
      setPhoto({ uri: a.uri, base64: a.base64 || null, mime: a.mimeType || "image/jpeg" });
      setStep(2);
    }
  }, []);

  const toggleDest = (id) => { const sid = String(id); setDestIds((prev) => prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]); };

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert("Objet", "Ajoute un titre."); return; }
    if (!destIds.length) { Alert.alert("Objet", "Sélectionne au moins un Cercle."); return; }
    setSaving(true);
    await onSave({ photo, title: title.trim(), description: itemDesc.trim() || null, category, destIds, editItem, isFree: itemIsFree, totalCost: itemIsFree ? null : parseMoney(itemCost), period: itemIsFree ? null : itemPeriod });
    setSaving(false); onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={S.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <View style={[S.addSheet, { maxHeight: "92%" }]}>
            <View style={[S.RC, { justifyContent: "space-between", marginBottom: 16 }]}>
              <Text style={S.addSheetTitle}>{editItem ? "Modifier l'objet" : "Ajouter un objet"}</Text>
              {step === 2 && !editItem && <TouchableOpacity onPress={() => setStep(1)}><Text style={{ color: pal.primary, fontWeight: "700", fontSize: 13 }}>← Photo</Text></TouchableOpacity>}
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {step === 1 && !editItem ? (
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <TouchableOpacity onPress={pickPhoto} style={[S.cameraBtn, { backgroundColor: pal.dim, borderColor: pal.border }]} activeOpacity={0.88}>
                    <MaterialCommunityIcons name="camera" size={36} color={pal.primary} />
                    <Text style={[S.cameraBtnTxt, { color: pal.primary }]}>Ajouter une photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setStep(2)} style={[S.ghostBtn, { marginTop: 16, width: "100%" }]}>
                    <Text style={S.ghostBtnTxt}>Continuer sans photo →</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {photo?.uri ? (
                    <View style={S.photoPreview}>
                      <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      <TouchableOpacity onPress={pickPhoto} style={S.changePhotoBtn}><MaterialCommunityIcons name="camera" size={14} color={colors.text} /><Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>Changer</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => setPhoto(null)} style={[S.changePhotoBtn, { right: 80 }]}><MaterialCommunityIcons name="close" size={14} color={colors.text} /></TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={pickPhoto} style={[S.photoPlaceholder, { borderColor: pal.border, backgroundColor: pal.dim }]}>
                      <MaterialCommunityIcons name="camera-plus" size={24} color={pal.primary} />
                      <Text style={{ color: pal.primary, fontSize: 13, fontWeight: "700", marginTop: 8 }}>Ajouter une photo</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={S.fieldLabel}>Nom de l'objet *</Text>
                  <TextInput value={title} onChangeText={setTitle} autoFocus={!photo} placeholder="Ex: Perceuse Bosch, Raclette…" placeholderTextColor={colors.subtext} style={[S.input, { marginTop: 8 }]} returnKeyType="next" />
                  <Text style={S.fieldLabel}>Description (optionnel)</Text>
                  <TextInput value={itemDesc} onChangeText={setItemDesc} multiline placeholder="État, marque, conditions…" placeholderTextColor={colors.subtext} style={[S.input, { marginTop: 8, height: 80, textAlignVertical: "top" }]} />
                  <Text style={S.fieldLabel}>Conditions</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                    {[{ val: true, label: "Gratuit 🤝" }, { val: false, label: "Participation aux frais" }].map((opt) => (
                      <TouchableOpacity key={String(opt.val)} onPress={() => setItemIsFree(opt.val)}
                        style={[S.catChip, { flex: 1, justifyContent: "center" }, itemIsFree === opt.val && { backgroundColor: pal.dim, borderColor: pal.border }]}>
                        <Text style={[S.catChipTxt, itemIsFree === opt.val && { color: pal.primary }]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {!itemIsFree && (
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                      <TextInput value={itemCost} onChangeText={setItemCost} placeholder="0.00" placeholderTextColor={colors.subtext} keyboardType="decimal-pad" style={[S.input, { flex: 1 }]} />
                      {["jour", "semaine", "mois"].map((p) => (
                        <TouchableOpacity key={p} onPress={() => setItemPeriod(p)} style={[S.catChip, itemPeriod === p && { backgroundColor: pal.dim, borderColor: pal.border }]}>
                          <Text style={[S.catChipTxt, itemPeriod === p && { color: pal.primary }]}>/{p}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <Text style={S.fieldLabel}>Catégorie</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
                    {CATEGORIES.filter((c) => c.key !== "all").map((c) => {
                      const active = category === c.key;
                      return (
                        <TouchableOpacity key={c.key} onPress={() => setCategory(c.key)} style={[S.catChip, active && { backgroundColor: pal.dim, borderColor: pal.border }]}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.dot }} />
                          <Text style={[S.catChipTxt, active && { color: pal.primary }]}>{c.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  {(circles || []).length > 1 && (
                    <>
                      <Text style={S.fieldLabel}>Partager dans</Text>
                      <View style={{ gap: 8, marginTop: 8 }}>
                        {(circles || []).map((c) => {
                          const cpal = getPaletteForCircle(c);
                          const isSel = destIds.includes(String(c.id));
                          return (
                            <TouchableOpacity key={c.id} onPress={() => toggleDest(c.id)} style={[S.circleDestRow, isSel && { backgroundColor: cpal.dim, borderColor: cpal.border }]}>
                              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cpal.primary }} />
                              <Text style={{ color: colors.text, fontWeight: "800", flex: 1 }} numberOfLines={1}>{c.name || ` ${c.id}`}</Text>
                              <MaterialCommunityIcons name={isSel ? "check-circle" : "circle-outline"} size={20} color={isSel ? cpal.primary : colors.subtext} />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}
                </>
              )}
            </ScrollView>
            {step === 2 && (
              <View style={S.addSheetFooter}>
                <TouchableOpacity onPress={handleSave} disabled={saving} style={[S.primaryBtn, { backgroundColor: pal.primary, opacity: saving ? 0.7 : 1 }]}>
                  {saving ? <ActivityIndicator color={colors.bg} /> : <Text style={[S.primaryBtnTxt, { color: colors.bg }]}>{editItem ? "Enregistrer" : "Mettre à disposition ✓"}</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   MODALE : ONDE
───────────────────────────────────────────── */
function WaveModal({ visible, onClose, onSave, palette }) {
  const pal = palette || CIRCLE_PALETTES[0];
  const [msg, setMsg]           = useState("");
  const [category, setCategory] = useState("other");
  const [saving, setSaving]     = useState(false);

  useEffect(() => { if (visible) { setMsg(""); setCategory("other"); setSaving(false); } }, [visible]);

  const handleSave = async () => {
    if (!msg.trim()) { Alert.alert("Onde", "Écris ta demande."); return; }
    setSaving(true);
    await onSave({ msg: msg.trim(), category });
    setSaving(false); onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={S.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <View style={[S.addSheet, { maxHeight: "70%" }]}>
            <View style={[S.RC, { gap: 12, marginBottom: 16 }]}>
              <View style={[S.waveIcon, { backgroundColor: pal.dim, borderColor: pal.border }]}>
                <MaterialCommunityIcons name="bullhorn" size={18} color={pal.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.addSheetTitle}>Lancer une onde</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>Visible 24h · Le cercle reçoit une notification</Text>
              </View>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <TextInput value={msg} onChangeText={setMsg} multiline autoFocus
                placeholder="Ex : Quelqu'un a une perceuse ce week-end ? 🙏"
                placeholderTextColor={colors.subtext}
                style={[S.input, { height: 110, textAlignVertical: "top", marginBottom: 14 }]} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {CATEGORIES.filter((c) => c.key !== "all").map((c) => {
                  const active = category === c.key;
                  return (
                    <TouchableOpacity key={c.key} onPress={() => setCategory(c.key)} style={[S.catChip, active && { backgroundColor: pal.dim, borderColor: pal.border }]}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.dot }} />
                      <Text style={[S.catChipTxt, active && { color: pal.primary }]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </ScrollView>
            <View style={S.addSheetFooter}>
              <TouchableOpacity onPress={handleSave} disabled={saving} style={[S.primaryBtn, { backgroundColor: pal.primary, opacity: saving ? 0.7 : 1 }]}>
                {saving ? <ActivityIndicator color={colors.bg} /> : <Text style={[S.primaryBtnTxt, { color: colors.bg }]}>Publier l'onde 📡</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   MODALE : PARTAGE OBJET
───────────────────────────────────────────── */
function ShareItemModal({ visible, onClose, item, circles, activeCircle, myItems, palette, currentUserId }) {
  const pal = palette || CIRCLE_PALETTES[0];
  const [shareCircleIds, setShareCircleIds] = useState([]);
  const [sharing, setSharing] = useState(false);

  useEffect(() => { if (visible) setShareCircleIds([]); }, [visible, item]);

  const handleShareInvite = async () => {
    if (!activeCircle?.id) return;
    const code = await getOrCreateCircleInviteCode(activeCircle.id, activeCircle.name || "");
    if (!code) return;
    const titles = (myItems || []).map((it) => it.title).filter(Boolean).slice(0, 3);
    try { await Share.share({ message: formatInviteMessage(activeCircle.name || "mon ", code, titles) }); } catch {}
  };

  const handleCopyCircles = async () => {
    if (!shareCircleIds.length) return;
    const user = await getUserOrAlert(); if (!user) return;
    setSharing(true);
    try {
      const dests = shareCircleIds.filter((id) => id !== item?.circle_id);
      const res = await shareItemToOtherCircles(item, dests, user.id);
      onClose();
      Alert.alert("Partagé ✓", `${res.ok} inventaire(s) mis à jour${res.ko ? ` · ${res.ko} échec` : ""}`);
    } finally { setSharing(false); }
  };

  const otherCircles = (circles || []).filter((c) => c.id !== item?.circle_id);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={S.modalOverlay}>
        <TouchableWithoutFeedback onPress={onClose}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
        <View style={[S.addSheet, { maxHeight: "80%" }]}>
          <Text style={[S.addSheetTitle, { marginBottom: 16 }]}>Partager</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            {/* Preview objet */}
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 20, alignItems: "center" }}>
              <View style={{ width: 60, height: 60, borderRadius: 12, overflow: "hidden" }}>
                <CardMedia category={item?.category} photoUrl={item?.photo} height="100%" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "900", fontSize: 15 }} numberOfLines={1}>{item?.title}</Text>
                <Text style={{ color: colors.subtext, fontSize: 13, marginTop: 3 }}>{labelCat(item?.category)}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleShareInvite} style={[S.primaryBtn, { backgroundColor: pal.primary, marginBottom: 10 }]}>
              <MaterialCommunityIcons name="share-variant" size={18} color={colors.bg} />
              <Text style={[S.primaryBtnTxt, { color: colors.bg }]}>Inviter quelqu'un dans le Cercle</Text>
            </TouchableOpacity>
            {otherCircles.length > 0 && (
              <>
                <Text style={[S.fieldLabel, { marginTop: 16 }]}>Copier dans un autre Cercle</Text>
                <View style={{ gap: 8, marginTop: 10 }}>
                  {otherCircles.map((c) => {
                    const cpal = getPaletteForCircle(c);
                    const isSel = shareCircleIds.includes(c.id);
                    return (
                      <TouchableOpacity key={c.id} onPress={() => setShareCircleIds((prev) => isSel ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                        style={[S.circleDestRow, isSel && { backgroundColor: cpal.dim, borderColor: cpal.border }]}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cpal.primary }} />
                        <Text style={{ color: colors.text, fontWeight: "800", flex: 1 }} numberOfLines={1}>{c.name}</Text>
                        <MaterialCommunityIcons name={isSel ? "check-circle" : "circle-outline"} size={20} color={isSel ? cpal.primary : colors.subtext} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {shareCircleIds.length > 0 && (
                  <TouchableOpacity onPress={handleCopyCircles} disabled={sharing} style={[S.secondaryBtn, { marginTop: 10, opacity: sharing ? 0.6 : 1 }]}>
                    {sharing ? <ActivityIndicator color={colors.text} size="small" />
                      : <><MaterialCommunityIcons name="content-copy" size={16} color={colors.text} /><Text style={S.secondaryBtnTxt}>Copier dans {shareCircleIds.length} (s)</Text></>}
                  </TouchableOpacity>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   SCREEN PRINCIPAL
───────────────────────────────────────────── */
const FAB_H = 60;

export default function CircleScreen({ navigation }) {
  const route          = useRoute();
  const { contentMax } = useResponsive?.() || {};
  const insets         = useSafeAreaInsets();
  const tabBarH        = useBottomTabBarHeight();
  const wantedId       = route?.params?.circleId || null;

  const { circles, activeCircle, setActiveCircle, reload: reloadCircles, ready: circlesReady } = useCircles(wantedId);
  const palette = useMemo(() => getPaletteForCircle(activeCircle), [activeCircle]);

  const { members, reload: reloadMembers } = useMembers(activeCircle?.id);
  const { calls, reload: reloadCalls }     = useCalls(activeCircle?.id);

  const [currentUserId, setCurrentUserId] = useState(null);
  useEffect(() => { (async () => { const u = await getUserOrAlert(); if (u) setCurrentUserId(u.id); })(); }, []);

  const isAdmin = !!activeCircle && activeCircle.owner_id === currentUserId;

  const [filters, setFilters]     = useState({ category: "all" });
  const [hasCatCol, setHasCatCol] = useState(true);
  const [tab, setTab]             = useState("feed");

  const { items, loading, refreshing, hasMore, loadMore, refresh, ready: itemsReady } = useItems(activeCircle?.id, filters, {
    hasCategoryColumn: hasCatCol,
    onCategoryMissing: () => { setHasCatCol(false); setFilters({ category: "all" }); },
  });

  /* ── Modales — rationalisées ── */
  const [circleHubOpen,   setCircleHubOpen]   = useState(false);
  const [inviteOpen,      setInviteOpen]       = useState(false);  // ← UN SEUL endroit invite
  const [fabOpen,         setFabOpen]          = useState(false);  // ← 2 choix seulement
  const [quickInvOpen,    setQuickInvOpen]     = useState(false);  // inventaire rapide checklist
  const [addItemOpen,     setAddItemOpen]      = useState(false);  // ajout objet avec photo
  const [waveOpen,        setWaveOpen]         = useState(false);
  const [editingItem,     setEditingItem]      = useState(null);
  const [shareOpen,       setShareOpen]        = useState(false);
  const [shareItem,       setShareItem]        = useState(null);
  const [membersOpen,     setMembersOpen]      = useState(false);
  const [joinCodeOpen,    setJoinCodeOpen]     = useState(false);
  const [circleEditOpen,  setCircleEditOpen]   = useState(false);
  const [circleEditMode,  setCircleEditMode]   = useState("create");
  const [circleNameDraft, setCircleNameDraft]  = useState("");
  const [savingCircle,    setSavingCircle]     = useState(false);
  const [joinCodeDraft,   setJoinCodeDraft]    = useState("");
  const [joiningByCode,   setJoiningByCode]    = useState(false);
  const [showCongrats,    setShowCongrats]     = useState(false);

  const navTo = useCallback((screen, params) => {
    const parent = navigation.getParent?.();
    if (parent?.navigate) parent.navigate(screen, params);
    else navigation.navigate(screen, params);
  }, [navigation]);

  useEffect(() => {
    if (route?.params?.justCreated) {
      setTab("mine"); setShowCongrats(true);
      const t = setTimeout(() => setShowCongrats(false), 4000);
      return () => clearTimeout(t);
    }
  }, [route?.params?.justCreated]);

  useEffect(() => {
    if (route?.params?.refreshKey && activeCircle?.id) refresh?.();
  }, [route?.params?.refreshKey, activeCircle?.id]);

  useFocusEffect(useCallback(() => {
    if (!activeCircle?.id) return;
    reloadCalls(); reloadMembers();
  }, [activeCircle?.id, reloadCalls, reloadMembers]));

  /* ── Agrégation feed ── */
  const memberNameById = useMemo(() => {
    const m = new Map();
    (members || []).forEach((x) => m.set(String(x.user_id), x.public_name || "Membre"));
    return m;
  }, [members]);

  const feedFlat = useMemo(() => {
    const map = new Map();
    for (const it of items || []) {
      const titleKey = normalizeTitleKey(it.title || "");
      if (!titleKey) continue;
      const existing = map.get(titleKey);
      const ownerId  = String(it.owner_id || "");
      if (!existing) {
        const owners = new Map();
        if (ownerId) owners.set(ownerId, { user_id: ownerId, name: memberNameById.get(ownerId) || "Membre" });
        map.set(titleKey, { title: titlePretty(it.title || titleKey), titleKey, category: it.category || "other", owners, lastAt: it.created_at || null, latestItemId: it.id, photo: it.photo || null });
      } else {
        if (ownerId && !existing.owners.has(ownerId)) existing.owners.set(ownerId, { user_id: ownerId, name: memberNameById.get(ownerId) || "Membre" });
        if (it.created_at && (!existing.lastAt || new Date(it.created_at) > new Date(existing.lastAt))) {
          existing.lastAt = it.created_at; existing.category = it.category || existing.category;
          existing.photo = it.photo || existing.photo; existing.latestItemId = it.id;
        }
      }
    }
    return Array.from(map.values()).map((g) => ({
      title: g.title, titleKey: g.titleKey, category: g.category,
      ownersList: Array.from(g.owners.values()), count: g.owners.size,
      lastAt: g.lastAt, latestItemId: g.latestItemId, photo: g.photo,
    })).sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));
  }, [items, memberNameById]);

  /* Feed grille 2 colonnes */
  const feedGrid = useMemo(() => {
    const arr = [...feedFlat];
    if (arr.length % 2 === 1) arr.push({ __empty: true, titleKey: "__empty__" });
    return arr;
  }, [feedFlat]);

  const myItems = useMemo(() => {
    const uid = String(currentUserId || "");
    if (!uid) return [];
    return (items || []).filter((it) => String(it.owner_id) === uid);
  }, [items, currentUserId]);

  const myItemTitles = useMemo(() => myItems.map((it) => it.title).filter(Boolean), [myItems]);

  const openShareForItem = useCallback((item) => { setShareItem(item); setShareOpen(true); }, []);

  /* ── Save item (objet unique avec photo) ── */
  const handleSaveItem = useCallback(async ({ photo, title, description, category, destIds, editItem, isFree, totalCost, period }) => {
    const user = await getUserOrAlert(); if (!user) return;
    try {
      let photoUrl = null;
      if (photo?.uri && !photo.uri.startsWith("http")) { photoUrl = normalizeUrl(await uploadToStorage(photo, STORAGE_BUCKET_ITEMS, user.id)); }
      else if (photo?.uri) photoUrl = photo.uri;
      const extraFields = { description: description || null, is_free: isFree !== false, total_cost: isFree !== false ? null : (totalCost ?? null), period: isFree !== false ? null : (period ?? null) };
      if (editItem) {
        const { error } = await supabase.from("items").update({ title, category, photo: photoUrl ?? editItem.photo ?? null, ...extraFields }).eq("id", editItem.id).eq("owner_id", user.id);
        if (error) throw error;
      } else {
        const rows = (destIds || []).map((cid) => ({ owner_id: user.id, circle_id: String(cid), title, category, photo: photoUrl || null, ...extraFields }));
        const { error } = await supabase.from("items").insert(rows); if (error) throw error;
        try {
          const tokens = await getCircleMemberTokens(destIds[0]);
          const myToken = await getUserToken(user.id);
          const targets = (tokens || []).filter((t) => t && t !== myToken);
          if (targets.length) await sendPush({ to: targets, title: "Nouveau dans le  🌿", body: `${title} vient d'être ajouté`, data: { type: "item_added" } });
        } catch {}
      }
      setEditingItem(null); refresh();
    } catch (e) { Alert.alert("Objet", e?.message || "Ajout impossible."); }
  }, [refresh]);

  /* ── Save inventaire rapide (multi-objets checklist) ── */
  const handleSaveQuickInventory = useCallback(async ({ titles, category, destIds, isFree, priceAmount, pricePeriod }) => {
    const user = await getUserOrAlert(); if (!user) return;
    try {
      const rows = [];
      for (const cid of (destIds || [])) {
        for (const title of (titles || [])) {
          rows.push({ owner_id: user.id, circle_id: String(cid), title, category, photo: null, is_free: isFree !== false, total_cost: isFree !== false ? null : priceAmount, period: isFree !== false ? null : pricePeriod });
        }
      }
      if (!rows.length) return;
      const { error } = await supabase.from("items").insert(rows);
      if (error) throw error;
      try {
        const tokens = await getCircleMemberTokens(destIds[0]);
        const myToken = await getUserToken(user.id);
        const targets = (tokens || []).filter((t) => t && t !== myToken);
        if (targets.length) await sendPush({ to: targets, title: "Inventaire mis à jour 🌿", body: `${titles.length} objet${titles.length > 1 ? "s" : ""} ajouté${titles.length > 1 ? "s" : ""}`, data: { type: "item_added" } });
      } catch {}
      refresh();
      Alert.alert("Ajouté ✓", `${rows.length} objet${rows.length > 1 ? "s" : ""} mis à disposition.`);
    } catch (e) { Alert.alert("Inventaire", e?.message || "Ajout impossible."); }
  }, [refresh]);

  /* ── Save wave ── */
  const handleSaveWave = useCallback(async ({ msg, category }) => {
    const user = await getUserOrAlert(); if (!user || !activeCircle?.id) return;
    try {
      const { error } = await supabase.from("calls").insert({ circle_id: activeCircle.id, author_id: user.id, message: msg, category, status: "open" });
      if (error) throw error;
      try {
        const tokens = await getCircleMemberTokens(activeCircle.id);
        const myToken = await getUserToken(user.id);
        const targets = (tokens || []).filter((t) => t && t !== myToken);
        if (targets.length) await sendPush({ to: targets, title: "Nouvelle onde ", body: msg.slice(0, 80), data: { type: "call_created", circleId: activeCircle.id } });
      } catch {}
      InteractionManager.runAfterInteractions(() => setTimeout(reloadCalls, 150));
    } catch (e) { Alert.alert("Onde", e?.message || "Publication impossible."); }
  }, [activeCircle?.id, reloadCalls]);

  const deleteWave = useCallback(async (c) => {
    const user = await getUserOrAlert(); if (!user || String(c.author_id) !== String(user.id)) { Alert.alert("Onde", "Tu ne peux supprimer que tes ondes."); return; }
    Alert.alert("Supprimer l'onde ?", "", [{ text: "Annuler", style: "cancel" }, { text: "Supprimer", style: "destructive", onPress: async () => { await supabase.from("calls").delete().eq("id", c.id).eq("author_id", user.id); reloadCalls(); } }]);
  }, [reloadCalls]);

  const respondWave = useCallback(async (c) => {
    try {
      await Clipboard.setStringAsync(`Je peux aider ✅ — "${c.message}"`);
      const { data: threadUuid, error } = await supabase.rpc("get_or_create_circle_thread", { p_circle_id: activeCircle.id });
      if (error) throw error;
      navigation.navigate("Thread", { threadId: String(threadUuid), circleId: String(activeCircle.id), title: activeCircle.name || "Messages" });
      Alert.alert("Réponse copiée ✓", "Colle le message dans le chat.");
    } catch { Alert.alert("Erreur", "Impossible d'ouvrir le chat."); }
  }, [activeCircle, navigation]);

  const deleteItem = useCallback(async (item) => {
    const user = await getUserOrAlert(); if (!user || String(item.owner_id) !== String(user.id)) return;
    Alert.alert("Retirer du  ?", "", [{ text: "Annuler", style: "cancel" }, { text: "Retirer", style: "destructive", onPress: async () => { await supabase.from("items").delete().eq("id", item.id).eq("owner_id", user.id); refresh(); } }]);
  }, [refresh]);

  const openChat = useCallback(async () => {
    if (!activeCircle?.id) return;
    try {
      const { data: threadUuid, error } = await supabase.rpc("get_or_create_circle_thread", { p_circle_id: activeCircle.id });
      if (error) throw error;
      navigation.navigate("Thread", { threadId: String(threadUuid), circleId: String(activeCircle.id), title: activeCircle.name || "Messages" });
    } catch (e) { Alert.alert("Chat", e?.message || "Impossible."); }
  }, [activeCircle, navigation]);

  const createCircle = useCallback(async (name) => {
    const user = await getUserOrAlert(); if (!user) return null;
    const clean = String(name || "").trim();
    if (!clean) { Alert.alert("", "Donne un nom."); return null; }
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("create_circle", { p_name: clean });
      const newId = typeof rpcData === "string" ? rpcData : rpcData?.id;
      if (rpcErr || !newId) {
        const { data: inserted, error: insErr } = await supabase.from("circles").insert({ name: clean, owner_id: user.id }).select("id").single();
        if (insErr) throw insErr;
        await reloadCircles(String(inserted.id)); return String(inserted.id);
      }
      await reloadCircles(String(newId)); return String(newId);
    } catch (e) { Alert.alert("", e?.message || "Impossible."); return null; }
  }, [reloadCircles]);

  const renameCircle = useCallback(async (newName) => {
    if (!activeCircle?.id || !isAdmin) return;
    const user = await getUserOrAlert(); if (!user) return;
    const clean = String(newName || "").trim(); if (!clean) return;
    try {
      const { error } = await supabase.from("circles").update({ name: clean }).eq("id", activeCircle.id).eq("owner_id", user.id);
      if (error) throw error;
      setCircleEditOpen(false); await reloadCircles(String(activeCircle.id));
    } catch (e) { Alert.alert("", e?.message || "Impossible."); }
  }, [activeCircle, isAdmin, reloadCircles]);

  const leaveCircle = useCallback(async () => {
    if (!activeCircle?.id) return;
    const user = await getUserOrAlert(); if (!user) return;
    try { await supabase.from("circle_members").delete().eq("circle_id", activeCircle.id).eq("user_id", user.id); setCircleHubOpen(false); await reloadCircles(null); }
    catch { Alert.alert("Cercle", "Impossible de quitter."); }
  }, [activeCircle, reloadCircles]);

  const deleteCircle = useCallback(async () => {
    if (!activeCircle?.id || !isAdmin) return;
    const user = await getUserOrAlert(); if (!user) return;
    try { await supabase.from("circles").delete().eq("id", activeCircle.id).eq("owner_id", user.id); setCircleHubOpen(false); await reloadCircles(null); }
    catch { Alert.alert("", "Suppression impossible."); }
  }, [activeCircle, isAdmin, reloadCircles]);

  const normalizeCode = (raw) => {
    let s = String(raw || "").trim();
    try { s = decodeURIComponent(s); } catch {}
    const mShort = s.match(/([A-Z]{2,10}-[A-Z0-9]{3,6})/i);
    if (mShort?.[1]) return mShort[1].toUpperCase();
    const candidates = s.match(/[A-Za-z0-9_-]{8,}/g) || [];
    if (candidates.length) { candidates.sort((a, b) => b.length - a.length); return candidates[0]; }
    return s.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase();
  };

  const joinByCode = useCallback(async (rawCode) => {
    const user = await getUserOrAlert(); if (!user) return;
    const code = normalizeCode(rawCode);
    if (!code) { Alert.alert("Rejoindre", "Code invalide."); return; }
    setJoiningByCode(true);
    try {
      const { data, error } = await supabase.rpc("join_circle_by_token_or_code_v2", { p_code: code });
      if (error) throw error;
      const circleId = (typeof data === "string" && data) || data?.circle_id || data?.id || null;
      if (!circleId) throw new Error(" introuvable.");
      await reloadCircles(String(circleId)); setJoinCodeOpen(false); setJoinCodeDraft("");
      Alert.alert("Bienvenue ✓", "Tu as rejoint le  !");
    } catch (e) { Alert.alert("Rejoindre", e?.message || "Code incorrect."); }
    finally { setJoiningByCode(false); }
  }, [reloadCircles]);

  /* ── Render ── */
  const renderFeedCard = useCallback(({ item: row }) => {
    if (row?.__empty) return <View style={[S.feedCard, { opacity: 0 }]} pointerEvents="none" />;
    return (
      <FeedCard row={row} palette={palette}
        onPress={() => navTo("ItemDetail", { itemId: row.latestItemId, title: row.title, circleId: activeCircle?.id, titleKey: row.titleKey, ownersList: row.ownersList, count: row.count, category: row.category })}
        onShare={() => openShareForItem({ ...row, circle_id: activeCircle?.id })} />
    );
  }, [navTo, activeCircle?.id, palette, openShareForItem]);

  const pal      = palette;
  const bottomPad = FAB_H + tabBarH + 32;

  /* ─── RENDER ─── */
  return (
    <SafeAreaView style={S.safe} edges={["top", "left", "right"]}>
      <View style={[S.container, contentMax && { alignSelf: "center", width: contentMax }, { paddingBottom: Math.max(12, insets.bottom) }]}>

        {/* ══════════ TOPBAR ══════════
            Cercle selector | Inviter (accent) | Chat
            Filtre retiré ici → dans le feed
            Inviter = 1 seul endroit dans toute l'app */}
        <View style={S.topbar}>
          <TouchableOpacity onPress={() => setCircleHubOpen(true)} style={[S.circleChip, { borderColor: pal.border }]} activeOpacity={0.88}>
            <View style={[S.circleChipDot, { backgroundColor: pal.primary }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={S.circleChipName} numberOfLines={1}>{activeCircle?.name || "Mes s"}</Text>
              <Text style={S.circleChipMeta} numberOfLines={1}>
                {members?.length ? `${members.length} membre${members.length > 1 ? "s" : ""}` : "Appuie pour gérer"}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-down" size={18} color={pal.primary} />
          </TouchableOpacity>
          <View style={S.RC}>
            {/* Inviter — bouton accent, moteur de croissance */}
            {!!activeCircle && (
              <TouchableOpacity onPress={() => setInviteOpen(true)}
                style={[S.topbarBtn, { backgroundColor: pal.dim, borderColor: pal.border, marginRight: 8 }]}>
                <MaterialCommunityIcons name="account-plus-outline" size={18} color={pal.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={openChat} style={S.topbarBtn}>
              <MaterialCommunityIcons name="message-text-outline" size={19} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── AUCUN CERCLE ── */}
        {!activeCircle ? (
          <View style={S.emptyWrap}>
            <View style={S.emptyCard}>
              <View style={[S.emptyIcon, { backgroundColor: pal.dim, borderColor: pal.border }]}>
                <MaterialCommunityIcons name="wardrobe-outline" size={28} color={pal.primary} />
              </View>
              <Text style={S.emptyTitle}>Aucun </Text>
              <Text style={S.emptySub}>Crée ton  collectif ou rejoins celui d'un proche.</Text>
              <TouchableOpacity onPress={() => { setCircleEditMode("create"); setCircleNameDraft(""); setCircleEditOpen(true); }}
                style={[S.primaryBtn, { backgroundColor: pal.primary, marginTop: 20 }]}>
                <Text style={[S.primaryBtnTxt, { color: colors.bg }]}>Créer un </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setJoinCodeOpen(true)} style={[S.secondaryBtn, { marginTop: 10 }]}>
                <MaterialCommunityIcons name="key-outline" size={16} color={colors.text} />
                <Text style={S.secondaryBtnTxt}>J'ai un code d'invitation</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* ── SEGMENTED — 2 onglets clairs ── */}
            <View style={S.segmented}>
              {[
                { k: "feed", label: "Emprunter", icon: "view-dashboard-outline" },
                { k: "mine", label: "Mon inventaire", icon: "package-variant" },
              ].map((t) => (
                <TouchableOpacity key={t.k} onPress={() => setTab(t.k)}
                  style={[S.segBtn, tab === t.k && [S.segBtnActive, { borderColor: pal.border, backgroundColor: pal.dim }]]}
                  activeOpacity={0.88}>
                  <MaterialCommunityIcons name={t.icon} size={15} color={tab === t.k ? pal.primary : colors.subtext} />
                  <Text style={[S.segTxt, tab === t.k && { color: pal.primary }]}>{t.label}</Text>
                  {t.k === "mine" && myItems.length > 0 && (
                    <View style={[S.segBadge, { backgroundColor: pal.dim, borderColor: pal.border }]}>
                      <Text style={[S.segBadgeTxt, { color: pal.primary }]}>{myItems.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* ════ TAB : LE VESTIAIRE ════
                Hiérarchie : ondes (si présentes, compactes) → filtre cats → objets
                Pas de stats ici. Dense, direct, efficace. */}
            {tab === "feed" && (
              <FlatList
                data={feedGrid}
                keyExtractor={(r, i) => r.__empty ? `empty-${i}` : `feed-${r.titleKey}`}
                numColumns={2}
                columnWrapperStyle={{ gap: 12 }}
                contentContainerStyle={{ paddingTop: 10, paddingBottom: bottomPad, gap: 12 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={pal.primary} />}
                onEndReached={loadMore} onEndReachedThreshold={0.4}
                ListHeaderComponent={
                  <View>
                    {/* Ondes — compactes, pas dominantes */}
                    {!!(calls || []).length && (
                      <View style={S.wavesBlock}>
                        <View style={[S.RC, { gap: 8, marginBottom: 10 }]}>
                          <View style={[S.sectionDot, { backgroundColor: pal.primary }]} />
                          <Text style={S.sectionTitle}>Demandes en cours</Text>
                          <View style={[S.sectionBadge, { backgroundColor: pal.dim, borderColor: pal.border }]}>
                            <Text style={[S.sectionBadgeTxt, { color: pal.primary }]}>{calls.length}</Text>
                          </View>
                        </View>
                        {(calls || []).slice(0, 3).map((c) => (
                          <WaveRow key={String(c.id)} c={c} palette={pal}
                            isMine={String(c.author_id) === String(currentUserId)}
                            onRespond={() => respondWave(c)}
                            onDelete={() => deleteWave(c)} />
                        ))}
                      </View>
                    )}

                    {/* Filtre catégories — compact, horizontal, direct */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingBottom: 12, paddingTop: 2 }}>
                      {CATEGORIES.map((c) => {
                        const active = filters.category === c.key;
                        return (
                          <TouchableOpacity key={c.key} onPress={() => setFilters({ category: c.key })}
                            style={[S.catChip, active && { backgroundColor: pal.dim, borderColor: pal.border }]}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.dot }} />
                            <Text style={[S.catChipTxt, active && { color: pal.primary }]}>{c.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    {feedFlat.length > 0 && (
                      <View style={[S.RC, { marginBottom: 8 }]}>
                        <View style={[S.sectionDot, { backgroundColor: pal.primary }]} />
                        <Text style={[S.sectionTitle, { marginLeft: 8 }]}>
                          {feedFlat.length} objet{feedFlat.length > 1 ? "s" : ""} disponibles
                        </Text>
                      </View>
                    )}
                  </View>
                }
                renderItem={renderFeedCard}
                ListEmptyComponent={
                  itemsReady && !loading ? (
                    <EmptyFeedState palette={pal} membersCount={members?.length || 0}
                      onAddItem={() => setQuickInvOpen(true)}
                      onInvite={() => setInviteOpen(true)} />
                  ) : loading ? (
                    <View style={{ alignItems: "center", padding: 32 }}><ActivityIndicator color={pal.primary} /></View>
                  ) : null
                }
              />
            )}

            {/* ════ TAB : CE QUE JE PRÊTE ════ */}
            {tab === "mine" && (
              <FlatList
                data={myItems}
                keyExtractor={(it) => `mine-${it.id}`}
                contentContainerStyle={{ paddingTop: 10, paddingBottom: bottomPad, gap: 10 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={pal.primary} />}
                renderItem={({ item }) => (
                  <InventoryCard item={item} palette={pal}
                    onEdit={() => { setEditingItem(item); setAddItemOpen(true); }}
                    onShare={() => openShareForItem(item)} />
                )}
                ListEmptyComponent={
                  itemsReady && !loading ? (
                    route?.params?.justCreated ? (
                      <View style={{ alignItems: "center", padding: 32 }}>
                        <ActivityIndicator color={pal.primary} size="large" />
                        <Text style={{ color: colors.subtext, marginTop: 12 }}>Chargement…</Text>
                      </View>
                    ) : (
                      <View style={S.emptyWrap}>
                        <View style={S.emptyCard}>
                          <MaterialCommunityIcons name="package-variant-closed" size={28} color={pal.primary} />
                          <Text style={S.emptyTitle}>Tu ne prêtes encore rien</Text>
                          <Text style={S.emptySub}>Partage ce que tu possèdes avec ton .</Text>
                          <TouchableOpacity onPress={() => setQuickInvOpen(true)}
                            style={[S.primaryBtn, { backgroundColor: pal.primary, marginTop: 20 }]}>
                            <MaterialCommunityIcons name="lightning-bolt" size={18} color={colors.bg} />
                            <Text style={[S.primaryBtnTxt, { color: colors.bg }]}>Mettre à jour mon inventaire</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )
                  ) : null
                }
              />
            )}

            {/* ── FAB — 2 choix, pas plus ── */}
            <View pointerEvents="box-none" style={[S.fabWrap, { bottom: Math.max(16, insets.bottom + tabBarH + 16) }]}>
              <TouchableOpacity onPress={() => setFabOpen(true)} style={[S.fabBtn, { backgroundColor: pal.primary }]}>
                <MaterialCommunityIcons name="plus" size={26} color={colors.bg} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ══════════ MODALES ══════════ */}

        {/* FAB — 2 choix seulement : inventaire rapide | onde */}
        <Modal visible={fabOpen} transparent animationType="fade" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={() => setFabOpen(false)}>
          <View style={S.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setFabOpen(false)}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
            <View style={[S.dropSheet, { paddingBottom: Math.max(16, insets.bottom) }]}>
              <Text style={S.dropTitle}>Que veux-tu faire ?</Text>
              {[
                {
                  icon: "lightning-bolt",
                  label: "Mettre à jour mon inventaire",
                  sub: "Coche des objets à prêter par catégorie",
                  action: () => { setFabOpen(false); setQuickInvOpen(true); },
                },
                {
                  icon: "bullhorn-outline",
                  label: "Lancer une onde",
                  sub: "Demander quelque chose au ",
                  action: () => { setFabOpen(false); setWaveOpen(true); },
                },
              ].map((it, i) => (
                <TouchableOpacity key={i} onPress={it.action} style={[S.dropItem, { paddingVertical: 16 }]} activeOpacity={0.85}>
                  <View style={[S.dropItemIcon, { backgroundColor: pal.dim, borderColor: pal.border, width: 44, height: 44, borderRadius: 14 }]}>
                    <MaterialCommunityIcons name={it.icon} size={22} color={pal.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[S.dropItemTxt, { marginBottom: 2 }]}>{it.label}</Text>
                    <Text style={{ color: colors.subtext, fontSize: 12 }}>{it.sub}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.subtext} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>

        {/* Hub cercle — gestion uniquement, pas d'invite ici */}
        <Modal visible={circleHubOpen} transparent animationType="fade" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={() => setCircleHubOpen(false)}>
          <View style={S.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setCircleHubOpen(false)}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
            <View style={[S.dropSheet, { paddingBottom: Math.max(16, insets.bottom) }]}>
              <Text style={S.dropTitle}>Mes s</Text>
              <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                {(circles || []).map((c) => {
                  const cpal = getPaletteForCircle(c);
                  const isSel = activeCircle?.id === c.id;
                  return (
                    <TouchableOpacity key={String(c.id)} onPress={() => { setActiveCircle(c); setCircleHubOpen(false); setFilters({ category: "all" }); setTimeout(() => { refresh(); reloadCalls(); reloadMembers(); }, 80); }}
                      style={[S.dropItem, isSel && { backgroundColor: cpal.dim }]} activeOpacity={0.85}>
                      <View style={[S.circleListDot, { backgroundColor: cpal.primary }]} />
                      <Text style={[S.dropItemTxt, isSel && { color: cpal.primary }]} numberOfLines={1}>{c.name || ` ${c.id}`}</Text>
                      {isSel && <MaterialCommunityIcons name="check" size={16} color={cpal.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={S.hr} />
              {[
                { icon: "account-multiple", label: "Voir les membres",        action: () => { setCircleHubOpen(false); setMembersOpen(true); } },
                { icon: "key-outline",      label: "J'ai un code d'invitation", action: () => { setCircleHubOpen(false); setJoinCodeOpen(true); } },
              ].map((item, i) => (
                <TouchableOpacity key={i} onPress={item.action} style={S.dropItem} activeOpacity={0.85}>
                  <View style={[S.dropItemIcon, { backgroundColor: pal.dim, borderColor: pal.border }]}>
                    <MaterialCommunityIcons name={item.icon} size={16} color={pal.primary} />
                  </View>
                  <Text style={S.dropItemTxt}>{item.label}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={16} color={colors.subtext} />
                </TouchableOpacity>
              ))}
              {isAdmin && (
                <>
                  <TouchableOpacity onPress={() => { setCircleHubOpen(false); setCircleEditMode("rename"); setCircleNameDraft(activeCircle?.name || ""); setCircleEditOpen(true); }} style={S.dropItem} activeOpacity={0.85}>
                    <View style={[S.dropItemIcon, { backgroundColor: pal.dim, borderColor: pal.border }]}>
                      <MaterialCommunityIcons name="pencil-outline" size={16} color={pal.primary} />
                    </View>
                    <Text style={S.dropItemTxt}>Renommer le Cercle</Text>
                    <MaterialCommunityIcons name="chevron-right" size={16} color={colors.subtext} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setCircleHubOpen(false); Alert.alert("Supprimer le  ?", "Action irréversible.", [{ text: "Annuler", style: "cancel" }, { text: "Supprimer", style: "destructive", onPress: deleteCircle }]); }}
                    style={[S.dropItem, { backgroundColor: colors.dangerDim }]} activeOpacity={0.85}>
                    <View style={[S.dropItemIcon, { backgroundColor: "rgba(255,90,90,0.15)" }]}>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.danger} />
                    </View>
                    <Text style={[S.dropItemTxt, { color: colors.danger }]}>Supprimer le </Text>
                  </TouchableOpacity>
                </>
              )}
              {!isAdmin && (
                <TouchableOpacity onPress={() => { setCircleHubOpen(false); Alert.alert("Quitter ?", "", [{ text: "Annuler", style: "cancel" }, { text: "Quitter", style: "destructive", onPress: leaveCircle }]); }} style={S.dropItem} activeOpacity={0.85}>
                  <View style={[S.dropItemIcon, { backgroundColor: colors.card }]}>
                    <MaterialCommunityIcons name="logout" size={16} color={colors.text} />
                  </View>
                  <Text style={S.dropItemTxt}>Quitter le </Text>
                </TouchableOpacity>
              )}
              <View style={S.hr} />
              <TouchableOpacity onPress={() => { setCircleHubOpen(false); setCircleEditMode("create"); setCircleNameDraft(""); setCircleEditOpen(true); }}
                style={[S.primaryBtn, { backgroundColor: pal.primary }]}>
                <Text style={[S.primaryBtnTxt, { color: colors.bg }]}>+ Nouveau </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Invitation — UN SEUL endroit dans toute l'app */}
        <InviteModal visible={inviteOpen} onClose={() => setInviteOpen(false)}
          circle={activeCircle} myItems={myItems} palette={pal} />

        {/* Rejoindre par code */}
        <Modal visible={joinCodeOpen} transparent animationType="slide" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={() => setJoinCodeOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={S.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setJoinCodeOpen(false)}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
            <View style={[S.dropSheet, { paddingBottom: Math.max(16, insets.bottom) }]}>
              <Text style={S.dropTitle}>J'ai un code d'invitation</Text>
              <Text style={{ color: colors.subtext, fontSize: 13, marginBottom: 14 }}>Colle le code reçu par SMS ou message.</Text>
              <TouchableOpacity onPress={async () => { try { const c = await Clipboard.getStringAsync(); if (c) setJoinCodeDraft(c); } catch {} }} style={[S.secondaryBtn, { marginBottom: 10 }]}>
                <MaterialCommunityIcons name="content-paste" size={16} color={colors.text} />
                <Text style={S.secondaryBtnTxt}>Coller depuis le presse-papier</Text>
              </TouchableOpacity>
              <TextInput value={joinCodeDraft} onChangeText={(v) => setJoinCodeDraft(v.toUpperCase())} placeholder="FAMILLE-7K2X…"
                placeholderTextColor={colors.subtext} style={[S.input, { letterSpacing: 2, fontWeight: "800" }]} autoCapitalize="characters" autoCorrect={false} />
              <TouchableOpacity onPress={() => joinByCode(joinCodeDraft)} disabled={joiningByCode}
                style={[S.primaryBtn, { backgroundColor: pal.primary, marginTop: 14, opacity: joiningByCode ? 0.7 : 1 }]}>
                {joiningByCode ? <ActivityIndicator color={colors.bg} /> : <Text style={[S.primaryBtnTxt, { color: colors.bg }]}>Rejoindre</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Membres */}
        <Modal visible={membersOpen} transparent animationType="fade" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={() => setMembersOpen(false)}>
          <View style={S.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setMembersOpen(false)}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
            <View style={[S.dropSheet, { paddingBottom: Math.max(16, insets.bottom) }]}>
              <View style={[S.RC, { justifyContent: "space-between" }]}>
                <Text style={S.dropTitle}>Membres</Text>
                <TouchableOpacity onPress={() => { setMembersOpen(false); setInviteOpen(true); }}>
                  <Text style={{ color: pal.primary, fontWeight: "700", fontSize: 13 }}>+ Inviter</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                {(members || []).map((m) => (
                  <View key={m.user_id} style={[S.dropItem, { paddingVertical: 12 }]}>
                    <View style={[S.memberAvatar, { backgroundColor: pal.dim }]}>
                      <Text style={{ color: pal.primary, fontWeight: "900", fontSize: 12 }}>{initialsFromName(m.public_name)}</Text>
                    </View>
                    <Text style={S.dropItemTxt} numberOfLines={1}>{m.public_name}</Text>
                    {m.user_id === activeCircle?.owner_id && (
                      <View style={[S.adminBadge, { backgroundColor: pal.dim, borderColor: pal.border }]}>
                        <Text style={{ color: pal.primary, fontSize: 10, fontWeight: "800" }}>Admin</Text>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Créer / Renommer vestiaire */}
        <Modal visible={circleEditOpen} transparent animationType="slide" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={() => setCircleEditOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={S.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setCircleEditOpen(false)}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
            <View style={[S.dropSheet, { paddingBottom: Math.max(16, insets.bottom) }]}>
              <Text style={S.dropTitle}>{circleEditMode === "create" ? "Nouveau " : "Renommer"}</Text>
              <Text style={{ color: colors.subtext, fontSize: 13, marginBottom: 14 }}>
                {circleEditMode === "create" ? "Famille, amis, voisins… donne-lui un nom." : "Nouveau nom pour ce ."}
              </Text>
              <TextInput value={circleNameDraft} onChangeText={setCircleNameDraft} placeholder="Ex : Famille Martin, Les Voisins" placeholderTextColor={colors.subtext}
                style={[S.input, { marginBottom: 14 }]} returnKeyType="done" autoFocus />
              <TouchableOpacity disabled={savingCircle} onPress={async () => {
                setSavingCircle(true);
                try {
                  if (circleEditMode === "create") { const id = await createCircle(circleNameDraft); if (id) { setCircleEditOpen(false); setShowCongrats(true); setTimeout(() => setShowCongrats(false), 3500); } }
                  else await renameCircle(circleNameDraft);
                } finally { setSavingCircle(false); }
              }} style={[S.primaryBtn, { backgroundColor: pal.primary, opacity: savingCircle ? 0.7 : 1 }]}>
                {savingCircle ? <ActivityIndicator color={colors.bg} /> : <Text style={[S.primaryBtnTxt, { color: colors.bg }]}>{circleEditMode === "create" ? "Créer" : "Renommer"}</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Congrats — invite immédiatement après création */}
        <Modal visible={showCongrats} transparent animationType="fade">
          <View style={[S.modalOverlay, { justifyContent: "center", alignItems: "center" }]}>
            <View style={[S.dropSheet, { width: 290, alignItems: "center", borderRadius: 24, borderColor: pal.border }]}>
              <View style={[S.emptyIcon, { backgroundColor: pal.dim, borderColor: pal.border }]}>
                <MaterialCommunityIcons name="check-circle" size={28} color={pal.primary} />
              </View>
              <Text style={[S.dropTitle, { textAlign: "center", marginTop: 12 }]}> créé ✓</Text>
              <Text style={{ color: colors.subtext, textAlign: "center", fontSize: 13, lineHeight: 19, marginBottom: 16 }}>
                Invite maintenant tes proches pour commencer à partager.
              </Text>
              <TouchableOpacity onPress={() => { setShowCongrats(false); setInviteOpen(true); }}
                style={[S.primaryBtn, { backgroundColor: pal.primary, width: "100%" }]}>
                <MaterialCommunityIcons name="account-plus-outline" size={18} color={colors.bg} />
                <Text style={[S.primaryBtnTxt, { color: colors.bg }]}>Inviter mes proches</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowCongrats(false)} style={[S.ghostBtn, { marginTop: 4 }]}>
                <Text style={S.ghostBtnTxt}>Plus tard</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Inventaire rapide — checklist ultra-fluide */}
        <QuickInventorySheet visible={quickInvOpen} onClose={() => setQuickInvOpen(false)}
          onSave={handleSaveQuickInventory} circles={circles} activeCircleId={activeCircle?.id}
          palette={pal} existingTitles={myItemTitles} />

        {/* Ajout objet photo (depuis "Modifier" dans onglet mine) */}
        <AddItemModal visible={addItemOpen} onClose={() => { setAddItemOpen(false); setEditingItem(null); }}
          onSave={handleSaveItem} circles={circles} activeCircleId={activeCircle?.id} palette={pal} editItem={editingItem} />

        {/* Onde */}
        <WaveModal visible={waveOpen} onClose={() => setWaveOpen(false)} onSave={handleSaveWave} palette={pal} />

        {/* Partage objet */}
        <ShareItemModal visible={shareOpen} onClose={() => { setShareOpen(false); setShareItem(null); }}
          item={shareItem} circles={circles} activeCircle={activeCircle} myItems={myItems} palette={pal} currentUserId={currentUserId} />

      </View>
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────
   STYLES
───────────────────────────────────────────── */
const RC = { flexDirection: "row", alignItems: "center" };
const CC = { alignItems: "center", justifyContent: "center" };
const CARD_BASE = { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.stroke };

const S = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, paddingHorizontal: 14 },
  RC:        { flexDirection: "row", alignItems: "center" },

  /* Topbar */
  topbar:         { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, paddingBottom: 8, gap: 10 },
  circleChip:     { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, ...CARD_BASE },
  circleChipDot:  { width: 10, height: 10, borderRadius: 5 },
  circleChipName: { color: colors.text, fontWeight: "900", fontSize: 16 },
  circleChipMeta: { color: colors.subtext, fontSize: 12, marginTop: 1 },
  topbarBtn:      { width: 40, height: 40, borderRadius: 13, ...CC, ...CARD_BASE, borderWidth: 1 },

  /* Segmented */
  segmented:    { flexDirection: "row", gap: 8, marginVertical: 10 },
  segBtn:       { flex: 1, height: 40, borderRadius: 999, borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  segBtnActive: {},
  segTxt:       { color: colors.subtext, fontWeight: "800", fontSize: 13 },
  segBadge:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1, marginLeft: 2 },
  segBadgeTxt:  { fontSize: 10, fontWeight: "900" },

  /* Feed */
  feedCard: { flex: 1, minWidth: 0, borderRadius: 18, overflow: "hidden", ...CARD_BASE },

  /* Ondes compactes */
  wavesBlock: { borderRadius: 16, padding: 12, marginBottom: 12, ...CARD_BASE },
  waveRow:    { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.stroke, borderLeftWidth: 2, paddingLeft: 10, marginLeft: -2 },
  waveAvatar: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  waveCta:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  waveCtaTxt: { fontSize: 12, fontWeight: "900" },

  /* Section labels */
  sectionDot:     { width: 8, height: 8, borderRadius: 4 },
  sectionTitle:   { color: colors.text, fontWeight: "900", fontSize: 15 },
  sectionBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, marginLeft: 4 },
  sectionBadgeTxt:{ fontSize: 11, fontWeight: "900" },

  /* Inventory card */
  invCard:    { flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 14, ...CARD_BASE },
  iconBtn:    { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  editPill:   { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  editPillTxt:{ fontWeight: "900", fontSize: 12 },

  /* Empty */
  emptyWrap:  { alignItems: "center", paddingVertical: 32 },
  emptyCard:  { width: "100%", borderRadius: 20, padding: 24, alignItems: "center", ...CARD_BASE },
  emptyIcon:  { width: 56, height: 56, borderRadius: 18, ...CC, borderWidth: 1, marginBottom: 4 },
  emptyTitle: { color: colors.text, fontWeight: "900", fontSize: 18, marginTop: 12 },
  emptySub:   { color: colors.subtext, fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 20 },

  /* FAB */
  fabWrap: { position: "absolute", right: 16, zIndex: 99 },
  fabBtn:  { width: FAB_H, height: FAB_H, borderRadius: FAB_H / 2, ...CC, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },

  /* Modales */
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  dropSheet:    { backgroundColor: colors.bg, paddingTop: 20, paddingHorizontal: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: colors.stroke, gap: 4 },
  dropTitle:    { color: colors.text, fontWeight: "900", fontSize: 18, marginBottom: 10 },
  dropItem:     { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12 },
  dropItemIcon: { width: 34, height: 34, borderRadius: 11, ...CC, borderWidth: 1 },
  dropItemTxt:  { color: colors.text, fontWeight: "700", flex: 1, fontSize: 15 },
  circleListDot:{ width: 10, height: 10, borderRadius: 5 },

  /* Invite sheet */
  inviteSheet:  { backgroundColor: colors.bg, padding: 24, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.stroke },
  codeBlock:    { alignSelf: "stretch", paddingHorizontal: 20, paddingVertical: 16, borderRadius: 16, borderWidth: 1, alignItems: "center" },
  codeTxt:      { fontWeight: "900", fontSize: 26, letterSpacing: 3 },

  /* Add sheet */
  addSheet:       { backgroundColor: colors.bg, paddingTop: 20, paddingHorizontal: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: colors.stroke },
  addSheetTitle:  { color: colors.text, fontWeight: "900", fontSize: 18 },
  addSheetFooter: { paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.stroke, paddingBottom: 6 },
  waveIcon:       { width: 38, height: 38, borderRadius: 12, ...CC, borderWidth: 1 },

  /* Quick inventory */
  catTile: { width: "47%", borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, overflow: "hidden", alignItems: "flex-start", justifyContent: "center", minHeight: 72 },
  catTileTxt: { color: colors.text, fontWeight: "800", fontSize: 13 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.card, marginBottom: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.stroke, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  checkRowTxt: { color: colors.text, fontWeight: "700", fontSize: 14, flex: 1 },
  customRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: colors.stroke, marginTop: 4 },
  selBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  priceOption: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.card, marginBottom: 10 },
  priceOptionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  /* Photo */
  photoPreview:    { width: "100%", height: 200, borderRadius: 16, overflow: "hidden", marginBottom: 16, backgroundColor: colors.card },
  photoPlaceholder:{ width: "100%", height: 140, borderRadius: 16, ...CC, gap: 8, borderWidth: 1.5, borderStyle: "dashed", marginBottom: 16 },
  changePhotoBtn:  { position: "absolute", top: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  cameraBtn:       { width: 200, height: 200, borderRadius: 24, ...CC, gap: 10, borderWidth: 1.5, borderStyle: "dashed" },
  cameraBtnTxt:    { fontWeight: "900", fontSize: 16 },

  /* Chips */
  catChip:    { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, height: 34, borderRadius: 999, borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.card },
  catChipTxt: { color: colors.text, fontWeight: "700", fontSize: 13 },

  /* Circle dest */
  circleDestRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.card, marginBottom: 8 },

  /* Buttons */
  primaryBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 50, borderRadius: 14, paddingHorizontal: 16 },
  primaryBtnTxt: { fontWeight: "900", fontSize: 15 },
  secondaryBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 46, borderRadius: 14, paddingHorizontal: 16, ...CARD_BASE },
  secondaryBtnTxt: { color: colors.text, fontWeight: "800", fontSize: 14 },
  ghostBtn:      { alignItems: "center", justifyContent: "center", height: 40, borderRadius: 12 },
  ghostBtnTxt:   { color: colors.subtext, fontWeight: "700", fontSize: 13 },

  /* Inputs */
  input:      { backgroundColor: colors.card, color: colors.text, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: colors.stroke, fontSize: 15 },
  fieldLabel: { color: colors.subtext, fontWeight: "700", fontSize: 13, marginTop: 16, marginBottom: 4 },

  /* Members */
  memberAvatar: { width: 36, height: 36, borderRadius: 12, ...CC },
  adminBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },

  /* Misc */
  hr:        { height: 1, backgroundColor: colors.stroke, marginVertical: 10 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.stroke },
});