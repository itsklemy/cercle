// src/lib/notify.js
import Constants from 'expo-constants';

const isExpoGo = Constants.appOwnership === 'expo';

export async function registerForPush() {
  // import paresseux pour éviter l'init quand on n'en a pas besoin
  const Notifications = await import('expo-notifications');

  // Handler local (OK dans Expo Go)
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });

  // Expo Go → on se limite au local, on NE DEMANDE PAS de token push
  if (isExpoGo) {
    try { await Notifications.requestPermissionsAsync(); } catch {}
    return { mode: 'local-only' };
  }

  // Dev build / prod → tu peux gérer ici l’enregistrement FCM/APNs
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return { mode: 'denied' };
    // Exemple: récupérer un token Expo (si tu utilises le service Expo push)
    // const token = await Notifications.getExpoPushTokenAsync();
    return { mode: 'remote-enabled' };
  } catch {
    return { mode: 'error' };
  }
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
