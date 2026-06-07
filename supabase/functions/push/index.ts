import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type PushRequest = {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type ExpoMessage = {
  to: string;
  sound?: "default" | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: "default" | "normal" | "high";
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

function isExpoToken(token: string) {
  return /^ExponentPushToken\[[^\]]+\]$/.test(token) || /^ExpoPushToken\[[^\]]+\]$/.test(token);
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

serve(async (req: Request) => {
  console.log("[push fn] requête reçue, method =", req.method);

  if (req.method === "OPTIONS") {
    console.log("[push fn] OPTIONS");
    return json({ ok: true }, 200);
  }

  if (req.method !== "POST") {
    console.log("[push fn] mauvaise méthode =", req.method);
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  let payload: PushRequest;
  try {
    payload = await req.json();
    console.log("[push fn] payload reçu =", payload);
  } catch (e) {
    console.log("[push fn] JSON invalide =", String(e));
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const title = payload?.title?.trim();
  const body = payload?.body?.trim();
  const data = payload?.data ?? {};
  const toRaw = payload?.to;

  console.log("[push fn] title =", title);
  console.log("[push fn] body =", body);
  console.log("[push fn] toRaw =", toRaw);

  if (!toRaw || !title || !body) {
    console.log("[push fn] champs requis manquants");
    return json({ ok: false, error: "Missing required fields: to, title, body" }, 400);
  }

  const tokens = uniq(
    (Array.isArray(toRaw) ? toRaw : [toRaw])
      .filter((t) => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean),
  );

  console.log("[push fn] tokens normalisés =", tokens);

  const validTokens = tokens.filter(isExpoToken);
  const invalidTokens = tokens.filter((t) => !isExpoToken(t));

  console.log("[push fn] validTokens =", validTokens);
  console.log("[push fn] invalidTokens =", invalidTokens);

  if (validTokens.length === 0) {
    console.log("[push fn] aucun token Expo valide");
    return json({ ok: false, error: "No valid Expo push tokens", invalidTokens }, 400);
  }

  const messages: ExpoMessage[] = validTokens.map((t) => ({
    to: t,
    title,
    body,
    data,
    sound: "default",
    priority: "high",
  }));

  console.log("[push fn] messages envoyés à Expo =", messages);

  try {
    const expoRes = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });

    const expoJson = await expoRes.json().catch(() => null);

    console.log("[push fn] status Expo =", expoRes.status);
    console.log("[push fn] réponse Expo =", expoJson);

    if (!expoRes.ok) {
      return json(
        {
          ok: false,
          error: "Expo push API error",
          status: expoRes.status,
          details: expoJson,
          invalidTokens,
        },
        502,
      );
    }

    return json(
      {
        ok: true,
        sent: validTokens.length,
        invalidTokens,
        expo: expoJson?.data ?? expoJson,
      },
      200,
    );
  } catch (e) {
    console.log("[push fn] erreur réseau Expo =", String(e));
    return json(
      {
        ok: false,
        error: "Network error while calling Expo push API",
        details: String(e),
        invalidTokens,
      },
      502,
    );
  }
});