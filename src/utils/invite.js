// src/utils/invite.js
import * as Clipboard from "expo-clipboard";
import { Share } from "react-native";
import { supabase } from "../lib/supabase";

/**
 * Helpers sécurité : éviter les tokens "blockchain" (JWT / signed URLs)
 */
function looksLikeJwtOrSignedToken(t) {
  const s = String(t || "");

  // JWT souvent = 3 segments séparés par des points
  if (s.split(".").length >= 3) return true;

  // marqueurs fréquents de liens signés / tokens techniques
  if (/token=|access_token=|refresh_token=|signature=|expires=|x-amz-/i.test(s)) return true;

  return false;
}

function isReasonableInviteToken(t) {
  const s = String(t || "").trim();
  if (!s) return false;

  // Un code d’invite ne doit jamais être énorme
  if (s.length > 80) return false;

  // Refuse JWT / tokens signés / tokens techniques
  if (looksLikeJwtOrSignedToken(s)) return false;

  // Autorise uniquement un set safe (slug/base64url)
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return false;

  return true;
}

function safeDecode(v) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/**
 * Extrait un token depuis une URL d'invitation.
 * Supporte :
 *  - https://.../invite/<TOKEN>   (préféré)
 *  - https://...?token=<TOKEN>   (uniquement si token "raisonnable")
 */
function extractTokenFromInviteUrl(url) {
  const s = String(url || "").trim();
  if (!s) return null;

  // ✅ cas fiable : path /invite/<TOKEN>
  const m2 = s.match(/\/invite\/([^/?#]+)/i);
  if (m2?.[1]) {
    const tok = safeDecode(m2[1]);
    return isReasonableInviteToken(tok) ? tok : null;
  }

  // ⚠️ query token : accepté uniquement si token court/clean
  const m1 = s.match(/[?&]token=([^&]+)/i);
  if (m1?.[1]) {
    const tok = safeDecode(m1[1]);
    return isReasonableInviteToken(tok) ? tok : null;
  }

  return null;
}

/**
 * Génère un lien d'invite "propre" à partir d'un code OU d'une URL,
 * en garantissant un format stable :
 *  - PROD : https://cercle.app/invite/<TOKEN>
 */
function getInviteLinkForEnv(codeOrUrl) {
  const raw = String(codeOrUrl || "").trim();
  if (!raw) return null;

  // Si on a déjà un URL, on tente d'extraire le token
  let token = raw;

  try {
    if (raw.includes("/invite/")) {
      token = raw.split("/invite/")[1]?.split(/[?#]/)[0]?.trim() || raw;
    } else if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      const seg = (u.pathname || "").split("/").filter(Boolean);
      token = (seg[seg.length - 1] || "").trim();
    }
  } catch {
    token = raw;
  }

  token = safeDecode(token);

  // token invalide (trop long, jwt, etc.)
  if (!isReasonableInviteToken(token)) return null;

  // Prod : lien web stable
  return `https://cercle.app/invite/${encodeURIComponent(token)}`;
}

/**
 * Invite UNE personne à rejoindre un cercle via la RPC create_invite.
 * Le serveur peut renvoyer :
 *  - un code (token) court
 *  - OU une URL
 *
 * IMPORTANT :
 *  - Ton App.js mappe: Invite: 'invite/:token'
 *  - Donc le deep link doit être: cercle://invite/<TOKEN>
 */
export async function inviteContactToCircle({ circleId, name, phone }) {
  if (!circleId) throw new Error("circleId requis");

  // RPC: peut retourner une URL universelle OU un code.
  const { data: raw, error } = await supabase.rpc("create_invite", {
    p_circle_id: circleId,
    p_phone: phone ?? null,
    p_name: name ?? null,
  });

  if (error) throw error;
  if (!raw) throw new Error("Invitation non générée");

  // Normalisation robuste
  const rawStr = String(raw).trim();

  // Essaye d'extraire un token court
  const token = extractTokenFromInviteUrl(rawStr) || (isReasonableInviteToken(rawStr) ? rawStr : null);

  // Si on ne trouve pas de token propre, on bloque plutôt que d'envoyer un pavé illisible
  if (!token) {
    const rawLooksBad =
      rawStr.length > 220 || /token=|access_token=|refresh_token=|signature=|jwt/i.test(rawStr);
    if (rawLooksBad) {
      throw new Error(
        "Lien d’invitation invalide (token signé trop long). Le serveur doit renvoyer un code court."
      );
    }
  }

  // Lien web propre (toujours)
  const url = token ? `https://cercle.app/invite/${encodeURIComponent(token)}` : rawStr;

  // Deep link seulement si token propre
  const deep = token ? `cercle://invite/${encodeURIComponent(token)}` : null;

  const message =
  `👋 ${name ? `${name}, ` : ""}rejoins mon cercle sur Cercle :\n${url}` +
  (token ? `\n\nCode : ${token}` : "") +
  `\n\nSi le lien ne s’ouvre pas : ouvre l’app → Cercle → “Rejoindre avec un code” et colle le code.` +
  (deep ? `\n\n📲 Si l’app est installée :\n${deep}` : "");

  // Partage natif + copie
  await Share.share({ message });
  await Clipboard.setStringAsync(message);

  return { url, token, deep };
}

/**
 * Invite PLUSIEURS contacts d’un coup.
 * contacts = [{ name, phone }, ...]
 * Retourne le tableau renvoyé par la RPC.
 *
 * ⚠️ Important : cette fonction ne construit pas le message SMS.
 * Elle sert juste à enregistrer/obtenir les invites côté backend.
 */
export async function inviteContactsBulk({ circleId, contacts }) {
  if (!circleId) throw new Error("circleId requis");
  if (!Array.isArray(contacts)) throw new Error("contacts[] attendu");

  const { data, error } = await supabase.rpc("add_contacts_to_circle", {
    p_circle_id: circleId,
    p_contacts: contacts, // [{name, phone}]
  });

  if (error) throw error;
  return data || [];
}

// Optionnel : export des helpers si tu veux les réutiliser ailleurs
export const inviteUtils = {
  extractTokenFromInviteUrl,
  getInviteLinkForEnv,
  isReasonableInviteToken,
};
