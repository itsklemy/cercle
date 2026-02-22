import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Platform,
  Alert,
  StyleSheet,
  Image,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Linking,
  AppState,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sendPush } from "../notifications/pushClient";
import { getCircleMemberTokens, getUserToken } from "../notifications/pushTargets";
import * as ImagePicker from "expo-image-picker";
import * as Contacts from "expo-contacts";
import * as FileSystem from "expo-file-system";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { InteractionManager } from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import Constants from "expo-constants";
import * as ExpoLinking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import { Share } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable } from "react-native"; // en haut si pas déjà





import { supabase } from "../lib/supabase";
import { Log } from "../lib/remoteLogger";
import { useResponsive } from "../hooks/useResponsive";
import { colors as themeColors } from "../theme/colors";


/***********************
 * Couleurs (fallback)
 ***********************/
const C0 = themeColors || {};
const colors = {
  bg: C0.bg ?? "#0B0E14",
  card: C0.card ?? "rgba(255,255,255,0.04)",
  text: C0.text ?? "#F3F4F6",
  subtext: C0.subtext ?? "#9AA3B2",
  stroke: C0.stroke ?? "rgba(255,255,255,0.08)",
  mint: C0.mint ?? "#1DFFC2",
};


/***********************
 * Constantes
 ***********************/
const PAGE_SIZE = 20;
const CALL_TTL_HOURS = 7;
const STORAGE_BUCKET_ITEMS = "items";
const STORAGE_BUCKET_CALLS = "calls";

const CATEGORIES = [
  { key: "all", label: "Toutes", dot: "#9AA3B2" },
  { key: "maison", label: "Maison", dot: "#D1D5DB" },
  { key: "jardin", label: "Jardin", dot: "#34D399" },
  { key: "cuisine", label: "Cuisine", dot: "#F59E0B" },
  { key: "recette", label: "Recette", dot: "#FBBF24" },
  { key: "sport", label: "Sport", dot: "#60A5FA" },
  { key: "vehicule", label: "Véhicule", dot: "#5FC8FF" },
  { key: "abonnements", label: "Abonnements", dot: "#AD8CFF" },
  { key: "utilitaire", label: "Utilitaire", dot: "#9CA3AF" },
  { key: "chantiers", label: "Chantiers", dot: "#A78BFA" },
  { key: "bricolage", label: "Bricolage", dot: "#FFB648" },
  { key: "service", label: "Service", dot: "#22D3EE" },
  { key: "entretien", label: "Entretien", dot: "#10B981" },
  { key: "travail", label: "Travail", dot: "#F472B6" },
  { key: "animaux", label: "Animaux", dot: "#F87171" },
  { key: "plantes", label: "Plantes", dot: "#86EFAC" },
  { key: "dons", label: "Dons", dot: "#6EE7B7" },
  { key: "other", label: "Autre", dot: "#6EE7B7" },
];

const POP = {
  mint:   "#1DFFC2",
  sky:    "#85CCFF",
  pink:   "#FF4FD8",
  peach:  "#FFB5B3",
  lemon:  "#FFE66D",
  purple: "#AD8CFF",
};

const CATEGORY_DA = {
  maison:      { a: POP.peach,  b: POP.lemon,  icon: "home-variant-outline" },
  jardin:      { a: POP.mint,   b: POP.sky,    icon: "flower-outline" },
  cuisine:     { a: POP.lemon,  b: POP.peach,  icon: "silverware-fork-knife" },
  recette:     { a: POP.pink,   b: POP.peach,  icon: "chef-hat" },
  sport:       { a: POP.sky,    b: POP.mint,   icon: "basketball" },
  vehicule:    { a: POP.sky,    b: POP.purple, icon: "car-outline" },
  utilitaire:  { a: POP.mint,   b: POP.purple, icon: "tools" },
  bricolage:   { a: POP.lemon,  b: POP.purple, icon: "hammer-screwdriver" },
  chantiers:   { a: POP.purple, b: POP.sky,    icon: "hammer-wrench" },
  service:     { a: POP.mint,   b: POP.peach,  icon: "handshake-outline" },
  entretien:   { a: POP.mint,   b: POP.lemon,  icon: "spray-bottle" },
  travail:     { a: POP.pink,   b: POP.sky,    icon: "briefcase-outline" },
  animaux:     { a: POP.peach,  b: POP.pink,   icon: "paw-outline" },
  plantes:     { a: POP.mint,   b: POP.lemon,  icon: "leaf" },
  dons:        { a: POP.mint,   b: POP.peach,  icon: "gift-outline" },
  abonnements: { a: POP.purple, b: POP.pink,   icon: "credit-card-outline" },
  other:       { a: POP.sky,    b: POP.peach,  icon: "shape-outline" },
};

const daForCat = (catKey) =>
  CATEGORY_DA[String(catKey || "other")] || CATEGORY_DA.other;





const IDEA_PRESETS = [
  {
    key: "sport_soir",
    label: "Sport ce soir",
    categories: ["sport"],
    keywords: ["ballon", "raquette", "yoga", "haltère", "tapis", "vélo", "match"],
  },
  {
    key: "bricolage_minute",
    label: "Bricolage minute",
    categories: ["bricolage", "chantiers", "utilitaire"],
    keywords: ["perceuse", "visseuse", "marteau", "tournevis", "mètre", "escabeau", "boîte"],
  },
  {
    key: "weekend_dehors",
    label: "Week-end dehors",
    categories: ["jardin", "sport", "utilitaire"],
    keywords: ["tente", "glacière", "chaise", "sac", "randonnée", "camping", "barbecue"],
  },
  {
    key: "invites_maison",
    label: "Invités à la maison",
    categories: ["maison", "cuisine", "recette"],
    keywords: ["raclette", "plancha", "mixeur", "robot", "table", "chaises", "verres"],
  },
];

const catMeta = (k) => CATEGORIES.find((c) => c.key === k) || CATEGORIES[0];
const labelCat = (k) => catMeta(k).label;

const isoHoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
const fmt = (iso) => {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "—";
  }
};
const normalizeTitleKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[’']/g, "'");

const titlePretty = (s) => {
  try {
    const t = String(s || "").trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  } catch {
    return String(s || "");
  }
};




/***********************
 * Auth helper
 ***********************/
async function getUserOrAlert() {
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;
  if (error) {
    Alert.alert("Auth", "Erreur utilisateur");
    return null;
  }
  if (!user) {
    Alert.alert("Auth", "Connecte-toi d’abord.");
    return null;
  }
  return user;
}

/***********************
 * base64 -> Uint8Array
 ***********************/
function decodeBase64ToUint8Array(b64) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = String(b64 || "").replace(/[^A-Za-z0-9+/=]/g, "");
  const bytes = [];
  let i = 0;

  while (i < clean.length) {
    const enc1 = alphabet.indexOf(clean[i++]);
    const enc2 = alphabet.indexOf(clean[i++]);
    const enc3 = alphabet.indexOf(clean[i++]);
    const enc4 = alphabet.indexOf(clean[i++]);

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    bytes.push(chr1);
    if (enc3 !== 64 && enc3 !== -1) bytes.push(chr2);
    if (enc4 !== 64 && enc4 !== -1) bytes.push(chr3);
  }
  return new Uint8Array(bytes);
}

const normalizeUrl = (u) => {
  if (!u) return null;
  const s = String(u).trim().replace(/\s+/g, "");
  // garde file:// ou autres schémas si besoin
  if (!/^https?:\/\//i.test(s)) return s;
  try {
    return s
      .replace(/^https?:\/\/+/, (m) => m.slice(0, m.indexOf("//") + 2))
      .replace(/([^:])\/{2,}/g, "$1/");
  } catch {
    return s;
  }
};

const onImgError = (label, id, uri, e) => {
  console.log(`[IMG ERROR] ${label} id=${id} uri=${uri}`, e?.nativeEvent);
};

const getInviteLinkForEnv = (codeOrUrl) => {
  const raw = String(codeOrUrl || "").trim();
  if (!raw) return null;

  // Si on a déjà un URL, on tente d'extraire le code comme tu fais
  let code = raw;

  try {
    if (raw.includes("/invite/")) {
      code = raw.split("/invite/")[1]?.split(/[?#]/)[0]?.trim() || raw;
    } else if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      const seg = (u.pathname || "").split("/").filter(Boolean);
      code = (seg[seg.length - 1] || "").trim();
    }
  } catch {}

  // En DEV (Expo Go), on génère un lien entrant Expo fiable
  if (__DEV__) {
    // exp://.../--/invite/<code>
    return ExpoLinking.createURL(`invite/${code}`);
  }

  // En PROD, tu peux garder ton lien web
  return `https://cercle.app/invite/${code}`;
};

async function getOrCreateCircleInviteCode(circleId) {
  const user = await getUserOrAlert();
  if (!user) return null;

  // 1) Essayer de récupérer un code existant
  const existing = await supabase
    .from("circle_invites")                 // ✅ BON NOM
    .select("code, created_at")
    .eq("circle_id", circleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing.error && existing.data?.code) return String(existing.data.code);

  // 2) Sinon créer
  const code = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 24);

  const ins = await supabase
    .from("circle_invites")                 // ✅ BON NOM
    .insert({
      circle_id: circleId,
      code,
      invited_by: user.id,                   // ✅ OBLIGATOIRE (NOT NULL)
    })
    .select("code")
    .single();

  if (ins.error) {
    Alert.alert("Invitation", ins.error.message || "Impossible de créer une invitation.");
    return null;
  }

  return String(ins.data.code);
}



/***********************
 * Storage upload (Expo Go)
 ***********************/
async function uploadToStorage(asset, bucket, userId) {
  if (!asset?.uri) return null;

  let contentType = asset.mime || "image/jpeg";
  const pathBase = `public/${userId}/${Date.now()}`;
  let body = null;

  try {
    if (asset.base64) {
      const bytes = decodeBase64ToUint8Array(asset.base64);
      body = bytes.buffer;
    } else {
      const uri = String(asset.uri || "");
      const isLocal =
        uri.startsWith("file://") ||
        (!uri.startsWith("http://") && !uri.startsWith("https://"));
      if (isLocal) {
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists) throw new Error("Fichier introuvable");
        const guess = (uri.split(".").pop() || "").toLowerCase();
        if (!asset.mime) {
          contentType =
            guess === "png" ? "image/png" : guess === "webp" ? "image/webp" : "image/jpeg";
        }
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const bytes = decodeBase64ToUint8Array(base64);
        body = bytes.buffer;
      } else {
        const resp = await fetch(uri);
        const b = await resp.blob();
        contentType = b.type || contentType;
        body = b;
      }
    }

    const ext = contentType.split("/")[1] || "jpg";
    const path = `${pathBase}.${ext}`;

    const { error: upErr } = await supabase.storage.from(bucket).upload(path, body, {
      upsert: true,
      contentType,
      cacheControl: "3600",
    });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    let finalUrl = pub?.publicUrl || null;

    // nettoyage éventuel d’URL signée
    if (finalUrl && finalUrl.includes("/object/sign/")) {
      finalUrl = finalUrl
        .replace("/object/sign/", "/object/public/")
        .replace(/(\?token=[^&]+(&.*)?)$/, "");
    }
    if (!finalUrl) throw new Error("Aucune URL publique retournée.");

    finalUrl = normalizeUrl(`${finalUrl}${finalUrl.includes("?") ? "&" : "?"}v=${Date.now()}`);
    return finalUrl;
  } catch (e) {
    Log?.error?.("storage", "upload", e);
    Alert.alert("Photo", `Envoi impossible: ${e?.message || e}`);
    return null;
  }
}

/***********************
 * Normalisation téléphone (FR-first)
 ***********************/
const normalizePhone = (raw) => {
  if (!raw) return null;
  let s = String(raw)
    .trim()
    .replace(/\u00A0/g, " ")
    .replace(/[().-]/g, "")
    .replace(/\s+/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (s.startsWith("+")) {
    const keep = "+" + s.slice(1).replace(/[^\d]/g, "");
    return keep.length >= 8 ? keep : null;
  }
  if (/^0\d{9}$/.test(s)) return `+33${s.slice(1)}`;
  if (/^[67]\d{8}$/.test(s)) return `+33${s}`;
  const digits = s.replace(/[^\d]/g, "");
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
};

/***********************
 * Permissions contacts (robuste)
 ***********************/
async function ensureContactsPermissionHard({ onGoToSettings } = {}) {
  try {
    const current = await Contacts.getPermissionsAsync();
    if (current.status === "granted") return { ok: true, status: "granted" };

    if (current.canAskAgain) {
      const req = await Contacts.requestPermissionsAsync();
      if (req.status === "granted") return { ok: true, status: "granted" };
      return { ok: false, status: req.status };
    }

    Alert.alert(
      "Contacts",
      "Tu as refusé l’accès aux contacts. Active-le dans Réglages pour inviter des membres.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Ouvrir Réglages",
          onPress: () => {
            onGoToSettings?.();
            Linking.openSettings();
          },
        },
      ]
    );

    return { ok: false, status: current.status };
  } catch (e) {
    Alert.alert("Contacts", "Impossible d’accéder aux permissions.");
    return { ok: false, status: "error" };
  }
}

/***********************
 * Invites: Edge Function + fallback SMS composer
 ***********************/
async function sendInviteSMS(phone, circleId, inviteUrl, message) {
  const supaUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !anon) throw new Error("Config env manquante");

  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const url = `${supaUrl}/functions/v1/send_invite_sms`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phone, circleId, inviteUrl, message }),
  });

  const txt = await r.text();
  console.log("[sendInviteSMS] status=", r.status, "body=", txt);

  if (!r.ok) throw new Error(`HTTP ${r.status} - ${txt}`);
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

async function openComposerSMS(phone, message) {
  const p = String(phone || "").trim();
  if (!p) throw new Error("Numéro invalide");

  // iOS: l’encodage peut rendre l’URL trop longue si on encode tout
  // On encode uniquement le body, et on garde le numéro propre
  const body = encodeURIComponent(String(message || ""));

  // iOS est capricieux selon versions : on tente plusieurs variantes
  const candidates =
    Platform.OS === "ios"
      ? [
          `sms:${p}&body=${body}`,
          `sms:${p}?body=${body}`,
          `sms:${p}?&body=${body}`,
        ]
      : [
          `sms:${p}?body=${body}`,
          `sms:${p}&body=${body}`,
        ];

  let lastErr = null;

  for (const url of candidates) {
    try {
      const can = await Linking.canOpenURL(url);
      console.log("[SMS] try", url, "canOpenURL=", can);
      if (!can) continue;

      await Linking.openURL(url);
      console.log("[SMS] opened OK");
      return;
    } catch (e) {
      lastErr = e;
      console.log("[SMS] open failed", url, e?.message || e);
    }
  }

  throw new Error(lastErr?.message || "Impossible d’ouvrir Messages (SMS non disponible).");
}




function applyIdeaFilter(rows, idea) {
  if (!idea) return rows;

  const cats = new Set((idea.categories || []).map(String));
  const kws = (idea.keywords || []).map((k) => normalizeTitleKey(k));

  return (rows || []).filter((r) => {
    const catOk = cats.size ? cats.has(String(r.category || "other")) : true;
    if (catOk) return true;

    const t = normalizeTitleKey(r.title || "");
    if (!t) return false;
    return kws.some((kw) => kw && t.includes(kw));
  });
}

function buildAggregatedFeedFlat(items, memberNameById) {
  const map = new Map(); // titleKey -> group

  for (const it of items || []) {
    const titleKey = normalizeTitleKey(it.title || "");
    if (!titleKey) continue;

    const existing = map.get(titleKey);
    const itAt = it.created_at || null;

    if (!existing) {
  const ownerId = String(it.owner_id || "");
  const owners = new Map();
  if (ownerId) owners.set(ownerId, { user_id: ownerId, name: memberNameById.get(ownerId) || "Membre" });

  map.set(titleKey, {
    title: titlePretty(it.title || titleKey),
    titleKey,
    category: it.category || "other",
    owners,
    lastAt: itAt,
    latestItemId: it.id, // ✅ AJOUT ICI (id uuid de l'item le + récent du groupe)
  });
  continue;
}


    // owners
    const ownerId = String(it.owner_id || "");
    if (ownerId && !existing.owners.has(ownerId)) {
      existing.owners.set(ownerId, { user_id: ownerId, name: memberNameById.get(ownerId) || "Membre" });
    }

    // lastAt + category du plus récent
   if (itAt && (!existing.lastAt || new Date(itAt) > new Date(existing.lastAt))) {
  existing.lastAt = itAt;
  existing.category = it.category || existing.category || "other";
  existing.title = titlePretty(it.title || existing.title);
  existing.latestItemId = it.id; // ✅ AJOUT ICI
}

  }

  return Array.from(map.values()).map((g) => ({
  title: g.title,
  titleKey: g.titleKey,
  category: g.category || "other",
  ownersList: Array.from(g.owners.values()),
  count: g.owners.size,
  lastAt: g.lastAt,
  latestItemId: g.latestItemId, // ✅ AJOUT ICI
}));

}


function hoursSince(iso) {
  const t = iso ? new Date(iso).getTime() : 0;
  if (!t) return 999999;
  return (Date.now() - t) / 3600000;
}

function computeDispoScore(row) {
  const ageH = hoursSince(row.lastAt);
  // simple: plus récent + plus de owners
  // tri principal: lastAt desc, puis count desc (score ici juste pour expliciter)
  return (-ageH * 10) + (Number(row.count || 0) * 2);
}

function dedupeByTitleKey(list, usedSet) {
  const out = [];
  for (const r of list || []) {
    if (!r?.titleKey) continue;
    if (usedSet.has(r.titleKey)) continue;
    usedSet.add(r.titleKey);
    out.push(r);
  }
  return out;
}

function isNewWithin48h(iso) {
  if (!iso) return false;
  return hoursSince(iso) <= 48;
}


/***********************
 * Consent modal
 ***********************/
