// src/screens/ThreadScreen.js
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  RefreshControl,
  Pressable,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { supabase } from "../lib/supabase";
import { colors as themeColors } from "../theme/colors";

// ✅ PUSH
import { sendPush } from "../notifications/pushClient";
import { getCircleMemberTokens, getUserToken } from "../notifications/pushTargets";

/* -------------------- Theme fallback (anti-crash) -------------------- */
const C = themeColors || {};
const colors = {
  bg: C.bg ?? "#0B0E14",
  text: C.text ?? "#F3F4F6",
  subtext: C.subtext ?? "#9AA3B2",
  mint: C.mint ?? "#1DFFC2",
  card: C.card ?? "rgba(255,255,255,0.04)",
  stroke: C.stroke ?? "rgba(255,255,255,0.10)",
  danger: C.danger ?? "#ff6b6b",
};

/* -------------------- current user -------------------- */
function useCurrentUser() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    let mounted = true;

    const fetch = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted) setUser(data?.session?.user || null);
      } catch {
        if (mounted) setUser(null);
      }
    };

    fetch();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user || null);
    });

    return () => {
      mounted = false;
      try {
        sub?.subscription?.unsubscribe?.();
      } catch {}
    };
  }, []);

  return user;
}

export default function ThreadScreen() {
  const route = useRoute();
  const navigation = useNavigation();

  const threadId = route?.params?.threadId;
  const title = route?.params?.title || "Chat";

  // ✅ IMPORTANT : on récupère circleId (ton CircleScreen l’envoie déjà)
  const circleId = route?.params?.circleId ? String(route.params.circleId) : null;

  // fallback mapping participants via route.params (pas fiable)
  const participants = route?.params?.participants || {};

  const user = useCurrentUser();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);

  // ✅ mapping user_id -> public_name (venant du cercle)
  const [participantsMap, setParticipantsMap] = useState({});

  const listRef = useRef(null);

  const canSend = useMemo(() => {
    return text.trim().length > 0 && !!user?.id && !!threadId && !sending;
  }, [text, user?.id, threadId, sending]);

  const mergeById = useCallback((prev = [], incoming = []) => {
    const map = new Map();
    prev.forEach((m) => m?.id != null && map.set(String(m.id), m));
    incoming.forEach((m) => m?.id != null && map.set(String(m.id), m));
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    try {
      if (!listRef.current) return;
      listRef.current.scrollToEnd?.({ animated });
    } catch {}
  }, []);

  // ✅ charge les pseudos depuis le cercle (circle_members_list)
  const loadParticipants = useCallback(async () => {
    if (!circleId) {
      setParticipantsMap({});
      return;
    }

    try {
      const { data, error } = await supabase.rpc("circle_members_list", {
        p_circle_id: circleId,
      });

      if (error) {
        console.log("[ThreadScreen] circle_members_list error:", error);
        setParticipantsMap({});
        return;
      }

      const map = {};
      (data || []).forEach((r) => {
        const uid = r?.user_id || r?.id || r?.member_id;
        if (uid) map[String(uid)] = r.public_name || "Membre";
      });

      setParticipantsMap(map);
    } catch (e) {
      console.log("[ThreadScreen] loadParticipants catch:", e?.message || e);
      setParticipantsMap({});
    }
  }, [circleId]);

  const getName = useCallback(
    (senderId) => {
      const key = String(senderId ?? "");
      return (
        participantsMap?.[key] ||
        participants?.[key]?.name ||
        participants?.[key]?.full_name ||
        "Membre"
      );
    },
    [participantsMap, participants]
  );

  const load = useCallback(
    async (opts = { silent: false }) => {
      if (!opts?.silent) setLoading(true);
      try {
        if (!threadId) {
          setMessages([]);
          return;
        }

        const res = await supabase
          .from("messages")
          .select("*")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: true })
          .limit(1000);

        if (res.error) {
          console.log("[ThreadScreen] load error:", res.error);
          setMessages([]);
        } else {
          setMessages(res.data || []);
          setTimeout(() => scrollToBottom(false), 60);
        }
      } catch (e) {
        console.log("[ThreadScreen] load catch:", e?.message || e);
        setMessages([]);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [threadId, scrollToBottom]
  );

  useLayoutEffect(() => {
    navigation.setOptions?.({
      title,
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.headerCloseBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.headerCloseTxt}>×</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, title]);

  // initial load + realtime insert
  useEffect(() => {
    load();
    loadParticipants();

    let subscription = null;
    try {
      if (supabase?.channel && threadId) {
        subscription = supabase
          .channel(`public:messages:thread=${threadId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
              filter: `thread_id=eq.${threadId}`,
            },
            (payload) => {
              const newMsg = payload?.new;
              if (newMsg) {
                setMessages((prev) => mergeById(prev, [newMsg]));
                setTimeout(() => scrollToBottom(true), 80);
              }
            }
          )
          .subscribe();
      }
    } catch (e) {
      console.log("[ThreadScreen] realtime err:", e?.message || e);
    }

    return () => {
      try {
        if (subscription) supabase.removeChannel?.(subscription);
      } catch {}
    };
  }, [threadId, load, loadParticipants, mergeById, scrollToBottom]);

  // scroll when keyboard opens
  useEffect(() => {
    const subShow = Keyboard.addListener("keyboardDidShow", () =>
      setTimeout(() => scrollToBottom(true), 120)
    );
    return () => {
      try {
        subShow.remove?.();
      } catch {}
    };
  }, [scrollToBottom]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load({ silent: true });
      await loadParticipants();
    } finally {
      setRefreshing(false);
    }
  }, [load, loadParticipants]);

  const send = useCallback(async () => {
    if (!canSend) return;

    const body = text.trim();

    const tmpId = `tmp-${Date.now()}`;
    const pending = {
      id: tmpId,
      body,
      thread_id: threadId,
      sender_id: user?.id,
      created_at: new Date().toISOString(),
      pending: true,
    };

    setText("");
    setMessages((prev) => mergeById(prev, [pending]));
    setSending(true);

    try {
      const { data, error } = await supabase
        .from("messages")
        .insert([{ thread_id: threadId, body, sender_id: user?.id }])
        .select()
        .single();

      if (error) {
        console.log("[ThreadScreen] send error:", error);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tmpId ? { ...m, error: true, pending: false } : m
          )
        );
      } else {
        setMessages((prev) =>
          mergeById(prev.filter((m) => m.id !== tmpId), [data])
        );

        // ✅ PUSH: Nouveau message (chat de cercle)
        // Notifie tous les membres du cercle sauf l'expéditeur
        try {
          if (circleId) {
            const tokens = await getCircleMemberTokens(circleId);
            const myToken = await getUserToken(user?.id);
            const targets = tokens.filter((t) => t && t !== myToken);

            if (targets.length) {
              await sendPush({
                to: targets,
                title: "Nouveau message",
                body: "1 nouveau message",
                data: {
                  type: "message",
                  circleId,
                  threadId,
                  messageId: data.id,
                },
              });
            }
          }
        } catch (e) {
          console.warn("Push message failed:", e?.message || e);
        }
      }

      setTimeout(() => scrollToBottom(true), 80);
    } catch (e) {
      console.log("[ThreadScreen] send catch:", e?.message || e);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tmpId ? { ...m, error: true, pending: false } : m
        )
      );
    } finally {
      setSending(false);
    }
  }, [canSend, text, threadId, user?.id, mergeById, scrollToBottom, circleId]);

  const keyExtractor = useCallback((m, idx) => String(m?.id ?? `idx-${idx}`), []);

  const renderItem = useCallback(
    ({ item }) => {
      const mine =
        user?.id &&
        item?.sender_id &&
        String(item.sender_id) === String(user.id);

      const isError = !!item?.error;
      const senderLabel = mine ? "Moi" : getName(item?.sender_id);

      return (
        <View style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowOther]}>
          <View
            style={[
              styles.bubble,
              mine ? styles.bubbleMine : styles.bubbleOther,
              isError && styles.bubbleError,
            ]}
          >
            {!mine && <Text style={styles.sender}>{senderLabel}</Text>}

            <Text style={[styles.body, mine ? styles.bodyMine : styles.bodyOther]}>
              {item?.body || ""}
            </Text>

            <Text style={[styles.time, mine ? styles.timeMine : styles.timeOther]}>
              {item?.pending ? "Envoi…" : item?.error ? "Erreur" : fmtTime(item?.created_at)}
            </Text>
          </View>
        </View>
      );
    },
    [user?.id, getName]
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator />
          <Text style={styles.loadingTxt}>Chargement…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const keyboardOffset = headerHeight + insets.top;
  const composerPadBottom = Math.max(insets.bottom, 10);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={keyboardOffset}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.listContent, { paddingBottom: 10 }]}
          onContentSizeChange={() => setTimeout(() => scrollToBottom(false), 20)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        />

        <View style={[styles.composer, { paddingBottom: composerPadBottom }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Écrire un message…"
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={styles.input}
            multiline
            editable={!sending}
            onFocus={() => setTimeout(() => scrollToBottom(true), 120)}
          />

          <TouchableOpacity
            onPress={send}
            disabled={!canSend}
            style={[styles.sendBtn, { opacity: !canSend ? 0.55 : 1 }]}
            activeOpacity={0.9}
          >
            <Text style={styles.sendTxt}>{sending ? "…" : "Envoyer"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  kav: { flex: 1 },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 16 },
  loadingTxt: { color: colors.subtext, fontWeight: "700" },

  listContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    flexGrow: 1,
    justifyContent: "flex-end",
  },

  msgRow: { width: "100%", marginVertical: 4, flexDirection: "row" },
  msgRowMine: { justifyContent: "flex-end" },
  msgRowOther: { justifyContent: "flex-start" },

  bubble: {
    maxWidth: "82%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bubbleMine: {
    backgroundColor: colors.mint,
    borderTopRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderTopLeftRadius: 6,
  },
  bubbleError: { borderWidth: 1, borderColor: colors.danger },

  sender: {
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 4,
    color: "rgba(255,255,255,0.70)",
  },

  body: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  bodyMine: { color: "#0C0C0C" },
  bodyOther: { color: colors.text },

  time: { marginTop: 4, fontSize: 11, fontWeight: "700" },
  timeMine: { color: "rgba(0,0,0,0.60)" },
  timeOther: { color: "rgba(255,255,255,0.55)" },

  composer: {
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    backgroundColor: colors.bg,
    paddingTop: 10,
    paddingHorizontal: 10,
  },

  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    backgroundColor: "rgba(255,255,255,0.06)",
    color: colors.text,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  sendBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  sendTxt: { color: colors.bg, fontWeight: "900" },

  headerCloseBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  headerCloseTxt: { color: colors.text, fontSize: 18, fontWeight: "900", lineHeight: 20 },
});
