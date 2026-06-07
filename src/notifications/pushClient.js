// src/notifications/pushClient.js
//
// Moteur d'envoi push via l'API Expo.
// sendPush({ to, title, body, data }) — envoie à 1..N tokens.
// Gestion des erreurs silencieuse : jamais de crash côté app.
 
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE    = 100; // Expo accepte max 100 par requête
 
/**
 * Envoie une notification push à un ou plusieurs tokens Expo.
 *
 * @param {object} opts
 * @param {string|string[]} opts.to      - Token(s) Expo "ExponentPushToken[...]"
 * @param {string}          opts.title   - Titre
 * @param {string}          opts.body    - Corps
 * @param {object}          [opts.data]  - Payload JSON custom
 * @param {string}          [opts.sound] - "default" | null
 * @param {string}          [opts.badge] - Badge iOS
 * @returns {Promise<boolean>} true si au moins un envoi a réussi
 */
export async function sendPush({ to, title, body, data = {}, sound = "default" }) {
  try {
    const tokens = Array.isArray(to) ? to : [to];
    const valid  = tokens.filter(isValidToken);
    if (!valid.length) return false;
 
    // Découper en chunks de 100
    const chunks = [];
    for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
      chunks.push(valid.slice(i, i + CHUNK_SIZE));
    }
 
    let anyOk = false;
    for (const chunk of chunks) {
      const messages = chunk.map((token) => ({
        to:    token,
        title: String(title || ""),
        body:  String(body  || ""),
        data:  data || {},
        sound,
        priority: "high",
        channelId: "default",
      }));
 
      const res = await fetch(EXPO_PUSH_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body:    JSON.stringify(messages),
      });
 
      if (res.ok) anyOk = true;
    }
    return anyOk;
  } catch (e) {
    console.log("[push] sendPush error =", e?.message || e);
    return false;
  }
}
 
/**
 * Vérifie qu'un token est au format Expo valide.
 */
export function isValidToken(token) {
  return (
    typeof token === "string" &&
    token.startsWith("ExponentPushToken[") &&
    token.endsWith("]")
  );
}