function InlineContactsConsentModal({ visible, onAccept, onDecline }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.modalOverlay}>
        <TouchableWithoutFeedback onPress={onDecline}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>

        <View style={[styles.sheet, { maxHeight: "60%" }]}>
          <Text style={styles.sheetTitle}>Accès aux contacts</Text>
          <Text style={styles.consentTxt}>
            Pour inviter des membres, l’app doit accéder à ton répertoire (uniquement pour sélectionner des
            contacts et envoyer une invitation).
          </Text>

          <View style={{ height: 12 }} />

          <TouchableOpacity onPress={onAccept} style={styles.primaryBtn} activeOpacity={0.92}>
            <Text style={styles.primaryBtnTxt}>Autoriser</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onDecline} style={styles.secondaryBtn} activeOpacity={0.92}>
            <Text style={styles.secondaryBtnTxt}>Pas maintenant</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/***********************
 * Data hooks
 ***********************/
function useCircles(wantedId) {
  const [circles, setCircles] = useState([]);
  const [active, setActive] = useState(null);
  const [ready, setReady] = useState(false);

  const loadCircles = useCallback(
    async (preferredId = null) => {
      const user = await getUserOrAlert();
      if (!user) return;

      setReady(false);
      try {
        const [{ data: owned }, { data: memberOf }] = await Promise.all([
          supabase.from("circles").select("*").eq("owner_id", user.id).order("created_at", { ascending: true }),
          supabase.from("circle_members").select("circle_id, circles!inner(*)").eq("user_id", user.id),
        ]);

        const list = [
          ...(owned || []),
          ...((memberOf || []).map((r) => r.circles)).filter(Boolean),
        ];

        const uniq = Array.from(new Map(list.map((c) => [String(c.id), c])).values());
        setCircles(uniq);

        const targetId = preferredId || wantedId;
        const nextActive =
          (targetId && uniq.find((c) => String(c.id) === String(targetId))) || uniq[0] || null;
        setActive(nextActive);
      } finally {
        setReady(true);
      }
    },
    [wantedId]
  );

  useEffect(() => {
    loadCircles();
  }, [loadCircles]);

  return {
    circles,
    activeCircle: active,
    setActiveCircle: setActive,
    reload: loadCircles,
    ready,
  };
}

function useMembers(circleId) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!circleId) {
      setMembers([]);
      return;
    }

    setLoading(true);
    try {
      // 1) ids des membres
      const memRes = await supabase
        .from("circle_members")
        .select("user_id")
        .eq("circle_id", circleId);

      if (memRes.error) throw memRes.error;

      const ids = (memRes.data || []).map((x) => x.user_id).filter(Boolean);

      if (!ids.length) {
        setMembers([]);
        return;
      }

      // 2) profils (public_name)
      const profRes = await supabase
        .from("profiles")
        .select("id, public_name")
        .in("id", ids);

      if (profRes.error) throw profRes.error;

      const map = new Map((profRes.data || []).map((p) => [String(p.id), p]));

      const list = ids
        .map((id) => {
          const p = map.get(String(id));
          return {
            user_id: id,
            public_name: p?.public_name || "Membre",
          };
        })
        .sort((a, b) =>
          String(a.public_name || "").localeCompare(String(b.public_name || ""))
        );

      setMembers(list);
    } catch (e) {
      Log?.error?.("members", "load", e);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [circleId]);

  useEffect(() => {
    load();
  }, [load]);

  return { members, reload: load, loading };
}


