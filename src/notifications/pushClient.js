// src/notifications/pushClient.js
import { supabase } from "../lib/supabase";

export async function sendPush({ to, title, body, data = {} }) {
  if (!to || !title || !body) {
    throw new Error("sendPush: missing {to, title, body}");
  }

  const payload = { to, title, body, data };

  const { data: res, error } = await supabase.functions.invoke("push", {
    body: payload,
  });

  if (error) {
    // error.message + error.details selon cas
    throw new Error(`push invoke failed: ${error.message || String(error)}`);
  }

  if (!res?.ok) {
    throw new Error(`push failed: ${res?.error || "unknown error"}`);
  }

  return res; // { ok:true, sent, invalidTokens, expo }
}
