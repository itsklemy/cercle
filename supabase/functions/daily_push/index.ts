import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(),
  });
}

function isExpoToken(token: string) {
  return (
    /^ExponentPushToken\[[^\]]+\]$/.test(token) ||
    /^ExpoPushToken\[[^\]]+\]$/.test(token)
  );
}

async function expoSend(messages: any[]) {
  console.log("[daily push] appel Expo API, messages =", messages.length);
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(messages),
  });
  const expoJson = await res.json().catch(() => null);
  console.log("[daily push] réponse Expo status =", res.status);
  if (!res.ok) throw new Error(`Expo API error ${res.status}: ${JSON.stringify(expoJson)}`);
  return expoJson?.data ?? expoJson;
}

serve(async (req) => {
  console.log("[daily push] fonction appelée");

  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1. Récupérer tous les utilisateurs avec un token valide
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, expo_push_token")
      .eq("notifications_enabled", true)
      .not("expo_push_token", "is", null);

    if (profErr) throw profErr;

    const validProfiles = (profiles || []).filter((p) =>
      isExpoToken(p.expo_push_token)
    );

    console.log("[daily push] utilisateurs valides =", validProfiles.length);
    if (!validProfiles.length) return json({ ok: true, sent: 0, note: "No tokens" });

    const messages: any[] = [];

    for (const profile of validProfiles) {
      const userId = profile.id;

      // 2. Cercles de l'utilisateur
      const { data: memberships } = await supabase
        .from("circle_members")
        .select("circle_id")
        .eq("user_id", userId);

      const circleIds = (memberships || []).map((m) => m.circle_id);

      // Pas de cercle
      if (!circleIds.length) {
        messages.push({
          to: profile.expo_push_token,
          sound: "default",
          title: "Cercle",
          body: "Ton Cercle t'attend! Invite tes proches et commence à échanger ",
          data: { type: "daily" },
          priority: "high",
        });
        continue;
      }

      // 3. Membres dans ces cercles (hors soi-même)
      const { data: otherMembers } = await supabase
        .from("circle_members")
        .select("user_id")
        .in("circle_id", circleIds)
        .neq("user_id", userId);

      const hasMembers = (otherMembers || []).length > 0;

      if (!hasMembers) {
        messages.push({
          to: profile.expo_push_token,
          sound: "default",
          title: "Cercle",
          body: "Ton Cercle t'attend! Invite tes proches et commence à échanger",
          data: { type: "daily" },
          priority: "high",
        });
        continue;
      }

      // 4. Objets disponibles dans ces cercles (pas les siens)
      const { data: items } = await supabase
        .from("items")
        .select("title")
        .in("circle_id", circleIds)
        .neq("owner_id", userId)
        .order("created_at", { ascending: false })
        .limit(3);

      const itemTitles = (items || []).map((i) => i.title).filter(Boolean);

      if (!itemTitles.length) {
        // Cercle avec membres mais pas d'objets
        messages.push({
          to: profile.expo_push_token,
          sound: "default",
          title: "Cercle",
          body: "Ton Cercle est prêt! Ajoute tes articles  pour que tes proches puissent emprunter",
          data: { type: "daily" },
          priority: "high",
        });
      } else {
        // Cercle avec objets — message concret
        const itemList = itemTitles.join(", ");
        messages.push({
          to: profile.expo_push_token,
          sound: "default",
          title: "Cercle",
          body: `${itemList}… disponibles dans ton Cercle 👀`,
          data: { type: "daily" },
          priority: "high",
        });
      }
    }

    // 5. Envoi par batch de 90
    const batchSize = 90;
    let sent = 0;
    const allResults: any[] = [];

    for (let i = 0; i < messages.length; i += batchSize) {
      const chunk = messages.slice(i, i + batchSize);
      console.log("[daily push] envoi batch =", chunk.length);
      const result = await expoSend(chunk);
      allResults.push(...(Array.isArray(result) ? result : [result]));
      sent += chunk.length;
    }

    console.log("[daily push] total envoyé =", sent);
    return json({ ok: true, sent, expo: allResults });

  } catch (e) {
    console.log("[daily push] erreur =", String(e));
    return json({ ok: false, error: String(e) }, 500);
  }
});