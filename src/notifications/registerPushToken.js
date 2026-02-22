import * as Notifications from "expo-notifications";
import { supabase } from "../lib/supabase";

export async function registerExpoPushToken() {
  // 1) user id
  const { data: sess, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) return { ok: false, reason: sessErr.message };

  const userId = sess?.session?.user?.id;
  if (!userId) return { ok: false, reason: "no_user" };

  // 2) expo token
  const tokenRes = await Notifications.getExpoPushTokenAsync();
  const token = tokenRes?.data;
  if (!token) return { ok: false, reason: "no_token" };

  // 3) store token in profiles
  // upsert => crée la row si elle n'existe pas, sinon update
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, expo_push_token: token }, { onConflict: "id" });

  if (error) return { ok: false, reason: error.message };

  return { ok: true, token };
}