function useCalls(circleId) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);

  const channelRef = useRef(null);
  const rtTimerRef = useRef(null);

  // ✅ ref vers la fonction load (pour l'utiliser en realtime sans problème de scope)
  const loadRef = useRef(null);

  const load = useCallback(async () => {
    if (!circleId) return;

    setLoading(true);
    try {
      const sinceIso = isoHoursAgo(CALL_TTL_HOURS);

      // 1) Récupère les ondes
      const { data, error } = await supabase
        .from("calls")
        .select("id, circle_id, author_id, title, category, message, status, photo, created_at")
        .eq("circle_id", circleId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false });

      if (error) {
        Log?.error?.("calls", "select", error);
        setCalls([]);
        return;
      }

      const rows = data || [];

      // 2) Récupère les noms des auteurs (profiles.public_name)
      const authorIds = Array.from(
        new Set(rows.map((c) => c.author_id).filter(Boolean).map(String))
      );

      let nameById = new Map();
      if (authorIds.length) {
        const profRes = await supabase
          .from("profiles")
          .select("id, public_name")
          .in("id", authorIds);

        if (!profRes.error) {
          nameById = new Map(
            (profRes.data || []).map((p) => [String(p.id), p.public_name || "Membre"])
          );
        }
      }

      // 3) Merge (author_name)
      const merged = rows.map((c) => ({
        ...c,
        author_name: nameById.get(String(c.author_id)) || "Membre",
      }));

      setCalls(merged);
    } finally {
      setLoading(false);
    }
  }, [circleId]);

  // ✅ met à jour la ref à chaque render
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // ✅ charge au changement de circleId
  useEffect(() => {
    load();
  }, [load]);

  // ✅ realtime SUR LA TABLE calls
  useEffect(() => {
    if (!circleId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (rtTimerRef.current) {
      clearTimeout(rtTimerRef.current);
      rtTimerRef.current = null;
    }

    const ch = supabase
      .channel(`calls:${circleId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls", filter: `circle_id=eq.${circleId}` },
        () => {
          if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
          rtTimerRef.current = setTimeout(() => {
            loadRef.current?.();
          }, 200);
        }
      )
      .subscribe();

    channelRef.current = ch;

    return () => {
      if (rtTimerRef.current) {
        clearTimeout(rtTimerRef.current);
        rtTimerRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [circleId]);

  // ✅ met à jour la ref à chaque render
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // ✅ charge au changement de circleId
  useEffect(() => {
    load();
  }, [load]);

  // ✅ realtime SUR LA TABLE calls (pas items)
  useEffect(() => {
    if (!circleId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (rtTimerRef.current) {
      clearTimeout(rtTimerRef.current);
      rtTimerRef.current = null;
    }

    const ch = supabase
      .channel(`calls:${circleId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls", filter: `circle_id=eq.${circleId}` },
        () => {
          if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
          rtTimerRef.current = setTimeout(() => {
            loadRef.current?.();
          }, 200);
        }
      )
      .subscribe();

    channelRef.current = ch;

    return () => {
      if (rtTimerRef.current) {
        clearTimeout(rtTimerRef.current);
        rtTimerRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [circleId]);

  return { calls, loading, reload: load };
}


function useItems(circleId, filters, options = {}) {
  const { hasCategoryColumn = true, onCategoryMissing } = options;

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ready, setReady] = useState(false);

  const loadingMoreRef = useRef(false);
  const lastKeyRef = useRef(null);
  const channelRef = useRef(null);


  const loadPage = useCallback(
    async ({ resetFirst = false, isPullToRefresh = false } = {}) => {
      if (!circleId) return;
      if (loading) return;
      if (!resetFirst && (!hasMore || loadingMoreRef.current)) return;

      if (!resetFirst) loadingMoreRef.current = true;
      if (isPullToRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const nextOffset = resetFirst ? 0 : page * PAGE_SIZE;

        let q = supabase
          .from("items")
          .select("*")
          .eq("circle_id", circleId)
          .order("created_at", { ascending: false })
          .range(nextOffset, nextOffset + PAGE_SIZE - 1);

        if (hasCategoryColumn && filters?.category && filters.category !== "all") {
          q = q.eq("category", filters.category);
        }

        let data = [];
        let error = null;

        try {
          const res = await q;
          data = res.data || [];
          error = res.error || null;
        } catch (e) {
          error = e;
        }

        if (
          error &&
          (String(error.code) === "42703" ||
            /column .*category.* does not exist/i.test(String(error.message)))
        ) {
          onCategoryMissing?.();
          const q2 = supabase
            .from("items")
            .select("*")
            .eq("circle_id", circleId)
            .order("created_at", { ascending: false })
            .range(nextOffset, nextOffset + PAGE_SIZE - 1);

          const res2 = await q2;
          data = res2.data || [];
        } else if (error) {
          Log?.error?.("items", "select", { error, filters });
          Alert.alert("Objets", error.message || "Erreur de chargement.");
          data = [];
        }

        const list = (data || []).map((it) => ({
          ...it,
          photo: it.photo ?? it.image ?? it.photo_url ?? null,
        }));

        const mergeUnique = (a, b) => {
          const map = new Map();
          [...a, ...b].forEach((x) => map.set(String(x.id), x));
          return Array.from(map.values());
        };

        if (resetFirst) {
          setItems(list);
          setPage(1);
        } else {
          setItems((prev) => mergeUnique(prev, list));
          setPage((prev) => prev + 1);
        }

        setHasMore(list.length >= PAGE_SIZE);
        setReady(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
        loadingMoreRef.current = false;
      }
    },
    [circleId, page, filters, loading, hasMore, hasCategoryColumn, onCategoryMissing]
  );


  useEffect(() => {
    setItems([]);
    setPage(0);
    setHasMore(true);
    setReady(false);
  }, [circleId]);

  useEffect(() => {
  if (!circleId) return;

  if (channelRef.current) {
    supabase.removeChannel(channelRef.current);
    channelRef.current = null;
  }

  const ch = supabase
    .channel(`items:${circleId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "items", filter: `circle_id=eq.${circleId}` },
      () => {
        loadPage({ resetFirst: true });
      }
    )
    .subscribe();

  channelRef.current = ch;

  return () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  };
}, [circleId, loadPage]);

  useEffect(() => {
    if (!circleId) return;
    const key = `${circleId}::${filters?.category || "all"}`;
    if (lastKeyRef.current === key && ready) return;
    lastKeyRef.current = key;
    loadPage({ resetFirst: true });
  }, [circleId, filters?.category, loadPage, ready]);

  const loadMore = useCallback(() => loadPage({ resetFirst: false }), [loadPage]);
  const refresh = useCallback(() => loadPage({ resetFirst: true, isPullToRefresh: true }), [loadPage]);

  return { items, loading, refreshing, hasMore, loadMore, refresh, ready };
}

/***********************
 * Screen
 ***********************/
const FAB_H = 56;

export default function CircleScreen({ navigation }) {
  const route = useRoute();
  const { contentMax } = useResponsive?.() || {};
  const insets = useSafeAreaInsets();
  const tabBarH = useBottomTabBarHeight();

  const wantedId = route?.params?.circleId || null;

  const didHandleEntry = useRef(false);
 useEffect(() => {
  if (route?.params?.justCreated) {
    setShowCongrats(true);
    const t = setTimeout(() => setShowCongrats(false), 3500); // visible 3,5 sec
    return () => clearTimeout(t);
  }
}, [route?.params]);

const [showCongrats, setShowCongrats] = useState(false);


  const { circles, activeCircle, setActiveCircle, reload: reloadCircles, ready: circlesReady } =
    useCircles(wantedId);

    // juste sous: export default function CircleScreen({ navigation }) {
const navTo = useCallback(
  (screen, params) => {
    // tente d’abord sur le parent (RootStack), sinon local
    const parent = navigation.getParent?.();
    if (parent?.navigate) parent.navigate(screen, params);
    else navigation.navigate(screen, params);
  },
  [navigation]
);
const onUpdateInventoryItem = () => {
  // tu gardes TON comportement existant : ça route comme avant
  navTo("InventoryUpdate", {
  activeCircleId: activeCircle?.id,
  circles: circles || [],          // la liste de tes cercles (celle que tu as déjà dans ce screen)
  existingItems: myItems || [],    // OU ta liste items existants (selon ton state)
});

};


  const { members, reload: reloadMembers, loading: loadingMembers } = useMembers(activeCircle?.id);
  const { calls, loading: loadingCalls, reload: reloadCalls } = useCalls(activeCircle?.id);

  const [currentUserId, setCurrentUserId] = useState(null);
  useEffect(() => {
    (async () => {
      const u = await getUserOrAlert();
      if (u) setCurrentUserId(u.id);
    })();
  }, []);

  const isAdminOfActive = !!activeCircle && activeCircle.owner_id === currentUserId;

  const [filters, setFilters] = useState({ category: "all" });
  const [hasCategoryColumn, setHasCategoryColumn] = useState(true);

  const [viewMode, setViewMode] = useState("gallery"); // 'gallery' | 'list'
  const [tab, setTab] = useState("feed"); // 'feed' | 'mine'
  // const [ideaChip, setIdeaChip] = useState(null); // { key, label, categories, keywords } | null
const [ideaChip, setIdeaChip] = useState(null); 

  const { items, loading, refreshing, hasMore, loadMore, refresh, ready: itemsReady } =
    useItems(activeCircle?.id, filters, {
      hasCategoryColumn,
      onCategoryMissing: () => {
        setHasCategoryColumn(false);
        setFilters({ category: "all" });
        Alert.alert("Catégories", "Le filtrage par catégorie est désactivé (MAJ base requise).");
      },
    });

    

  const listRef = useRef(null);

  // Modales principales
  const [circleHubOpen, setCircleHubOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ✅ Join by code (nouveau)
  const [joinByCodeOpen, setJoinByCodeOpen] = useState(false);
  const [joinCodeDraft, setJoinCodeDraft] = useState("");
  const [joiningByCode, setJoiningByCode] = useState(false);

  // Consent auto-contenu
  const [contactsConsentOpen, setContactsConsentOpen] = useState(false);

  // Contacts picker
  const [contactsQuickOpen, setContactsQuickOpen] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsList, setContactsList] = useState([]); // [{id, name, phone}]
  const [contactsSel, setContactsSel] = useState(new Set());
  const [contactsFilter, setContactsFilter] = useState("");
  const [addingContacts, setAddingContacts] = useState(false);

  const pendingOpenContactsRef = useRef(false);

  // action du picker
  const [contactsAction, setContactsAction] = useState("invite_members"); // 'invite_members' | 'share'
  const [inviteTargetCircleId, setInviteTargetCircleId] = useState(null);

  // Circle create/rename
  const [circleEditOpen, setCircleEditOpen] = useState(false);
  const [circleEditMode, setCircleEditMode] = useState("create"); // 'create' | 'rename'
  const [circleNameDraft, setCircleNameDraft] = useState("");
  const [savingCircleName, setSavingCircleName] = useState(false);

  // FAB
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);

  // Partage annonce
  const [shareOpen, setShareOpen] = useState(false);
  const [shareItem, setShareItem] = useState(null);
  const [shareCircleIds, setShareCircleIds] = useState([]);
  const [shareInviteCircleId, setShareInviteCircleId] = useState(null);
  const [sharing, setSharing] = useState(false);

  // Form Item
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [itemTitle, setItemTitle] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [itemCategory, setItemCategory] = useState("other");
  const [itemPhoto, setItemPhoto] = useState(null);
  const [savingItem, setSavingItem] = useState(false);

  // ✅ Destination cercle (annonce + onde)
const [itemCircleId, setItemCircleId] = useState(null);
const [callCircleId, setCallCircleId] = useState(null);

const [selectedCircleIds, setSelectedCircleIds] = useState([]);

useEffect(() => {
  if (addItemOpen) {
    const cid = String(activeCircle?.id || "");
    setItemCircleId(cid);
    setSelectedCircleIds(cid ? [cid] : []);
  }
}, [addItemOpen, activeCircle?.id]);

useEffect(() => {
  if (createCallOpen) {
    const cid = String(activeCircle?.id || "");
    setCallCircleId(cid);
  }
}, [createCallOpen, activeCircle?.id]);

// ✅ Annonce : gratuit/payant + coût + période + frais
const [itemIsFree, setItemIsFree] = useState(true);
const [itemTotalCost, setItemTotalCost] = useState(""); // coût total (ce que ça t’a coûté)
const [itemPeriod, setItemPeriod] = useState("month"); // day | month | year

// Form Call
  const [createCallOpen, setCreateCallOpen] = useState(false);
  const [callTitle, setCallTitle] = useState("");
  const [callCategory, setCallCategory] = useState("other");
  const [callMsg, setCallMsg] = useState("");
  const [savingCall, setSavingCall] = useState(false);


  const [invSaving, setInvSaving] = useState(false);


  const INVENTORY_ONBOARDING_KEY = "inventory_onboarding_done_v1";
  const [onboardingChecked, setOnboardingChecked] = useState(false);



console.log("ACTIVE CIRCLE", activeCircle?.id, activeCircle?.name);
console.log("ITEMS TOTAL", items?.length);
console.log("ITEMS IN ACTIVE", (items || []).filter(i => String(i.circle_id) === String(activeCircle?.id)).length);
console.log("CIRCLES LOADED", (circles || []).map(c => c.id));


  /********************* Join by code helpers (nouveau) **************************/
  const extractInviteCode = useCallback((raw) => {
    const s = String(raw || "").trim();
    if (!s) return "";
    try {
      // accepte: "xagz..." OU "https://cercle.app/invite/xagz..."
      if (s.includes("/invite/")) {
        const parts = s.split("/invite/");
        const tail = parts[1] || "";
        return tail.split(/[?#]/)[0].trim();
      }
      // si c'est une URL (sans /invite/), on prend le dernier segment
      if (/^https?:\/\//i.test(s)) {
        const u = new URL(s);
        const seg = (u.pathname || "").split("/").filter(Boolean);
        return (seg[seg.length - 1] || "").trim();
      }
      return s.replace(/\s+/g, "");
    } catch {
      return s.replace(/\s+/g, "");
    }
  }, []);

const normalizeInviteCode = (raw) => {
  if (!raw) return "";

  let s = String(raw);

  // 1) decode (si lien encodé)
  try {
    s = decodeURIComponent(s);
  } catch {}

  s = s.trim();

  // 2) Priorité : "Code : XXXXX" (même si l'utilisateur colle tout le SMS)
  // - accepte espaces/retours à la ligne autour
  const mCode = s.match(/(?:^|[\s\r\n])code\s*[:\-]\s*([A-Za-z0-9_-]{10,})/i);
  if (mCode?.[1]) return mCode[1];

  // 3) Sinon : lien .../invite/XXXXX
  const mInvite = s.match(/\/invite\/([A-Za-z0-9_-]{10,})/i);
  if (mInvite?.[1]) return mInvite[1];

  // 4) Sinon : on prend le "meilleur candidat" = le plus long token base64url
  // (parfait quand on colle tout le SMS, même sans "Code :" ni lien)
  const candidates = s.match(/[A-Za-z0-9_-]{20,}/g) || [];
  if (candidates.length) {
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0];
  }

  // 5) Fallback : ton extraction existante (code seul ou URL)
  let c = s;
  c = extractInviteCode(c);

  c = c
    .split(/[?#]/)[0]
    .replace(/\/+$/, "")
    .replace(/\u200B/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9_-]/g, "");

  return c;
};

  const joinCircleByCode = useCallback(
  async (rawCode) => {
    const user = await getUserOrAlert();
    if (!user) return null;

    const code = normalizeInviteCode(rawCode);

    console.log("[JOIN] pasted =", JSON.stringify(rawCode));
    console.log("[JOIN] normalized =", JSON.stringify(code), "len=", code.length);

    if (!code) {
      Alert.alert("Rejoindre", "Entre un code ou colle le lien / le message d’invitation.");
      return null;
    }

    setJoiningByCode(true);

    try {
      // ✅ Appel direct RPC (la plus fiable)
      // IMPORTANT : remplace le nom si ta RPC s'appelle autrement en prod
      const { data, error } = await supabase.rpc("join_circle_by_token_or_code_v2", {
        p_code: code,
      });

      console.log("[JOIN] rpc data =", data);
      console.log("[JOIN] rpc error =", error);

      if (error) throw error;

      const circleId =
        (typeof data === "string" && data) ||
        data?.circle_id ||
        data?.circleId ||
        data?.id ||
        null;

      if (!circleId) {
        throw new Error("Join OK mais circleId manquant (retour serveur inattendu).");
      }

      await reloadCircles(String(circleId));

      setJoinByCodeOpen(false);
      setJoinCodeDraft("");

      Alert.alert("Rejoindre", "Tu as maintenant accès au cercle ✅");
      return String(circleId);
    } catch (e) {
      console.log("[JOIN] FINAL ERROR =", e?.message, e);
      Alert.alert("Rejoindre", e?.message || "Impossible de rejoindre ce cercle.");
      return null;
    } finally {
      setJoiningByCode(false);
    }
  },
  [reloadCircles]
);

function initialsFromName(name) {
  const s = String(name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[1]?.[0] || "" : "";
  return (a + b).toUpperCase() || "?";
}

function hashToIndex(str, mod) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return mod ? (h % mod) : h;
}

function AvatarStack({ ownersList }) {
  const list = (ownersList || []).slice(0, 3);

  return (
    <View style={styles.avatarStack}>
      {list.map((o, idx) => {
        const label = initialsFromName(o?.name || "Membre");
        const n = hashToIndex(o?.user_id || o?.name || String(idx), 6);
        const bg = [
          "rgba(29,255,194,0.18)",
          "rgba(255,181,179,0.16)",
          "rgba(133,204,255,0.16)",
          "rgba(167,139,250,0.16)",
          "rgba(245,158,11,0.14)",
          "rgba(248,113,113,0.14)",
        ][n];

        return (
          <View
            key={`${o?.user_id || o?.name || idx}`}
            style={[
              styles.avatarBubble,
              { marginLeft: idx === 0 ? 0 : -10, backgroundColor: bg },
            ]}
          >
            <Text style={styles.avatarTxt}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function CardMedia({ category, label, photoUrl }) {
  const da = daForCat(category);
  const hasPhoto = !!photoUrl;

  return (
    <View style={styles.mediaWrap}>
      {/* Base DA toujours visible */}
      <LinearGradient
        colors={[da.a, da.b]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* formes pop (toujours) */}
      <View style={styles.mediaBlobA} />
      <View style={styles.mediaBlobB} />

      {/* Photo = texture par-dessus */}
      {hasPhoto ? (
        <>
          <Image
            source={{ uri: normalizeUrl(photoUrl) }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />

          {/* vernis pour harmoniser toutes les photos */}
          <View style={styles.photoWash} />

          {/* gradient bas pour lisibilité */}
          <LinearGradient
            colors={["rgba(0,0,0,0.00)", "rgba(0,0,0,0.55)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </>
      ) : (
        <View style={styles.noPhotoCenter}>
  <Text style={styles.noPhotoLabel} numberOfLines={1}>{label}</Text>
</View>

      )}
    </View>
  );
}


  /********************* Contacts: load device contacts **************************/
  const loadDeviceContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        pageSize: 2000,
      });

      const arr = (data || []).flatMap((c) => {
        const baseName = c.name || c.firstName || c.lastName || "Contact";
        const phones = (c.phoneNumbers || [])
          .map((p) => {
            const raw = p?.number;
            const n = normalizePhone(raw);
            if (n) return n;

            const digits = String(raw || "").replace(/[^\d]/g, "");
            if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
            return null;
          })
          .filter(Boolean);

        return phones.map((ph, i) => ({
          id: `${c.id}-${i}`,
          name: baseName,
          phone: ph,
        }));
      });

      const uniq = Array.from(new Map(arr.map((x) => [`${x.name}::${x.phone}`, x])).values());
      setContactsList(uniq);
    } catch (e) {
      Alert.alert("Contacts", "Lecture des contacts impossible.");
    } finally {
      setContactsLoading(false);
    }
  }, []);

  /********************* Re-open au retour Réglages **************************/
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      if (!pendingOpenContactsRef.current) return;

      const perm = await Contacts.getPermissionsAsync();
      if (perm.status === "granted") {
        pendingOpenContactsRef.current = false;
        setContactsSel(new Set());
        setContactsFilter("");
        setContactsQuickOpen(true);
        loadDeviceContacts();
      }
    });

    return () => sub.remove();
  }, [loadDeviceContacts]);

  /********************* Consent interne **************************/
  const ensureContactsConsentThen = useCallback(async (next) => {
    try {
      const v = await AsyncStorage.getItem("contacts_consent_v1");
      if (v === "granted") return next();
      setContactsConsentOpen(true);
    } catch {
      setContactsConsentOpen(true);
    }
  }, []);

  /********************* Ouvrir picker contacts **************************/
  const openContactsPicker = useCallback(
    async ({ action = "invite_members", circleId = null } = {}) => {
      const targetCircleId = circleId || activeCircle?.id || null;

      if (action === "invite_members" && !targetCircleId) {
        Alert.alert("Inviter", "Sélectionne un cercle d’abord.");
        return;
      }

      setContactsAction(action);
      setInviteTargetCircleId(targetCircleId);

      await ensureContactsConsentThen(async () => {
        const res = await ensureContactsPermissionHard({
          onGoToSettings: () => {
            pendingOpenContactsRef.current = true;
          },
        });
        if (!res.ok) return;

        setContactsSel(new Set());
        setContactsFilter("");
        setContactsQuickOpen(true);
        loadDeviceContacts();
      });
    },
    [activeCircle?.id, ensureContactsConsentThen, loadDeviceContacts]
  );

  /********************* Chat cercle **************************/
  const openCircleChat = useCallback(async () => {
    if (!activeCircle?.id) {
      Alert.alert("Chat", "Sélectionne un cercle d’abord.");
      return;
    }
    try {
      const { data: threadUuid, error } = await supabase.rpc("get_or_create_circle_thread", {
        p_circle_id: activeCircle.id,
      });
      if (error) throw error;

      navigation.navigate("Thread", {
        threadId: String(threadUuid),
        circleId: String(activeCircle.id),
        title: activeCircle.name || "Messages",
      });
    } catch (e) {
      Alert.alert("Chat", e?.message || "Ouverture du chat impossible.");
    }
  }, [activeCircle?.id, activeCircle?.name, navigation]);

   useFocusEffect(
    useCallback(() => {
      if (!activeCircle?.id) return;
      reloadCalls();
      reloadMembers();
    }, [activeCircle?.id, reloadCalls, reloadMembers])
  );

  /********************* Cercle: create / rename / leave / delete **************************/
  const createCircleWithName = useCallback(
    async (name) => {
      const user = await getUserOrAlert();
      if (!user) return null;

      const clean = String(name || "").trim();
      if (!clean) {
        Alert.alert("Cercle", "Donne un nom au cercle.");
        return null;
      }

      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc("create_circle", { p_name: clean });
        const newId = typeof rpcData === "string" ? rpcData : rpcData?.id;

        if (rpcErr || !newId) {
          const { data: inserted, error: insErr } = await supabase
            .from("circles")
            .insert({ name: clean, owner_id: user.id })
            .select("id")
            .single();
          if (insErr) throw insErr;

          await reloadCircles(String(inserted.id));
          return String(inserted.id);
        } else {
          await reloadCircles(String(newId));
          return String(newId);
        }
      } catch (e) {
        Log?.error?.("circles", "create", e);
        Alert.alert("Cercle", e?.message || "Création impossible.");
        return null;
      }
    },
    [reloadCircles]
  );

  const renameActiveCircle = useCallback(
    async (newName) => {
      if (!activeCircle?.id) return;
      if (!isAdminOfActive) {
        Alert.alert("Cercle", "Seul l’admin peut renommer le cercle.");
        return;
      }
      const user = await getUserOrAlert();
      if (!user) return;

      const clean = String(newName || "").trim();
      if (!clean) {
        Alert.alert("Cercle", "Le nom ne peut pas être vide.");
        return;
      }

      try {
        const { error } = await supabase
          .from("circles")
          .update({ name: clean })
          .eq("id", activeCircle.id)
          .eq("owner_id", user.id);
        if (error) throw error;

        setCircleEditOpen(false);
        await reloadCircles(String(activeCircle.id));
        Alert.alert("Cercle", "Nom mis à jour ✅");
      } catch (e) {
        Log?.error?.("circles", "rename", e);
        Alert.alert("Cercle", e?.message || "Renommage impossible.");
      }
    },
    [activeCircle?.id, isAdminOfActive, reloadCircles]
  );

  const leaveActiveCircle = useCallback(async () => {
    if (!activeCircle?.id) return;
    const user = await getUserOrAlert();
    if (!user) return;
    try {
      await supabase.from("circle_members").delete().eq("circle_id", activeCircle.id).eq("user_id", user.id);

      // ✅ PUSH: Nouveau membre (après insert circle_members OK)
try {
  const tokens = await getCircleMemberTokens(circleId);
  const myToken = await getUserToken(userId);
  const targets = tokens.filter((t) => t && t !== myToken);

  if (targets.length) {
    await sendPush({
      to: targets,
      title: "Nouveau membre",
      body: "Un nouveau membre a été ajouté à ton Cercle",
      data: { type: "member_added", circleId },
    });
  }
} catch (e) {
  console.warn("Push member failed:", e?.message || e);
}


      setCircleHubOpen(false);
      await reloadMembers();
      await reloadCircles(null);
      Alert.alert("Cercle", "Tu as quitté le cercle.");
    } catch (e) {
      Log?.error?.("circles", "leave", e);
      Alert.alert("Cercle", "Impossible de quitter ce cercle.");
    }
  }, [activeCircle?.id, reloadCircles, reloadMembers]);

  const deleteActiveCircle = useCallback(async () => {
    if (!activeCircle?.id) return;
    if (!isAdminOfActive) {
      Alert.alert("Cercle", "Seul l’admin peut supprimer le cercle.");
      return;
    }
    const user = await getUserOrAlert();
    if (!user) return;
    try {
      await supabase.from("circles").delete().eq("id", activeCircle.id).eq("owner_id", user.id);
      setCircleHubOpen(false);
      await reloadCircles(null);
      Alert.alert("Cercle", "Cercle supprimé.");
    } catch (e) {
      Log?.error?.("circles", "delete", e);
      Alert.alert("Cercle", "Suppression impossible (droits ou contraintes).");
    }
  }, [activeCircle?.id, reloadCircles, isAdminOfActive]);

  /********************* Picker images **************************/
  const pickItemPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Photos", "Autorise l’accès à la photothèque.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.85,
      allowsMultipleSelection: false,
      base64: true,
      selectionLimit: 1,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });

    if (!res.canceled && res.assets?.[0]?.uri) {
      const a = res.assets[0];
      const mime =
        a.mimeType ||
        (a.uri?.toLowerCase().endsWith(".png")
          ? "image/png"
          : a.uri?.toLowerCase().endsWith(".webp")
          ? "image/webp"
          : "image/jpeg");
      setItemPhoto({ uri: a.uri, base64: a.base64 || null, mime });
    }
  }, []);

  const pickCallPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Photos", "Autorise l’accès à la photothèque.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.85,
      allowsMultipleSelection: false,
      base64: true,
      selectionLimit: 1,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });

    if (!res.canceled && res.assets?.[0]?.uri) {
      const a = res.assets[0];
      const mime =
        a.mimeType ||
        (a.uri?.toLowerCase().endsWith(".png")
          ? "image/png"
          : a.uri?.toLowerCase().endsWith(".webp")
          ? "image/webp"
          : "image/jpeg");
      setCallPhoto({ uri: a.uri, base64: a.base64 || null, mime });
    }
  }, []);


  const deleteCall = useCallback(async (c) => {
  const user = await getUserOrAlert();
  if (!user) return;

  if (String(c.author_id) !== String(user.id)) {
    Alert.alert("Onde", "Tu ne peux supprimer que tes ondes.");
    return;
  }
async function deleteCall(callId) {
  const { error } = await supabase
    .from("calls")
    .delete()
    .eq("id", callId)
    .eq("author_id", userId); // sécurité: uniquement l’auteur

  if (error) throw error;

}

  Alert.alert("Supprimer", "Supprimer cette onde ?", [
    { text: "Annuler", style: "cancel" },
    {
      text: "Supprimer",
      style: "destructive",
      onPress: async () => {
        const { error } = await supabase
          .from("calls")
          .delete()
          .eq("id", c.id)
          .eq("author_id", user.id);

        if (error) {
          Alert.alert("Suppression", error.message || "Impossible de supprimer.");
          return;
        }
        reloadCalls();
      },
    },
  ]);
}, [reloadCalls]);

const respondToCall = useCallback(async (c) => {
  try {
    const msg = `Je peux aider ✅ — pour : ${c.message}`;
    await Clipboard.setStringAsync(msg);
    await openCircleChat();
    Alert.alert("Réponse", "Message copié ✅ Ouvre le chat et colle-le.");
  } catch (e) {
    Alert.alert("Réponse", "Impossible de préparer la réponse.");
  }
}, [openCircleChat]);


/********************* Save Item **************************/
const saveItem = useCallback(async () => {
  if (savingItem) return;
  const user = await getUserOrAlert();
  if (!user) return;

  if (!activeCircle?.id && !itemCircleId) {
    Alert.alert("Article", "Sélectionne un cercle.");
    return;
  }
  if (!itemTitle.trim()) {
    Alert.alert("Article", "Ajoute un titre.");
    return;
  }

  setSavingItem(true);
  try {
    let photoUrl = null;
    if (itemPhoto?.uri) {
      photoUrl = await uploadToStorage(itemPhoto, STORAGE_BUCKET_ITEMS, user.id);
      photoUrl = normalizeUrl(photoUrl);
    }

   const dests = (selectedCircleIds || []).length
  ? selectedCircleIds
  : [String(itemCircleId || activeCircle?.id || "")].filter(Boolean);

if (!dests.length) {
  Alert.alert("Article", "Sélectionne au moins un cercle.");
  return;
}

const payloadBase = {
  owner_id: user.id,
  title: itemTitle.trim(),
  description: itemDesc.trim(),
  category: itemCategory || "other",
  photo: photoUrl || null,
};

// insertion dans tous les cercles sélectionnés
const rows = dests.map((cid) => ({
  ...payloadBase,
  circle_id: String(cid),
}));

const { error } = await supabase.from("items").insert(rows);

// ✅ PUSH: Article ajouté (après insert items OK)
try {
  const tokens = await getCircleMemberTokens(circleId);
  const myToken = await getUserToken(userId);
  const targets = tokens.filter((t) => t && t !== myToken);

  if (targets.length) {
    await sendPush({
      to: targets,
      title: "Inventaire",
      body: "Un article a été ajouté dans ton Cercle",
      data: { type: "item_added", circleId, itemId: data.id },
    });
  }
} catch (e) {
  console.warn("Push item failed:", e?.message || e);
}


    setAddItemOpen(false);
    refresh();
    Alert.alert("Article", "Ajouté à ton inventaire ✅");
  } catch (e) {
    console.log("save item error:", e);
    Log?.error?.("items", "insert-failed", e);
    Alert.alert("Article", e?.message || "Ajout impossible.");
  } finally {
    setSavingItem(false);
  }
}, [savingItem, activeCircle?.id, itemCircleId, itemTitle, itemDesc, itemCategory, itemPhoto, refresh]);

  const deleteItem = useCallback(
  async (item) => {
    const user = await getUserOrAlert();
    if (!user) return;

    if (String(item.owner_id) !== String(user.id)) {
      Alert.alert("Suppression", "Tu ne peux supprimer que tes annonces.");
      return;
    }

    Alert.alert("Supprimer", "Supprimer cette annonce ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("items")
            .delete()
            .eq("id", item.id)
            .eq("owner_id", user.id);

          if (error) {
            Alert.alert("Suppression", error.message || "Impossible de supprimer.");
            return;
          }

          refresh();
        },
      },
    ]);
  },
  [refresh]
);


  const parseMoney = (s) => {
  const n = Number(String(s || "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const fmtEUR = (n) => {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n || 0));
  } catch {
    return `${Number(n || 0).toFixed(2)} €`;
  }
};



// ✅ Mets ici TA règle de frais si tu veux (sinon laisse)
const FEE_RATE = 0.10;   // 10%
const FEE_FIXED = 0.30;  // +0,30 €

const computeFees = (cost) => {
  const base = Math.max(0, Number(cost) || 0);
  const fee = Math.round((base * FEE_RATE + (base > 0 ? FEE_FIXED : 0)) * 100) / 100;
  const total = Math.round((base + fee) * 100) / 100;
  return { base, fee, total };
};

const perPeriod = (cost, period) => {
  const base = Math.max(0, Number(cost) || 0);
  if (!base) return 0;
  if (period === "day") return Math.round((base / 30) * 100) / 100;
  if (period === "year") return Math.round((base * 12) * 100) / 100;
  return Math.round(base * 100) / 100; // month
};


  /********************* Save Call **************************/
const saveCall = useCallback(async () => {
  if (savingCall) return;
  const user = await getUserOrAlert();
  if (!user) return;

  if (!activeCircle?.id && !callCircleId) {
    Alert.alert("Onde", "Sélectionne un cercle.");
    return;
  }
  if (!callMsg.trim()) {
    Alert.alert("Onde", "Ajoute un message.");
    return;
  }
// 1) récupérer les membres du cercle
const { data: members } = await supabase
  .from("circle_members")
  .select("user_id")
  .eq("circle_id", targetCircleId);

// 2) récupérer leurs tokens
const userIds = (members || []).map((m) => m.user_id);

if (userIds.length) {
  const { data: profiles } = await supabase
    .from("profiles")
    .select("expo_push_token")
    .in("id", userIds);

  const tokens = (profiles || [])
    .map((p) => p.expo_push_token)
    .filter(Boolean);

  // 3) envoyer une push à chaque token
  for (const token of tokens) {
    await supabase.functions.invoke("push", {
      body: {
        to: token,
        title: "Nouvelle onde",
        body: "Une onde a été lancée dans ton Cercle",
      },
    });
  }
}
  setSavingCall(true);
  try {
    const targetCircleId = String(callCircleId || activeCircle?.id || "");
    if (!targetCircleId) {
      Alert.alert("Onde", "Sélectionne un cercle.");
      return;
    }

    const payload = {
      circle_id: targetCircleId,
      author_id: user.id,
      title: (callTitle || "").trim() || null,
      category: callCategory || "other",
      message: callMsg.trim(),
      status: "open",
      photo: null, // ✅ pas de photo
    };

    const { error } = await supabase.from("calls").insert(payload);
    if (error) throw error;
// ✅ PUSH: Nouvelle onde (après insert calls OK)
try {
  const tokens = await getCircleMemberTokens(circleId);
  const myToken = await getUserToken(userId); // l’auteur
  const targets = tokens.filter((t) => t && t !== myToken);

  if (targets.length) {
    await sendPush({
      to: targets,
      title: "Nouvelle onde",
      body: "Une onde a été lancée dans ton Cercle",
      data: { type: "call_created", circleId, callId: data.id },
    });
  }
} catch (e) {
  console.warn("Push onde failed:", e?.message || e);
}

    setCreateCallOpen(false);
    InteractionManager.runAfterInteractions(() => {
      setCallTitle("");
      setCallCategory("other");
      setCallMsg("");
      setTimeout(() => reloadCalls(), 120);
    });

    Alert.alert("Onde", "Onde publiée ✅");
  } catch (e) {
    Log?.error?.("calls", "insert-failed", e);
    Alert.alert("Onde", e?.message || "Publication impossible.");
  } finally {
    setSavingCall(false);
  }
}, [savingCall, activeCircle?.id, callCircleId, callTitle, callCategory, callMsg, reloadCalls]);

  /********************* Partage annonce **************************/
  const openShareForItem = useCallback(
    (item) => {
      if (!item) return;
      setShareItem(item);

      const otherCircles = (circles || []).map((c) => c.id).filter((id) => id !== item.circle_id);
      setShareCircleIds(otherCircles.length ? [otherCircles[0]] : []);

      const defaultInviteCircle = activeCircle?.id || item.circle_id || null;
      setShareInviteCircleId(defaultInviteCircle);

      setContactsAction("share");
      setContactsSel(new Set());
      setContactsFilter("");
      setShareOpen(true);
    },
    [circles, activeCircle?.id]
  );
const shareInviteForItem = useCallback(async (item) => {
  if (!item) return;
  const circleId = item.circle_id || activeCircle?.id;
  if (!circleId) {
    Alert.alert("Partage", "Cercle introuvable pour cette annonce.");
    return;
  }

  try {
    const code = await getOrCreateCircleInviteCode(circleId);
    if (!code) return;

    const inviteUrl = getInviteLinkForEnv(code); // déjà dans ton fichier
    const title = String(item.title || "Annonce");
    const desc = String(item.description || "").trim();

    const message =
      `Je te partage une annonce sur Cercle :\n\n` +
      `${title}\n` +
      (desc ? `${desc}\n\n` : `\n`) +
      `👉 Rejoins le cercle pour la voir :\n${inviteUrl}\n\n` +
      `Code : ${code}\n\n` +
      `Si le lien ne s’ouvre pas : ouvre l’app → “Rejoindre avec un code” et colle le code.`;

    await Share.share({ message });
  } catch (e) {
    Alert.alert("Partage", e?.message || "Impossible d’ouvrir le partage.");
  }
}, [activeCircle?.id]);

const shareItemToContacts = useCallback(async (item) => {
  if (!item) return;

  const text =
    `${item.title || "Annonce"}\n\n` +
    `${item.description || ""}\n\n` +
    `Catégorie: ${labelCat(item.category || "other")}`;

  try {
    await Share.share({ message: text });
  } catch (e) {
    Alert.alert("Partage", "Impossible d’ouvrir le partage.");
  }
}, []);



/// PATCH START: shareItemToOtherCircles - secure ok/ko and payload
const shareItemToOtherCircles = useCallback(
  async (item, destCircleIds) => {
    const user = await getUserOrAlert();
    if (!user) return { ok: 0, ko: 0 };

    let ok = 0;
    let ko = 0;

    const payloadBase = {
      owner_id: user.id,
      title: item.title,
      description: item.description ?? null,
      category: item.category ?? "other",
      photo: item.photo ?? null,
    };

    for (const cid of (destCircleIds || []).filter(Boolean)) {
      try {
        const payload = { ...payloadBase, circle_id: cid };
        const { error } = await supabase.from("items").insert(payload);
        if (error) throw error;
        ok++;
      } catch (e) {
        ko++;
        Log?.error?.("share", "item-copy-failed", { circle: cid, err: e?.message || e });
      }
    }

    return { ok, ko };
  },
  []
);

  // ✅ Inviter des contacts : v2 + SMS (robuste)
// ✅ Inviter des contacts : v2 + SMS (robuste)
const inviteSelectedContactsToCircle = useCallback(
  async ({ circleId, itemTitle }) => {
    try {
      if (!circleId) {
        Alert.alert("Invitations", "Choisis un cercle.");
        return { ok: 0, ko: 0 };
      }

      const selected = contactsList.filter((c) => contactsSel.has(c.id));
      if (selected.length === 0) return { ok: 0, ko: 0 };

      setAddingContacts(true);

      const payload = selected
        .map((c) => ({
          name: String(c.name || "Contact").trim(),
          phone: c.phone,
        }))
        .filter((x) => !!x.phone);

      const { data, error } = await supabase.rpc("add_contacts_to_circle_v2", {
        p_circle_id: circleId,
        p_contacts: payload,
      });

      if (error) {
        console.log("[INVITES v2] RPC error =", error);
        Alert.alert("Invitations", error.message || "Erreur inconnue.");
        return { ok: 0, ko: payload.length };
      }

      const resArr = Array.isArray(data) ? data : [];

      // index retour par téléphone normalisé
      const byPhone = new Map();
      for (const r of resArr) {
        const k =
          normalizePhone(r?.input_phone) ||
          normalizePhone(r?.phone) ||
          normalizePhone(r?.normalized_phone) ||
          null;
        if (k && !byPhone.has(k)) byPhone.set(k, r);
      }

      let ok = 0;
      let ko = 0;

for (const c of selected) {
  const rawPhone = c?.phone;
  const phoneN = normalizePhone(rawPhone);
  const row = (phoneN && byPhone.get(phoneN)) || {};

  // 1) Ce que renvoie le backend (code OU url)
  const rawInvite =
    row?.invite_code ||
    row?.code ||
    row?.inviteCode ||
    row?.invite_url ||
    row?.inviteUrl ||
    "";

  // 2) IMPORTANT : définir codeOnly ICI (sinon crash)
  // 🔁 utilise TON helper déjà présent dans CircleScreen : extractInviteCode(...)
  const codeOnly = extractInviteCode(rawInvite);

  if (!codeOnly) {
    console.log("[INVITE] blocked: no code", { rawInvite, row, rawPhone });
    ko++;
    continue;
  }

  // 3) lien web stable (store)
  const inviteUrlFinal = `https://cercle.app/invite/${encodeURIComponent(codeOnly)}`;

  // 4) message + code visible
  const msg = itemTitle
    ? `Rejoins mon cercle sur Cercle :\n${inviteUrlFinal}\n\nCode : ${codeOnly}\n\nAnnonce : ${String(
        itemTitle || "Annonce"
      )}\n\nSi le lien ne s’ouvre pas : ouvre l’app → Cercle → “Rejoindre avec un code” et colle le code.`
    : `Rejoins mon cercle sur Cercle :\n${inviteUrlFinal}\n\nCode : ${codeOnly}\n\nSi le lien ne s’ouvre pas : ouvre l’app → Cercle → “Rejoindre avec un code” et colle le code.`;

  const phoneToSend = phoneN || rawPhone;

  console.log("[INVITE] about to open SMS", {
    phoneToSend,
    codeOnly,
    msgLen: msg.length,
  });

  try {
    await openComposerSMS(phoneToSend, msg);
    ok++;
  } catch (e2) {
    console.log("[INVITE] SMS open error", e2?.message || e2);
    ko++;
  }
}

      await reloadMembers();
      return { ok, ko };
    } catch (e) {
      Alert.alert("Invitations", e?.message || "Ajout impossible.");
      return { ok: 0, ko: 0 };
    } finally {
      setAddingContacts(false);
    }
  },
  [contactsList, contactsSel, reloadMembers, extractInviteCode]

);

  const confirmShare = useCallback(async () => {
    if (!shareItem) return;

    setSharing(true);
    try {
      let copyRes = { ok: 0, ko: 0 };
      const dests = (shareCircleIds || [])
        .filter(Boolean)
        .filter((id) => id !== shareItem.circle_id);

      if (dests.length) {
        copyRes = await shareItemToOtherCircles(shareItem, dests);
      }

      let inviteRes = { ok: 0, ko: 0 };
      if (contactsSel.size > 0) {
        inviteRes = await inviteSelectedContactsToCircle({
          circleId: shareInviteCircleId,
          itemTitle: shareItem.title,
        });
      }

      setShareOpen(false);

      if (dests.includes(activeCircle?.id)) {
        setTimeout(() => refresh(), 120);
      }

      const parts = [];
      if (copyRes.ok || copyRes.ko)
        parts.push(`Cercles: ${copyRes.ok} ok${copyRes.ko ? ` / ${copyRes.ko} échec` : ""}`);
      if (inviteRes.ok || inviteRes.ko)
        parts.push(`Contacts: ${inviteRes.ok} ok${inviteRes.ko ? ` / ${inviteRes.ko} échec` : ""}`);

      Alert.alert("Partage", parts.length ? parts.join("\n") : "Aucun partage effectué.");
    } finally {
      setSharing(false);
    }
  }, [
    shareItem,
    shareCircleIds,
    shareItemToOtherCircles,
    contactsSel,
    shareInviteCircleId,
    inviteSelectedContactsToCircle,
    activeCircle?.id,
    refresh,
  ]);

  /********************* UI derivations **************************/

  // ✅ 1) mapping id -> nom (sert à l’agrégation)
const memberNameById = useMemo(() => {
  const m = new Map();
  (members || []).forEach((x) => m.set(String(x.user_id), x.public_name || "Membre"));
  return m;
}, [members]);

// ✅ 2) base agrégée
const feedFlatBase = useMemo(() => {
  return buildAggregatedFeedFlat(items || [], memberNameById);
}, [items, memberNameById]);

const data2cols = useMemo(() => {
  const arr = [...(feedFlatBase || [])];
  if (arr.length % 2 === 1) arr.push({ __empty: true, titleKey: "__empty__" });
  return arr;
}, [feedFlatBase]);

const renderFeedCard = useCallback(
  ({ item: row }) => {
    // ✅ Placeholder invisible pour garder la grille en 2 colonnes
    if (row?.__empty) {
      return <View style={[styles.instaCard, { opacity: 0 }]} pointerEvents="none" />;
    }

    return (
      <FeedInstaCard
        row={row}
        onPress={() =>
          navTo("ItemDetail", {
            itemId: row.latestItemId,       // item le + récent du groupe
            title: row.title,
            circleId: activeCircle?.id,
            titleKey: row.titleKey,
            ownersList: row.ownersList,
            count: row.count,
            category: row.category,
          })
        }
      />
    );
  },
  [navTo, activeCircle?.id]
);

const myItems = useMemo(() => {
  const uid = String(currentUserId || "");
  if (!uid) return [];
  return (items || []).filter((it) => String(it.owner_id) === uid);
}, [items, currentUserId]);


// Pour garder 2 colonnes stables même si impair
const myItems2cols = useMemo(() => {
  const arr = [...(myItems || [])];
  if (arr.length % 2 === 1) arr.push({ __empty: true, id: "__empty__" });
  return arr;
}, [myItems]);

// ✅ 3) filtrage par idée
const feedFlatFiltered = useMemo(() => {
  return applyIdeaFilter(feedFlatBase, ideaChip);
}, [feedFlatBase, ideaChip]);

// ✅ 4) Dispo maintenant
const feedDispoNow = useMemo(() => {
  const sorted = [...(feedFlatFiltered || [])].sort((a, b) => {
    const da = a.lastAt ? new Date(a.lastAt).getTime() : 0;
    const db = b.lastAt ? new Date(b.lastAt).getTime() : 0;
    if (db !== da) return db - da;
    return (b.count || 0) - (a.count || 0);
  });
  return sorted.slice(0, 8);
}, [feedFlatFiltered]);


const feedItems = useMemo(() => {
  const arr = [...(items || [])];

  // Option : filtre catégorie (si tu veux garder)
  if (filters?.category && filters.category !== "all") {
    return arr.filter((it) => String(it.category || "other") === String(filters.category));
  }

  return arr;
}, [items, filters?.category]);


// ✅ 5) Nouveautés
const feedNew = useMemo(() => {
  const used = new Set((feedDispoNow || []).map((r) => r.titleKey));
  const sorted = [...(feedFlatFiltered || [])].sort((a, b) => {
    const da = a.lastAt ? new Date(a.lastAt).getTime() : 0;
    const db = b.lastAt ? new Date(b.lastAt).getTime() : 0;
    return db - da;
  });

  return sorted.filter((r) => r?.titleKey && !used.has(r.titleKey)).slice(0, 8);
}, [feedFlatFiltered, feedDispoNow]);


  const gallery = viewMode === "gallery";
  const bottomContentPadding = FAB_H + tabBarH + 24;

  const itemsToShow = useMemo(() => {
    if (tab === "mine") return items.filter((it) => it.owner_id === currentUserId);
    return items;
  }, [items, tab, currentUserId]);

  

  const feedByCategory = useMemo(() => {
    const catMap = new Map(); // catKey -> map titleKey -> group
    for (const it of items || []) {
      const cat = it.category || "other";
      const titleKey = normalizeTitleKey(it.title || "");
      if (!titleKey) continue;
      if (!catMap.has(cat)) catMap.set(cat, new Map());
      const gmap = catMap.get(cat);
      if (!gmap.has(titleKey)) {
        gmap.set(titleKey, {
          title: titlePretty(it.title || titleKey),
          titleKey,
          category: cat,
          owners: new Map(),
          lastAt: it.created_at || null,
        });
      }
const g = gmap.get(titleKey);
      const ownerId = String(it.owner_id || "");
      if (!g.owners.has(ownerId)) g.owners.set(ownerId, { user_id: ownerId, name: memberNameById.get(ownerId) || ownerId });
      if (it.created_at && (!g.lastAt || new Date(it.created_at) > new Date(g.lastAt))) g.lastAt = it.created_at;
    }

    const out = [];
    for (const [cat, gmap] of catMap.entries()) {
      const rows = Array.from(gmap.values())
        .map((r) => ({
          title: r.title,
          titleKey: r.titleKey,
          category: r.category,
          ownersList: Array.from(r.owners.values()),
          count: r.owners.size,
          lastAt: r.lastAt,
        }))
        .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
      const meta = catMeta(cat);
      out.push({
        categoryKey: cat,
        label: meta.label || cat,
        dot: meta.dot || "#888",
        totalCount: rows.length,
        rows,
      });
    }
return out.sort((a, b) => b.totalCount - a.totalCount || a.label.localeCompare(b.label, "fr"));
  }, [items, memberNameById]);

  const renderAggregatedRow = useCallback(
    ({ item }) => {
      return (
        <TouchableOpacity
          key={`agg-${item.titleKey}`}
          style={styles.itemRow}
          activeOpacity={0.85}
          onPress={() =>
  navTo("ItemDetail", {
    itemId: item.latestItemId, // ✅ AJOUT ICI
    title: item.title,
    circleId: activeCircle?.id,
    titleKey: item.titleKey,
    ownersList: item.ownersList,
    count: item.count,
    category: item.category,
  })

}

        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>
              {item.title} · x{item.count}
            </Text>
            <Text style={styles.meta}>
              {(item.ownersList || []).slice(0, 3).map((o) => o.name).join(", ")}
              {(item.ownersList || []).length > 3 ? ` et ${item.ownersList.length - 3} autres` : ""}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.subtext} />
        </TouchableOpacity>
      );
    },
 [navigation, activeCircle?.id]
  );

  const openAddItem = useCallback(() => {
  navTo("InventoryUpdate", { circleId: activeCircle?.id });

}, []);

  const openCreateCall = useCallback(() => setCreateCallOpen(true), []);

  const [editingItem, setEditingItem] = useState(null);

const openEditItem = useCallback((item) => {
  if (!item) return;

  setEditingItem(item);

  setItemTitle(String(item.title || ""));
  setItemDesc(String(item.description || ""));
  setItemCategory(String(item.category || "other"));

  setItemPhoto(item.photo ? { uri: item.photo, base64: null, mime: null } : null);

  // pré-cocher le cercle de cet item
  const cid = String(item.circle_id || activeCircle?.id || "");
  setItemCircleId(cid);
  setSelectedCircleIds(cid ? [cid] : []);

  setAddItemOpen(true);
}, [activeCircle?.id]);


  const EmptyBlock = useMemo(() => {
    if (!itemsReady || loading) return null;

    const msg =
      tab === "mine"
        ? "Aucune annonce publiée pour l’instant."
        : `Aucun article${filters.category !== "all" ? ` dans “${labelCat(filters.category)}”` : ""}.`;

    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyCard}>
          <MaterialCommunityIcons name="sparkles" size={22} color={colors.mint} />
          <Text style={styles.emptyTitle}>Rien à afficher</Text>
          <Text style={styles.empty}>{msg}</Text>

          <View style={{ height: 12 }} />

          <TouchableOpacity onPress={openAddItem} style={styles.primaryBtn} activeOpacity={0.92}>
            <Text style={styles.primaryBtnTxt}>Mettre à jour mon inventaire</Text>
          </TouchableOpacity>

          {!!activeCircle?.id && (
            <TouchableOpacity
              onPress={openCircleChat}
              style={[styles.secondaryBtn, { marginTop: 10 }]}
              activeOpacity={0.92}
            >
              <MaterialCommunityIcons name="message-text-outline" size={18} color={colors.text} />
              <Text style={styles.secondaryBtnTxt}>Ouvrir le chat</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }, [itemsReady, loading, tab, filters.category, openAddItem, activeCircle?.id, openCircleChat]);



  function FeedHeroSquare({ row, onPress }) {
  const meta = catMeta(row.category || "other");

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={styles.cardSquare}
    >
      <CardMedia
        category={row.category}
        label={meta.label}
        photoUrl={row.photo}
      />

      <View style={styles.cardBottomOverlay}>
        <Text style={styles.cardTitleOverlay} numberOfLines={1}>
          {row.title}
        </Text>
        <Text style={styles.cardCount}>
          {row.count} pers.
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function CallFeedCard({ c }) {
  const isMine = String(c.author_id) === String(currentUserId);
  const authorName = String(c?.author_name || "Membre").trim() || "Membre";

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => navTo("CallDetail", { callId: c.id, title: "Onde" })}
      style={styles.callFeedCard}
    >
      {/* Header */}
      <View style={styles.callFeedTop}>
        <View style={styles.callAvatarBubble}>
          <Text style={styles.callAvatarTxt}>
            {authorName.slice(0, 1).toUpperCase()}
          </Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.callFeedAuthor} numberOfLines={1}>
            {authorName}
          </Text>
          <Text style={styles.callFeedMeta} numberOfLines={1}>
            {labelCat(c.category || "other")} • {fmt(c.created_at)}
          </Text>
        </View>

        <View style={styles.callFeedSeePill}>
          <Text style={styles.callFeedSeeTxt}>Voir</Text>
        </View>
      </View>

      {/* Message */}
      <Text style={styles.callFeedMsg} numberOfLines={3}>
        {c.message}
      </Text>

      {/* Actions */}
      <View style={styles.callFeedActions}>
        {isMine ? (
          <TouchableOpacity
            onPress={(e) => {
              e?.stopPropagation?.();
              deleteCall(c);
            }}
            activeOpacity={0.85}
            style={styles.callActionDanger}
          >
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={18}
              color="#ffdddd"
            />
            <Text style={styles.callActionDangerTxt}>Supprimer</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={(e) => {
              e?.stopPropagation?.();
              respondToCall(c);
            }}
            activeOpacity={0.9}
            style={styles.callActionPrimary}
          >
            <Text style={styles.callActionPrimaryTxt}>
              Je peux aider
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}


  function CardMedia({ category, label, photoUrl }) {
  const da = daForCat(category);
  const hasPhoto = !!photoUrl;

  return (
    <View style={styles.mediaWrap}>
      <LinearGradient
        colors={[da.a, da.b]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.mediaBlobA} />
      <View style={styles.mediaBlobB} />

      {hasPhoto ? (
        <>
          <Image
            source={{ uri: photoUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <View style={styles.photoWash} />
          <LinearGradient
            colors={["rgba(0,0,0,0.00)", "rgba(0,0,0,0.55)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </>
     ) : (
  <View style={styles.noPhotoFallback}>
    {/* rien au centre : pas de pictogramme */}
  </View>
)}
    </View>
  );
}

function FeedInstaCard({ row, onPress }) {
  const meta = catMeta(row.category || "other");

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.92} style={styles.instaCard}>
      <CardMedia category={row.category} photoUrl={row.photo || null} />

      {/* Catégorie : UNE fois */}
      <View style={styles.instaCatBadge}>
        <Text style={styles.instaCatTxt} numberOfLines={1}>{meta.label}</Text>
      </View>

      {/* Titre (priorité max) */}
      <View style={styles.instaBottom}>
  <Text style={styles.instaTitle} numberOfLines={2}>
    {row.title}
  </Text>

  {/* Count à gauche, CTA bloqué à droite */}
  <View style={styles.instaMetaWrap}>
    
    {/* Badge compteur (top-right) */}
<View style={styles.countBadge}>
  <MaterialCommunityIcons name="account-multiple" size={20} color="#fff" />
  <Text style={styles.countBadgeTxt}>{row.count || 0}</Text>
</View>


    <TouchableOpacity style={styles.instaSeePill} activeOpacity={0.9}>
      <Text style={styles.instaSeeTxt}>Voir</Text>
    </TouchableOpacity>
  </View>
</View>
    </TouchableOpacity>
  );
}

function useCalls(circleId) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);

  const channelRef = useRef(null);
  const rtTimerRef = useRef(null);

  // ✅ ref vers la fonction load (pour l'utiliser en realtime sans problème de scope)
  const loadRef = useRef(null);

  const load = useCallback(async () => {
    if (!circleId) return;

    setLoading(true);
    try {
      const sinceIso = isoHoursAgo(CALL_TTL_HOURS);

      // 1) Récupère les ondes
      const { data, error } = await supabase
        .from("calls")
        .select("id, circle_id, author_id, title, category, message, status, photo, created_at")
        .eq("circle_id", circleId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false });

      if (error) {
        Log?.error?.("calls", "select", error);
        setCalls([]);
        return;
      }

      const rows = data || [];

      // 2) Récupère les noms des auteurs (profiles.public_name)
      const authorIds = Array.from(
        new Set(rows.map((c) => c.author_id).filter(Boolean).map(String))
      );

      let nameById = new Map();
      if (authorIds.length) {
        const profRes = await supabase
          .from("profiles")
          .select("id, public_name")
          .in("id", authorIds);

        if (!profRes.error) {
          nameById = new Map(
            (profRes.data || []).map((p) => [String(p.id), p.public_name || "Membre"])
          );
        }
      }

      // 3) Merge (author_name)
      const merged = rows.map((c) => ({
        ...c,
        author_name: nameById.get(String(c.author_id)) || "Membre",
      }));

      setCalls(merged);
    } finally {
      setLoading(false);
    }
  }, [circleId]);

  // ✅ met à jour la ref à chaque render
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // ✅ charge au changement de circleId
  useEffect(() => {
    load();
  }, [load]);

  // ✅ realtime SUR LA TABLE calls
  useEffect(() => {
    if (!circleId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (rtTimerRef.current) {
      clearTimeout(rtTimerRef.current);
      rtTimerRef.current = null;
    }

    const ch = supabase
      .channel(`calls:${circleId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls", filter: `circle_id=eq.${circleId}` },
        () => {
          if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
          rtTimerRef.current = setTimeout(() => {
            loadRef.current?.();
          }, 200);
        }
      )
      .subscribe();

    channelRef.current = ch;

    return () => {
      if (rtTimerRef.current) {
        clearTimeout(rtTimerRef.current);
        rtTimerRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [circleId]);

  return { calls, loading, reload: load };
}


function MyItemCard({ item, onOpenDetail, onEdit }) {
  if (item?.__empty) return <View style={[styles.instaCard, { opacity: 0 }]} />;

  const meta = catMeta(item.category || "other");

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      style={styles.instaCard}
      onPress={onOpenDetail} // ✅ clic carte = détails
    >
      <CardMedia category={item.category} photoUrl={item.photo || null} label={meta.label} />

      {/* Catégorie */}
      <View style={styles.instaCatBadge}>
        <Text style={styles.instaCatTxt} numberOfLines={1}>{meta.label}</Text>
      </View>

      {/* Bas */}
      <View style={styles.instaBottom}>
        <Text style={styles.instaTitle} numberOfLines={2}>
          {item.title}
        </Text>

        <View style={styles.instaMetaRow}>
          <Text style={styles.instaCount} numberOfLines={1}>
            {fmt(item.created_at)}
          </Text>

          {/* ✅ Bouton Modifier (ne doit pas déclencher le onPress parent) */}
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.(); // ✅ empêche le clic carte si supporté
              onEdit?.();
            }}
            onPressIn={(e) => e?.stopPropagation?.()}
            style={styles.instaSeePill}
          >
            <Text style={styles.instaSeeTxt}>Modifier</Text>
          </Pressable>
        </View>
      </View>
    </TouchableOpacity>
  );
}


function MyInventoryCard({ item, onOpenDetail, onEdit }) {
  if (item?.__empty) return <View style={[styles.invCard, { opacity: 0 }]} />;

  const meta = catMeta(item.category || "other");

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      style={styles.invCard}         // ✅ style inventaire (rectangle)
      onPress={onOpenDetail}         // ✅ clic carte = détail
    >
      <CardMedia category={item.category} photoUrl={item.photo || null} label={meta.label} />

      {/* badge catégorie (optionnel : tu peux le garder pour aider la lecture) */}
      <View style={styles.instaCatBadge}>
        <Text style={styles.instaCatTxt} numberOfLines={1}>{meta.label}</Text>
      </View>

      {/* bas inventaire */}
      <View style={styles.invBottomBar}>
        <Text style={styles.invTitle} numberOfLines={1}>
          {item.title}
        </Text>

        <View style={styles.invMetaRow}>
          <Text style={styles.invMetaTxt} numberOfLines={1}>
            {fmt(item.created_at)}
          </Text>

          <Pressable
            onPressIn={(e) => e?.stopPropagation?.()}
            onPress={(e) => {
              e?.stopPropagation?.();
              onEdit?.();
            }}
            style={styles.invEditPill}
          >
            <Text style={styles.invEditTxt}>Modifier</Text>
          </Pressable>
        </View>
      </View>
    </TouchableOpacity>
  );
}
// ✅ Sauvegarde (ajout / update) appelée par le bouton "Enregistrer"
const handleSaveUpdate = async () => {
  // si tu as déjà une fonction qui sauvegarde, appelle-la ici
  // ex: await saveTier(); ou await saveItem(); etc.

  if (typeof saveTier === "function") {
    return saveTier(); // 👈 si ton ancienne fonction s'appelle saveTier
  }

  if (typeof saveItem === "function") {
    return saveItem(); // 👈 si ta fonction s'appelle saveItem
  }

  console.warn("handleSaveUpdate: aucune fonction de sauvegarde branchée (saveTier/saveItem).");
};


  /********************* Render cards **************************/
  const renderItemList = useCallback(
    ({ item }) => {
      const isOwner = currentUserId && item.owner_id === currentUserId;

      return (
        <View style={styles.itemRow}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 }}
            activeOpacity={0.88}
            onPress={() => navTo("ItemDetail", { itemId: item.id, title: item.title || "Annonce" })}
          >
            <View style={styles.itemRowIcon}>
              <MaterialCommunityIcons name="cube-outline" size={20} color={colors.text} />
            </View>

            <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {labelCat(item.category || "other")}
              </Text>
            </View>
          </TouchableOpacity>

          {isOwner && (
            <TouchableOpacity onPress={() => openShareForItem(item)} style={styles.iconBtnMini}>
              <MaterialCommunityIcons name="share-variant-outline" size={19} color={colors.text} />
            </TouchableOpacity>
          )}

          {isOwner && (
  <TouchableOpacity onPress={() => deleteItem(item)} style={styles.iconBtnMini}>
    <MaterialCommunityIcons name="trash-can-outline" size={19} color={colors.text} />
  </TouchableOpacity>
)}

        </View>
      );
    },
    [currentUserId, navigation, openShareForItem]
  );

  const renderItemGallery = useCallback(
    ({ item }) => {
      const dotColor = catMeta(item.category || "other").dot;
      const isOwner = currentUserId && item.owner_id === currentUserId;

      return (
        <View style={styles.cardSquare}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={0.92}
            onPress={() => navTo("ItemDetail", { itemId: item.id, title: item.title || "Annonce" })}
          >
           {(() => {
  const meta = catMeta(item.category || "other");
  return (
    <CardMedia
      category={item.category}
      label={meta.label}
      photoUrl={item.photo}
    />
  );
})()}


            <View style={styles.cardBottom}>
              <View style={[styles.dot, { backgroundColor: dotColor }]} />
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
          </TouchableOpacity>

          {isOwner && (
            <View style={styles.cardActions}>
              <TouchableOpacity
                onPress={() => openShareForItem(item)}
                style={[styles.cardActionBtn, styles.cardActionSoft]}
              >
                <MaterialCommunityIcons name="share-variant-outline" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    },
    [currentUserId, navigation, openShareForItem]
  );

  const CallCard = useCallback(
    (c) => {
      const dotColor = catMeta(c.category || "other").dot;

      return (
        <View key={String(c.id)} style={styles.callCard}>
          <TouchableOpacity
            onPress={() => navigation.navigate("CallDetail", { callId: c.id, title: c.title || "Onde" })}
            activeOpacity={0.88}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 }}
          >
            <View style={[styles.callThumb, { borderColor: `${dotColor}55` }]}>
              {c.photo ? (
                <Image
                  source={{ uri: normalizeUrl(c.photo) }}
                  style={styles.callThumbImg}
                  resizeMode="cover"
                  onError={(e) => onImgError("call", c.id, c.photo, e)}
                />
              ) : (
                <View style={styles.callThumbPlaceholder}>
                  <MaterialCommunityIcons name="bullhorn-outline" size={18} color={colors.text} />
                </View>
              )}
              <View style={[styles.callDot, { backgroundColor: dotColor }]} />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.callTitle} numberOfLines={1}>
                {c.title?.trim() || "Besoin rapide"}
              </Text>
              <Text style={styles.callMsg} numberOfLines={2}>
                {c.message}
              </Text>
              <Text style={styles.callMeta} numberOfLines={1}>
                {labelCat(c.category || "other")} • {fmt(c.created_at)}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      );
    },
    [navigation]
  );

  function FeedInstaTile({ item, authorName, onPress }) {
  const meta = catMeta(item.category || "other");

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.92} style={styles.instaTile}>
      <CardMedia
        category={item.category}
        label={meta.label}
        photoUrl={item.photo}
      />

      <View style={styles.instaOverlay}>
        <Text style={styles.instaTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.instaAuthor} numberOfLines={1}>
          {authorName}
        </Text>
      </View>

      <View
        style={[
          styles.instaBadge,
          { borderColor: `${meta.dot}88`, backgroundColor: `${meta.dot}22` },
        ]}
      >
        <Text style={styles.instaBadgeTxt} numberOfLines={1}>
          {meta.label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function FeedPostCard({ row, onPress }) {
  const meta = catMeta(row.category || "other");
  const da = daForCat(row.category || "other");

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={styles.postCard}>
      {/* Media grand format */}
      <View style={styles.postMedia}>
        <CardMedia
          category={row.category}
          label={meta.label}
          photoUrl={row.photo || null}
        />

        {/* Badge catégorie */}
        <View style={[styles.postBadge, { borderColor: `${meta.dot}88`, backgroundColor: `${meta.dot}22` }]}>
          <Text style={styles.postBadgeTxt} numberOfLines={1}>{meta.label}</Text>
        </View>

        {/* Overlay bas : gros titre + CTA */}
        <View style={styles.postBottom}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.postTitle} numberOfLines={2}>
              {row.title}
            </Text>

            <View style={styles.postMetaRow}>
              <AvatarStack ownersList={row.ownersList} />
              <Text style={styles.postCountTxt} numberOfLines={1}>
                {row.count} personne{row.count > 1 ? "s" : ""} l’ont
              </Text>
            </View>
          </View>

          <TouchableOpacity onPress={onPress} style={styles.postCtaBtn} activeOpacity={0.9}>
            <Text style={styles.postCtaTxt}>Voir</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}
const renderIgCard = ({ item }) => {
  const hasPhoto = !!item.photoURL; // adapte au nom réel
  const owners = item.ownersPreview || []; // ex: [{name:"Anna"}, {name:"Tom"}]
  const count = item.count || 0;

  return (
    <Pressable
      style={styles.igCard}
      onPress={() => navigation.navigate("ArticleGroup", { titleKey: item.titleKey })}
    >
      <ImageBackground
        source={hasPhoto ? { uri: item.photoURL } : null}
        style={styles.igBg}
        resizeMode="cover"
      >
        {/* Fallback si pas de photo (pour que ça reste beau) */}
        {!hasPhoto && (
          <View style={[styles.igBg, { backgroundColor: "rgba(255,255,255,0.06)" }]} />
        )}

        <View style={styles.igWash} />

        {/* Badge catégorie (UNE seule fois) */}
        <View style={[styles.igCatBadge, { borderColor: item.catBorder, backgroundColor: item.catBg }]}>
          <Text style={styles.igCatBadgeTxt}>{item.categoryLabel}</Text>
        </View>

        {/* Picto catégorie centré */}
        <View style={styles.igCenterIcon}>
          {item.CategoryIcon /* <Ionicons .../> ou ton composant */}
        </View>

        {/* Bas de carte unie */}
        <View style={styles.igBottomBar}>
          <Text numberOfLines={2} style={styles.igTitle}>
            {item.title}
          </Text>

          <View style={styles.igMetaRow}>
            <View style={styles.igSocial}>
              <View style={styles.igAvatarStack}>
                {owners.slice(0, 3).map((p, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.igAvatarBubble,
                      { marginLeft: idx === 0 ? 0 : -8 },
                    ]}
                  >
                    <Text style={styles.igAvatarTxt}>
                      {(p?.name || "?").slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                ))}
              </View>

              <Text style={styles.igCountTxt}>{count} l’ont</Text>
            </View>

            <View style={styles.igCta}>
              <Text style={styles.igCtaTxt}>Voir</Text>
            </View>
          </View>
        </View>
      </ImageBackground>
    </Pressable>
  );
};

  /********************* Top bar **************************/
  const TopBar = (
    <View style={styles.topbar}>
      <TouchableOpacity onPress={() => setCircleHubOpen(true)} style={styles.circleChip} activeOpacity={0.9}>
        <View style={styles.circleChipIcon}>
          <MaterialCommunityIcons name="account-group-outline" size={18} color={colors.text} />
        </View>


        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.circleChipTitle} numberOfLines={1}>
            {activeCircle?.name || "Mes cercles"}
          </Text>
          <Text style={styles.circleChipSub} numberOfLines={1}>
            {members?.length ? `${members.length} membre${members.length > 1 ? "s" : ""}` : "—"}
          </Text>
        </View>

        <MaterialCommunityIcons name="chevron-down" size={18} color={colors.subtext} />
      </TouchableOpacity>

    <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity onPress={() => setFiltersOpen(true)} style={styles.iconBtn}>
          <MaterialCommunityIcons name="tune-variant" size={20} color={colors.text} />
        </TouchableOpacity>


        <TouchableOpacity onPress={openCircleChat} style={styles.iconBtn}>
          <MaterialCommunityIcons name="message-text-outline" size={20} color={colors.text} />
        </TouchableOpacity>
       </View>
{/* PATCH END */}    
</View>
  );

  
  /// PATCH START: Segmented simplified -> Feed / Mon inventaire
  const Segmented = (
    <View style={styles.segmented}>
      {[
        { k: "feed", label: "Emprunter", icon: "view-dashboard-outline" },
        { k: "mine", label: "Mon inventaire", icon: "cube-outline" },
      ].map((t) => (
        <TouchableOpacity
          key={t.k}
          onPress={() => setTab(t.k)}
          style={[styles.segBtn, tab === t.k && styles.segBtnActive]}
          activeOpacity={0.9}
        >
          <MaterialCommunityIcons name={t.icon} size={16} color={tab === t.k ? colors.mint : colors.text} />
          <Text style={[styles.segTxt, tab === t.k && styles.segTxtActive]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  /********************* Render **************************/
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View
        style={[
          styles.container,
          contentMax && { alignSelf: "center", width: contentMax },
          { paddingBottom: Math.max(12, insets.bottom) },
        ]}
      >
        {TopBar}

        {!activeCircle ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="account-group" size={26} color={colors.mint} />
              <Text style={styles.emptyTitle}>Aucun cercle</Text>
              <Text style={styles.empty}>Crée ton premier cercle pour démarrer.</Text>

              <View style={{ height: 12 }} />

              <TouchableOpacity
                onPress={() => {
                  setCircleEditMode("create");
                  setCircleNameDraft("Mon cercle");
                  setCircleEditOpen(true);
                }}
                style={styles.primaryBtn}
                activeOpacity={0.92}
              >
                <Text style={styles.primaryBtnTxt}>Créer un cercle</Text>
              </TouchableOpacity>

              {/* ✅ NOUVEAU : rejoindre via code, même sans cercle */}
              <TouchableOpacity
                onPress={() => setJoinByCodeOpen(true)}
                style={[styles.secondaryBtn, { marginTop: 10 }]}
                activeOpacity={0.92}
              >
                <MaterialCommunityIcons name="key-outline" size={18} color={colors.text} />
                <Text style={styles.secondaryBtnTxt}>Rejoindre avec un code</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {Segmented}

            
{tab === "feed" ? (
  <FlatList
    key="feed-2cols"
    data={data2cols}
    keyExtractor={(r, i) => (r.__empty ? `empty-${i}` : `explore-${r.titleKey}`)}
    numColumns={2}
    columnWrapperStyle={{ gap: 12 }}
    contentContainerStyle={{
      paddingTop: 12,
      paddingBottom: bottomContentPadding,
      gap: 12,
    }}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    ListEmptyComponent={EmptyBlock}
    ListHeaderComponent={
      <View style={{ paddingBottom: 12 }}>
        {!!(calls || []).length && (
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.sectionLabel, { fontSize: 14, marginBottom: 8 }]}>
              Ondes (24h)
            </Text>

            {(calls || []).slice(0, 6).map((c) => (
              <CallFeedCard key={String(c.id)} c={c} />
            ))}
          </View>
        )}
      </View>
    }
    renderItem={renderFeedCard}
  />
) : tab === "mine" ? (
<FlatList
  key="mine-1col"
  data={myItems}
  keyExtractor={(it) => `mine-${it.id}`}
  numColumns={1}   // ✅ pleine largeur
  contentContainerStyle={{
    paddingVertical: 12,
    paddingBottom: bottomContentPadding,
    gap: 12,
  }}
  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
  renderItem={({ item }) => (
    <MyInventoryCard
      item={item}
      onOpenDetail={() =>
        navTo("ItemDetail", { itemId: item.id, title: item.title || "Objet" })
      }
      onEdit={() => openEditItem(item)}
    />
  )}
  ListEmptyComponent={EmptyBlock}
/>


) : null}

{!!activeCircle && (
  <View
    pointerEvents="box-none"
    style={[styles.fabWrap, { bottom: Math.max(16, insets.bottom + 8) }]}
  >
    <TouchableOpacity
      onPress={() => setQuickActionsOpen(true)}
      style={styles.fabMain}
      activeOpacity={0.92}
    >
      <MaterialCommunityIcons name="plus" size={24} color={colors.bg} />
    </TouchableOpacity>
  </View>
)}

{/* Actions rapides */}
<Modal
  visible={quickActionsOpen}
  transparent
  animationType="fade"
  statusBarTranslucent
  presentationStyle="overFullScreen"
  onRequestClose={() => setQuickActionsOpen(false)}
>
  <View style={styles.modalOverlay}>
    <TouchableWithoutFeedback onPress={() => setQuickActionsOpen(false)}>
      <View style={StyleSheet.absoluteFill} />
    </TouchableWithoutFeedback>

    <View style={[styles.dropdownSheet, { paddingBottom: Math.max(14, insets.bottom) }]}>
      <Text style={styles.dropdownTitle}>Actions rapides</Text>

      <TouchableOpacity
        onPress={() => {
          setQuickActionsOpen(false);
          navTo("InventoryUpdate", { circleId: activeCircle?.id });
        }}
        style={styles.dropdownItem}
        activeOpacity={0.85}
      >
        <View style={styles.dropdownIcon}>
          <MaterialCommunityIcons name="cube-outline" size={18} color={colors.text} />
        </View>
        <Text style={styles.dropdownItemTxt}>Mettre à jour mon inventaire</Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color={colors.subtext} />
      </TouchableOpacity>

    <TouchableOpacity
  onPress={() => {
    setQuickActionsOpen(false);
    setCreateCallOpen(true);
  }}
  style={styles.dropdownItem}
  activeOpacity={0.85}
>
  <View style={styles.dropdownIcon}>
    <MaterialCommunityIcons name="bullhorn-outline" size={18} color={colors.text} />
  </View>
  <Text style={styles.dropdownItemTxt}>Lancer une onde</Text>
  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.subtext} />
</TouchableOpacity>

    </View>
  </View>
</Modal>


        {/* Hub Cercle */}
        <Modal
          visible={circleHubOpen}
          transparent
          animationType="fade"
          statusBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={() => setCircleHubOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setCircleHubOpen(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <View style={[styles.dropdownSheet, { paddingBottom: Math.max(14, insets.bottom) }]}>
              <Text style={styles.dropdownTitle}>Cercle</Text>

              {!circlesReady ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator />
                  <Text style={styles.loadingTxt}>Chargement…</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                  {(circles || []).map((c) => {
                    const selected = activeCircle?.id === c.id;
                    return (
                      <TouchableOpacity
                        key={String(c.id)}
                        style={[styles.dropdownItem, selected && styles.dropdownItemActive]}
                        onPress={() => {
                          setActiveCircle(c);
                          setCircleHubOpen(false);
                          setTimeout(() => {
                            refresh();
                            reloadCalls();
                            reloadMembers();
                          }, 80);
                        }}
                        activeOpacity={0.85}
                      >
                        <View style={styles.dropdownIcon}>
                          <MaterialCommunityIcons name="account-group-outline" size={18} color={colors.text} />
                        </View>
                        <Text
                          style={[styles.dropdownItemTxt, selected && styles.dropdownItemTxtActive]}
                          numberOfLines={1}
                        >
                          {c.name || `Cercle ${c.id}`}
                        </Text>
                        {selected && <MaterialCommunityIcons name="check" size={18} color={colors.mint} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              <View style={styles.hr} />

              <TouchableOpacity
                onPress={() => {
                  setCircleHubOpen(false);
                  setMembersOpen(true);
                }}
                style={styles.dropdownItem}
                activeOpacity={0.85}
              >
                <View style={styles.dropdownIcon}>
                  <MaterialCommunityIcons name="account-multiple" size={18} color={colors.text} />
                </View>
                <Text style={styles.dropdownItemTxt}>Voir les membres</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.subtext} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setCircleHubOpen(false);
                  openContactsPicker({ action: "invite_members", circleId: activeCircle?.id });
                }}
                style={styles.dropdownItem}
                activeOpacity={0.85}
              >
                <View style={styles.dropdownIcon}>
                  <MaterialCommunityIcons name="account-plus-outline" size={18} color={colors.text} />
                </View>
                <Text style={styles.dropdownItemTxt}>Inviter des membres</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.subtext} />
              </TouchableOpacity>

              {/* ✅ NOUVEAU : rejoindre via code (accessible aussi quand tu as déjà des cercles) */}
              <TouchableOpacity
                onPress={() => {
                  setCircleHubOpen(false);
                  setJoinByCodeOpen(true);
                }}
                style={styles.dropdownItem}
                activeOpacity={0.85}
              >
                <View style={styles.dropdownIcon}>
                  <MaterialCommunityIcons name="key-outline" size={18} color={colors.text} />
                </View>
                <Text style={styles.dropdownItemTxt}>Rejoindre avec un code</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.subtext} />
              </TouchableOpacity>

              {isAdminOfActive ? (
                <>
                  <TouchableOpacity
                    onPress={() => {
                      setCircleHubOpen(false);
                      setCircleEditMode("rename");
                      setCircleNameDraft(activeCircle?.name || "Mon cercle");
                      setCircleEditOpen(true);
                    }}
                    style={styles.dropdownItem}
                    activeOpacity={0.85}
                  >
                    <View style={styles.dropdownIcon}>
                      <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.text} />
                    </View>
                    <Text style={styles.dropdownItemTxt}>Renommer</Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={colors.subtext} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setCircleHubOpen(false);
                      Alert.alert("Supprimer", "Supprimer définitivement ce cercle ?", [
                        { text: "Annuler", style: "cancel" },
                        { text: "Supprimer", style: "destructive", onPress: deleteActiveCircle },
                      ]);
                    }}
                    style={[styles.dropdownItem, { backgroundColor: "rgba(255,80,80,0.10)" }]}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.dropdownIcon, { backgroundColor: "rgba(255,80,80,0.12)" }]}>
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color="#ffdddd" />
                    </View>
                    <Text style={[styles.dropdownItemTxt, { color: "#ffdddd" }]}>Supprimer le cercle</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    setCircleHubOpen(false);
                    Alert.alert("Quitter", "Voulez-vous quitter ce cercle ?", [
                      { text: "Annuler", style: "cancel" },
                      { text: "Quitter", style: "destructive", onPress: leaveActiveCircle },
                    ]);
                  }}
                  style={styles.dropdownItem}
                  activeOpacity={0.85}
                >
                  <View style={styles.dropdownIcon}>
                    <MaterialCommunityIcons name="logout" size={18} color={colors.text} />
                  </View>
                  <Text style={styles.dropdownItemTxt}>Quitter le cercle</Text>
                </TouchableOpacity>
              )}

              <View style={styles.hr} />

              <TouchableOpacity
                onPress={() => {
                  setCircleHubOpen(false);
                  setCircleEditMode("create");
                  setCircleNameDraft("Mon cercle");
                  setCircleEditOpen(true);
                }}
                style={[styles.primaryBtn, { marginTop: 6 }]}
                activeOpacity={0.92}
              >
                <Text style={styles.primaryBtnTxt}>Créer un nouveau cercle</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={showCongrats} transparent animationType="fade">
  <View style={styles.modalOverlay}>
    <View style={[styles.sheet, { alignItems: "center" }]}>
      <MaterialCommunityIcons name="check-circle" size={36} color={colors.mint} />
      <Text style={[styles.sheetTitle, { marginTop: 8 }]}>
        Cercle créé
      </Text>
      <Text style={styles.meta}>
        Tu peux maintenant ajouter des membres.
      </Text>
    </View>
  </View>
</Modal>


        {/* ✅ MODAL Rejoindre avec un code (nouveau) */}
        <Modal
          visible={joinByCodeOpen}
          transparent
          animationType="slide"
          statusBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={() => setJoinByCodeOpen(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setJoinByCodeOpen(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <View style={[styles.sheet, { paddingBottom: Math.max(14, insets.bottom) }]}>
              <Text style={styles.sheetTitle}>Rejoindre avec un code</Text>
              <TouchableOpacity
  onPress={async () => {
    try {
      const clip = await Clipboard.getStringAsync();
      if (clip) setJoinCodeDraft(clip);
      else Alert.alert("Presse-papiers", "Rien à coller.");
    } catch (e) {
      Alert.alert("Presse-papiers", "Impossible de lire le presse-papiers.");
    }
  }}
  style={styles.secondaryBtn}
  activeOpacity={0.92}
>
  <Text style={styles.secondaryBtnTxt}>Coller l’invitation</Text>
</TouchableOpacity>


              <Text style={styles.sectionLabel}>
                Colle le lien d’invitation (ou juste le code).
              </Text>

              <TextInput
                value={joinCodeDraft}
                onChangeText={setJoinCodeDraft}
                placeholder="Ex: xagzuVVm6g-u5ye-..."
                placeholderTextColor={colors.subtext}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />

              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                <TouchableOpacity
                  onPress={() => {
                    setJoinByCodeOpen(false);
                    setJoinCodeDraft("");
                  }}
                  style={[styles.secondaryBtn, { flex: 1 }]}
                  activeOpacity={0.92}
                >
                  <Text style={styles.secondaryBtnTxt}>Annuler</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={joiningByCode}
                  onPress={() => joinCircleByCode(joinCodeDraft)}
                  style={[styles.primaryBtn, { flex: 1, opacity: joiningByCode ? 0.75 : 1 }]}
                  activeOpacity={0.92}
                >
                  {joiningByCode ? (
                    <ActivityIndicator color={colors.bg} />
                  ) : (
                    <Text style={styles.primaryBtnTxt}>Rejoindre</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Membres */}
        <Modal
          visible={membersOpen}
          transparent
          animationType="fade"
          statusBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={() => setMembersOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setMembersOpen(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <View style={[styles.dropdownSheet, { paddingBottom: Math.max(14, insets.bottom) }]}>
              <View style={styles.membersHeader}>
                <Text style={styles.dropdownTitle}>Membres</Text>
                <TouchableOpacity
                  onPress={() => {
                    setMembersOpen(false);
                    openContactsPicker({ action: "invite_members", circleId: activeCircle?.id });
                  }}
                >
                  <Text style={styles.link}>Inviter</Text>
                </TouchableOpacity>
              </View>

              {loadingMembers ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator />
                  <Text style={styles.loadingTxt}>Chargement…</Text>
                </View>
              ) : (members || []).length === 0 ? (
                <Text style={styles.empty}>Aucun membre pour l’instant.</Text>
              ) : (
                members.map((m) => (
                  <View
                  key={String(m.user_id)}
                    style={[styles.dropdownItem, { justifyContent: "space-between" }]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                      <View style={styles.memberAvatar}>
                        <MaterialCommunityIcons name="account" size={18} color={colors.text} />
                      </View>
                      <Text style={styles.dropdownItemTxt} numberOfLines={1}>
                        {m.public_name || "Membre"}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        </Modal>

        {/* Filtres */}
        <Modal
          visible={filtersOpen}
          transparent
          animationType="fade"
          statusBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={() => setFiltersOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setFiltersOpen(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <View style={[styles.sheet, { paddingBottom: Math.max(14, insets.bottom) }]}>
              <Text style={styles.sheetTitle}>Filtres</Text>

              <Text style={styles.sectionLabel}>Catégorie</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
                style={{ marginTop: 8 }}
              >
                {CATEGORIES.map((c) => {
                  const active = filters.category === c.key;
                  const disabled = !hasCategoryColumn && c.key !== "all";
                  return (
                    <TouchableOpacity
                      key={c.key}
                      onPress={() => {
                        if (disabled) return;
                        setFilters({ category: c.key });
                        listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
                      }}
                      style={[styles.chip, active && styles.chipActive, disabled && { opacity: 0.5 }]}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.dot, { backgroundColor: c.dot }]} />
                      <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={{ height: 12 }} />

              <Text style={styles.sectionLabel}>Affichage</Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                <TouchableOpacity
                  onPress={() => setViewMode("gallery")}
                  style={[styles.optionPill, viewMode === "gallery" && styles.optionPillActive]}
                  activeOpacity={0.9}
                >
                  <MaterialCommunityIcons
                    name="view-grid-outline"
                    size={18}
                    color={viewMode === "gallery" ? colors.mint : colors.text}
                  />
                  <Text style={[styles.optionPillTxt, viewMode === "gallery" && { color: colors.mint }]}>
                    Galerie
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setViewMode("list")}
                  style={[styles.optionPill, viewMode === "list" && styles.optionPillActive]}
                  activeOpacity={0.9}
                >
                  <MaterialCommunityIcons
                    name="view-agenda-outline"
                    size={18}
                    color={viewMode === "list" ? colors.mint : colors.text}
                  />
                  <Text style={[styles.optionPillTxt, viewMode === "list" && { color: colors.mint }]}>Liste</Text>
                </TouchableOpacity>
              </View>

              <View style={{ height: 14 }} />
              <TouchableOpacity onPress={() => setFiltersOpen(false)} style={styles.primaryBtn} activeOpacity={0.92}>
                <Text style={styles.primaryBtnTxt}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>


<Modal
  visible={createCallOpen}
  transparent
  animationType="slide"
  statusBarTranslucent
  presentationStyle="overFullScreen"
  onRequestClose={() => setCreateCallOpen(false)}
>
  <KeyboardAvoidingView
    behavior={Platform.OS === "ios" ? "padding" : undefined}
    style={{ flex: 1 }}
  >
    <View style={styles.modalOverlay}>
      {/* ✅ Overlay qui ferme, MAIS ne bloque pas la sheet */}
      <Pressable style={{ flex: 1 }} onPress={() => setCreateCallOpen(false)} />

      {/* ✅ Sheet */}
      <View
        style={[
          styles.sheet,
          {
            height: "88%", // ✅ plus haut = tu peux scroller
            paddingBottom: Math.max(18, insets.bottom + 10),
          },
        ]}
      >
        <Text style={[styles.sheetTitle, { fontSize: 20 }]}>Lancer une onde</Text>
        <Text style={styles.meta}>Visible 24h dans ce cercle.</Text>

        <View style={{ height: 1, backgroundColor: colors.stroke, marginBottom: 10 }} />

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          <Text style={[styles.sectionLabel, { fontSize: 14 }]}>Ta demande</Text>
          <TextInput
            value={callMsg}
            onChangeText={setCallMsg}
            placeholder="Ex : Je cherche une poche à douille 🙏"
            placeholderTextColor={colors.subtext}
            style={[
              styles.input,
              { height: 140, marginTop: 10, textAlignVertical: "top" },
            ]}
            multiline
            autoFocus
          />

          <View style={{ height: 16 }} />

          <Text style={[styles.sectionLabel, { fontSize: 14 }]}>Catégorie</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, marginTop: 10, paddingVertical: 4 }}
          >
            {CATEGORIES.filter((c) => c.key !== "all").map((c) => {
              const active = String(callCategory) === String(c.key);
              return (
                <TouchableOpacity
                  key={`call-cat-${c.key}`}
                  onPress={() => setCallCategory(c.key)}
                  style={[styles.chip, active && styles.chipActive]}
                  activeOpacity={0.85}
                >
                  <View style={[styles.dot, { backgroundColor: c.dot }]} />
                  <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </ScrollView>

        <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.stroke }}>
          <TouchableOpacity
            disabled={savingCall}
            onPress={saveCall}
            style={[styles.primaryBtn, savingCall && { opacity: 0.6 }]}
            activeOpacity={0.92}
          >
            <Text style={styles.primaryBtnTxt}>{savingCall ? "Publication..." : "Publier l’onde"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setCreateCallOpen(false)}
            style={[styles.secondaryBtn, { marginTop: 10 }]}
            activeOpacity={0.92}
          >
            <Text style={styles.secondaryBtnTxt}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </KeyboardAvoidingView>
</Modal>



        {/* Partage annonce */}
       <Modal
  visible={shareOpen}
  transparent
  animationType="slide"
  statusBarTranslucent
  presentationStyle="overFullScreen"
  onRequestClose={() => setShareOpen(false)}
>
  <KeyboardAvoidingView
    behavior={Platform.OS === "ios" ? "padding" : undefined}
    style={styles.modalOverlay}
  >
    <TouchableWithoutFeedback onPress={() => setShareOpen(false)}>
      <View style={StyleSheet.absoluteFill} />
    </TouchableWithoutFeedback>

    {/* ✅ plus grand */}
    <View style={[styles.sheet, { height: "90%", paddingBottom: Math.max(18, insets.bottom + 8), paddingTop: 18 }]}>
      <Text style={[styles.sheetTitle, { fontSize: 18 }]}>Partager l’annonce</Text>

      <ScrollView
        nestedScrollEnabled
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 18 }}
      >
        {/* ✅ Preview plus grande */}
        <Text style={[styles.sectionLabel, { marginTop: 6 }]}>Aperçu</Text>

        <View style={[styles.previewRow, { marginTop: 10, alignItems: "flex-start" }]}>
          <View style={[styles.previewImgBox, { width: 76, height: 76, borderRadius: 18 }]}>
            {shareItem?.photo ? (
              <Image
                source={{ uri: normalizeUrl(shareItem.photo) }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
                onError={(e) => onImgError("share", shareItem?.id, shareItem?.photo, e)}
              />
            ) : (
              <View style={styles.previewPlaceholder}>
                <MaterialCommunityIcons name="image-off-outline" size={24} color={colors.subtext} />
              </View>
            )}
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { fontSize: 16 }]} numberOfLines={2}>
              {shareItem?.title || "Annonce"}
            </Text>
            <Text style={[styles.meta, { marginTop: 6 }]} numberOfLines={4}>
              {shareItem?.description || "—"}
            </Text>
          </View>
        </View>

        <View style={{ height: 16 }} />

        {/* ✅ Action principale : invitation */}
        <Text style={styles.sectionLabel}>Partager à quelqu’un</Text>

        <TouchableOpacity
          onPress={() => shareInviteForItem(shareItem)}
          style={[styles.primaryBtn, { marginTop: 10 }]}
          activeOpacity={0.92}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <MaterialCommunityIcons name="share-outline" size={20} color={colors.bg} />
            <Text style={[styles.primaryBtnTxt, { fontSize: 16 }]}>Partager l’annonce</Text>
          </View>
        </TouchableOpacity>

        <Text style={[styles.meta, { marginTop: 8 }]}>
          Ceci envoie un message avec un code pour rejoindre le cercle et accéder à l’annonce.
        </Text>

        <View style={{ height: 18 }} />

        {/* ✅ Option 2 : copier dans d’autres cercles */}
        <Text style={styles.sectionLabel}>Partager dans d’autres cercles</Text>

        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, marginTop: 10, paddingVertical: 4 }}
        >
          {(circles || [])
            .filter((c) => c.id !== shareItem?.circle_id)
            .map((c) => {
              const selected = shareCircleIds.includes(c.id);
              return (
                <TouchableOpacity
                  key={`share-circle-${c.id}`}
                  onPress={() =>
                    setShareCircleIds((prev) =>
                      selected ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                    )
                  }
                  style={[styles.chip, { height: 40, paddingHorizontal: 14 }, selected && styles.chipActive]}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons
                    name={selected ? "checkbox-marked-outline" : "checkbox-blank-outline"}
                    size={18}
                    color={selected ? colors.mint : colors.text}
                  />
                  <Text style={[styles.chipTxt, { fontSize: 14 }, selected && styles.chipTxtActive]} numberOfLines={1}>
                    {c.name || `Cercle ${c.id}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
        </ScrollView>

        <View style={{ height: 14 }} />

        <TouchableOpacity
          disabled={sharing || (shareCircleIds || []).length === 0}
          onPress={async () => {
            setSharing(true);
            try {
              const dests = (shareCircleIds || [])
                .filter(Boolean)
                .filter((id) => id !== shareItem?.circle_id);

              if (!dests.length) {
                Alert.alert("Partage", "Choisis au moins un cercle.");
                return;
              }

              const res = await shareItemToOtherCircles(shareItem, dests);
              setShareOpen(false);

              if (dests.includes(activeCircle?.id)) setTimeout(() => refresh(), 120);

              Alert.alert("Partage", `Cercles: ${res.ok} ok${res.ko ? ` / ${res.ko} échec` : ""}`);
            } finally {
              setSharing(false);
            }
          }}
          style={[
            styles.secondaryBtn,
            { opacity: sharing || (shareCircleIds || []).length === 0 ? 0.6 : 1, marginTop: 4 },
          ]}
          activeOpacity={0.92}
        >
          {sharing ? (
            <ActivityIndicator />
          ) : (
            <>
              <MaterialCommunityIcons name="account-group-outline" size={18} color={colors.text} />
              <Text style={[styles.secondaryBtnTxt, { fontSize: 16 }]}>
                Copier dans mes cercles {shareCircleIds?.length ? `(${shareCircleIds.length})` : ""}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 10 }} />
      </ScrollView>
    </View>
  </KeyboardAvoidingView>
</Modal>


        {/* Contacts Picker */}
        <Modal
          visible={contactsQuickOpen}
          transparent
          animationType="slide"
          statusBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={() => setContactsQuickOpen(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setContactsQuickOpen(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <View style={[styles.sheet, { paddingBottom: Math.max(14, insets.bottom) }]}>
              <Text style={styles.sheetTitle}>Choisir des contacts</Text>

              <View style={[styles.searchRow, { marginTop: 8 }]}>
                <MaterialCommunityIcons name="magnify" size={18} color={colors.subtext} />
                <TextInput
                  placeholder="Rechercher…"
                  placeholderTextColor={colors.subtext}
                  value={contactsFilter}
                  onChangeText={setContactsFilter}
                  style={styles.searchInput}
                  returnKeyType="search"
                />
                {!!contactsFilter && (
                  <TouchableOpacity onPress={() => setContactsFilter("")}>
                    <MaterialCommunityIcons name="close-circle" size={18} color={colors.subtext} />
                  </TouchableOpacity>
                )}
              </View>

              <View style={{ height: 10 }} />

              {contactsLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator />
                  <Text style={styles.loadingTxt}>Lecture du carnet…</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                  {contactsList
                    .filter(
                      (c) =>
                        !contactsFilter ||
                        c.name?.toLowerCase().includes(contactsFilter.toLowerCase()) ||
                        c.phone?.includes(contactsFilter)
                    )
                    .map((c) => {
                      const selected = contactsSel.has(c.id);
                      return (
                        <TouchableOpacity
                          key={c.id}
                          onPress={() => {
                            setContactsSel((prev) => {
                              const next = new Set(prev);
                              selected ? next.delete(c.id) : next.add(c.id);
                              return next;
                            });
                          }}
                          style={[styles.dropdownItem, selected && styles.dropdownItemActive]}
                          activeOpacity={0.85}
                        >
                          <MaterialCommunityIcons
                            name={selected ? "checkbox-marked-outline" : "checkbox-blank-outline"}
                            size={18}
                            color={selected ? colors.mint : colors.text}
                          />
                          <View style={{ marginLeft: 8, flex: 1 }}>
                            <Text style={styles.dropdownItemTxt} numberOfLines={1}>
                              {c.name}
                            </Text>
                            <Text style={styles.meta}>{c.phone}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                </ScrollView>
              )}

              <View style={{ height: 12 }} />

              {contactsAction === "invite_members" ? (
                <TouchableOpacity
                  disabled={addingContacts}
                  onPress={async () => {
                    const circleId = inviteTargetCircleId || activeCircle?.id;
                    if (!circleId) {
                      Alert.alert("Inviter", "Sélectionne un cercle d’abord.");
                      return;
                    }
                    if (contactsSel.size === 0) {
                      Alert.alert("Inviter", "Sélectionne au moins un contact.");
                      return;
                    }
                    const res = await inviteSelectedContactsToCircle({ circleId, itemTitle: null });
                    setContactsQuickOpen(false);
                    setContactsSel(new Set());
                    setContactsFilter("");
                    Alert.alert("Invitations", `${res.ok} envoyée(s)${res.ko ? ` • ${res.ko} échec(s)` : ""}`);
                  }}
                  style={[styles.primaryBtn, { opacity: addingContacts ? 0.7 : 1 }]}
                  activeOpacity={0.92}
                >
                  {addingContacts ? (
                    <ActivityIndicator color={colors.bg} />
                  ) : (
                    <Text style={styles.primaryBtnTxt}>Inviter au cercle</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => setContactsQuickOpen(false)} style={styles.primaryBtn} activeOpacity={0.92}>
                  <Text style={styles.primaryBtnTxt}>OK</Text>
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Consent auto-contenu */}
        <InlineContactsConsentModal
          visible={contactsConsentOpen}
          onAccept={async () => {
            setContactsConsentOpen(false);
            await AsyncStorage.setItem("contacts_consent_v1", "granted");

            const res = await ensureContactsPermissionHard({
              onGoToSettings: () => {
                pendingOpenContactsRef.current = true;
              },
            });
            if (!res.ok) return;

            pendingOpenContactsRef.current = false;
            setContactsSel(new Set());
            setContactsFilter("");
            setContactsQuickOpen(true);
            loadDeviceContacts();
          }}
          onDecline={() => {
            pendingOpenContactsRef.current = false;
            setContactsConsentOpen(false);
          }}
        />

        {/* Create/Rename cercle */}
        <Modal
          visible={circleEditOpen}
          transparent
          animationType="slide"
          statusBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={() => setCircleEditOpen(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setCircleEditOpen(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <View style={[styles.sheet, { paddingBottom: Math.max(14, insets.bottom) }]}>
              <Text style={styles.sheetTitle}>
                {circleEditMode === "create" ? "Créer un cercle" : "Renommer le cercle"}
              </Text>

              <TextInput
                value={circleNameDraft}
                onChangeText={setCircleNameDraft}
                placeholder="Nom du cercle"
                placeholderTextColor={colors.subtext}
                style={styles.input}
                returnKeyType="done"
              />

              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                <TouchableOpacity
                  onPress={() => setCircleEditOpen(false)}
                  style={[styles.secondaryBtn, { flex: 1 }]}
                  activeOpacity={0.92}
                >
                  <Text style={styles.secondaryBtnTxt}>Annuler</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={savingCircleName}
                  onPress={async () => {
                    if (savingCircleName) return;
                    setSavingCircleName(true);
                    try {
                      if (circleEditMode === "create") {
                        const newId = await createCircleWithName(circleNameDraft);
                        if (newId) setCircleEditOpen(false);
                      } else {
                        await renameActiveCircle(circleNameDraft);
                      }
                    } finally {
                      setSavingCircleName(false);
                    }
                  }}
                  style={[styles.primaryBtn, { flex: 1, opacity: savingCircleName ? 0.75 : 1 }]}
                  activeOpacity={0.92}
                >
                  {savingCircleName ? (
                    <ActivityIndicator color={colors.bg} />
                  ) : (
                    <Text style={styles.primaryBtnTxt}>Valider</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

{/* MODALE Add / Update Item */}
<Modal
  visible={addItemOpen}
  transparent
  animationType="slide"
  statusBarTranslucent
  presentationStyle="overFullScreen"
  onRequestClose={() => setAddItemOpen(false)}
>
  <KeyboardAvoidingView
    behavior={Platform.OS === "ios" ? "padding" : undefined}
    style={styles.modalOverlay}
  >
    <TouchableWithoutFeedback onPress={() => setAddItemOpen(false)}>
      <View style={StyleSheet.absoluteFill} />
    </TouchableWithoutFeedback>

    <View
      style={[
        styles.sheet,
        {
          height: "90%",
          paddingBottom: Math.max(18, insets.bottom + 10),
        },
      ]}
    >
      {/* HEADER */}
      <View style={{ paddingBottom: 10 }}>
        <Text style={[styles.sheetTitle, { fontSize: 20 }]}>
          {editingItem ? "Modifier l’objet" : "Ajouter un objet"}
        </Text>

        {/* ✅ nom de l'item visible quand tu édites */}
        {editingItem ? (
          <Text style={[styles.sectionLabel, { marginTop: 6, fontSize: 13, opacity: 0.9 }]} numberOfLines={1}>
            {itemTitle || editingItem?.title || "Objet"}
          </Text>
        ) : (
          <Text style={[styles.sectionLabel, { marginTop: 6, fontSize: 13, opacity: 0.9 }]}>
            Photo, titre, description, cercles de destination
          </Text>
        )}
      </View>

      <View style={{ height: 1, backgroundColor: colors.stroke, marginBottom: 10 }} />

      <ScrollView
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 18 }}
      >
        {/* TITRE */}
        <Text style={[styles.sectionLabel, { fontSize: 14 }]}>Nom de l’objet</Text>
        <TextInput
          value={itemTitle}
          onChangeText={setItemTitle}
          placeholder="Ex: Perceuse, Raclette…"
          placeholderTextColor={colors.subtext}
          style={[styles.input, { marginTop: 10 }]}
        />

        <View style={{ height: 16 }} />

        {/* PHOTO */}
        <Text style={[styles.sectionLabel, { fontSize: 14 }]}>Photo</Text>

        {itemPhoto?.uri ? (
          <View style={[styles.photoPreviewWrap, { marginTop: 10 }]}>
            <Image source={{ uri: itemPhoto.uri }} style={styles.photoPreviewImg} resizeMode="cover" />
            <View style={styles.photoPreviewBar}>
              <TouchableOpacity onPress={pickItemPhoto} style={styles.photoPreviewBtn} activeOpacity={0.9}>
                <MaterialCommunityIcons name="image-edit-outline" size={16} color={colors.text} />
                <Text style={styles.photoPreviewBtnTxt}>Changer</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setItemPhoto(null)} style={styles.photoPreviewBtn} activeOpacity={0.9}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.text} />
                <Text style={styles.photoPreviewBtnTxt}>Retirer</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={pickItemPhoto}
            style={[styles.secondaryBtn, { marginTop: 10 }]}
            activeOpacity={0.92}
          >
            <MaterialCommunityIcons name="image-outline" size={18} color={colors.text} />
            <Text style={styles.secondaryBtnTxt}>Ajouter une photo</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 16 }} />

        {/* DESCRIPTION */}
        <Text style={[styles.sectionLabel, { fontSize: 14 }]}>Description</Text>
        <TextInput
          value={itemDesc}
          onChangeText={setItemDesc}
          placeholder="Ajoute une description plus précise…"
          placeholderTextColor={colors.subtext}
          style={[styles.input, { height: 140, marginTop: 10, textAlignVertical: "top" }]}
          multiline
        />

        <View style={{ height: 16 }} />

        {/* CERCLES */}
        <Text style={[styles.sectionLabel, { fontSize: 14 }]}>Partager dans</Text>

        <View style={{ marginTop: 10, gap: 10 }}>
          {(circles || []).map((c) => {
            const selected = selectedCircleIds?.includes(String(c.id));
            return (
              <TouchableOpacity
                key={`dest-circle-${c.id}`}
                onPress={() => {
                  setSelectedCircleIds((prev) => {
                    const arr = prev ? [...prev] : [];
                    const sid = String(c.id);
                    const idx = arr.indexOf(sid);
                    if (idx >= 0) arr.splice(idx, 1);
                    else arr.push(sid);
                    return arr;
                  });
                }}
                activeOpacity={0.9}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: selected ? "rgba(29,255,194,0.35)" : colors.stroke,
                  backgroundColor: selected ? "rgba(29,255,194,0.12)" : colors.card,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: colors.text, fontWeight: "900", flex: 1 }} numberOfLines={1}>
                  {c.name || `Cercle ${c.id}`}
                </Text>

                {selected ? (
                  <MaterialCommunityIcons name="check-circle" size={22} color={colors.mint} />
                ) : (
                  <MaterialCommunityIcons name="checkbox-blank-circle-outline" size={20} color={colors.subtext} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 18 }} />
      </ScrollView>

      {/* FOOTER */}
      <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.stroke }}>
        <TouchableOpacity
          disabled={savingItem}
          onPress={handleSaveUpdate}
          style={[styles.primaryBtn, savingItem && { opacity: 0.6 }]}
          activeOpacity={0.92}
        >
          <Text style={styles.primaryBtnTxt}>{savingItem ? "Enregistrement..." : "Enregistrer"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setAddItemOpen(false)}
          style={[styles.secondaryBtn, { marginTop: 10 }]}
          activeOpacity={0.92}
        >
          <Text style={styles.secondaryBtnTxt}>Annuler</Text>
        </TouchableOpacity>
      </View>
    </View>
  </KeyboardAvoidingView>
</Modal>

          </>
        )}

      </View>
    </SafeAreaView>
  );
}
  
/***********************
 * Styles (COMPLET) — tout ce qui est utilisé dans TON JSX
 * ✅ Noms alignés: insta*, ig*, post*, call*, chip*, sheet*, etc.
 ***********************/
const cardBase = {
  borderWidth: 1,
  borderColor: colors.stroke,
  backgroundColor: colors.card,
};

const row = { flexDirection: "row" };
const rowCenter = { flexDirection: "row", alignItems: "center" };
const center = { alignItems: "center", justifyContent: "center" };

const titleTxt = { color: colors.text, fontWeight: "900" };
const subTxt = { color: colors.subtext };

const iconBtnBase = {
  padding: 8,
  borderRadius: 12,
  ...cardBase,
};

const sheetBase = {
  backgroundColor: colors.bg,
  padding: 14,
  borderTopLeftRadius: 18,
  borderTopRightRadius: 18,
  maxHeight: "82%",
  borderWidth: 1,
  borderColor: colors.stroke,
};

const pillBase = {
  height: 44,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: colors.stroke,
  backgroundColor: colors.card,
  ...center,
};

const chipBase = {
  ...rowCenter,
  gap: 8,
  borderWidth: 1,
  borderColor: colors.stroke,
  backgroundColor: colors.card,
};

const overlaySoft = { backgroundColor: "rgba(255,255,255,0.06)" };

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, paddingHorizontal: 16 },

  /************ Topbar ************/
  topbar: {
    ...rowCenter,
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 6,
  },

  circleChip: {
    ...rowCenter,
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    maxWidth: 290,
    flex: 1,
    ...cardBase,
  },
  circleChipIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(29,255,194,0.14)",
    ...center,
    borderWidth: 1,
    borderColor: "rgba(29,255,194,0.25)",
  },
  circleChipTitle: { ...titleTxt, fontSize: 16 },
  circleChipSub: { ...subTxt, fontSize: 12, marginTop: 1 },

  iconBtn: { ...iconBtnBase },
  iconBtnMini: { ...iconBtnBase, marginLeft: 8 },

  /************ Segmented ************/
  segmented: { ...rowCenter, gap: 8, marginTop: 10 },
  segBtn: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    ...rowCenter,
    justifyContent: "center",
    gap: 8,
  },
  segBtnActive: { borderColor: "rgba(29,255,194,0.22)" },
  segTxt: { ...titleTxt },
  segTxtActive: { color: colors.mint },

  /************ Rows (liste) ************/
  itemRow: {
    ...rowCenter,
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    minHeight: 62,
    ...cardBase,
  },
  itemRowIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    ...center,
    borderWidth: 1,
    borderColor: colors.stroke,
  },
  title: { ...titleTxt },
  meta: { ...subTxt, marginTop: 2 },

  /************ Empty ************/
  emptyWrap: { alignItems: "center", paddingVertical: 24 },
  emptyCard: {
    width: "100%",
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    ...cardBase,
  },
  emptyTitle: { ...titleTxt, fontSize: 16, marginTop: 8 },
  empty: { ...subTxt, textAlign: "center", marginTop: 6, lineHeight: 18 },

  /************ Buttons ************/
  primaryBtn: {
    backgroundColor: colors.mint,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
    width: "100%",
  },
  primaryBtnTxt: { color: colors.bg, fontWeight: "900" },

  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    width: "100%",
    ...rowCenter,
    gap: 8,
    justifyContent: "center",
    ...cardBase,
  },
  secondaryBtnTxt: { ...titleTxt },

  /************ Chips / Pills ************/
  chip: {
    ...chipBase,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 999,
  },
  chipActive: {
    backgroundColor: "rgba(29,255,194,0.16)",
    borderColor: "rgba(29,255,194,0.22)",
  },
  chipTxt: { color: colors.text, fontWeight: "800" },
  chipTxtActive: { color: colors.mint },

  optionPill: {
    flex: 1,
    ...pillBase,
    ...rowCenter,
    gap: 8,
  },
  optionPillActive: { borderColor: "rgba(29,255,194,0.22)" },
  optionPillTxt: { ...titleTxt },

  /************ Small primitives used around ************/
  dot: { width: 8, height: 8, borderRadius: 999 },

  /************ FAB ************/
  fabWrap: { position: "absolute", right: 16, zIndex: 50 },
  fabMain: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.mint,
    ...center,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },

  /************ Modals / Sheets ************/
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  dropdownSheet: { ...sheetBase, gap: 8 },
  dropdownTitle: { ...titleTxt, marginBottom: 6 },

  dropdownItem: {
    ...rowCenter,
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
  },
  dropdownItemActive: { ...overlaySoft },
  dropdownItemTxt: { color: colors.text, fontWeight: "800", flex: 1 },
  dropdownItemTxtActive: { color: colors.mint },

 callFeedCard: {
  borderWidth: 1,
  borderColor: colors.stroke,
  backgroundColor: colors.card,
  borderRadius: 18,
  padding: 12,
  marginBottom: 12,
},

callFeedTop: {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
},

callAvatarBubble: {
  width: 36,
  height: 36,
  borderRadius: 999,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderColor: colors.stroke,
  backgroundColor: "rgba(255,255,255,0.06)",
},

callAvatarTxt: {
  color: colors.text,
  fontWeight: "900",
},

callFeedAuthor: {
  color: colors.text,
  fontWeight: "950",
},

callFeedMeta: {
  color: colors.subtext,
  marginTop: 2,
  fontWeight: "800",
  fontSize: 12,
},

callFeedSeePill: {
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: 999,
  backgroundColor: "rgba(29,255,194,0.92)",
  borderWidth: 1,
  borderColor: "rgba(29,255,194,0.35)",
},

callFeedSeeTxt: {
  color: colors.bg,
  fontWeight: "950",
  fontSize: 13,
},

callFeedMsg: {
  marginTop: 10,
  color: colors.text,
  fontWeight: "700",
  opacity: 0.95,
  lineHeight: 18,
},

callFeedActions: {
  marginTop: 12,
  flexDirection: "row",
  justifyContent: "flex-end",
},

callActionPrimary: {
  paddingHorizontal: 12,
  paddingVertical: 10,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: colors.stroke,
},

callActionPrimaryTxt: {
  color: colors.text,
  fontWeight: "950",
},

callActionDanger: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  paddingHorizontal: 12,
  paddingVertical: 10,
  borderRadius: 999,
  backgroundColor: "rgba(255,80,80,0.10)",
  borderWidth: 1,
  borderColor: "rgba(255,80,80,0.20)",
},

callActionDangerTxt: {
  color: "#ffdddd",
  fontWeight: "950",
},



  dropdownIcon: {
    width: 30,
    height: 30,
    borderRadius: 12,
    ...center,
    ...overlaySoft,
    borderWidth: 1,
    borderColor: colors.stroke,
  },

  link: { color: colors.mint, fontWeight: "800" },
  hr: { height: 1, backgroundColor: colors.stroke, marginVertical: 6 },

  sheet: { ...sheetBase, gap: 10 },
  sheetTitle: { ...titleTxt, marginBottom: 4 },
  sectionLabel: { ...subTxt, marginTop: 2, fontWeight: "800" },

  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.stroke,
  },

  /************ Search ************/
  searchRow: {
    ...rowCenter,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 44,
    backgroundColor: colors.card,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    paddingVertical: Platform.OS === "ios" ? 8 : 6,
  },

  /************ Members ************/
  membersHeader: {
    ...rowCenter,
    justifyContent: "space-between",
    marginBottom: 6,
  },
  memberAvatar: {
    width: 30,
    height: 30,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    ...center,
  },

  /************ Loading ************/
  loadingRow: {
    ...rowCenter,
    gap: 8,
    paddingVertical: 10,
    justifyContent: "center",
  },
  loadingTxt: { ...subTxt },

  /************ Preview (share) ************/
  previewRow: { ...rowCenter, gap: 10, marginTop: 8 },
  previewImgBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    overflow: "hidden",
    ...cardBase,
  },
  previewPlaceholder: { flex: 1, ...center },

  /************ Pricing ************/
  priceRow: { ...row, gap: 10, marginTop: 8 },

  pill: { flex: 1, ...pillBase },
  pillActive: {
    borderColor: "rgba(29,255,194,0.30)",
    backgroundColor: "rgba(29,255,194,0.12)",
  },
  pillTxt: { ...titleTxt },
  pillTxtActive: { color: colors.mint },

  helperLine: { ...subTxt, fontWeight: "700", marginTop: 6 },

  /************ Photo preview (create item) ************/
  photoPreviewWrap: {
    marginTop: 10,
    borderRadius: 14,
    overflow: "hidden",
    ...cardBase,
  },
  photoPreviewImg: { width: "100%", height: 180 },
  photoPreviewBar: { position: "absolute", top: 10, right: 10, ...row, gap: 8 },
  photoPreviewBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    ...rowCenter,
    gap: 6,
  },
  photoPreviewBtnTxt: { color: colors.text, fontWeight: "900" },

  /************ Calls ************/
  callCard: {
    ...rowCenter,
    gap: 10,
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    ...cardBase,
  },
  callThumb: {
    width: 46,
    height: 46,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    backgroundColor: colors.card,
  },
  callThumbImg: { width: "100%", height: "100%" },
  callThumbPlaceholder: { flex: 1, ...center },
  callDot: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.25)",
  },
  callTitle: { ...titleTxt },
  callMsg: { color: colors.text, opacity: 0.92, marginTop: 1, fontWeight: "700" },
  callMeta: { ...subTxt, marginTop: 6, fontSize: 12 },

  /************ Media layer (CardMedia) ************/
  mediaWrap: { width: "100%", height: "100%" },

  // blobs pop (tu les utilises)
  mediaBlobA: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    top: -70,
    right: -80,
    transform: [{ rotate: "18deg" }],
  },
  mediaBlobB: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.08)",
    bottom: -110,
    left: -110,
    transform: [{ rotate: "-12deg" }],
  },

  photoWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(11,14,20,0.18)",
  },

  noPhotoCenter: {
    flex: 1,
    ...center,
    gap: 10,
    paddingHorizontal: 12,
  },
  noPhotoPill: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.92)",
    ...center,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  noPhotoLabel: {
    color: "rgba(255,255,255,0.92)",
    fontWeight: "900",
    fontSize: 13,
  },

  /************ AvatarStack ************/
  avatarStack: { ...rowCenter },
  avatarBubble: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.stroke,
    ...center,
  },
  avatarTxt: { color: colors.text, fontWeight: "900", fontSize: 12 },

  /************ Consent ************/
  consentTxt: { ...subTxt, lineHeight: 18 },

  /************ Gallery square (renderItemGallery / FeedHeroSquare) ************/
  cardSquare: {
    flex: 1,
    minWidth: 0,
    height: 140,
    borderRadius: 18,
    overflow: "hidden",
    ...cardBase,
  },
  cardBottom: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(11,14,20,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    ...rowCenter,
    gap: 8,
  },
  cardTitle: { color: "#fff", fontWeight: "950", fontSize: 14, flex: 1 },

  cardActions: {
    position: "absolute",
    top: 10,
    right: 10,
    ...rowCenter,
    gap: 8,
  },
  cardActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    ...center,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  cardActionSoft: { backgroundColor: "rgba(0,0,0,0.35)" },

  /************ FeedHeroSquare overlay ************/
  cardBottomOverlay: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(11,14,20,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  cardTitleOverlay: {
    color: "#fff",
    fontWeight: "950",
    fontSize: 16,
    lineHeight: 18,
  },
  cardCount: {
    marginTop: 6,
    color: "rgba(255,255,255,0.84)",
    fontWeight: "900",
    fontSize: 12,
  },

  /************ Insta Explore Card (FeedInstaCard) ************/
  instaCard: {
    flex: 1,
    minWidth: 0,
    height: 240,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    position: "relative",
    marginBottom: 12,
  },
  instaCatBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  instaCatTxt: {
    color: "rgba(255,255,255,0.92)",
    fontWeight: "900",
    fontSize: 11,
  },
instaBottom: {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: 12,
},

instaTitle: {
  color: "#fff",
  fontWeight: "900",
  fontSize: 18,
  lineHeight: 22,
  letterSpacing: 0.2,
  textShadowColor: "rgba(0,0,0,0.35)",
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 10,
},

// ✅ zone meta avec espace réservé pour le bouton
instaMetaWrap: {
  marginTop: 10,
  minHeight: 32,              // garde une hauteur stable
  justifyContent: "center",
  paddingRight: 74,           // ✅ réserve la place du bouton
},

instaLeftMeta: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
},

