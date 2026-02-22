// src/components/CircleInventorySection.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { getCircleInventoryAggregate, labelFromNormalized } from "../lib/inventory";
import { supabase } from "../lib/supabase";

export default function CircleInventorySection({ circleId }) {
  const [agg, setAgg] = useState({ inventory_counts: {}, inventory_providers: {} });
  const [busy, setBusy] = useState(false);

  const [openItemKey, setOpenItemKey] = useState(null);
  const [providersNames, setProvidersNames] = useState([]);

  const countsList = useMemo(() => {
    const m = agg?.inventory_counts || {};
    const entries = Object.entries(m).map(([k, v]) => ({ key: k, count: Number(v || 0) }));
    entries.sort((a, b) => b.count - a.count);
    return entries;
  }, [agg]);

  const providersByItem = agg?.inventory_providers || {};

  const whoProposesLines = useMemo(() => {
    // "Hugo : pompe à vélo, boîte à outils, échelle"
    // Pour limiter les lectures, on fait une requête noms uniquement si tu as un RPC de noms visibles.
    // Ici fallback: on affiche userId abrégé si pas de mapping.
    return null;
  }, [agg]);

  const load = async () => {
    setBusy(true);
    try {
      const data = await getCircleInventoryAggregate(circleId);
      setAgg(data || { inventory_counts: {}, inventory_providers: {} });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!circleId) return;
    load();
  }, [circleId]);

  const openWho = async (itemKey) => {
    setOpenItemKey(itemKey);
    const ids = (providersByItem?.[itemKey] || providersByItem?.[itemKey]?.map?.(() => null)) || [];

    // providersByItem vient du jsonb => souvent { item: ["uuid","uuid"] }
    const list = Array.isArray(providersByItem?.[itemKey]) ? providersByItem[itemKey] : [];

    // Essayez de récupérer des noms "visibles" si tu as déjà un RPC (vu dans Dashboard: visible_member_names)
    try {
      const rpcRes = await supabase.rpc("visible_member_names");
      const visible = rpcRes?.data;
      const map = {};
      if (Array.isArray(visible)) for (const u of visible) map[u.id] = u.name || "—";
      const names = list.map((id) => map[id] || `${String(id).slice(0, 6)}…`);
      setProvidersNames(names);
    } catch {
      setProvidersNames(list.map((id) => `${String(id).slice(0, 6)}…`));
    }
  };

  const empty = countsList.length === 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Dans ce cercle, on a déjà</Text>
        <TouchableOpacity onPress={load} activeOpacity={0.9} style={styles.refreshBtn}>
          <MaterialCommunityIcons name="refresh" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      {empty ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTxt}>Aucun objet renseigné pour l’instant. Ajoute 3 items pour démarrer.</Text>
        </View>
      ) : (
        <View style={styles.card}>
          {countsList.slice(0, 30).map((it) => (
            <TouchableOpacity key={it.key} style={styles.row} onPress={() => openWho(it.key)} activeOpacity={0.9}>
              <Text style={styles.rowTxt}>{labelFromNormalized(it.key)}</Text>
              <Text style={styles.rowCount}>{it.count}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Modal "Qui le propose" */}
      <Modal visible={!!openItemKey} transparent animationType="fade" onRequestClose={() => setOpenItemKey(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Qui le propose</Text>
              <TouchableOpacity onPress={() => setOpenItemKey(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub} numberOfLines={2}>
              {openItemKey ? labelFromNormalized(openItemKey) : ""}
            </Text>

            <ScrollView style={{ maxHeight: 360 }}>
              {(providersNames || []).length === 0 ? (
                <Text style={styles.emptyTxt}>Personne pour l’instant.</Text>
              ) : (
                providersNames.map((n, idx) => (
                  <View key={`${n}-${idx}`} style={styles.nameRow}>
                    <MaterialCommunityIcons name="account-circle-outline" size={18} color={colors.mint} />
                    <Text style={styles.nameTxt}>{n}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  title: { color: colors.text, fontWeight: "900", fontSize: 16 },
  refreshBtn: { padding: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.stroke, backgroundColor: "rgba(255,255,255,0.04)" },

  emptyCard: { borderWidth: 1, borderColor: colors.stroke, borderRadius: 16, padding: 12, backgroundColor: "rgba(255,255,255,0.03)" },
  emptyTxt: { color: colors.subtext, fontWeight: "700" },

  card: { borderWidth: 1, borderColor: colors.stroke, borderRadius: 16, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.03)" },
  row: { padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  rowTxt: { color: colors.text, fontWeight: "800", flex: 1, paddingRight: 10 },
  rowCount: { color: colors.mint, fontWeight: "900" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 520, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.bg, padding: 14 },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  modalSub: { color: colors.subtext, marginTop: 6, marginBottom: 10, fontWeight: "700" },

  nameRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  nameTxt: { color: colors.text, fontWeight: "800" },
});
