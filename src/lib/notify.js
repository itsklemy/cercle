// src/lib/notify.js
import * as Notifications from "expo-notifications";

export const IS_EXPO_GO = false; // App Store => false par défaut

export async function getExpoPushTokenSafe(projectId) {
  const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenResp?.data || null;
}

export async function notifyLocal(title, body, data) {
  const Notifications = await import('expo-notifications');
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data },
      trigger: null,
    });
  } catch {}
}
