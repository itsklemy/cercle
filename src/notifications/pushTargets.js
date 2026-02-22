// src/notifications/pushTargets.js
import { supabase } from "../lib/supabase";

function uniq(arr) {
  return Array.from(new Set(arr));
}

/**
 * Retourne tous les tokens uniques (non null) des membres d'un cercle.
 * Nécessite FK: circle_members.user_id -> profiles.id
 */
export async function getCircleMemberTokens(circleId) {
  if (!circleId) throw new Error("getCircleMemberTokens: missing circleId");

  const { data, error } = await supabase
    .from("circle_members")
    .select("user_id, profiles ( expo_push_token )")
    .eq("circle_id", circleId);

  if (error) throw new Error(`getCircleMemberTokens failed: ${error.message}`);

  const tokens =
    (data || [])
      .map((row) => row?.profiles?.expo_push_token)
      .filter((t) => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.trim());

  return uniq(tokens);
}

/**
 * Retourne le token d'un user (ou null).
 */
export async function getUserToken(userId) {
  if (!userId) throw new Error("getUserToken: missing userId");

  const { data, error } = await supabase
    .from("profiles")
    .select("expo_push_token")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`getUserToken failed: ${error.message}`);

  const token = data?.expo_push_token;
  return typeof token === "string" && token.trim().length > 0 ? token.trim() : null;
}
