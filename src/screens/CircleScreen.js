// src/screens/CircleScreen.js — version corrigée (Expo SDK 53/54, React 19 safe)
// - Évite toute suspension non gérée (aucune promesse créée pendant le render)
// - Affichage images fiable (signées/public + cache bust)
// - Contacts: permissions robustes + navigation ContactsPicker
// - Scroll/performances: listes stables, clés uniques, windowing OK
// - Supabase: inserts résilients, RPC membres, notifications optionnelles
// - Aucun placeholder; prêt pour soumission (logique côté UI)

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl,
  Platform, Alert, StyleSheet, Image, Modal, KeyboardAvoidingView, ScrollView, Switch,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Contacts from 'expo-contacts';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { InteractionManager } from 'react-native';
import * as FileSystem from 'expo-file-system';

import { supabase } from '../lib/supabase';
import { Log } from '../lib/remoteLogger';
import { useResponsive } from '../hooks/useResponsive';
import ContactsConsentModal from '../components/ContactsConsentModal';
import { colors } from '../theme/colors';
import ItemDetail from '../screens/ItemDetail';


/*************************************************
 * Constantes & métadonnées
 *************************************************/
const PAGE_SIZE = 20;
const CALL_TTL_HOURS = 7;
const STORAGE_BUCKET_ITEMS = 'items';
const STORAGE_BUCKET_CALLS = 'calls';

const CATEGORIES = [
  { key: 'all', label: 'Toutes les catégories', dot: '#9AA3B2' },
  { key: 'maison', label: 'Maison', dot: '#D1D5DB' },
  { key: 'jardin', label: 'Jardin', dot: '#34D399' },
  { key: 'cuisine', label: 'Cuisine', dot: '#F59E0B' },
  { key: 'recette', label: 'Recette', dot: '#FBBF24' },
  { key: 'sport', label: 'Sport', dot: '#60A5FA' },
  { key: 'vehicule', label: 'Véhicule', dot: '#5FC8FF' },
  { key: 'abonnements', label: 'Abonnements', dot: '#AD8CFF' },
  { key: 'utilitaire', label: 'Utilitaire', dot: '#9CA3AF' },
  { key: 'chantiers', label: 'Chantiers', dot: '#A78BFA' },
  { key: 'bricolage', label: 'Bricolage', dot: '#FFB648' },
  { key: 'service', label: 'Service', dot: '#22D3EE' },
  { key: 'entretien', label: 'Entretien', dot: '#10B981' },
  { key: 'travail', label: 'Travail', dot: '#F472B6' },
  { key: 'animaux', label: 'Animaux', dot: '#F87171' },
  { key: 'plantes', label: 'Plantes', dot: '#86EFAC' },
  { key: 'dons', label: 'Dons', dot: '#6EE7B7' },
  { key: 'other', label: 'Autre', dot: '#6EE7B7' },
];
const catMeta = (k) => CATEGORIES.find((c) => c.key === k) || CATEGORIES[0];
const labelCat = (k) => catMeta(k).label;

const nowIso = () => new Date().toISOString();
const isoHoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
const fmt = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return '—'; } };

/*************************************************
 * Helpers Supabase / Auth / Storage
 *************************************************/
async function getUserOrAlert() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    const user = data?.user;
    if (!user) {
      Alert.alert('Auth', 'Connecte-toi d’abord.');
      return null;
    }
    return user;
  } catch (error) {
    Log?.error?.('auth', 'getUser', error);
    Alert.alert('Auth', 'Erreur utilisateur');
    return null;
  }
}

// Fallback base64 → Uint8Array (sans dépendance externe)
function base64ToUint8Array(base64) {
  try {
    const binary = global.atob ? global.atob(base64)
      : (typeof Buffer !== 'undefined' ? Buffer.from(base64, 'base64').toString('binary') : null);
    if (!binary) throw new Error('Base64 decoder unavailable');
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return new Uint8Array();
  }
}

async function uploadToStorage(uri, bucket, userId) {
  if (!uri) return null;
  try {
    const pathBase = `public/${userId}/${Date.now()}`;
    let body = null;
    let contentType = 'image/jpeg';

    // 1) Essai direct fetch → blob (Expo SDK 53/54)
    try {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      contentType = blob.type || 'image/jpeg';
      body = blob;
    } catch (e) {
      // 2) Fallback base64 → Uint8Array pour file://
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      if (!info.exists) throw new Error('Fichier introuvable');
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      body = base64ToUint8Array(base64);
      const extGuess = (uri.split('.').pop() || 'jpg').toLowerCase();
      contentType = extGuess === 'png' ? 'image/png' : extGuess === 'webp' ? 'image/webp' : 'image/jpeg';
    }

    const ext = (contentType.split('/')[1]) || 'jpg';
    const path = `${pathBase}.${ext}`;

    const { error } = await supabase.storage.from(bucket).upload(path, body, {
      upsert: true,
      contentType,
      cacheControl: '3600',
    });
    if (error) throw error;

    // 3) URL signée (marche aussi avec bucket public)
    try {
      const { data, error: signErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10); // ~10 ans
      if (!signErr && data?.signedUrl) return `${data.signedUrl}&v=${Date.now()}`;
    } catch {}

    // 4) Fallback URL publique
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    return pub?.publicUrl ? `${pub.publicUrl}?v=${Date.now()}` : null;
  } catch (e) {
    Log?.error?.('storage', 'upload', e);
    Alert.alert('Photo', `Envoi impossible: ${e?.message || e}`);
    return null;
  }
}

/*************************************************
 * Contacts (Expo)
 *************************************************/
async function ensureContactsPermission() {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Contacts', 'Autorise l’accès aux contacts dans les réglages.');
    return false;
  }
  return true;
}

/*************************************************
 * Inserts/updates ultra-résilients
 *************************************************/
async function safeInsertMinimal(table, minimalPayload) {
  const { data, error } = await supabase.from(table).insert(minimalPayload).select('id').single();
  if (error) throw error;
  return data?.id;
}

async function safePatchField(table, id, field, value) {
  const { error } = await supabase.from(table).update({ [field]: value }).eq('id', id);
  if (error) {
    const msg = String(error.message || '');
    const code = String(error.code || '');
    if (code === '42703' || /does not exist/i.test(msg)) return false; // colonne absente
    throw error;
  }
  return true;
}

async function safePatchMany(table, id, patch) {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  for (const [k, v] of entries) await safePatchField(table, id, k, v);
}

/*************************************************
 * Hooks de données (SQL)
 *************************************************/
