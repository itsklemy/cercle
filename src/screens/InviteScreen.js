import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, Text, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { CommonActions, useNavigation, useRoute } from "@react-navigation/native";
import { colors } from "../theme/colors";

const PENDING_INVITE_KEY = "pending_invite_token_v1";

function extractInviteCodeUniversal(raw) {
  if (!raw) return "";

  let s = String(raw);

  try {
    s = decodeURIComponent(s);
  } catch {}

  s = s.trim();

  if (s.startsWith("invite/")) s = s.slice("invite/".length);

  if (s.includes("/--/invite/")) s = s.split("/--/invite/")[1] || "";
  if (s.includes("/invite/")) s = s.split("/invite/")[1] || "";

  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const seg = (u.pathname || "").split("/").filter(Boolean);
      s = (seg[seg.length - 1] || "").trim();
    } catch {}
  }

  s = s.split(/[?#]/)[0].replace(/\/+$/, "");

  s = s
    .replace(/\u200B/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, "");

  return s;
}

function supabaseErrorToMessage(e) {
  if (!e) return "Erreur inconnue.";
  if (typeof e === "string") return e;

  // Supabase / PostgREST error shapes
  if (e?.message) return String(e.message);
  if (e?.error_description) return String(e.error_description);

  try {
    return JSON.stringify(e);
  } catch {
    return "Erreur inconnue.";
  }
}

export default function InviteScreen({ navigation: propNav }) {
  const route = useRoute();
  const navigation = propNav || useNavigation();

  const rawParam =
    route?.params?.token ??
    route?.params?.code ??
    route?.params?.invite ??
    route?.params?.url ??
    route?.params?.link ??
    "";

  const [loading, setLoading] = useState(true);
  const [statusText, setStatusText] = useState("On te fait rejoindre le cercle…");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const code = extractInviteCodeUniversal(rawParam);

        console.log("[InviteScreen] rawParam =", JSON.stringify(rawParam));
        console.log("[InviteScreen] code =", JSON.stringify(code), "len=", code.length);

        if (!code) {
          Alert.alert("Invitation", "Lien invalide (code manquant).", [
            { text: "OK", onPress: () => navigation.navigate("AppTabs") },
          ]);
          return;
        }

        setStatusText("Vérification de ta session…");

        const { data: sessResp, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) console.log("[InviteScreen] session error =", sessErr);

        const user = sessResp?.session?.user;

        // Pas connecté -> on stocke le code puis on envoie vers Auth
        if (!user) {
          try {
            await AsyncStorage.setItem(PENDING_INVITE_KEY, code);
          } catch (e) {
            console.log("[InviteScreen] AsyncStorage setItem failed =", e?.message || e);
          }

          Alert.alert("Invitation", "Connecte-toi pour rejoindre ce cercle.", [
            {
              text: "OK",
              onPress: () => {
                navigation.dispatch(
                  CommonActions.reset({
                    index: 0,
                    routes: [{ name: "Auth", params: { mode: "signin" } }],
                  })
                );
              },
            },
          ]);
          return;
        }

        setStatusText("Validation de l’invitation…");

        // RPC unique côté serveur (accepte token OU code)
        const { data: circleId, error } = await supabase.rpc("join_circle_by_token_or_code_v2", {
          p_code: code,
        });

        if (error) {
          console.log("[InviteScreen] join rpc error =", error);
          throw error;
        }
        if (!circleId) throw new Error("Impossible de rejoindre (circleId manquant).");

        try {
          await AsyncStorage.removeItem(PENDING_INVITE_KEY);
        } catch {}

        // ✅ Confirmation claire avant navigation
        Alert.alert("Invitation", "Tu as maintenant accès au cercle ✅", [
          {
            text: "Ouvrir",
            onPress: () => {
              navigation.dispatch(
                CommonActions.reset({
                  index: 0,
                  routes: [
                    {
                      name: "AppTabs",
                      params: {
                        screen: "Circle",
                        params: { circleId: String(circleId) },
                      },
                    },
                  ],
                })
              );
            },
          },
        ]);
      } catch (e) {
        const msg = supabaseErrorToMessage(e);
        console.log("[InviteScreen] FINAL ERROR =", msg, e);

        // Fallback : on ré-affiche le code pour copie manuelle
        const code = extractInviteCodeUniversal(rawParam);

        Alert.alert("Invitation", `${msg}\n\nCode : ${code || "—"}`, [
          { text: "OK", onPress: () => navigation.navigate("AppTabs") },
        ]);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setStatusText("Terminé.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rawParam, navigation]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <ActivityIndicator />
      <Text style={{ color: colors.subtext, marginTop: 10, textAlign: "center" }}>
        {loading ? statusText : "Terminé."}
      </Text>
    </View>
  );
}