instaSeePill: {
  position: "absolute",
  right: 0,
  top: "50%",
  transform: [{ translateY: -16 }], // centre vertical du bouton
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: 999,
  backgroundColor: "rgba(29,255,194,0.92)",
  borderWidth: 1,
  borderColor: "rgba(29,255,194,0.35)",
},

instaSeeTxt: {
  color: colors.bg,
  fontWeight: "900",
  fontSize: 13,
},


  /************ Insta Tile (FeedInstaTile / "mine") ************/
  instaTile: {
    flex: 1,
    minWidth: 0,
    height: 118,
    borderRadius: 18,
    overflow: "hidden",
    ...cardBase,
  },
  instaOverlay: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(11,14,20,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  instaAuthor: {
    marginTop: 6,
    color: "rgba(255,255,255,0.78)",
    fontWeight: "900",
    fontSize: 12,
  },
  instaBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  instaBadgeTxt: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
  },

  /************ PostCard (FeedPostCard) ************/
  postCard: {
    width: "100%",
    borderRadius: 18,
    overflow: "hidden",
    ...cardBase,
  },
  postMedia: { width: "100%", height: 320 },
  postBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  postBadgeTxt: { color: "#fff", fontWeight: "900", fontSize: 11 },
  postBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "rgba(11,14,20,0.92)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    ...rowCenter,
    gap: 10,
  },
  postTitle: {
    color: "#fff",
    fontWeight: "950",
    fontSize: 18,
    lineHeight: 21,
    letterSpacing: 0.2,
  },
  postMetaRow: { ...rowCenter, justifyContent: "space-between", marginTop: 10, gap: 10 },
  postCountTxt: { color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 12 },
  postCtaBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(29,255,194,0.92)",
    borderWidth: 1,
    borderColor: "rgba(29,255,194,0.35)",
  },
  postCtaTxt: { color: colors.bg, fontWeight: "950", fontSize: 13 },

  /************ IG styles (renderIgCard) — au cas où tu l’utilises ************/
  igCard: {
    flex: 1,
    minWidth: 0,
    height: 240,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    position: "relative",
  },
  igBg: { ...StyleSheet.absoluteFillObject },
  igWash: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(11,14,20,0.18)" },
  igCatBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  igCatBadgeTxt: { color: "#fff", fontWeight: "900", fontSize: 11 },

  // Wrap + background pour centre picto (si tu choisis de l’utiliser)
  igCenterIconWrap: {
    position: "absolute",
    top: "44%",
    left: "50%",
    transform: [{ translateX: -30 }, { translateY: -30 }],
  },
  igCenterIconBg: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },

  // (fallback) si ton JSX utilise directement igCenterIcon
  igCenterIcon: {
    position: "absolute",
    top: "44%",
    left: "50%",
    transform: [{ translateX: -30 }, { translateY: -30 }],
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },

  igBottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "rgba(11,14,20,0.92)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  igTitle: {
    color: "#fff",
    fontWeight: "950",
    fontSize: 18,
    lineHeight: 21,
    letterSpacing: 0.2,
  },
  igMetaRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  igSocial: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  igAvatarStack: { flexDirection: "row", alignItems: "center" },
  igAvatarBubble: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  igAvatarTxt: { color: "#fff", fontWeight: "900", fontSize: 11 },
  igCountTxt: { color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 12 },
  igCta: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(29,255,194,0.92)",
    borderWidth: 1,
    borderColor: "rgba(29,255,194,0.35)",
  },
  noPhotoCenter: {
  flex: 1,
  alignItems: "flex-start",
  justifyContent: "flex-end",
  padding: 12,
},
noPhotoLabel: {
  color: "rgba(255,255,255,0.92)",
  fontWeight: "950",
  fontSize: 16,
},


