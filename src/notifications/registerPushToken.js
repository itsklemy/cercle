// src/notifications/registerPushToken.js
//
// Demande la permission push, obtient le token Expo,
// et l'écrit dans profiles.expo_push_token pour l'utilisateur connecté.
//
// Appelé depuis App.js :
//   - au montage (si session active)
//   - à chaque SIGNED_IN via onAuthStateChange

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { supabase } from "../lib/supabase";

let _lastRegisteredToken = null; // cache session pour éviter les doublons

/**
 * Enregistre le token push Expo de l'utilisateur courant dans Supabase.
 * Silencieux : ne throw jamais.
 *
 * @returns {Promise<string|null>} Le token ou null
 */
export async function registerExpoPushToken() {
  try {
    // 1. Doit être un device physique (simulateur = pas de push)
    if (!Device.isDevice) {
      console.log("[push] simulateur détecté — pas de token push");
      return null;
    }

    // 2. Permission
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("[push] permission refusée");
      return null;
    }

    // 3. Android : channel requis
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name:              "default",
        importance:        Notifications.AndroidImportance.MAX,
        vibrationPattern:  [0, 250, 250, 250],
        enableVibrate:     true,
        enableLights:      true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        showBadge:         true,
      });
    }

    // 4. Token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "4de9ab1e-5c50-4931-b7a7-8c47a38d9f10", // ← ton EAS projectId
    });
    const token = tokenData?.data;
    if (!token) return null;

    // 5. Éviter d'écrire le même token plusieurs fois par session
    if (_lastRegisteredToken === token) return token;

    // 6. Session active ?
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return token;

    // 7. Écrire dans profiles
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, expo_push_token: token }, { onConflict: "id" });

    if (error) {
      console.log("[push] upsert token error =", error.message);
    } else {
      _lastRegisteredToken = token;
      console.log("[push] token enregistré =", token.slice(0, 40) + "...");
    }

    return token;
  } catch (e) {
    console.log("[push] registerExpoPushToken error =", e?.message || e);
    return null;
  }
}

/**
 * Efface le token push de l'utilisateur courant dans Supabase.
 * À appeler lors du SIGNED_OUT.
 */
export async function clearExpoPushToken(userId) {
  try {
    if (!userId) return;
    await supabase
      .from("profiles")
      .update({ expo_push_token: null })
      .eq("id", userId);
    _lastRegisteredToken = null;
    console.log("[push] token effacé pour", userId);
  } catch (e) {
    console.log("[push] clearExpoPushToken error =", e?.message || e);
  }
}