// src/notifications/notifications.js
//
// Configure les listeners de notifications :
//   - réception en foreground (affiche l'alerte)
//   - tap sur une notification (navigation vers le bon écran)
//
// Appelé dans App.js :
//   const detach = setupNotificationListeners(navigationRef);
//   // Dans cleanup : detach?.();

import * as Notifications from "expo-notifications";

// Handler global : afficher les notifs même en foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

/**
 * @param {React.RefObject} navRef - ref vers le NavigationContainer
 */
export function setupNotificationListeners(navRef) {
  // 1. Notif reçue en foreground
  const foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data || {};
    console.log("[notif] foreground =", data?.type);
    // Pas de navigation ici — l'alerte s'affiche automatiquement
  });

  // 2. Tap sur une notif (foreground ou background)
  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data || {};
    console.log("[notif] tap =", data?.type, data);
    handleNotificationTap(data, navRef);
  });

  // 3. Notif reçue pendant que l'app était fermée (cold start)
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (!response) return;
    const data = response.notification.request.content.data || {};
    console.log("[notif] cold start tap =", data?.type);
    // Délai pour laisser la nav se monter
    setTimeout(() => handleNotificationTap(data, navRef), 1200);
  });

  return () => {
    foregroundSub.remove();
    responseSub.remove();
  };
}

/**
 * Routing selon le type de notification.
 * Types définis par convention dans les sendPush() du projet.
 */
function handleNotificationTap(data, navRef) {
  if (!navRef?.current) return;
  const nav = navRef.current;

  try {
    switch (data?.type) {
      // Quelqu'un a ajouté un item dans le cercle
      case "item_added":
        nav.navigate("AppTabs", { screen: "Circle" });
        break;

      // Demande de réservation reçue
      case "reservation_request":
        if (data.itemId) {
          nav.navigate("ItemDetail", { itemId: data.itemId });
        } else {
          nav.navigate("MyReservations");
        }
        break;

      // Onde (call) publiée
      case "call_created":
        nav.navigate("AppTabs", { screen: "Circle" });
        break;

      // Message dans un thread
      case "thread_message":
        if (data.callId) {
          nav.navigate("CallDetail", { callId: data.callId });
        } else if (data.threadId) {
          nav.navigate("Thread", { threadId: data.threadId });
        } else {
          nav.navigate("AppTabs", { screen: "Circle" });
        }
        break;

      // Quelqu'un a rejoint le cercle
      case "member_joined":
        nav.navigate("Members", { circleId: data.circleId });
        break;

      // Quelqu'un a quitté le cercle
      case "member_left":
        nav.navigate("Members", { circleId: data.circleId });
        break;

      // Réservation confirmée
      case "reservation_confirmed":
        nav.navigate("MyReservations");
        break;

      // Pro : onde Pro
      case "pro_call_created":
        nav.navigate("AppTabs", { screen: "Circle" });
        break;

      default:
        nav.navigate("AppTabs", { screen: "Circle" });
    }
  } catch (e) {
    console.log("[notif] navigation error =", e?.message || e);
  }
}