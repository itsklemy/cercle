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
import * as Contacts from "expo-contacts";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ExpoLinking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import { Share } from "react-native";

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
 * Catalogue (exhaustif, simple, “1 tap”)
 ***********************/
const CATALOG = {
  maison: ["Escabeau", "Perceuse", "Diable", "Projecteur", "Rallonge électrique", "Fer à repasser"],
  jardin: ["Tondeuse", "Taille-haie", "Souffleur", "Sécateur", "Brouette"],
  cuisine: ["Appareil à raclette", "Robot", "Mixeur", "Plancha"],
  sport: ["Vélo", "Tapis de yoga", "Haltères", "Raquettes"],
  vehicule: ["Cric", "Pompe à vélo", "Booster batterie", "Chaînes neige"],
  utilitaire: ["Glacière", "Tente", "Matelas gonflable", "Gonfleur à matelas"],
  chantiers: ["Perceuse", "Scie circulaire", "Ponceuse"],
  bricolage: ["Perceuse", "Visseuse", "Boîte à outils", "Marteau"],
  service: ["Remorque", "Aide déménagement"],
  entretien: ["Shampouineuse", "Nettoyeur haute pression"],
  travail: ["Écran", "Webcam"],
  animaux: ["Caisse de transport"],
  plantes: ["Lampe horticole"],
  dons: ["Vêtements à donner"],
  other: ["Autre"],
};

const CATEGORIES = [
  { key: "maison", label: "Maison", dot: "#D1D5DB" },
  { key: "jardin", label: "Jardin", dot: "#34D399" },
  { key: "cuisine", label: "Cuisine", dot: "#F59E0B" },
  { key: "sport", label: "Sport", dot: "#60A5FA" },
  { key: "vehicule", label: "Véhicule", dot: "#5FC8FF" },
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

const CATEGORY_ICONS = {
  maison: "home-outline",
  jardin: "flower-outline",
  cuisine: "silverware-fork-knife",
  sport: "basketball",
  vehicule: "car-outline",
  utilitaire: "tools",
  chantiers: "hammer-screwdriver",
  bricolage: "hammer-outline",
  service: "handshake-outline",
  entretien: "spray-bottle",
  travail: "briefcase-outline",
  animaux: "paw-outline",
  plantes: "leaf-outline",
  dons: "gift-outline",
  other: "shape-outline",
};

const catMeta = (k) => CATEGORIES.find((c) => c.key === k) || CATEGORIES[0];
const labelCat = (k) => catMeta(k).label;

const fmt = (iso) => {
  try {
    return new Date(iso).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
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

const COND = [
  { k: "new", label: "Neuf" },
  { k: "mid", label: "Intermédiaire" },
  { k: "used", label: "Usé" },
];

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
 * Helpers contacts / invite / encode
 ***********************/
const getInviteLinkForEnv = (codeOrUrl) => {
  const raw = String(codeOrUrl || "").trim();
  if (!raw) return null;
  let code = raw;
  try {
    if (raw.includes("/invite/")) code = raw.split("/invite/")[1]?.split(/[?#]/)[0]?.trim() || raw;
    else if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      const seg = (u.pathname || "").split("/").filter(Boolean);
      code = (seg[seg.length - 1] || "").trim();
    }
  } catch {}
  if (__DEV__) return ExpoLinking.createURL(`invite/${code}`);
  return `https://cercle.app/invite/${code}`;
};

async function getOrCreateCircleInviteCode(circleId) {
  const user = await getUserOrAlert();
  if (!user) return null;

  const existing = await supabase
    .from("circle_invites")
    .select("code, created_at")
    .eq("circle_id", circleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing.error && existing.data?.code) return String(existing.data.code);

  const code = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 24);

  const ins = await supabase.from("circle_invites").insert({ circle_id: circleId, code, invited_by: user.id }).select("code").single();

  if (ins.error) {
    Alert.alert("Invitation", ins.error.message || "Impossible de créer une invitation.");
    return null;
  }

  return String(ins.data.code);
}

const normalizePhone = (raw) => {
  if (!raw) return null;
  let s = String(raw).trim().replace(/\u00A0/g, " ").replace(/[().-]/g, "").replace(/\s+/g, "");
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

async function ensureContactsPermissionHard({ onGoToSettings } = {}) {
  try {
    const current = await Contacts.getPermissionsAsync();
    if (current.status === "granted") return { ok: true, status: "granted" };

    if (current.canAskAgain) {
      const req = await Contacts.requestPermissionsAsync();
      if (req.status === "granted") return { ok: true, status: "granted" };
      return { ok: false, status: req.status };
    }

    Alert.alert("Contacts", "Tu as refusé l’accès. Active-le dans Réglages pour inviter.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Ouvrir Réglages",
        onPress: () => {
          onGoToSettings?.();
          Linking.openSettings();
        },
      },
    ]);

    return { ok: false, status: current.status };
  } catch {
    Alert.alert("Contacts", "Impossible d’accéder aux permissions.");
    return { ok: false, status: "error" };
  }
}

/***********************
 * Inventory encoding
 ***********************/
const encodeInvItem = (obj) => {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj?.title || "");
  }
};

const decodeInvItem = (raw, fallbackCategory = "other") => {
  if (raw == null) return null;
  if (typeof raw === "object" && raw.title) {
    return {
      title: String(raw.title || "").trim(),
      category: raw.category || fallbackCategory,
      condition: raw.condition || "mid",
      isFree: raw.isFree ?? true,
    };
  }
  const s = String(raw).trim();
  if (!s) return null;

  if (s.startsWith("{") && s.endsWith("}")) {
    try {
      const o = JSON.parse(s);
      if (o?.title) {
        return {
          title: String(o.title || "").trim(),
          category: o.category || fallbackCategory,
          condition: o.condition || "mid",
          isFree: o.isFree ?? true,
        };
      }
    } catch {}
  }

  return { title: s, category: fallbackCategory, condition: "mid", isFree: true };
};

