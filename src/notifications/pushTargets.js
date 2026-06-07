// src/notifications/pushTargets.js
//
// Helpers pour récupérer les tokens push depuis Supabase.
// Toutes les fonctions sont silencieuses : elles retournent []
// ou null en cas d'erreur, jamais d'exception.

import { supabase } from "../lib/supabase";
import { isValidToken } from "./pushClient";

/**
 * Récupère les tokens de tous les membres d'un cercle,
 * en excluant optionnellement un userId (l'expéditeur).
 *
 * @param {string}      circleId
 * @param {string|null} excludeUserId - userId à exclure (self)
 * @returns {Promise<string[]>}
 */
export async function getCircleMemberTokens(circleId, excludeUserId = null) {
  try {
    if (!circleId) return [];

    // 1. Membres du cercle
    const { data: members, error: memErr } = await supabase
      .from("circle_members")
      .select("user_id")
      .eq("circle_id", circleId);

    if (memErr || !members?.length) return [];

    let ids = members.map((m) => m.user_id).filter(Boolean);
    if (excludeUserId) ids = ids.filter((id) => id !== excludeUserId);
    if (!ids.length) return [];

    // 2. Tokens dans profiles
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("expo_push_token")
      .in("id", ids)
      .not("expo_push_token", "is", null);

    if (profErr || !profiles?.length) return [];

    return profiles
      .map((p) => p.expo_push_token)
      .filter(isValidToken);
  } catch (e) {
    console.log("[pushTargets] getCircleMemberTokens error =", e?.message || e);
    return [];
  }
}

/**
 * Récupère le token push d'un utilisateur spécifique.
 *
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
export async function getUserToken(userId) {
  try {
    if (!userId) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("expo_push_token")
      .eq("id", userId)
      .single();
    if (error || !data?.expo_push_token) return null;
    return isValidToken(data.expo_push_token) ? data.expo_push_token : null;
  } catch (e) {
    console.log("[pushTargets] getUserToken error =", e?.message || e);
    return null;
  }
}

/**
 * Envoie un push à tous les membres d'un cercle sauf l'expéditeur.
 * Wrapper pratique qui combine getCircleMemberTokens + sendPush.
 *
 * @param {object} opts
 * @param {string}  opts.circleId
 * @param {string}  opts.senderId      - userId de l'expéditeur (exclu)
 * @param {string}  opts.title
 * @param {string}  opts.body
 * @param {object}  [opts.data]
 */
export async function notifyCircleMembers({ circleId, senderId, title, body, data = {} }) {
  try {
    const { sendPush } = await import("./pushClient");
    const tokens = await getCircleMemberTokens(circleId, senderId);
    if (!tokens.length) return;
    await sendPush({ to: tokens, title, body, data });
  } catch (e) {
    console.log("[pushTargets] notifyCircleMembers error =", e?.message || e);
  }
}