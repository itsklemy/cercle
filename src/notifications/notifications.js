// src/notifications/notifications.js
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

export async function registerForPushTokenAsync() {
  try {
    // Vérifie qu’on est sur un vrai téléphone
    if (!Device.isDevice) {
      console.log("Push: pas un device physique.");
      return null;
    }

    // Demande permission
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();

    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } =
        await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Push: permission refusée");
      return null;
    }

    // Android : créer un channel (obligatoire)
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    // Récupération du token Expo
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    console.log("EXPO PUSH TOKEN =", token); // ✅ log pour vérification

    return token;
  } catch (e) {
    console.log("registerForPushTokenAsync error:", e);
    return null;
  }
}
