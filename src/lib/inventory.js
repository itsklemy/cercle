// src/lib/inventory.js
import { supabase } from "../lib/supabase";

export const STARTER_ITEMS = [
  "Pompe à vélo",
  "Boîte à outils",
  "Échelle",
  "Perceuse",
  "Tondeuse",
  "Débroussailleuse",
  "Shampouineuse / injecteur-extracteur",
  "Nettoyeur vapeur",
  "Aspirateur puissant",
  "Matelas d’appoint",
  "Lit parapluie",
  "Glacière",
  "Appareil à raclette",
  "Enceinte / sono",
  "Projecteur",
  "Valise",
  "Tente",
  "Chaise pliante (x2)",
  "Diable / chariot",
  "Câbles / adaptateurs",
];

// ---------- Normalisation ----------
const stripDiacritics = (s) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const singularizeSimpleFr = (s) => {
  // ultra simple: "cables"->"cable", "valises"->"valise"
  // ne touche pas aux mots très courts
  if (!s || s.length < 4) return s;
  if (s.endsWith("aux")) return s; // ignore (chevaux etc.)
  if (s.endsWith("s")) return s.slice(0, -1);
  return s;
};

export const normalizeItem = (raw) => {
  let s = String(raw || "").trim().toLowerCase();
  s = stripDiacritics(s);
  s = s.replace(/['’]/g, " ");
  s = s.replace(/[^a-z0-9\/\s-]/g, " "); // garde / pour "sono"
  s = s.replace(/\s+/g, " ").trim();
  s = singularizeSimpleFr(s);
  return s;
};

export const normalizeItemsList = (arr) => {
  const uniq = [];
  const seen = new Set();
  for (const it of arr || []) {
    const n = normalizeItem(it);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    uniq.push(n);
  }
  return uniq;
};

// ---------- UI labels ----------
export const labelFromNormalized = (n) => {
  // On préfère afficher les labels starter si match “normalisé”
  for (const label of STARTER_ITEMS) {
    if (normalizeItem(label) === n) return label;
  }
  // fallback: capitalise simple
  return (n || "").replace(/^\w/, (c) => c.toUpperCase());
};

// ---------- Supabase API ----------
export async function getMyInventory() {
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) return { items: [], updated_at: null };

  const { data, error } = await supabase
    .from("user_inventory")
    .select("items,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || { items: [], updated_at: null };
}

export async function saveMyInventoryItems(normalizedItems, { circleIds = [] } = {}) {
  const items = normalizeItemsList(normalizedItems).slice(0, 8);

  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  // fetch old items
  const prev = await getMyInventory();
  const oldItems = prev?.items || [];

  // upsert user_inventory
  const { error: upErr } = await supabase
    .from("user_inventory")
    .upsert({ user_id: userId, items, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

  if (upErr) throw upErr;

  // apply diff to circles (RPC)
  for (const circleId of circleIds) {
    await supabase.rpc("apply_inventory_diff", {
      p_circle_id: circleId,
      p_user_id: userId,
      p_old_items: oldItems,
      p_new_items: items,
    });
  }

  return { items };
}

export async function getCircleInventoryAggregate(circleId) {
  const { data, error } = await supabase
    .from("circle_inventory")
    .select("inventory_counts, inventory_providers, updated_at")
    .eq("circle_id", circleId)
    .maybeSingle();

  if (error) throw error;
  return data || { inventory_counts: {}, inventory_providers: {}, updated_at: null };
}
