import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { colors as themeColors } from "../theme/colors";

const C0 = themeColors || {};
const colors = {
  bg: C0.bg ?? "#0B0E14",
  card: C0.card ?? "rgba(255,255,255,0.04)",
  text: C0.text ?? "#F3F4F6",
  subtext: C0.subtext ?? "#9AA3B2",
  stroke: C0.stroke ?? "rgba(255,255,255,0.08)",
  mint: C0.mint ?? "#1DFFC2",
};

const normalizeTitleKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[’']/g, "'");

const titlePretty = (s) => {
  const t = String(s || "").trim();
  if (!t) return "Objet";
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export default function CategoryItemsScreen() {
  const route = useRoute();
  const navigation = useNavigation();

  const circleId = route?.params?.circleId || null;
  const category = route?.params?.category || "all";

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    if (!circleId) return;
    setLoading(true);
    try {
      let q = supabase
        .from("items")
        .select("id, title, owner_id, circle_id, category, photo, created_at")
        .eq("circle_id", circleId)
        .order("created_at", { ascending: false });

      if (category && category !== "all") q = q.eq("category", category);

      const { data, error } = await q;
      if (error) throw error;
      setItems(data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [circleId, category]);

  useEffect(() => {
    load();
  }, [load]);

  // ✅ Regroupement par “type d’objet” (titre normalisé)
  const grouped = useMemo(() => {
    const map = new Map(); // titleKey -> { title, count, lastAt }
    for (const it of items || []) {
      const key = normalizeTitleKey(it.title);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, { title: titlePretty(it.title), titleKey: key, count: 0, lastAt: it.created_at || null });
      }
      const g = map.get(key);
      g.count += 1;
      if (it.created_at && (!g.lastAt || new Date(it.created_at) > new Date(g.lastAt))) g.lastAt = it.created_at;
    }
    return Array.from(map.values()).sort((a, b) => (b.count - a.count) || (a.title.localeCompare(b.title, "fr")));
  }, [items]);

  const renderRow = ({ item }) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.88}
      onPress={() =>
        // ✅ On passe en “mode agrégé” vers ItemDetail
        // (si ton ItemDetail n’accepte que itemId, dis-le-moi et je te donne le patch ItemDetail exact)
        navigation.navigate("ItemDetail", {
          circleId,
          titleKey: item.titleKey,
          title: item.title,
          category,
        })
      }
    >
      <View style={styles.iconBox}>
        <MaterialCommunityIcons name="cube-outline" size={20} color={colors.text} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.count} dispo
        </Text>
      </View>

      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.subtext} />
    </TouchableOpacity>
  );

  if (!circleId) {
    return (
      <View style={[styles.screen, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.subtext }}>Cercle introuvable.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {loading ? (
        <View style={{ paddingTop: 24, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ color: colors.subtext, marginTop: 10 }}>Chargement…</Text>
        </View>
      ) : grouped.length === 0 ? (
        <View style={{ paddingTop: 24, alignItems: "center" }}>
          <Text style={{ color: colors.subtext }}>Aucun objet dans cette catégorie.</Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={(x) => `g-${x.titleKey}`}
          renderItem={renderRow}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.stroke,
    marginBottom: 10,
    minHeight: 62,
    backgroundColor: colors.card,
    gap: 10,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.stroke,
  },
  title: { color: colors.text, fontWeight: "900" },
  meta: { color: colors.subtext, marginTop: 2, fontWeight: "700" },
});
