// src/screens/ThreadScreen.js
import React, {
  useCallback, useEffect, useLayoutEffect,
  useMemo, useRef, useState,
} from "react";
import {
  View, Text, FlatList, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, TouchableOpacity,
  StyleSheet, Keyboard, RefreshControl,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { supabase } from "../lib/supabase";
import { colors as themeColors } from "../theme/colors";
import { sendPush } from "../notifications/pushClient";
import { getCircleMemberTokens, getUserToken } from "../notifications/pushTargets";

/* ─── Theme ─── */
const C = themeColors || {};
const colors = {
  bg:      C.bg      ?? "#0B0E14",
  text:    C.text    ?? "#F3F4F6",
  subtext: C.subtext ?? "#9AA3B2",
  mint:    C.mint    ?? "#1DFFC2",
  card:    C.card    ?? "rgba(255,255,255,0.04)",
  stroke:  C.stroke  ?? "rgba(255,255,255,0.10)",
  danger:  C.danger  ?? "#ff6b6b",
};

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

/* ═══════════════════════════════════════════
   SCREEN
═══════════════════════════════════════════ */
export default function ThreadScreen() {
  const route      = useRoute();
  const navigation = useNavigation();
  const insets     = useSafeAreaInsets();
  const headerH    = useHeaderHeight();

  const threadId   = route?.params?.threadId;
  const title      = route?.params?.title || "Chat";
  const circleId   = route?.params?.circleId ? String(route.params.circleId) : null;
  // Fallback noms si circle_members_list indisponible
  const routeParticipants = route?.params?.participants || {};

  /* ─── Auth — simple getUser au mount, pas de subscription ─── */
  const [userId, setUserId] = useState(null);
  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data }) => setUserId(data?.user?.id ?? null))
      .catch(() => setUserId(null));
  }, []);

  /* ─── State ─── */
  const [messages,        setMessages]        = useState([]);
  const [participantsMap, setParticipantsMap] = useState({});
  const [text,            setText]            = useState("");
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [sending,         setSending]         = useState(false);

  /* ─── FlatList inversée — plus besoin de scrollToBottom ─── */
  // Les messages sont triés du plus récent (index 0) au plus ancien.
  // inverted=true affiche les plus récents en bas nativement.
  const displayMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [messages]
  );

  /* ─── Merge messages par id (évite doublons realtime + insert) ─── */
  const mergeMessages = useCallback((prev, incoming) => {
    const map = new Map(prev.map((m) => [String(m.id), m]));
    for (const m of incoming) {
      if (m?.id != null) map.set(String(m.id), m);
    }
    return Array.from(map.values());
  }, []);

  /* ─── Pseudos membres ─── */
  const loadParticipants = useCallback(async () => {
    if (!circleId) return;
    try {
      const { data, error } = await supabase.rpc("circle_members_list", { p_circle_id: circleId });
      if (error || !data) return;
      const map = {};
      for (const r of data) {
        const uid = r?.user_id || r?.id || r?.member_id;
        if (uid) map[String(uid)] = r.public_name || "Membre";
      }
      setParticipantsMap(map);
    } catch (e) {
      console.log("[Thread] loadParticipants:", e?.message);
    }
  }, [circleId]);

  const getName = useCallback((senderId) => {
    const key = String(senderId ?? "");
    return (
      participantsMap[key]
      || routeParticipants[key]?.name
      || routeParticipants[key]?.full_name
      || "Membre"
    );
  }, [participantsMap, routeParticipants]);

  /* ─── Load messages ─── */
  const load = useCallback(async (silent = false) => {
    if (!threadId) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("messages").select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true })
        .limit(1000);
      if (!error) setMessages(data || []);
      else console.log("[Thread] load error:", error);
    } catch (e) {
      console.log("[Thread] load catch:", e?.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [threadId]);

  /* ─── Initial load + realtime ─── */
  useEffect(() => {
    load();
    loadParticipants();

    if (!threadId) return;

    let sub = null;
    try {
      sub = supabase
        .channel(`thread:${threadId}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public",
          table: "messages", filter: `thread_id=eq.${threadId}`,
        }, (payload) => {
          const msg = payload?.new;
          if (msg) setMessages((prev) => mergeMessages(prev, [msg]));
        })
        .subscribe();
    } catch (e) {
      console.log("[Thread] realtime:", e?.message);
    }

    return () => {
      try { if (sub) supabase.removeChannel(sub); } catch {}
    };
  }, [threadId, load, loadParticipants, mergeMessages]);

  /* ─── Header ─── */
  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.headerClose}
        >
          <Text style={styles.headerCloseTxt}>×</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, title]);

  /* ─── Refresh ─── */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(true), loadParticipants()]);
    setRefreshing(false);
  }, [load, loadParticipants]);

  /* ─── Send ─── */
  const canSend = useMemo(
    () => text.trim().length > 0 && !!userId && !!threadId && !sending,
    [text, userId, threadId, sending]
  );

  const send = useCallback(async () => {
    if (!canSend) return;
    const body = text.trim();

    // Optimistic update
    const tmpId = `tmp-${Date.now()}`;
    setText("");
    setSending(true);
    setMessages((prev) => mergeMessages(prev, [{
      id: tmpId, body, thread_id: threadId,
      sender_id: userId, created_at: new Date().toISOString(), pending: true,
    }]));

    try {
      const { data, error } = await supabase
        .from("messages")
        .insert([{ thread_id: threadId, body, sender_id: userId }])
        .select().single();

      if (error) {
        console.log("[Thread] send error:", error);
        setMessages((prev) =>
          prev.map((m) => m.id === tmpId ? { ...m, error: true, pending: false } : m)
        );
        return;
      }

      // Remplacer l'optimistic par le vrai message
      setMessages((prev) =>
        mergeMessages(prev.filter((m) => m.id !== tmpId), [data])
      );

      // Push — seulement si on a un circleId et des tokens
      if (circleId) {
        try {
          const [allTokens, myToken] = await Promise.all([
            getCircleMemberTokens(circleId),
            getUserToken(userId),
          ]);
          const targets = allTokens.filter((t) => t && t !== myToken);
          if (targets.length) {
            await sendPush({
              to: targets,
              title: "Nouveau message",
              body: "1 nouveau message",
              data: { type: "message", circleId, threadId, messageId: data.id },
            });
          }
        } catch (e) {
          console.warn("[Thread] push failed:", e?.message);
        }
      }
    } finally {
      setSending(false);
    }
  }, [canSend, text, threadId, userId, circleId, mergeMessages]);

  /* ─── Render item ─── */
  const renderItem = useCallback(({ item }) => {
    const mine    = !!userId && String(item.sender_id) === String(userId);
    const isError = !!item.error;

    return (
      <View style={[styles.msgRow, mine ? styles.rowMine : styles.rowOther]}>
        <View style={[
          styles.bubble,
          mine ? styles.bubbleMine : styles.bubbleOther,
          isError && styles.bubbleError,
        ]}>
          {!mine && (
            <Text style={styles.sender}>{getName(item.sender_id)}</Text>
          )}
          <Text style={[styles.body, mine ? styles.bodyMine : styles.bodyOther]}>
            {item.body || ""}
          </Text>
          <Text style={[styles.time, mine ? styles.timeMine : styles.timeOther]}>
            {item.pending ? "Envoi…" : item.error ? "Erreur" : fmtTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  }, [userId, getName]);

  const keyExtractor = useCallback(
    (m, i) => String(m?.id ?? `i-${i}`), []
  );

  /* ─── Loading ─── */
  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.mint} />
          <Text style={styles.loadingTxt}>Chargement…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={headerH}
      >
        {/* ─── Messages — FlatList inversée ─── */}
        {/* inverted=true : le plus récent est toujours en bas,
            pas besoin de scrollToBottom ni de setTimeout */}
        <FlatList
          data={displayMessages}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          inverted
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
              tintColor={colors.mint} />
          }
          showsVerticalScrollIndicator={false}
        />

        {/* ─── Composer ─── */}
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Écrire un message…"
            placeholderTextColor="rgba(255,255,255,0.40)"
            style={styles.input}
            multiline
            editable={!sending}
          />
          <TouchableOpacity
            onPress={send}
            disabled={!canSend}
            style={[styles.sendBtn, !canSend && { opacity: 0.50 }]}
            activeOpacity={0.88}
          >
            {sending
              ? <ActivityIndicator size="small" color={colors.bg} />
              : <MaterialIcon />
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* Icône envoi inline pour éviter l'import MaterialCommunityIcons si non dispo */
function MaterialIcon() {
  try {
    const { MaterialCommunityIcons } = require("@expo/vector-icons");
    return <MaterialCommunityIcons name="send" size={18} color={colors.bg} />;
  } catch {
    return <Text style={{ color: colors.bg, fontWeight: "900", fontSize: 13 }}>→</Text>;
  }
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingTxt:  { color: colors.subtext, fontWeight: "700" },

  // inverted FlatList : paddingTop devient la marge sous les messages récents
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 10,    // ← espace sous le dernier message (haut visuellement = bas réel)
    paddingBottom: 6,
  },

  msgRow:   { width: "100%", marginVertical: 3, flexDirection: "row" },
  rowMine:  { justifyContent: "flex-end" },
  rowOther: { justifyContent: "flex-start" },

  bubble: {
    maxWidth: "82%", borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  bubbleMine:  { backgroundColor: colors.mint, borderTopRightRadius: 4 },
  bubbleOther: { backgroundColor: "rgba(255,255,255,0.10)", borderTopLeftRadius: 4 },
  bubbleError: { borderWidth: 1, borderColor: colors.danger },

  sender:   { fontSize: 12, fontWeight: "900", marginBottom: 4, color: "rgba(255,255,255,0.65)" },
  body:     { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  bodyMine: { color: "#0C0C0C" },
  bodyOther:{ color: colors.text },
  time:     { marginTop: 4, fontSize: 11, fontWeight: "700" },
  timeMine: { color: "rgba(0,0,0,0.55)" },
  timeOther:{ color: "rgba(255,255,255,0.50)" },

  composer: {
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)",
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    backgroundColor: colors.bg, paddingTop: 10, paddingHorizontal: 10,
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 140,
    backgroundColor: "rgba(255,255,255,0.06)",
    color: colors.text, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: colors.mint,
    alignItems: "center", justifyContent: "center",
  },

  headerClose:    { paddingHorizontal: 12, paddingVertical: 6 },
  headerCloseTxt: { color: colors.text, fontSize: 20, fontWeight: "900", lineHeight: 22 },
});