function useCircles(wantedId) {
  const [circles, setCircles] = useState([]);
  const [active, setActive] = useState(null);

  const loadCircles = useCallback(async (preferredId = null) => {
    const user = await getUserOrAlert();
    if (!user) return;

    const [{ data: owned }, { data: memberOf }] = await Promise.all([
      supabase.from('circles').select('*').eq('owner_id', user.id).order('created_at', { ascending: true }),
      supabase.from('circle_members').select('circle_id, circles!inner(*)').eq('user_id', user.id),
    ]);

    const list = [...(owned || []), ...((memberOf || []).map((r) => r.circles)).filter(Boolean)];
    const uniq = Array.from(new Map(list.map((c) => [String(c.id), c])).values());
    setCircles(uniq);

    const targetId = preferredId || wantedId;
    const nextActive = (targetId && uniq.find((c) => String(c.id) === String(targetId))) || uniq[0] || null;
    setActive(nextActive);
  }, [wantedId]);

  useEffect(() => { loadCircles(); }, [loadCircles]);

  return { circles, activeCircle: active, setActiveCircle: setActive, reload: loadCircles };
}

// Membres via RPC sécurisée circle_members_list()
function useMembers(circleId) {
  const [members, setMembers] = useState([]);
  const load = useCallback(async () => {
    if (!circleId) { setMembers([]); return; }
    const { data, error } = await supabase.rpc('circle_members_list', { p_circle_id: circleId });
    if (error) {
      Log?.error?.('members', 'rpc', error);
      setMembers([]);
      return;
    }
    setMembers(data || []); // (member_id uuid, user_id uuid, role text, public_name text)
  }, [circleId]);
  useEffect(() => { load(); }, [load]);
  return { members, reload: load };
}