// ✅ Mon inventaire : cartes rectangles (plus fines)
invCard: {
  flex: 1,
  minWidth: 0,
  height: 160,            // <-- rectangle fin (ajuste 150-180)
  borderRadius: 18,
  overflow: "hidden",
  borderWidth: 1,
  borderColor: "rgba(29,255,194,0.22)", // hint "gestion"
  backgroundColor: colors.card,
},

invBottomBar: {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  paddingHorizontal: 12,
  paddingVertical: 10,
  backgroundColor: "rgba(11,14,20,0.92)",
  borderTopWidth: 1,
  borderTopColor: "rgba(255,255,255,0.08)",
},

invTitle: {
  color: "#fff",
  fontWeight: "950",
  fontSize: 16,
  lineHeight: 19,
},

invMetaRow: {
  marginTop: 8,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
},

invMetaTxt: {
  color: "rgba(255,255,255,0.82)",
  fontWeight: "800",
  fontSize: 12,
},

invEditPill: {
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: 999,
  backgroundColor: "rgba(29,255,194,0.92)",
  borderWidth: 1,
  borderColor: "rgba(29,255,194,0.35)",
},

invEditTxt: {
  color: colors.bg,
  fontWeight: "950",
  fontSize: 13,
},

  igCtaTxt: { color: colors.bg, fontWeight: "950", fontSize: 13 },
});
