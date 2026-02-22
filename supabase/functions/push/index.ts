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
  // ExponentPushToken[xxxx] ou ExpoPushToken[xxxx]
  return /^ExponentPushToken\[[^\]]+\]$/.test(token) || /^ExpoPushToken\[[^\]]+\]$/.test(token);
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let payload: PushRequest;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const title = payload?.title?.trim();
  const body = payload?.body?.trim();
  const data = payload?.data ?? {};
  const toRaw = payload?.to;

  if (!toRaw || !title || !body) {
    return json({ ok: false, error: "Missing required fields: to, title, body" }, 400);
  }

  // normalise to => array, trim, uniq
  const tokens = uniq(
    (Array.isArray(toRaw) ? toRaw : [toRaw])
      .filter((t) => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean),
  );

  const validTokens = tokens.filter(isExpoToken);
  const invalidTokens = tokens.filter((t) => !isExpoToken(t));

  if (validTokens.length === 0) {
    return json({ ok: false, error: "No valid Expo push tokens", invalidTokens }, 400);
  }

  // Expo accepte un array de messages => 1 appel réseau
  const messages: ExpoMessage[] = validTokens.map((t) => ({
    to: t,
    title,
    body,
    data,
    sound: "default",
    priority: "high",
  }));

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

    // expoJson typique: { data: [ {status:'ok', id:'...'} | {status:'error', message:'...', details:{...}} ] }
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