/***********************
 * Hooks
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

        const list = [...(owned || []), ...((memberOf || []).map((r) => r.circles)).filter(Boolean)];
        const uniq = Array.from(new Map(list.map((c) => [String(c.id), c])).values());
        setCircles(uniq);

        const targetId = preferredId || wantedId;
        const nextActive = (targetId && uniq.find((c) => String(c.id) === String(targetId))) || uniq[0] || null;
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

  return { circles, activeCircle: active, setActiveCircle: setActive, reload: loadCircles, ready };
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
      const memRes = await supabase.from("circle_members").select("user_id").eq("circle_id", circleId);
      if (memRes.error) throw memRes.error;

      const ids = (memRes.data || []).map((x) => x.user_id).filter(Boolean);
      if (!ids.length) {
        setMembers([]);
        return;
      }

      const profRes = await supabase.from("profiles").select("id, public_name").in("id", ids);
      if (profRes.error) throw profRes.error;

      const map = new Map((profRes.data || []).map((p) => [String(p.id), p]));
      const list = ids
        .map((id) => {
          const p = map.get(String(id));
          return { user_id: id, public_name: p?.public_name || "Membre" };
        })
        .sort((a, b) => String(a.public_name || "").localeCompare(String(b.public_name || "")));

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

  const load = useCallback(async () => {
    if (!circleId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("calls")
        .select("id,circle_id,author_id,title,category,message,needed_at,status,created_at,photo")
        .eq("circle_id", circleId)
        .order("created_at", { ascending: false });

      if (error) {
        Log?.error?.("calls", "select", error);
        setCalls([]);
        return;
      }
      setCalls(data || []);
    } finally {
      setLoading(false);
    }
  }, [circleId]);

  useEffect(() => {
    if (!circleId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const ch = supabase
      .channel(`calls:${circleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls", filter: `circle_id=eq.${circleId}` }, load)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") load();
      });

    channelRef.current = ch;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [circleId, load]);

  return { calls, loading, reload: load };
}

function useCircleInventory(circleId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!circleId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.from("circle_inventory").select("user_id, items").eq("circle_id", circleId);
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      Log?.error?.("inventory", "circle-load", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [circleId]);

  useEffect(() => {
    load();
  }, [load]);

  return { rows, loading, reload: load };
}

function useMyInventory(userId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.from("user_inventory").select("items").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      setItems(data?.items || []);
    } catch (e) {
      Log?.error?.("inventory", "mine-load", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, reload: load };
}

/***********************
 * Screen
 ***********************/
