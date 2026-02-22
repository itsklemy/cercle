import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

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

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

async function expoSend(messages: any[]) {
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

  if (!res.ok) {
    throw new Error(
      `Expo API error ${res.status}: ${JSON.stringify(expoJson)}`
    );
  }

  return expoJson?.data ?? expoJson;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST")
    return json({ ok: false, error: "Method not allowed" }, 405);

  // sécurité: seul le cron (ou toi manuellement) peut appeler
  const secret = req.headers.get("x-cron-secret") || "";
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1) récupérer tous les tokens
    const { data, error } = await supabase
      .from("profiles")
      .select("expo_push_token")
      .not("expo_push_token", "is", null);

    if (error) {
      return json({ ok: false, error: error.message }, 500);
    }

    const tokens = uniq(
      (data || [])
        .map((r) => (r as any)?.expo_push_token)
        .filter((t) => typeof t === "string")
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && isExpoToken(t))
    );

    if (!tokens.length) {
      return json({ ok: true, sent: 0, note: "No tokens" }, 200);
    }

    // 2) message aléatoire (2 variantes)
    const bodies = [
      "Emprunte quelque-chose aujourd'hui dans ton Cercle",
      "L'inventaire a été mis à jour, consulte les nouveaux articles",
    ];
    const body = bodies[Math.floor(Math.random() * bodies.length)];

    // 3) envoi par batch (recommandé par Expo)
    const title = "Cercle";
    const batchSize = 90;
    let sent = 0;
    const allResults: any[] = [];

    for (let i = 0; i < tokens.length; i += batchSize) {
      const chunk = tokens.slice(i, i + batchSize);

      const messages = chunk.map((to) => ({
        to,
        sound: "default",
        title,
        body,
        data: { type: "daily" },
        priority: "high",
      }));

      const result = await expoSend(messages);
      allResults.push(...(Array.isArray(result) ? result : [result]));
      sent += chunk.length;
    }

    return json(
      {
        ok: true,
        sent,
        expo: allResults,
      },
      200
    );
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