function useCalls(circleId) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef(null);

  const load = useCallback(async () => {
    if (!circleId) return;
    setLoading(true);
    try {
      const sinceIso = isoHoursAgo(CALL_TTL_HOURS);
      const { data, error } = await supabase
        .from('calls')
        .select('id,circle_id,author_id,title,category,message,needed_at,status,created_at,photo')
        .eq('circle_id', circleId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false });
      if (error) {
        Log?.error?.('calls', 'select', error);
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
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    const ch = supabase
      .channel(`calls:${circleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `circle_id=eq.${circleId}` }, load)
      .subscribe((status) => { if (status === 'SUBSCRIBED') load(); });
    channelRef.current = ch;
    return () => { if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; } };
  }, [circleId, load]);

  return { calls, loading, reload: load };
}

function useItems(circleId, filters, options = {}) {
  const { hasCategoryColumn = true, onCategoryMissing } = options;
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const loadingMoreRef = useRef(false);

  const reset = useCallback(() => { setItems([]); setPage(0); setHasMore(true); }, []);

  const loadPage = useCallback(
    async (resetFirst = false) => {
      if (!circleId || loading) return;
      setLoading(true);
      try {
        const nextOffset = resetFirst ? 0 : page * PAGE_SIZE;

        let q = supabase
          .from('items')
          .select('*')
          .eq('circle_id', circleId)
          .order('created_at', { ascending: false })
          .range(nextOffset, nextOffset + PAGE_SIZE - 1);

        if (hasCategoryColumn && filters?.category && filters.category !== 'all') q = q.eq('category', filters.category);
        if (filters?.query) q = q.or(`title.ilike.%${filters.query}%,description.ilike.%${filters.query}%`);

        let data, error;
        try {
          const res = await q;
          data = res.data;
          error = res.error;
        } catch (e) { error = e; }

        if (error && (String(error.code) === '42703' || /column .*category.* does not exist/i.test(String(error.message)))) {
          onCategoryMissing?.();
          let q2 = supabase
            .from('items')
            .select('*')
            .eq('circle_id', circleId)
            .order('created_at', { ascending: false })
            .range(nextOffset, nextOffset + PAGE_SIZE - 1);
          if (filters?.query) q2 = q2.or(`title.ilike.%${filters.query}%,description.ilike.%${filters.query}%`);
          const res2 = await q2;
          data = res2.data || [];
        } else if (error) {
          Log?.error?.('items', 'select', { error, filters });
          Alert.alert('Objets', error.message || 'Erreur de chargement.');
          data = [];
        }

        const list = data || [];
        if (resetFirst) { setItems(list); setPage(1); }
        else { setItems((prev) => [...prev, ...list]); setPage((prev) => prev + 1); }
        if (list.length < PAGE_SIZE) setHasMore(false);
      } finally {
        setLoading(false);
        loadingMoreRef.current = false;
      }
    },
    [circleId, page, filters, loading, hasCategoryColumn, onCategoryMissing]
  );

  useEffect(() => { reset(); }, [circleId, filters?.category, filters?.query, reset]);
  useEffect(() => { if (circleId) loadPage(true); }, [circleId, filters?.category, filters?.query, loadPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    loadPage(false);
  }, [hasMore, loading, loadPage]);

  return { items, loading, hasMore, loadMore, refresh: () => loadPage(true) };
}

/*************************************************
 * Utils
 *************************************************/
const hasRoute = (navigation, name) => {
  try {
    const state = navigation.getState?.();
    const stack = (s) => !s ? [] : [{ name: s.routeNames?.[s.index], routes: s.routes }, ...s.routes?.flatMap((r) => stack(r.state))];
    const all = stack(state);
    return all.some((rg) => (rg?.routes || []).some((r) => r?.name === name)) || state?.routeNames?.includes?.(name);
  } catch { return false; }
};

/*************************************************
 * Écran principal: CircleScreen
 *************************************************/
const FAB_H = 56;

function CircleScreen({ navigation }) {
  const route = useRoute();
  const { contentMax } = useResponsive();
  const insets = useSafeAreaInsets();
  const wantedId = route?.params?.circleId || null;

  // ⚠️ Pas de hook asynchrone qui suspend: on gère l'UI readiness localement
  const [uiLoading, setUiLoading] = useState(true);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setUiLoading(false));
    return () => task?.cancel?.();
  }, []);

  const { circles, activeCircle, setActiveCircle, reload: reloadCircles } = useCircles(wantedId);
  const { members, reload: reloadMembers } = useMembers(activeCircle?.id);

  const [currentUserId, setCurrentUserId] = useState(null);
  useEffect(() => { (async () => { const u = await getUserOrAlert(); if (u) setCurrentUserId(u.id); })(); }, []);

  const canManageActive = !!activeCircle && activeCircle.owner_id === currentUserId;

  // Filtres & état UI
  const [filters, setFilters] = useState({ query: '', category: 'all' });
  const [viewMode, setViewMode] = useState('gallery'); // 'gallery' | 'list'
  const [tab, setTab] = useState('browse'); // 'browse' | 'calls' | 'mine'
  const [hasCategoryColumn, setHasCategoryColumn] = useState(true);

  // Modales
  const [circlePickerOpen, setCirclePickerOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [createCallOpen, setCreateCallOpen] = useState(false);
  const [contactsConsentOpen, setContactsConsentOpen] = useState(false);

  const { calls, loading: loadingCalls, reload: reloadCalls } = useCalls(activeCircle?.id);
  const { items, loading, hasMore, loadMore, refresh } = useItems(
    activeCircle?.id,
    filters,
    {
      hasCategoryColumn,
      onCategoryMissing: () => {
        setHasCategoryColumn(false);
        setFilters((f) => ({ ...f, category: 'all' }));
        Alert.alert('Catégories', 'Le filtrage par catégorie est temporairement désactivé (mise à jour base requise).');
      },
    }
  );

  const listRef = useRef(null);

  // Form Item
  const [itemTitle, setItemTitle] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemCategory, setItemCategory] = useState('other');
  const [itemPhoto, setItemPhoto] = useState(null);
  const [isFree, setIsFree] = useState(true);
  const [basePrice, setBasePrice] = useState('');
  const [periodCount, setPeriodCount] = useState('');
  const [periodUnit, setPeriodUnit] = useState('day');
  const [savingItem, setSavingItem] = useState(false);
  const [itemCircleIds, setItemCircleIds] = useState([]); // multi-cercles

  // Form Onde
  const [callTitle, setCallTitle] = useState('');
  const [callCategory, setCallCategory] = useState('other');
  const [callMsg, setCallMsg] = useState('');
  const [callNeededAt, setCallNeededAt] = useState('');
  const [callPhoto, setCallPhoto] = useState(null);
  const [savingCall, setSavingCall] = useState(false);
  const [callCircleIds, setCallCircleIds] = useState([]); // multi-cercles

  // Initialiser la sélection par défaut à l’ouverture des modales
  const openAddItem = useCallback(() => {
    const def = activeCircle?.id ? [activeCircle.id] : [];
    setItemCircleIds(def);
    setAddItemOpen(true);
  }, [activeCircle?.id]);

  const openCreateCall = useCallback(() => {
    const def = activeCircle?.id ? [activeCircle.id] : [];
    setCallCircleIds(def);
    setCreateCallOpen(true);
  }, [activeCircle?.id]);

  // Pré-remplir une onde existante pour la partager
  const prefillCallFrom = useCallback((c) => {
    setCallTitle(c?.title || '');
    setCallCategory(c?.category || 'other');
    setCallMsg(c?.message || '');
    setCallNeededAt(c?.needed_at ? new Date(c.needed_at).toISOString().slice(0,16).replace('T',' ') : '');
    setCallPhoto(null);
    const dest = (circles || []).map(x => x.id).filter(id => id !== c.circle_id);
    setCallCircleIds(dest.length ? dest : (activeCircle?.id ? [activeCircle.id] : []));
    setCreateCallOpen(true);
  }, [circles, activeCircle?.id]);

  // Recherche (debounce)
  const debouncer = useRef(null);
  const onQueryChange = useCallback((t) => {
    if (debouncer.current) clearTimeout(debouncer.current);
    debouncer.current = setTimeout(() => {
      setFilters((f) => ({ ...f, query: t }));
      listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
    }, 250);
  }, []);
  useEffect(() => () => { if (debouncer.current) clearTimeout(debouncer.current); }, []);

  useFocusEffect(
    useCallback(() => {
      if (!activeCircle?.id) return;
      reloadCalls();
      reloadMembers();
    }, [activeCircle?.id, reloadCalls, reloadMembers])
  );

  // Prix calculé
  const priceFloat = (s) => { const n = parseFloat(String(s || '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const computedUnitPrice = useMemo(() => {
    if (isFree) return 0;
    const base = priceFloat(basePrice);
    const count = Math.max(1, Math.floor(Number(periodCount) || 0));
    return count > 0 ? base / count : base;
  }, [isFree, basePrice, periodCount]);

  // Image pickers — SDK 53/54
  const pickItemPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photos', 'Autorise l’accès à la photothèque.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.85, allowsMultipleSelection: false, exif: false, base64: false, selectionLimit: 1,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      const a = res.assets[0];
      if (a.type && !String(a.type).toLowerCase().startsWith('image')) {
        Alert.alert('Photos', 'Merci de choisir une image.');
        return;
      }
      setItemPhoto(a.uri);
    }
  }, []);

  const pickCallPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photos', 'Autorise l’accès à la photothèque.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.85, allowsMultipleSelection: false, exif: false, base64: false, selectionLimit: 1,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      const a = res.assets[0];
      if (a.type && !String(a.type).toLowerCase().startsWith('image')) {
        Alert.alert('Photos', 'Merci de choisir une image.');
        return;
      }
      setCallPhoto(a.uri);
    }
  }, []);

  /*************************************************
   * Actions CRUD
   *************************************************/
  const saveItem = useCallback(async () => {
    if (savingItem) return;
    const user = await getUserOrAlert();
    if (!user) return;

    const targets = (itemCircleIds || []).filter(Boolean);
    if (targets.length === 0) { Alert.alert('Article', 'Choisis au moins un cercle.'); return; }
    if (!itemTitle.trim()) { Alert.alert('Article', 'Ajoute un titre.'); return; }
    if (!itemDesc.trim()) { Alert.alert('Article', 'Ajoute une description.'); return; }

    setSavingItem(true);
    try {
      // Upload photo une seule fois, réutilisée
      let photoUrl = null;
      if (itemPhoto) {
        photoUrl = await uploadToStorage(itemPhoto, STORAGE_BUCKET_ITEMS, user.id);
      }

      // Calcul prix
      const base = parseFloat(String(basePrice || '').replace(',', '.')) || 0;
      const count = Math.max(1, parseInt(String(periodCount || '1'), 10) || 1);
      const unit = isFree ? 0 : base / count;
      const price_cents = isFree ? 0 : Math.round(Math.max(0, unit) * 100);

      let okCount = 0, koCount = 0;
      for (const cid of targets) {
        try {
          const minimal = {
            owner_id: user.id,
            circle_id: cid,
            title: itemTitle.trim(),
            description: itemDesc?.trim() || null,
          };
          const newId = await safeInsertMinimal('items', minimal);
          await safePatchMany('items', newId, {
            category: itemCategory || 'other',
            photo: photoUrl,
            price_cents,
            price_unit: isFree ? null : periodUnit,
          });
          okCount++;
        } catch (e) {
          Log?.error?.('items', 'insert-one-failed', { cid, e });
          koCount++;
        }
      }

      setAddItemOpen(false);
      InteractionManager.runAfterInteractions(() => {
        setItemTitle(''); setItemDesc(''); setItemCategory('other'); setItemPhoto(null);
        setIsFree(true); setBasePrice(''); setPeriodCount(''); setPeriodUnit('day'); setItemCircleIds([]);
        setTimeout(() => { refresh(); }, 120);
      });

      Alert.alert('Article', okCount > 0
        ? `Article publié dans ${okCount} cercle(s).${koCount ? ` (${koCount} échec${koCount>1?'s':''})` : ''}`
        : 'Publication impossible dans les cercles choisis.');
    } catch (e) {
      Log?.error?.('items', 'insert-failed', e);
      Alert.alert(
        'Article',
        e?.message?.includes?.('row level security')
          ? 'Publication refusée par la sécurité (RLS). Vérifie les policies.'
          : `Publication impossible: ${e?.message || e}`
      );
    } finally {
      setSavingItem(false);
    }
  }, [savingItem, itemCircleIds, itemTitle, itemDesc, itemCategory, itemPhoto, isFree, periodUnit, basePrice, periodCount, refresh]);

  const deleteItem = useCallback(
    async (itemId) => {
      try {
        const user = await getUserOrAlert();
        if (!user) return;
        await supabase.from('items').delete().eq('id', itemId).eq('owner_id', user.id);
        refresh();
      } catch (e) {
        Log?.error?.('items', 'delete', e);
        Alert.alert('Article', 'Suppression impossible.');
      }
    },
    [refresh]
  );

  const saveCall = useCallback(async () => {
    if (savingCall) return;
    const user = await getUserOrAlert();
    if (!user) return;

    const targets = (callCircleIds || []).filter(Boolean);
    if (targets.length === 0) { Alert.alert('Onde', 'Choisis au moins un cercle.'); return; }
    if (!callMsg.trim()) { Alert.alert('Onde', 'Ajoute un message.'); return; }

    setSavingCall(true);
    try {
      let photoUrl = null;
      if (callPhoto) {
        photoUrl = await uploadToStorage(callPhoto, STORAGE_BUCKET_CALLS, user.id);
      }
      const need = callNeededAt?.trim() ? new Date(callNeededAt).toISOString() : null;

      let okCount = 0, koCount = 0;
      for (const cid of targets) {
        try {
          const minimal = { author_id: user.id, circle_id: cid, message: callMsg.trim() };
          const newId = await safeInsertMinimal('calls', minimal);
          await safePatchMany('calls', newId, {
            title: callTitle?.trim() || null,
            category: callCategory || 'other',
            needed_at: need,
            status: 'open',
            photo: photoUrl,
          });
          // Notification optionnelle
          try {
            await supabase.from('notifications').insert({
              circle_id: cid,
              actor_id: user.id,
              type: 'call_published',
              payload: { author_id: user.id, message: callMsg.trim(), title: callTitle?.trim() || null },
              created_at: nowIso(),
            });
          } catch (e) {
            const msg = String(e?.message || '');
            const code = String(e?.code || '');
            if (!(code === '42P01' || /relation .* does not exist/i.test(msg))) {
              Log?.warn?.('notifications', 'insert-skipped', e);
            }
          }
          okCount++;
        } catch (e) {
          Log?.error?.('calls', 'insert-one-failed', { cid, e });
          koCount++;
        }
      }

      setCreateCallOpen(false);
      InteractionManager.runAfterInteractions(() => {
        setCallTitle(''); setCallCategory('other'); setCallMsg(''); setCallNeededAt(''); setCallPhoto(null); setCallCircleIds([]);
        setTimeout(() => { reloadCalls(); }, 120);
      });

      Alert.alert('Onde', okCount > 0
        ? `Onde publiée dans ${okCount} cercle(s).${koCount ? ` (${koCount} échec${koCount>1?'s':''})` : ''}`
        : 'Publication impossible dans les cercles choisis.');
    } catch (e) {
      Log?.error?.('calls', 'insert-failed', e);
      Alert.alert('Onde', e?.message?.includes('row level security')
        ? 'Publication refusée par la sécurité (RLS). Vérifie les policies.'
        : `Publication impossible: ${e?.message || e}`);
    } finally { setSavingCall(false); }
  }, [savingCall, callCircleIds, callTitle, callCategory, callMsg, callNeededAt, callPhoto, reloadCalls]);

  // Quitter / Supprimer cercle
  const leaveActiveCircle = useCallback(async () => {
    if (!activeCircle?.id) return;
    const user = await getUserOrAlert();
    if (!user) return;
    try {
      await supabase
        .from('circle_members')
        .delete()
        .eq('circle_id', activeCircle.id)
        .eq('user_id', user.id);
      setCirclePickerOpen(false);
      await reloadMembers();
      await reloadCircles(null);
      Alert.alert('Cercle', 'Tu as quitté le cercle.');
    } catch (e) {
      Log?.error?.('circles', 'leave', e);
      Alert.alert('Cercle', 'Impossible de quitter ce cercle.');
    }
  }, [activeCircle?.id, reloadCircles, reloadMembers]);

  const deleteActiveCircle = useCallback(async () => {
    if (!activeCircle?.id) return;
    const user = await getUserOrAlert();
    if (!user) return;
    try {
      await supabase
        .from('circles')
        .delete()
        .eq('id', activeCircle.id)
        .eq('owner_id', user.id);
      setCirclePickerOpen(false);
      await reloadCircles(null);
      Alert.alert('Cercle', 'Cercle supprimé.');
    } catch (e) {
      Log?.error?.('circles', 'delete', e);
      Alert.alert('Cercle', 'Suppression impossible (droits ou contraintes).');
    }
  }, [activeCircle?.id, reloadCircles]);

  /*************************************************
   * UI composées
   *************************************************/
  const AppBar = (
    <View style={styles.appbar}>
      <TouchableOpacity
        onPress={() => setCirclePickerOpen(true)}
        style={styles.appbarCircle}
        activeOpacity={0.9}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialCommunityIcons name="account-group-outline" size={18} color={colors.text} />
        <Text style={styles.appbarTitle} numberOfLines={1}>{activeCircle?.name || 'Mes cercles'}</Text>
        <MaterialCommunityIcons name="chevron-down" size={18} color={colors.subtext} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={async () => {
          if (!activeCircle?.id) { Alert.alert('Cercle', 'Sélectionne un cercle.'); return; }
          const ok = await ensureContactsPermission();
          if (!ok) return;
          setMembersOpen(true);
        }}
        style={styles.iconBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialCommunityIcons name="account-multiple" size={20} color={colors.text} />
      </TouchableOpacity>
    </View>
  );

  const SearchAndFilters = (
    <View style={{ gap: 10 }}>
      <View style={styles.searchRow}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.subtext} />
        <TextInput
          placeholder="Rechercher un article…"
          placeholderTextColor={colors.subtext}
          defaultValue={filters.query}
          onChangeText={onQueryChange}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {!!filters.query && (
          <TouchableOpacity
            onPress={() => { setFilters((f) => ({ ...f, query: '' })); listRef.current?.scrollToOffset?.({ offset: 0, animated: false }); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.subtext} />
          </TouchableOpacity>
        )}
      </View>

      <View style={{ height: 42 }}>
        <FlatList
          data={CATEGORIES}
          keyExtractor={(c) => c.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item: c }) => {
            const active = filters.category === c.key;
            const disabled = !hasCategoryColumn && c.key !== 'all';
            return (
              <TouchableOpacity
                onPress={() => { if (disabled) return; setFilters((f) => ({ ...f, category: c.key })); listRef.current?.scrollToOffset?.({ offset: 0, animated: false }); }}
                style={[styles.chip, active && styles.chipActive, disabled && { opacity: 0.5 }]}
                activeOpacity={0.8}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <View style={[styles.dot, { backgroundColor: c.dot }]} />
                <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{c.label}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </View>
  );

  const Segmented = (
    <View style={styles.segmented}>
      {[
        { k: 'browse', label: 'Emprunter' },
        { k: 'calls', label: 'Ondes' },
        { k: 'mine', label: 'Mes annonces' },
      ].map((t) => (
        <TouchableOpacity
          key={t.k}
          onPress={() => setTab(t.k)}
          style={[styles.segBtn, tab === t.k && styles.segBtnActive]}
          activeOpacity={0.9}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={[styles.segTxt, tab === t.k && styles.segTxtActive]}>{t.label}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        onPress={() => setViewMode((v) => (v === 'gallery' ? 'list' : 'gallery'))}
        style={styles.viewToggle}
        activeOpacity={0.9}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <MaterialCommunityIcons name={viewMode === 'gallery' ? 'view-grid-outline' : 'view-agenda-outline'} size={18} color={colors.text} />
      </TouchableOpacity>
    </View>
  );

  const CallCard = useCallback((c, compact = false) => (
    <TouchableOpacity
      key={String(c.id)}
      onPress={() => navigation.navigate('CallDetail', { callId: c.id, title: c.title || 'Onde' })}
      onLongPress={() => prefillCallFrom(c)}
      style={[styles.callCard, compact && { marginBottom: 6 }]}
      activeOpacity={0.85}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      {!!c.photo && (<Image source={{ uri: c.photo }} style={{ width: 48, height: 48, borderRadius: 8 }} />)}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.callMsg} numberOfLines={2}>
          {c.title ? `${c.title} • ` : ''}{c.message}{c.needed_at ? ` • pour ${fmt(c.needed_at)}` : ''}
        </Text>
        <Text style={styles.meta}>{fmt(c.created_at)}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.subtext} />
    </TouchableOpacity>
  ), [navigation, prefillCallFrom]);

  const CallsStrip = calls?.length > 0 && (
    <View style={styles.callsBlock}>
      <View style={styles.blockTitleRow}>
        <Text style={styles.blockTitle}>Ondes récentes</Text>
        <TouchableOpacity onPress={() => navigation.navigate('CallsList', { circleId: activeCircle?.id, title: 'Ondes' })} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={styles.link}>Voir tout</Text>
        </TouchableOpacity>
      </View>
      {loadingCalls ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={styles.loadingTxt}>Chargement…</Text>
        </View>
      ) : calls.slice(0, 3).map((c) => CallCard(c, true))}
    </View>
  );

  // ---- Renderers de liste ----
  const renderItemList = useCallback(({ item }) => {
    const isOwner = currentUserId && item.owner_id === currentUserId;
    const priceStr =
      !!item.price_cents && !!item.price_unit
        ? ` • ${(item.price_cents / 100).toLocaleString('fr-FR', {
            minimumFractionDigits: 2, maximumFractionDigits: 2,
          })} €/${item.price_unit === 'day' ? 'j' : item.price_unit === 'week' ? 'sem.' : 'mois'}`
        : '';

    return (
      <View style={styles.itemRow}>
        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 }}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('ItemDetail', { itemId: item.id, title: item.title || 'Annonce' })}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <MaterialCommunityIcons name="cube" size={22} color={colors.mint} />
          <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {labelCat(item.category || 'other')}{priceStr}
            </Text>
          </View>
        </TouchableOpacity>

        {isOwner && (
          <TouchableOpacity
            onPress={() =>
              Alert.alert('Retirer', 'Supprimer cette annonce ?', [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Supprimer', style: 'destructive', onPress: () => deleteItem(item.id) },
              ])
            }
            style={[styles.iconBtn, { marginLeft: 8 }]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>
    );
  }, [currentUserId, navigation, deleteItem]);

  const renderItemGallery = useCallback(({ item }) => {
    const dotColor = catMeta(item.category || 'other').dot;
    const isOwner = currentUserId && item.owner_id === currentUserId;

    return (
      <View style={styles.cardSquare}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('ItemDetail', { itemId: item.id, title: item.title || 'Annonce' })}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <View style={styles.squareMedia}>
            {item.photo ? (
              <Image source={{ uri: item.photo }} style={styles.squareImg} resizeMode="cover" />
            ) : (
              <View style={styles.squarePlaceholder}>
                <MaterialCommunityIcons name="image-off-outline" size={24} color={colors.subtext} />
              </View>
            )}
          </View>
          <View style={styles.cardBottom}>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          </View>
        </TouchableOpacity>

        {isOwner && (
          <TouchableOpacity
            onPress={() =>
              Alert.alert('Retirer', 'Supprimer cette annonce ?', [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Supprimer', style: 'destructive', onPress: () => deleteItem(item.id) },
              ])
            }
            style={[styles.iconBtn, { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.25)' }]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>
    );
  }, [currentUserId, navigation, deleteItem]);

  /*************************************************
   * Skeleton d'attente
   *************************************************/
  if (uiLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator />
          <Text style={{ color: colors.subtext, marginTop: 8 }}>Chargement…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const noCircle = !activeCircle;
  const gallery = viewMode === 'gallery';
  const bottomContentPadding = FAB_H + 96 + insets.bottom;

  /*************************************************
   * Render principal
   *************************************************/
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={[
        styles.container,
        contentMax && { alignSelf: 'center', width: contentMax },
        { paddingBottom: Math.max(12, insets.bottom) }
      ]}>
        {AppBar}

        {tab === 'browse' && SearchAndFilters}
        {Segmented}
        {tab === 'browse' && !noCircle && CallsStrip}

        {noCircle ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>Aucun cercle. Choisis ou crée un cercle.</Text>
            <TouchableOpacity onPress={() => setCirclePickerOpen(true)} style={styles.primaryBtn} activeOpacity={0.9}>
              <Text style={styles.primaryBtnTxt}>Sélectionner un cercle</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {tab === 'calls' ? (
              <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: bottomContentPadding }} keyboardShouldPersistTaps="handled">
                {loadingCalls ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator />
                    <Text style={styles.loadingTxt}>Chargement…</Text>
                  </View>
                ) : calls.length === 0 ? (
                  <View style={styles.emptyWrap}><Text style={styles.empty}>Aucune onde pour l’instant.</Text></View>
                ) : (
                  calls.map((c) => CallCard(c))
                )}
              </ScrollView>
            ) : (
              <FlatList
                ref={listRef}
                data={tab === 'mine' ? items.filter((it) => it.owner_id === currentUserId) : items}
                key={viewMode}
                keyExtractor={(it) => String(it.id)}
                numColumns={gallery ? 2 : 1}
                columnWrapperStyle={gallery ? { gap: 10 } : undefined}
                renderItem={gallery ? renderItemGallery : renderItemList}
                ListEmptyComponent={!loading && (
                  <View style={styles.emptyWrap}>
                    <Text style={styles.empty}>
                      {tab === 'mine' ? 'Aucune annonce publiée.' : `Aucun article${
                        filters.category && filters.category !== 'all' ? ` dans “${labelCat(filters.category)}”` : ''
                      }${filters.query ? ` • “${filters.query}”` : ''}.`}
                    </Text>
                  </View>
                )}
                refreshControl={<RefreshControl refreshing={loading && items.length === 0} onRefresh={() => { refresh(); }} />}
                onEndReachedThreshold={0.35}
                onEndReached={loadMore}
                contentContainerStyle={{ paddingVertical: 8, paddingBottom: bottomContentPadding, paddingHorizontal: gallery ? 3 : 0 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                removeClippedSubviews={Platform.OS === 'android'}
                initialNumToRender={10}
                windowSize={7}
              />
            )}
          </>
        )}

        {/* Boutons d'action */}
        {!noCircle && (
          <View pointerEvents="box-none" style={[styles.fabsWrapRow, { bottom: Math.max(16, insets.bottom + 8) }]}>
            <TouchableOpacity
              onPress={openAddItem}
              style={styles.bigPublishBtn}
              activeOpacity={0.92}
              accessibilityLabel="Publier une annonce"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="plus" size={20} color={colors.bg} />
              <Text style={styles.bigPublishTxt}>Publier</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={openCreateCall}
              style={styles.roundCallBtn}
              activeOpacity={0.92}
              accessibilityLabel="Créer une onde"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="bullhorn" size={22} color={colors.bg} />
            </TouchableOpacity>
          </View>
        )}

        {/********************** Modales **********************/}
        {/* Sélecteur de cercle */}
        <Modal
          visible={circlePickerOpen}
          transparent
          animationType="fade"
          statusBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={() => setCirclePickerOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setCirclePickerOpen(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <View
              style={[styles.dropdownSheet, { zIndex: 20, elevation: 20, paddingBottom: Math.max(14, insets.bottom) }]}
              onStartShouldSetResponder={() => true}
            >
              <Text style={styles.dropdownTitle}>Mes cercles</Text>

              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {(circles || []).map((c) => {
                  const selected = activeCircle?.id === c.id;
                  return (
                    <TouchableOpacity
                      key={String(c.id)}
                      style={[styles.dropdownItem, selected && styles.dropdownItemActive]}
                      onPress={() => { setActiveCircle(c); setCirclePickerOpen(false); setTimeout(() => { refresh(); reloadCalls(); reloadMembers(); }, 80); }}
                      activeOpacity={0.8}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <MaterialCommunityIcons name="account-group-outline" size={18} color={colors.text} />
                      <Text style={[styles.dropdownItemTxt, selected && styles.dropdownItemTxtActive]} numberOfLines={1}>{c.name || `Cercle ${c.id}`}</Text>
                      {selected && <MaterialCommunityIcons name="check" size={18} color={colors.mint} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {!!activeCircle?.id && (
                <View style={{ marginTop: 8, gap: 8 }}>
                  {!canManageActive && (
                    <TouchableOpacity
                      onPress={() =>
                        Alert.alert('Quitter', 'Voulez-vous quitter ce cercle ?', [
                          { text: 'Annuler', style: 'cancel' },
                          { text: 'Quitter', style: 'destructive', onPress: leaveActiveCircle },
                        ])
                      }
                      style={[styles.primaryBtn, { backgroundColor: 'rgba(255,255,255,0.06)' }]}
                      activeOpacity={0.9}
                    >
                      <Text style={[styles.primaryBtnTxt, { color: colors.text }]}>Quitter le cercle</Text>
                    </TouchableOpacity>
                  )}

                  {canManageActive && (
                    <TouchableOpacity
                      onPress={() =>
                        Alert.alert('Supprimer', 'Supprimer définitivement ce cercle ?', [
                          { text: 'Annuler', style: 'cancel' },
                          { text: 'Supprimer', style: 'destructive', onPress: deleteActiveCircle },
                        ])
                      }
                      style={[styles.primaryBtn, { backgroundColor: 'rgba(255,80,80,0.18)' }]}
                      activeOpacity={0.9}
                    >
                      <Text style={[styles.primaryBtnTxt, { color: '#ffdddd' }]}>Supprimer le cercle</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </View>
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

            <View
              style={[styles.dropdownSheet, { zIndex: 20, elevation: 20, paddingBottom: Math.max(14, insets.bottom) }]}
              onStartShouldSetResponder={() => true}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={styles.dropdownTitle}>Membres</Text>
                <TouchableOpacity
                  onPress={async () => {
                    const v = await AsyncStorage.getItem('contacts_consent_v1');
                    if (v !== 'granted') { setContactsConsentOpen(true); return; }
                    const ok = await ensureContactsPermission();
                    if (!ok) return;

                    if (activeCircle?.id && hasRoute(navigation, 'ContactsPicker')) {
                      setMembersOpen(false);
                      navigation.navigate('ContactsPicker', { circleId: activeCircle?.id, title: 'Ajouter des membres' });
                    } else {
                      Alert.alert('Contacts', 'L’écran ContactsPicker n’est pas enregistré.');
                    }
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.link}>Ajouter</Text>
                </TouchableOpacity>
              </View>

              {(members || []).length === 0 ? (
                <Text style={styles.empty}>Aucun membre pour l’instant.</Text>
              ) : (
                members.map((m) => {
                  const me = m.user_id === currentUserId;
                  const canKick = canManageActive && !me;
                  const key = String(m.member_id || m.id || `${m.user_id}-${activeCircle?.id}`);
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.dropdownItem, { justifyContent: 'space-between' }]}
                      activeOpacity={0.8}
                      onLongPress={async () => {
                        if (!canKick && !me) return;
                        const action = me ? 'Quitter ce cercle ?' : 'Retirer ce membre ?';
                        Alert.alert('Membres', action, [
                          { text: 'Annuler', style: 'cancel' },
                          {
                            text: me ? 'Quitter' : 'Retirer',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                if (me) {
                                  const user = await getUserOrAlert();
                                  if (!user) return;
                                  await supabase.from('circle_members').delete().eq('circle_id', activeCircle.id).eq('user_id', user.id);
                                  setMembersOpen(false);
                                  await reloadMembers();
                                  await reloadCircles(null);
                                } else {
                                  if (m.member_id) await supabase.from('circle_members').delete().eq('id', m.member_id);
                                  else await supabase.from('circle_members').delete().eq('circle_id', activeCircle.id).eq('user_id', m.user_id);
                                  await reloadMembers();
                                }
                              } catch (e) {
                                Log?.error?.('members', 'delete', e);
                                Alert.alert('Membres', 'Action impossible.');
                              }
                            },
                          },
                        ]);
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialCommunityIcons name="account" size={18} color={colors.text} />
                        </View>
                        <Text style={[styles.dropdownItemTxt]} numberOfLines={1}>
                          {m.public_name || 'Membre'}
                        </Text>
                      </View>
                      <Text style={styles.meta}>{me ? 'Moi' : canKick ? 'Appui long: retirer' : ''}</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </View>
        </Modal>

        {/* Consent contacts */}
        <ContactsConsentModal
          visible={contactsConsentOpen}
          onAccept={async () => {
            setContactsConsentOpen(false);
            await AsyncStorage.setItem('contacts_consent_v1', 'granted');
            const ok = await ensureContactsPermission();
            if (!ok) return;
            if (activeCircle?.id && hasRoute(navigation, 'ContactsPicker')) {
              navigation.navigate('ContactsPicker', { circleId: activeCircle.id, title: 'Ajouter des membres' });
            }
          }}
          onDecline={() => setContactsConsentOpen(false)}
        />

        {/* -------- MODAL: AJOUTER UN ARTICLE -------- */}
        <Modal
          visible={addItemOpen}
          transparent
          animationType="slide"
          statusBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={() => setAddItemOpen(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalOverlay}
          >
            <TouchableWithoutFeedback onPress={() => setAddItemOpen(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <View style={[styles.sheet, { zIndex: 20, elevation: 20, paddingBottom: Math.max(14, insets.bottom) }]} onStartShouldSetResponder={() => true}>
              <Text style={styles.sheetTitle}>Ajouter un article</Text>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
                {/* Sélecteur MULTI-cercles */}
                <Text style={{ color: colors.subtext, marginTop: 2 }}>Destinations</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: 6 }} keyboardShouldPersistTaps="handled">
                  {(circles || []).map((c) => {
                    const selected = itemCircleIds.includes(c.id);
                    return (
                      <TouchableOpacity
                        key={`item-circle-${c.id}`}
                        onPress={() => {
                          setItemCircleIds((prev) => selected ? prev.filter(id => id !== c.id) : [...prev, c.id]);
                        }}
                        style={[styles.chip, selected && styles.chipActive]}
                        activeOpacity={0.8}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialCommunityIcons name={selected ? 'checkbox-marked-outline' : 'checkbox-blank-outline'} size={18} color={selected ? colors.mint : colors.text} />
                        <Text style={[styles.chipTxt, selected && styles.chipTxtActive]} numberOfLines={1}>{c.name || `Cercle ${c.id}`}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <TouchableOpacity onPress={pickItemPhoto} style={styles.photoPick} activeOpacity={0.8} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  {itemPhoto ? (
                    <Image source={{ uri: itemPhoto }} style={styles.photoPreview} />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="image-plus" size={22} color={colors.subtext} />
                      <Text style={styles.photoPickTxt}>Ajouter une photo</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TextInput
                  value={itemTitle}
                  onChangeText={setItemTitle}
                  placeholder="Titre"
                  placeholderTextColor={colors.subtext}
                  style={styles.input}
                  returnKeyType="next"
                />

                <View>
                  <TextInput
                    value={itemDesc}
                    onChangeText={(t) => setItemDesc((t || '').slice(0, 300))}
                    placeholder="Description (300 caractères max)"
                    placeholderTextColor={colors.subtext}
                    style={[styles.input, { height: 112, textAlignVertical: 'top', paddingRight: 64 }]}
                    multiline
                    maxLength={300}
                  />
                  <Text style={{ position: 'absolute', right: 12, bottom: 10, color: colors.subtext, fontSize: 12 }}>
                    {(itemDesc?.length || 0)}/300
                  </Text>
                </View>

                {/* Catégories rapides */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: 6 }} keyboardShouldPersistTaps="handled">
                  {CATEGORIES.filter((c) => c.key !== 'all').map((c) => {
                    const active = itemCategory === c.key;
                    return (
                      <TouchableOpacity
                        key={c.key}
                        onPress={() => setItemCategory(c.key)}
                        style={[styles.chip, active && styles.chipActive]}
                        activeOpacity={0.8}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <View style={[styles.dot, { backgroundColor: c.dot }]} />
                        <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Prix */}
                <View style={[styles.input, styles.inputRowBetween, { marginTop: 10 }]}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>Gratuit</Text>
                  <Switch value={isFree} onValueChange={setIsFree} />
                </View>

                {!isFree && (
                  <>
                    <View style={styles.row}>
                      <View style={[styles.input, styles.inputRow]}>
                        <Text style={[styles.meta, { marginRight: 6 }]}>Prix de base €</Text>
                        <TextInput
                          value={basePrice}
                          onChangeText={setBasePrice}
                          keyboardType="decimal-pad"
                          placeholder="ex. 30"
                          placeholderTextColor={colors.subtext}
                          style={{ flex: 1, color: colors.text }}
                        />
                      </View>

                      <View style={[styles.input, styles.inputRow]}>
                        <Text style={[styles.meta, { marginRight: 6 }]}>Durée</Text>
                        <TextInput
                          value={periodCount}
                          onChangeText={setPeriodCount}
                          keyboardType="number-pad"
                          placeholder="ex. 3"
                          placeholderTextColor={colors.subtext}
                          style={{ width: 64, color: colors.text, marginRight: 8 }}
                        />
                        <TouchableOpacity
                          onPress={() => setPeriodUnit((u) => (u === 'day' ? 'week' : u === 'week' ? 'month' : 'day'))}
                          style={styles.pill}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.pillTxt} numberOfLines={1}>
                            {periodUnit === 'day' ? 'jours' : periodUnit === 'week' ? 'semaines' : 'mois'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={[styles.input, styles.inputRowBetween]}>
                      <Text style={{ color: colors.subtext, flexShrink: 1 }}>Prix unitaire calculé</Text>
                      <Text style={{ color: colors.text, fontWeight: '800', flexShrink: 0 }}>
                        {Math.max(0, computedUnitPrice).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                        €/{periodUnit === 'day' ? 'j' : periodUnit === 'week' ? 'sem.' : 'mois'}
                      </Text>
                    </View>
                  </>
                )}

                <TouchableOpacity
                  disabled={savingItem}
                  onPress={saveItem}
                  style={[styles.primaryBtn, { marginTop: 12, opacity: savingItem ? 0.7 : 1 }]}
                  activeOpacity={0.9}
                >
                  {savingItem ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryBtnTxt}>Publier</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* -------- MODAL: CRÉER UNE ONDE -------- */}
        <Modal
          visible={createCallOpen}
          transparent
          animationType="slide"
          statusBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={() => setCreateCallOpen(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalOverlay}
          >
            <TouchableWithoutFeedback onPress={() => setCreateCallOpen(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <View style={[styles.sheet, { zIndex: 20, elevation: 20, paddingBottom: Math.max(14, insets.bottom) }]} onStartShouldSetResponder={() => true}>
              <Text style={styles.sheetTitle}>Lancer une onde</Text>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
                {/* Sélecteur MULTI-cercles */}
                <Text style={{ color: colors.subtext, marginTop: 2 }}>Destinations</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: 6 }} keyboardShouldPersistTaps="handled">
                  {(circles || []).map((c) => {
                    const selected = callCircleIds.includes(c.id);
                    return (
                      <TouchableOpacity
                        key={`call-circle-${c.id}`}
                        onPress={() => {
                          setCallCircleIds((prev) => selected ? prev.filter(id => id !== c.id) : [...prev, c.id]);
                        }}
                        style={[styles.chip, selected && styles.chipActive]}
                        activeOpacity={0.8}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialCommunityIcons name={selected ? 'checkbox-marked-outline' : 'checkbox-blank-outline'} size={18} color={selected ? colors.mint : colors.text} />
                        <Text style={[styles.chipTxt, selected && styles.chipTxtActive]} numberOfLines={1}>{c.name || `Cercle ${c.id}`}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <TextInput
                  value={callTitle}
                  onChangeText={setCallTitle}
                  placeholder="Titre (optionnel)"
                  placeholderTextColor={colors.subtext}
                  style={styles.input}
                />

                {/* Catégories rapides */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: 6 }} keyboardShouldPersistTaps="handled">
                  {CATEGORIES.filter((c) => c.key !== 'all').map((c) => {
                    const active = callCategory === c.key;
                    return (
                      <TouchableOpacity
                        key={c.key}
                        onPress={() => setCallCategory(c.key)}
                        style={[styles.chip, active && styles.chipActive]}
                        activeOpacity={0.8}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <View style={[styles.dot, { backgroundColor: c.dot }]} />
                        <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <TextInput
                  value={callMsg}
                  onChangeText={setCallMsg}
                  placeholder="Message"
                  placeholderTextColor={colors.subtext}
                  style={[styles.input, { height: 96, textAlignVertical: 'top', marginTop: 6 }]}
                  multiline
                />
                <TextInput
                  value={callNeededAt}
                  onChangeText={setCallNeededAt}
                  placeholder="Pour quand ? (ex. 2025-11-10 18:00)"
                  placeholderTextColor={colors.subtext}
                  style={styles.input}
                />

                <TouchableOpacity onPress={pickCallPhoto} style={[styles.photoPick, { height: 120 }]} activeOpacity={0.8} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  {callPhoto ? (
                    <Image source={{ uri: callPhoto }} style={styles.photoPreview} />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="image-plus" size={22} color={colors.subtext} />
                      <Text style={styles.photoPickTxt}>Ajouter une photo (optionnel)</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={savingCall}
                  onPress={saveCall}
                  style={[styles.primaryBtn, { marginTop: 12, opacity: savingCall ? 0.7 : 1 }]}
                  activeOpacity={0.9}
                >
                  {savingCall ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryBtnTxt}>Publier l’onde</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

/*************************************************
 * Styles
 *************************************************/
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, paddingHorizontal: 16 },

  // Appbar
  appbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 6 },
  appbarCircle: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', maxWidth: 260,
  },
  appbarTitle: { color: colors.text, fontWeight: '900', fontSize: 18, flexShrink: 1 },
  iconBtn: { padding: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },

  // Recherche + chips
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 12,
    paddingHorizontal: 10, height: 42, marginTop: 6,
  },
  searchInput: { flex: 1, color: colors.text, paddingVertical: Platform.OS === 'ios' ? 8 : 6 },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 36,
    borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)'
  },
  chipActive: { backgroundColor: 'rgba(29,255,194,0.18)' },
  chipTxt: { color: colors.text, fontWeight: '700' },
  chipTxtActive: { color: colors.mint },

  // Segmented
  segmented: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  segBtn: { flex: 1, height: 38, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  segBtnActive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  segTxt: { color: colors.text, fontWeight: '800' },
  segTxtActive: { color: colors.mint },
  viewToggle: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },

  // Ondes
  callsBlock: { marginTop: 10, marginBottom: 4 },
  blockTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  blockTitle: { color: colors.text, fontWeight: '900' },
  link: { color: colors.mint, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  loadingTxt: { color: colors.subtext },

  callCard: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 8, alignItems: 'center' },
  callMsg: { color: colors.text, fontWeight: '800' },

  // Liste
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 8, minHeight: 60 },
  title: { color: colors.text, fontWeight: '800' },
  meta: { color: colors.subtext, marginTop: 2 },

  // Galerie carrée
  cardSquare: { flex: 1, minWidth: 0, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 10, marginHorizontal: 3 },
  squareMedia: { width: '100%', aspectRatio: 1, backgroundColor: 'rgba(255,255,255,0.04)' },
  squareImg: { width: '100%', height: '100%' },
  squarePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  cardTitle: { color: colors.text, fontWeight: '700', flex: 1 },

  dot: { width: 10, height: 10, borderRadius: 5 },

  empty: { color: colors.subtext, textAlign: 'center' },
  emptyWrap: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  primaryBtn: { backgroundColor: colors.mint, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 },
  primaryBtnTxt: { color: colors.bg, fontWeight: '900' },

  // Boutons bas
  fabsWrapRow: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 50,
  },
  bigPublishBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: FAB_H, flex: 1, marginRight: 12, borderRadius: 999, backgroundColor: colors.mint,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
  },
  bigPublishTxt: { color: colors.bg, fontWeight: '900', fontSize: 16 },
  roundCallBtn: {
    width: FAB_H, height: FAB_H, borderRadius: FAB_H / 2, backgroundColor: colors.mint,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4
  },

  // Sheets / Modales
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, padding: 14, borderTopLeftRadius: 16, borderTopRightRadius: 16, gap: 10, maxHeight: '80%' },
  sheetTitle: { color: colors.text, fontWeight: '900', marginBottom: 4 },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', color: colors.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginTop: 6 },

  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  inputRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  inputRowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, maxWidth: 120 },
  pillTxt: { color: colors.text, fontWeight: '700' },

  photoPick: { height: 160, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, overflow: 'hidden' },
  photoPickTxt: { color: colors.subtext, fontWeight: '700', textAlign: 'center' },
  photoPreview: { width: '100%', height: '100%' },

  dropdownSheet: { backgroundColor: colors.bg, padding: 14, borderTopLeftRadius: 16, borderTopRightRadius: 16, gap: 6, maxHeight: '80%', elevation: 8 },
  dropdownTitle: { color: colors.text, fontWeight: '900', marginBottom: 6 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 10 },
  dropdownItemActive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  dropdownItemTxt: { color: colors.text, fontWeight: '700', flex: 1 },
  dropdownItemTxtActive: { color: colors.mint },
});

export default CircleScreen;