export default function CircleScreen({ navigation }) {
  const route = useRoute();
  const { contentMax } = useResponsive?.() || {};
  const insets = useSafeAreaInsets();

  const wantedId = route?.params?.circleId || null;

  const { circles, activeCircle, setActiveCircle, reload: reloadCircles, ready: circlesReady } = useCircles(wantedId);
  const { members, reload: reloadMembers, loading: loadingMembers } = useMembers(activeCircle?.id);
  const { calls, loading: loadingCalls, reload: reloadCalls } = useCalls(activeCircle?.id);

  const [currentUserId, setCurrentUserId] = useState(null);
  useEffect(() => {
    (async () => {
      const u = await getUserOrAlert();
      if (u) setCurrentUserId(u.id);
    })();
  }, []);

  const { rows: circleInvRows, loading: circleInvLoading, reload: reloadCircleInv } = useCircleInventory(activeCircle?.id);
  const { items: myInvItemsRaw, loading: myInvLoading, reload: reloadMyInv } = useMyInventory(currentUserId);

  const isAdminOfActive = !!activeCircle && activeCircle.owner_id === currentUserId;

  // Tabs
  const [tab, setTab] = useState("browse"); // browse | calls | mine

  // --- Top modals
  const [circleHubOpen, setCircleHubOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  // Join by code
  const [joinByCodeOpen, setJoinByCodeOpen] = useState(false);
  const [joinCodeDraft, setJoinCodeDraft] = useState("");
  const [joiningByCode, setJoiningByCode] = useState(false);

  // Contacts consent + picker
  const [contactsConsentOpen, setContactsConsentOpen] = useState(false);
  const [contactsQuickOpen, setContactsQuickOpen] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsList, setContactsList] = useState([]);
  const [contactsSel, setContactsSel] = useState(new Set());
  const [contactsFilter, setContactsFilter] = useState("");
  const [addingContacts, setAddingContacts] = useState(false);
  const pendingOpenContactsRef = useRef(false);
  const [contactsAction, setContactsAction] = useState("invite_members");
  const [inviteTargetCircleId, setInviteTargetCircleId] = useState(null);

  // Circle create/rename
  const [circleEditOpen, setCircleEditOpen] = useState(false);
  const [circleEditMode, setCircleEditMode] = useState("create"); // create | rename
  const [circleNameDraft, setCircleNameDraft] = useState("");
  const [savingCircleName, setSavingCircleName] = useState(false);

  // FAB actions
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);

  // --- Inventaire (modal)
  const [invOpen, setInvOpen] = useState(false);
  const [invCategory, setInvCategory] = useState("maison");
  const [invCondition, setInvCondition] = useState("mid");
  const [invIsFree, setInvIsFree] = useState(true);
  const [invSearch, setInvSearch] = useState("");
  const [invOtherTitle, setInvOtherTitle] = useState("");
  const [savingInv, setSavingInv] = useState(false);

  // --- Explorer / feed
  const [feedCategory, setFeedCategory] = useState("maison");
  const [browseMode, setBrowseMode] = useState("available"); // available | catalog
  const [browseSearch, setBrowseSearch] = useState("");

  // --- Object details modal
  const [objectModalOpen, setObjectModalOpen] = useState(false);
  const [objectModalObj, setObjectModalObj] = useState(null);

  // --- Member inventory modal
  const [memberInvOpen, setMemberInvOpen] = useState(false);
  const [memberInvUser, setMemberInvUser] = useState(null);

  // --- Onde create modal
  const [createCallOpen, setCreateCallOpen] = useState(false);
  const [callTitle, setCallTitle] = useState("");
  const [callCategory, setCallCategory] = useState("other");
  const [callMsg, setCallMsg] = useState("");
  const [savingCall, setSavingCall] = useState(false);

  // --- maps
  const memberNameById = useMemo(() => {
    const m = new Map();
    (members || []).forEach((x) => m.set(String(x.user_id), x.public_name || "Membre"));
    return m;
  }, [members]);

  const ownerLabel = useCallback((ownerId) => memberNameById.get(String(ownerId)) || "Membre", [memberNameById]);

  /********************* Deep link join helpers **************************/
  const extractInviteCode = useCallback((raw) => {
    const s = String(raw || "").trim();
    if (!s) return "";
    try {
      if (s.includes("/invite/")) return s.split("/invite/")[1]?.split(/[?#]/)[0]?.trim() || s;
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

  const normalizeInviteCode = useCallback(
    (raw) => {
      if (!raw) return "";
      let s = String(raw);
      try {
        s = decodeURIComponent(s);
      } catch {}
      s = s.trim();

      const mCode = s.match(/(?:^|[\s\r\n])code\s*[:\-]\s*([A-Za-z0-9_-]{10,})/i);
      if (mCode?.[1]) return mCode[1];

      const mInvite = s.match(/\/invite\/([A-Za-z0-9_-]{10,})/i);
      if (mInvite?.[1]) return mInvite[1];

      const candidates = s.match(/[A-Za-z0-9_-]{20,}/g) || [];
      if (candidates.length) {
        candidates.sort((a, b) => b.length - a.length);
        return candidates[0];
      }

      let c = extractInviteCode(s);
      c = c
        .split(/[?#]/)[0]
        .replace(/\/+$/, "")
        .replace(/\u200B/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, "")
        .replace(/[^A-Za-z0-9_-]/g, "");

      return c;
    },
    [extractInviteCode]
  );

  const joinCircleByCode = useCallback(
    async (rawCode) => {
      const user = await getUserOrAlert();
      if (!user) return null;

      const code = normalizeInviteCode(rawCode);
      if (!code) {
        Alert.alert("Rejoindre", "Entre un code ou colle l’invitation.");
        return null;
      }

      setJoiningByCode(true);
      try {
        const { data, error } = await supabase.rpc("join_circle_by_token_or_code_v2", { p_code: code });
        if (error) throw error;

        const circleId = (typeof data === "string" && data) || data?.circle_id || data?.circleId || data?.id || null;
        if (!circleId) throw new Error("Join OK mais circleId manquant.");

        await reloadCircles(String(circleId));
        setJoinByCodeOpen(false);
        setJoinCodeDraft("");
        Alert.alert("Rejoindre", "Tu as maintenant accès au cercle ✅");
        return String(circleId);
      } catch (e) {
        Alert.alert("Rejoindre", e?.message || "Impossible de rejoindre ce cercle.");
        return null;
      } finally {
        setJoiningByCode(false);
      }
    },
    [normalizeInviteCode, reloadCircles]
  );

  /********************* Contacts **************************/
  const loadDeviceContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        pageSize: 2000,
      });

      const arr = (data || []).flatMap((c) => {
        const baseName = c.name || c.firstName || c.lastName || "Contact";
        const phones = (c.phoneNumbers || []).map((p) => normalizePhone(p?.number)).filter(Boolean);
        return phones.map((ph, i) => ({ id: `${c.id}-${i}`, name: baseName, phone: ph }));
      });

      const uniq = Array.from(new Map(arr.map((x) => [`${x.name}::${x.phone}`, x])).values());
      setContactsList(uniq);
    } catch {
      Alert.alert("Contacts", "Lecture des contacts impossible.");
    } finally {
      setContactsLoading(false);
    }
  }, []);

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

  const ensureContactsConsentThen = useCallback(async (next) => {
    try {
      const v = await AsyncStorage.getItem("contacts_consent_v1");
      if (v === "granted") return next();
      setContactsConsentOpen(true);
    } catch {
      setContactsConsentOpen(true);
    }
  }, []);

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

  const inviteSelectedContactsToCircle = useCallback(
    async ({ circleId }) => {
      try {
        if (!circleId) {
          Alert.alert("Invitations", "Choisis un cercle.");
          return { ok: 0, ko: 0 };
        }
        const selected = contactsList.filter((c) => contactsSel.has(c.id));
        if (selected.length === 0) return { ok: 0, ko: 0 };

        setAddingContacts(true);

        const payload = selected.map((c) => ({ name: String(c.name || "Contact").trim(), phone: c.phone })).filter((x) => !!x.phone);

        const { data, error } = await supabase.rpc("add_contacts_to_circle_v2", {
          p_circle_id: circleId,
          p_contacts: payload,
        });

        if (error) {
          Alert.alert("Invitations", error.message || "Erreur inconnue.");
          return { ok: 0, ko: payload.length };
        }

        await reloadMembers();
        return { ok: payload.length, ko: 0 };
      } catch (e) {
        Alert.alert("Invitations", e?.message || "Ajout impossible.");
        return { ok: 0, ko: 0 };
      } finally {
        setAddingContacts(false);
      }
    },
    [contactsList, contactsSel, reloadMembers]
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

  const openThreadWithDraft = useCallback(
    async ({ draft }) => {
      if (!activeCircle?.id) return;
      try {
        const { data: threadUuid, error } = await supabase.rpc("get_or_create_circle_thread", {
          p_circle_id: activeCircle.id,
        });
        if (error) throw error;

        navigation.navigate("Thread", {
          threadId: String(threadUuid),
          circleId: String(activeCircle.id),
          title: activeCircle.name || "Messages",
          draftMessage: String(draft || ""),
        });
      } catch (e) {
        try {
          if (draft) await Clipboard.setStringAsync(String(draft));
        } catch {}
        Alert.alert("Réservation", "Impossible d’ouvrir le chat. Le message a été copié.");
      }
    },
    [activeCircle?.id, activeCircle?.name, navigation]
  );

  /********************* Focus reload **************************/
  useFocusEffect(
    useCallback(() => {
      if (!activeCircle?.id) return;
      reloadCalls();
      reloadMembers();
      reloadCircleInv?.();
      reloadMyInv?.();
    }, [activeCircle?.id, reloadCalls, reloadMembers, reloadCircleInv, reloadMyInv])
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([reloadCalls(), reloadMembers(), reloadCircleInv(), reloadMyInv()]);
  }, [reloadCalls, reloadMembers, reloadCircleInv, reloadMyInv]);

  /********************* Cercle create/rename/leave/delete **************************/
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
        const { error } = await supabase.from("circles").update({ name: clean }).eq("id", activeCircle.id).eq("owner_id", user.id);
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
      Alert.alert("Cercle", "Suppression impossible.");
    }
  }, [activeCircle?.id, reloadCircles, isAdminOfActive]);

  /********************* Partage code cercle **************************/
  const shareActiveCircleCode = useCallback(async () => {
    if (!activeCircle?.id) return;
    try {
      const code = await getOrCreateCircleInviteCode(activeCircle.id);
      if (!code) return;

      const inviteUrl = getInviteLinkForEnv(code);
      const msg = `Rejoins mon cercle sur Cercle 👇\n\n${inviteUrl}\n\nCode : ${code}`;
      await Share.share({ message: msg });
    } catch (e) {
      Alert.alert("Partage", e?.message || "Impossible de partager le code.");
    }
  }, [activeCircle?.id]);

  /********************* Inventory: compute from circle_inventory **************************/
  const circleInventoryDecoded = useMemo(() => {
    const out = [];
    (circleInvRows || []).forEach((r) => {
      const uid = r?.user_id ? String(r.user_id) : null;
      const arr = Array.isArray(r?.items) ? r.items : [];
      const decoded = arr.map((x) => decodeInvItem(x)).filter(Boolean);
      out.push({ user_id: uid, items: decoded });
    });
    return out;
  }, [circleInvRows]);

  const availabilityIndex = useMemo(() => {
    const map = new Map();
    for (const row of circleInventoryDecoded) {
      const uid = row.user_id;
      if (!uid) continue;
      const name = ownerLabel(uid);
      for (const entry of row.items) {
        const t = String(entry.title || "").trim();
        if (!t) continue;
        const key = normalizeTitleKey(t);

        if (!map.has(key)) {
          map.set(key, { title: t, owners: new Map() });
        }
        const item = map.get(key);
        if (!item.owners.has(uid)) item.owners.set(uid, { user_id: uid, name, entries: [] });
        item.owners.get(uid).entries.push(entry);
      }
    }

    const final = new Map();
    for (const [k, v] of map.entries()) {
      const ownersArr = Array.from(v.owners.values()).map((o) => ({
        ...o,
        condition: o.entries?.[0]?.condition || "mid",
        isFree: o.entries?.[0]?.isFree ?? true,
        category: o.entries?.[0]?.category || "other",
      }));
      final.set(k, {
        key: k,
        title: v.title,
        owners: ownersArr.sort((a, b) => a.name.localeCompare(b.name, "fr")),
        ownersCount: ownersArr.length,
        category: ownersArr?.[0]?.category || "other",
      });
    }
    return final;
  }, [circleInventoryDecoded, ownerLabel]);

  const getCountForTitle = useCallback(
    (title) => {
      const k = normalizeTitleKey(title);
      return availabilityIndex.get(k)?.ownersCount || 0;
    },
    [availabilityIndex]
  );

  const openObject = useCallback(
    (title, categoryFallback) => {
      const k = normalizeTitleKey(title);
      const obj = availabilityIndex.get(k);
      if (!obj) {
        Alert.alert("Indisponible", "Personne ne l’a encore listé dans ce cercle.");
        return;
      }
      setObjectModalObj({ ...obj, category: obj.category || categoryFallback || "other" });
      setObjectModalOpen(true);
    },
    [availabilityIndex]
  );

  const openMemberInventory = useCallback(
    (uid) => {
      const name = ownerLabel(uid);
      const row = circleInventoryDecoded.find((r) => String(r.user_id) === String(uid));
      const items = (row?.items || []).map((x) => ({ ...x, _key: normalizeTitleKey(x.title) })).sort((a, b) => String(a.title).localeCompare(String(b.title), "fr"));
      setMemberInvUser({ user_id: uid, public_name: name, items });
      setMemberInvOpen(true);
    },
    [circleInventoryDecoded, ownerLabel]
  );

  /********************* Inventory: my data **************************/
  const myCircleInventoryRaw = useMemo(() => {
    const uid = String(currentUserId || "");
    const row = (circleInvRows || []).find((r) => String(r.user_id) === uid);
    return Array.isArray(row?.items) ? row.items : [];
  }, [circleInvRows, currentUserId]);

  const myCircleInventoryDecoded = useMemo(() => {
    return (myCircleInventoryRaw || []).map((x) => decodeInvItem(x)).filter(Boolean);
  }, [myCircleInventoryRaw]);

  const myHasTitle = useCallback(
    (title) => {
      const k = normalizeTitleKey(title);
      return (myCircleInventoryDecoded || []).some((it) => normalizeTitleKey(it.title) === k);
    },
    [myCircleInventoryDecoded]
  );

  const toggleMyTitle = useCallback(
    async ({ title, category }) => {
      if (!activeCircle?.id) return;
      const user = await getUserOrAlert();
      if (!user) return;

      const t = String(title || "").trim();
      if (!t) return;

      setSavingInv(true);
      try {
        const key = normalizeTitleKey(t);
        const exists = (myCircleInventoryDecoded || []).some((it) => normalizeTitleKey(it.title) === key);

        let nextDecoded = myCircleInventoryDecoded.slice();
        if (exists) {
          nextDecoded = nextDecoded.filter((it) => normalizeTitleKey(it.title) !== key);
        } else {
          nextDecoded.push({
            title: t,
            category: category || invCategory || "other",
            condition: invCondition || "mid",
            isFree: invIsFree ?? true,
          });
        }

        const nextRaw = nextDecoded.map((it) => encodeInvItem(it));

        const { error } = await supabase.from("circle_inventory").upsert({ circle_id: activeCircle.id, user_id: user.id, items: nextRaw }, { onConflict: "circle_id,user_id" });
        if (error) throw error;

        const mergedGlobal = Array.from(new Set([...(Array.isArray(myInvItemsRaw) ? myInvItemsRaw : []), ...nextRaw].filter(Boolean).map(String)));

        await supabase.from("user_inventory").upsert({ user_id: user.id, items: mergedGlobal }, { onConflict: "user_id" });

        await reloadCircleInv();
        await reloadMyInv();
      } catch (e) {
        Log?.error?.("inventory", "toggle", e);
        Alert.alert("Inventaire", e?.message || "Impossible de mettre à jour.");
      } finally {
        setSavingInv(false);
      }
    },
    [activeCircle?.id, invCategory, invCondition, invIsFree, myCircleInventoryDecoded, myInvItemsRaw, reloadCircleInv, reloadMyInv]
  );

  const addOtherTitle = useCallback(async () => {
    const t = String(invOtherTitle || "").trim();
    if (!t) return;
    setInvOtherTitle("");
    await toggleMyTitle({ title: t, category: "other" });
  }, [invOtherTitle, toggleMyTitle]);

  /********************* Calls (onde) **************************/
  const saveCall = useCallback(async () => {
    if (savingCall) return;
    const user = await getUserOrAlert();
    if (!user) return;

    if (!activeCircle?.id) {
      Alert.alert("Onde", "Sélectionne un cercle.");
      return;
    }
    if (!callMsg.trim()) {
      Alert.alert("Onde", "Ajoute un message.");
      return;
    }

    setSavingCall(true);
    try {
      const payload = {
        circle_id: activeCircle.id,
        author_id: user.id,
        title: (callTitle || "").trim() || null,
        category: callCategory || "other",
        message: callMsg.trim(),
        status: "open",
      };

      const { error } = await supabase.from("calls").insert(payload);
      if (error) throw error;

      setCreateCallOpen(false);
      setCallTitle("");
      setCallCategory("other");
      setCallMsg("");
      setTimeout(() => reloadCalls(), 120);

      Alert.alert("Onde", "Onde publiée ✅");
    } catch (e) {
      Log?.error?.("calls", "insert-failed", e);
      Alert.alert("Onde", e?.message || "Publication impossible.");
    } finally {
      setSavingCall(false);
    }
  }, [savingCall, activeCircle?.id, callTitle, callCategory, callMsg, reloadCalls]);

  /********************* UI: blocks **************************/
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
        <TouchableOpacity onPress={openCircleChat} style={styles.iconBtn}>
          <MaterialCommunityIcons name="message-text-outline" size={20} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setQuickActionsOpen(true)} style={styles.iconBtn}>
          <MaterialCommunityIcons name="plus" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const Segmented = (
    <View style={styles.segmented}>
      {[
        { k: "browse", label: "Emprunter", icon: "handshake-outline" },
        { k: "calls", label: "Ondes", icon: "bullhorn-outline" },
        { k: "mine", label: "Mon inventaire", icon: "cube-outline" },
      ].map((t) => (
        <TouchableOpacity key={t.k} onPress={() => setTab(t.k)} style={[styles.segBtn, tab === t.k && styles.segBtnActive]} activeOpacity={0.9}>
          <MaterialCommunityIcons name={t.icon} size={16} color={tab === t.k ? colors.mint : colors.text} />
          <Text style={[styles.segTxt, tab === t.k && styles.segTxtActive]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const EmptyBlock = (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyCard}>
        <MaterialCommunityIcons name="cube-outline" size={26} color={colors.mint} />
        <Text style={styles.emptyTitle}>Aucun objet déclaré</Text>
        <Text style={styles.empty}>Ajoute 3 objets et le cercle devient immédiatement utile.</Text>

        <View style={{ height: 12 }} />
        <TouchableOpacity
          onPress={() => {
            setInvOpen(true);
            setInvCategory("maison");
          }}
          style={styles.primaryBtn}
          activeOpacity={0.92}
        >
          <Text style={styles.primaryBtnTxt}>Mettre à jour mon inventaire</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  /********************* Explorer: nouveau feed vivant **************************/
  const availableItemsList = useMemo(() => {
    const q = normalizeTitleKey(browseSearch);
    const list = Array.from(availabilityIndex.values());

    const filtered = list
      .filter((x) => {
        if (!x?.title) return false;
        if (feedCategory && feedCategory !== "other") {
          if (feedCategory !== "all" && String(x.category || "other") !== String(feedCategory)) return false;
        }
        if (q) return normalizeTitleKey(x.title).includes(q);
        return true;
      })
      .sort((a, b) => (b.ownersCount || 0) - (a.ownersCount || 0) || String(a.title).localeCompare(String(b.title), "fr"));

    return filtered;
  }, [availabilityIndex, browseSearch, feedCategory]);

  const topAvailable = useMemo(() => availableItemsList.slice(0, 10), [availableItemsList]);

  const catalogList = useMemo(() => {
    const q = normalizeTitleKey(browseSearch);
    const base = (CATALOG[feedCategory] || []).slice();
    const filtered = base.filter((t) => !q || normalizeTitleKey(t).includes(q));
    filtered.sort((a, b) => getCountForTitle(b) - getCountForTitle(a) || String(a).localeCompare(String(b), "fr"));
    return filtered;
  }, [browseSearch, feedCategory, getCountForTitle]);

  const FeedCategoryChips = (
    <View style={{ marginTop: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 12 }}>
        {Object.keys(CATALOG)
          .filter((k) => k !== "other")
          .map((k) => {
            const active = feedCategory === k;
            const meta = catMeta(k);
            return (
              <TouchableOpacity key={k} onPress={() => setFeedCategory(k)} style={[styles.chip, active && styles.chipActive]} activeOpacity={0.9}>
                <View style={[styles.dot, { backgroundColor: meta.dot }]} />
                <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{meta.label}</Text>
              </TouchableOpacity>
            );
          })}
      </ScrollView>
    </View>
  );

  const BrowseControls = (
    <View style={styles.browseControlsWrap}>
      <View style={styles.searchRow}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.subtext} />
        <TextInput placeholder="Rechercher un objet…" placeholderTextColor={colors.subtext} value={browseSearch} onChangeText={setBrowseSearch} style={styles.searchInput} returnKeyType="search" />
        {!!browseSearch && (
          <TouchableOpacity onPress={() => setBrowseSearch("")}>
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.subtext} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.modeRow}>
        <TouchableOpacity onPress={() => setBrowseMode("available")} style={[styles.modePill, browseMode === "available" && styles.modePillOn]} activeOpacity={0.9}>
          <MaterialCommunityIcons name="flash-outline" size={16} color={browseMode === "available" ? colors.mint : colors.text} />
          <Text style={[styles.modePillTxt, browseMode === "available" && styles.modePillTxtOn]}>Dispo</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setBrowseMode("catalog")} style={[styles.modePill, browseMode === "catalog" && styles.modePillOn]} activeOpacity={0.9}>
          <MaterialCommunityIcons name="format-list-bulleted" size={16} color={browseMode === "catalog" ? colors.mint : colors.text} />
          <Text style={[styles.modePillTxt, browseMode === "catalog" && styles.modePillTxtOn]}>Catalogue</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          onPress={() => {
            setInvOpen(true);
            setInvCategory(feedCategory || "maison");
          }}
          style={styles.quickAddBtn}
          activeOpacity={0.92}
        >
          <MaterialCommunityIcons name="plus" size={18} color={colors.bg} />
          <Text style={styles.quickAddTxt}>Ajouter</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAvailableCard = useCallback(
    ({ item }) => {
      const meta = catMeta(item.category || feedCategory || "other");
      return (
        <TouchableOpacity activeOpacity={0.92} onPress={() => openObject(item.title, item.category || feedCategory)} style={styles.cardLive}>
          <View style={styles.cardTop}>
            <View style={[styles.cardIcon, { borderColor: `${meta.dot}55` }]}>
              <MaterialCommunityIcons name={CATEGORY_ICONS[item.category] || CATEGORY_ICONS[feedCategory] || "cube-outline"} size={18} color={colors.text} />
            </View>

            <View style={styles.badgeLive}>
              <Text style={styles.badgeTxt}>{item.ownersCount || 0}</Text>
            </View>
          </View>

          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            Disponible • {labelCat(item.category || "other")}
          </Text>
        </TouchableOpacity>
      );
    },
    [feedCategory, openObject]
  );

  const renderCatalogCard = useCallback(
    ({ item }) => {
      const count = getCountForTitle(item);
      const disabled = count === 0;
      const meta = catMeta(feedCategory);
      return (
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => {
            if (disabled) {
              setCreateCallOpen(true);
              setCallTitle(item);
              setCallCategory(feedCategory || "other");
              setCallMsg(`Quelqu’un aurait ${item.toLowerCase()} à prêter ?`);
              return;
            }
            openObject(item, feedCategory);
          }}
          style={[styles.card, disabled && styles.cardDisabled]}
        >
          <View style={styles.cardTop}>
            <View style={[styles.cardIcon, disabled && styles.cardIconDisabled, { borderColor: `${meta.dot}55` }]}>
              <MaterialCommunityIcons name={CATEGORY_ICONS[feedCategory] || "cube-outline"} size={18} color={disabled ? colors.subtext : colors.text} />
            </View>

            <View style={[styles.badge, disabled && styles.badgeDisabled]}>
              <Text style={[styles.badgeTxt, disabled && styles.badgeTxtDisabled]}>{count}</Text>
            </View>
          </View>

          <Text style={[styles.cardTitle, disabled && styles.cardTitleDisabled]} numberOfLines={2}>
            {item}
          </Text>
          <Text style={[styles.cardSub, disabled && styles.cardSubDisabled]} numberOfLines={1}>
            {disabled ? "Pas dispo • Crée une onde" : "Disponible"}
          </Text>
        </TouchableOpacity>
      );
    },
    [feedCategory, getCountForTitle, openObject]
  );

  const CallCard = useCallback(
    (c) => {
      const dotColor = catMeta(c.category || "other").dot;
      return (
        <View key={String(c.id)} style={styles.callCard}>
          <View style={[styles.callThumb, { borderColor: `${dotColor}55` }]}>
            <View style={styles.callThumbPlaceholder}>
              <MaterialCommunityIcons name="bullhorn-outline" size={18} color={colors.text} />
            </View>
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
        </View>
      );
    },
    []
  );

  /********************* Render **************************/
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={[styles.container, contentMax && { alignSelf: "center", width: contentMax }, { paddingBottom: Math.max(12, insets.bottom) }]}>
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

              <TouchableOpacity onPress={() => setJoinByCodeOpen(true)} style={[styles.secondaryBtn, { marginTop: 10 }]} activeOpacity={0.92}>
                <MaterialCommunityIcons name="key-outline" size={18} color={colors.text} />
                <Text style={styles.secondaryBtnTxt}>Rejoindre avec un code</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {Segmented}

            {tab === "calls" ? (
              <ScrollView contentContainerStyle={{ paddingVertical: 10, paddingBottom: 18 }} refreshControl={<RefreshControl refreshing={loadingCalls} onRefresh={refreshAll} />} showsVerticalScrollIndicator={false}>
                {(calls || []).length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <View style={styles.emptyCard}>
                      <MaterialCommunityIcons name="bullhorn-outline" size={26} color={colors.mint} />
                      <Text style={styles.emptyTitle}>Aucune onde</Text>
                      <Text style={styles.empty}>Lance une onde si tu cherches quelque chose.</Text>
                      <View style={{ height: 12 }} />
                      <TouchableOpacity onPress={() => setCreateCallOpen(true)} style={styles.primaryBtn} activeOpacity={0.92}>
                        <Text style={styles.primaryBtnTxt}>Lancer une onde</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  calls.map((c) => CallCard(c))
                )}
              </ScrollView>
            ) : tab === "mine" ? (
              <ScrollView contentContainerStyle={{ paddingVertical: 10, paddingBottom: 18 }} refreshControl={<RefreshControl refreshing={circleInvLoading || myInvLoading} onRefresh={refreshAll} />} showsVerticalScrollIndicator={false}>
                <View style={styles.mineHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.mineTitle}>Mon inventaire</Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => {
                      setInvOpen(true);
                      setInvCategory("maison");
                    }}
                    style={styles.mineBtn}
                    activeOpacity={0.9}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.text} />
                    <Text style={styles.mineBtnTxt}>Mettre à jour</Text>
                  </TouchableOpacity>
                </View>

                {myCircleInventoryDecoded.length === 0 ? (
                  EmptyBlock
                ) : (
                  myCircleInventoryDecoded
                    .slice()
                    .sort((a, b) => String(a.title).localeCompare(String(b.title), "fr"))
                    .map((it) => (
                      <View key={`${normalizeTitleKey(it.title)}-${it.condition}-${it.isFree}`} style={styles.itemRowSimple}>
                        <View style={styles.itemRowIcon}>
                          <MaterialCommunityIcons name="cube-outline" size={18} color={colors.text} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.title} numberOfLines={1}>
                            {it.title}
                          </Text>
                          <Text style={styles.meta} numberOfLines={1}>
                            {labelCat(it.category || "other")} • {COND.find((x) => x.k === it.condition)?.label || "Intermédiaire"} • {it.isFree ? "Gratuit" : "Payant"}
                          </Text>
                        </View>

                        <TouchableOpacity onPress={() => toggleMyTitle({ title: it.title, category: it.category })} style={styles.iconBtnMini} activeOpacity={0.9}>
                          <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.text} />
                        </TouchableOpacity>
                      </View>
                    ))
                )}
              </ScrollView>
            ) : (
              <>
                {FeedCategoryChips}
                {BrowseControls}

                {browseMode === "available" ? (
                  <FlatList data={availableItemsList} keyExtractor={(x) => `avail-${x.key}-${x.title}`} renderItem={renderAvailableCard} contentContainerStyle={{ paddingVertical: 12, paddingBottom: 18 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={circleInvLoading || loadingMembers} onRefresh={refreshAll} />} ListEmptyComponent={EmptyBlock} />
                ) : (
                  <FlatList data={catalogList} keyExtractor={(x) => `cat-${feedCategory}-${x}`} renderItem={renderCatalogCard} numColumns={2} columnWrapperStyle={{ gap: 10 }} contentContainerStyle={{ paddingVertical: 12, paddingBottom: 18 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={circleInvLoading || loadingMembers} onRefresh={refreshAll} />} ListEmptyComponent={EmptyBlock} />
                )}
              </>
            )}
          </>
        )}

        {/* Quick actions */}
        <Modal visible={quickActionsOpen} transparent animationType="fade" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={() => setQuickActionsOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setQuickActionsOpen(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <View style={[styles.dropdownSheet, { paddingBottom: Math.max(14, insets.bottom) }]}>
              <Text style={styles.dropdownTitle}>Actions</Text>

              <TouchableOpacity onPress={() => { setQuickActionsOpen(false); setInvOpen(true); }} style={styles.dropdownItem} activeOpacity={0.85}>
                <View style={styles.dropdownIcon}>
                  <MaterialCommunityIcons name="cube-outline" size={18} color={colors.text} />
                </View>
                <Text style={styles.dropdownItemTxt}>Mettre à jour mon inventaire</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.subtext} />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { setQuickActionsOpen(false); setCreateCallOpen(true); }} style={styles.dropdownItem} activeOpacity={0.85}>
                <View style={styles.dropdownIcon}>
                  <MaterialCommunityIcons name="bullhorn-outline" size={18} color={colors.text} />
                </View>
                <Text style={styles.dropdownItemTxt}>Lancer une onde</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.subtext} />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { setQuickActionsOpen(false); openContactsPicker({ action: "invite_members", circleId: activeCircle?.id }); }} style={styles.dropdownItem} activeOpacity={0.85}>
                <View style={styles.dropdownIcon}>
                  <MaterialCommunityIcons name="account-plus-outline" size={18} color={colors.text} />
                </View>
                <Text style={styles.dropdownItemTxt}>Inviter</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.subtext} />
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Object modal */}
        <Modal visible={objectModalOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setObjectModalOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setObjectModalOpen(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <View style={[styles.sheet, { maxHeight: "80%", paddingBottom: Math.max(14, insets.bottom) }]}>
              <Text style={styles.sheetTitle}>{objectModalObj?.title || "Objet"}</Text>
              <Text style={styles.sectionLabel}>{objectModalObj?.ownersCount || 0} personne{objectModalObj?.ownersCount > 1 ? "s" : ""}</Text>

              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ maxHeight: "70%" }}>
                {(objectModalObj?.owners || []).map((o) => (
                  <View key={`owner-${o.user_id}`} style={[styles.itemRow, { justifyContent: "space-between" }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.title}>{o.name}</Text>
                      <Text style={styles.meta}>{o.entries?.[0]?.category ? labelCat(o.entries[0].category) : "—"}</Text>
                    </View>

                    <View style={{ marginLeft: 8 }}>
                      <TouchableOpacity onPress={() => openMemberInventory(o.user_id)} style={[styles.primaryBtn, { paddingHorizontal: 10, paddingVertical: 8 }]}>
                        <Text style={[styles.primaryBtnTxt, { fontSize: 13 }]}>Voir</Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => openThreadWithDraft({ draft: `Bonjour, je souhaite réserver "${objectModalObj.title}" chez ${o.name}` })} style={[styles.secondaryBtn, { marginTop: 8, paddingHorizontal: 10, paddingVertical: 8 }]}>
                        <Text style={styles.secondaryBtnTxt}>Demander</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>

              <TouchableOpacity onPress={() => setObjectModalOpen(false)} style={[styles.secondaryBtn, { marginTop: 10 }]} activeOpacity={0.92}>
                <Text style={styles.secondaryBtnTxt}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Member inventory modal (inline sheet) */}
        <Modal visible={memberInvOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setMemberInvOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setMemberInvOpen(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <View style={[styles.sheet, { maxHeight: "80%", paddingBottom: Math.max(14, insets.bottom) }]}>
              <Text style={styles.sheetTitle}>{memberInvUser?.public_name || "Inventaire"}</Text>
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ maxHeight: "70%" }}>
                {(memberInvUser?.items || []).length === 0 ? (
                  <Text style={{ color: colors.subtext, marginTop: 8 }}>Aucun objet déclaré.</Text>
                ) : (
                  (memberInvUser.items || []).map((it, i) => (
                    <View key={`mi-${i}`} style={[styles.itemRow, { justifyContent: "space-between" }]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.title}>{it.title}</Text>
                        <Text style={styles.meta}>{labelCat(it.category || "other")}</Text>
                      </View>

                      <View style={{ marginLeft: 8 }}>
                        <TouchableOpacity onPress={() => openThreadWithDraft({ draft: `Bonjour, je souhaite réserver "${it.title}"` })} style={[styles.primaryBtn, { paddingHorizontal: 10, paddingVertical: 8 }]}>
                          <Text style={[styles.primaryBtnTxt, { fontSize: 13 }]}>Demander</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>

              <TouchableOpacity onPress={() => setMemberInvOpen(false)} style={[styles.secondaryBtn, { marginTop: 10 }]} activeOpacity={0.92}>
                <Text style={styles.secondaryBtnTxt}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Create Call */}
        <Modal visible={createCallOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setCreateCallOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setCreateCallOpen(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <View style={[styles.sheet, { paddingBottom: Math.max(14, insets.bottom) }]}>
              <Text style={styles.sheetTitle}>Lancer une onde</Text>

              <TextInput value={callTitle} onChangeText={setCallTitle} placeholder="Titre (optionnel)" placeholderTextColor={colors.subtext} style={styles.input} />
              <TextInput value={callMsg} onChangeText={setCallMsg} placeholder="Message" placeholderTextColor={colors.subtext} style={[styles.input, { height: 110 }]} multiline />

              <TouchableOpacity disabled={savingCall} onPress={saveCall} style={[styles.primaryBtn, { opacity: savingCall ? 0.7 : 1 }]} activeOpacity={0.92}>
                {savingCall ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryBtnTxt}>Publier</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setCreateCallOpen(false)} style={styles.secondaryBtn} activeOpacity={0.92}>
                <Text style={styles.secondaryBtnTxt}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

/***********************
 * Styles
 ***********************/
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, paddingHorizontal: 16 },

  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8, paddingBottom: 6 },
  circleChip: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, maxWidth: 320, backgroundColor: colors.card, flex: 1 },
  circleChipIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: "rgba(29,255,194,0.14)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(29,255,194,0.25)" },
  circleChipTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  circleChipSub: { color: colors.subtext, fontSize: 12, marginTop: 1 },

  iconBtn: { padding: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.card },
  iconBtnMini: { padding: 8, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.stroke },

  segmented: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  segBtn: { flex: 1, height: 40, borderRadius: 999, borderWidth: 1, borderColor: colors.stroke, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: colors.card },
  segBtnActive: { borderColor: "rgba(29,255,194,0.22)" },
  segTxt: { color: colors.text, fontWeight: "900" },
  segTxtActive: { color: colors.mint },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.stroke, borderRadius: 14, paddingHorizontal: 10, height: 44, backgroundColor: colors.card },
  searchInput: { flex: 1, color: colors.text, paddingVertical: Platform.OS === "ios" ? 8 : 6 },

  browseControlsWrap: { marginTop: 10 },

  modeRow: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 },
  modePill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", gap: 8 },
  modePillOn: { borderColor: "rgba(29,255,194,0.22)" },
  modePillTxt: { color: colors.text, fontWeight: "900" },
  modePillTxtOn: { color: colors.mint },

  quickAddBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.mint, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  quickAddTxt: { color: colors.bg, fontWeight: "900" },

  chip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 36, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.stroke },
  chipActive: { backgroundColor: "rgba(29,255,194,0.16)", borderColor: "rgba(29,255,194,0.22)" },
  chipTxt: { color: colors.text, fontWeight: "800" },
  chipTxtActive: { color: colors.mint },

  dot: { width: 10, height: 10, borderRadius: 6 },

  card: { flex: 1, minHeight: 120, borderRadius: 12, padding: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.stroke },
  cardLive: { borderRadius: 12, padding: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.stroke, marginBottom: 12 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardIcon: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.stroke, alignItems: "center", justifyContent: "center" },
  cardIconDisabled: { borderColor: "transparent", backgroundColor: "rgba(255,255,255,0.02)" },

  badge: { backgroundColor: "rgba(255,255,255,0.04)", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10 },
  badgeLive: { backgroundColor: "rgba(255,255,255,0.04)", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10 },
  badgeDisabled: { backgroundColor: "transparent" },
  badgeTxt: { color: colors.text, fontWeight: "900" },
  badgeTxtDisabled: { color: colors.subtext },

  cardTitle: { color: colors.text, fontWeight: "900", marginTop: 8 },
  cardSub: { color: colors.subtext, marginTop: 4 },
  cardDisabled: { opacity: 0.6 },

  callCard: { flexDirection: "row", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.card, marginBottom: 10 },
  callThumb: { width: 54, height: 54, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: 8 },
  callThumbPlaceholder: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  callDot: { width: 10, height: 10, borderRadius: 6, position: "absolute", right: 6, bottom: 6 },
  callTitle: { color: colors.text, fontWeight: "900" },
  callMsg: { color: colors.subtext, marginTop: 6 },
  callMeta: { color: colors.subtext, marginTop: 6, fontSize: 12 },

  emptyWrap: { alignItems: "center", paddingVertical: 24 },
  emptyCard: { width: "100%", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.card, alignItems: "center" },
  emptyTitle: { color: colors.text, fontWeight: "900", fontSize: 16, marginTop: 8 },
  empty: { color: colors.subtext, textAlign: "center", marginTop: 6, lineHeight: 18 },

  sheet: { backgroundColor: colors.bg, padding: 14, borderTopLeftRadius: 18, borderTopRightRadius: 18, gap: 10, maxHeight: "82%", borderWidth: 1, borderColor: colors.stroke },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  dropdownSheet: { backgroundColor: colors.bg, padding: 14, borderTopLeftRadius: 18, borderTopRightRadius: 18, gap: 8, maxHeight: "82%", borderWidth: 1, borderColor: colors.stroke },
  dropdownTitle: { color: colors.text, fontWeight: "900", marginBottom: 6 },
  dropdownItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 12 },
  dropdownIcon: { width: 30, height: 30, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.stroke },
  dropdownItemTxt: { color: colors.text, fontWeight: "900", flex: 1 },

  primaryBtn: { backgroundColor: colors.mint, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, alignItems: "center", width: "100%" },
  primaryBtnTxt: { color: colors.bg, fontWeight: "900" },
  secondaryBtn: { backgroundColor: colors.card, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, alignItems: "center", width: "100%", flexDirection: "row", gap: 8, justifyContent: "center", borderWidth: 1, borderColor: colors.stroke },
  secondaryBtnTxt: { color: colors.text, fontWeight: "900" },

  sheetTitle: { color: colors.text, fontWeight: "900", marginBottom: 4 },
  sectionLabel: { color: colors.subtext, marginTop: 2, fontWeight: "800" },
  input: { borderWidth: 1, borderColor: colors.stroke, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === "ios" ? 12 : 8, color: colors.text, backgroundColor: colors.card },

  mineHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  mineTitle: { color: colors.text, fontWeight: "900", fontSize: 18 },
  mineBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.stroke },
  mineBtnTxt: { color: colors.text, fontWeight: "900" },

  itemRowSimple: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12, marginBottom: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.stroke },
  itemRowIcon: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 10 },
  title: { color: colors.text, fontWeight: "900" },
  meta: { color: colors.subtext, marginTop: 2, fontSize: 12 },
});