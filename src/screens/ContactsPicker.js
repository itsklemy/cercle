// src/screens/ContactsPicker.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  TextInput,
} from "react-native";
import * as Contacts from "expo-contacts";
import * as Linking from "expo-linking";
import { useRoute, useNavigation } from "@react-navigation/native";
import { colors } from "../theme/colors";
import { inviteContactsBulk } from "../utils/invite"; // ✅ on réutilise TON invite.js

export default function ContactsPicker() {
  const route = useRoute();
  const navigation = useNavigation();
  const circleId = route?.params?.circleId ? String(route.params.circleId) : null;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const normalizePhone = (s = "") =>
    String(s).replace(/[^\d+]/g, "").replace(/^00/, "+");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1) On check d’abord l’état actuel
      const perm = await Contacts.getPermissionsAsync();

      // 2) Si déjà OK -> on charge
      if (perm.status === "granted") {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
          pageSize: 2000,
        });
        setItems(data || []);
        return;
      }

      // 3) Si on peut redemander -> on demande
      if (perm.canAskAgain) {
        const req = await Contacts.requestPermissionsAsync();
        if (req.status === "granted") {
          const { data } = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
            pageSize: 2000,
          });
          setItems(data || []);
          return;
        }
      }

      // 4) Refus définitif -> réglages
      Alert.alert(
        "Accès aux contacts",
        "Tu as refusé l’accès aux contacts. Pour inviter depuis ton répertoire, active Contacts dans les Réglages iPhone.",
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Ouvrir Réglages",
            onPress: async () => {
              try {
                await Linking.openSettings();
              } catch {
                Alert.alert("Réglages", "Impossible d’ouvrir les réglages automatiquement.");
              }
            },
          },
        ]
      );

      setItems([]);
    } catch (e) {
      console.warn("[ContactsPicker] load error", e?.message || e);
      Alert.alert("Contacts", "Impossible de charger les contacts.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const mapped = useMemo(() => {
    // On transforme en lignes “contact + premier numéro”
    const list = (items || [])
      .map((c) => {
        const phoneRaw = c?.phoneNumbers?.[0]?.number || "";
        const phone = normalizePhone(phoneRaw);
        if (!phone) return null;
        return {
          id: String(c.id),
          name: c?.name || "Contact",
          phone,
        };
      })
      .filter(Boolean);

    const qq = q.trim().toLowerCase();
    if (!qq) return list;

    return list.filter((x) => {
      return (
        String(x.name || "").toLowerCase().includes(qq) ||
        String(x.phone || "").includes(qq)
      );
    });
  }, [items, q]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!circleId) return Alert.alert("Erreur", "ID du cercle manquant.");

    const picks = mapped.filter((i) => selected.has(i.id));
    if (!picks.length) return Alert.alert("Sélection", "Sélectionne au moins une personne.");

    setSaving(true);
    try {
      // ✅ on envoie EXACTEMENT le format attendu par ton invite.js: [{name, phone}]
      const contactsPayload = picks.map((p) => ({ name: p.name, phone: p.phone }));

      // RPC bulk (dans ton invite.js) => add_contacts_to_circle(p_circle_id, p_contacts)
      const res = await inviteContactsBulk({
        circleId,
        contacts: contactsPayload,
      });

      // res peut contenir des urls par contact selon ta RPC
      Alert.alert("Succès", "Invitations générées ✅");
      navigation.goBack();
    } catch (e) {
      console.warn("[ContactsPicker] save error", e?.message || e);
      Alert.alert("Erreur", e?.message || "Impossible d’ajouter/inviter ces contacts.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
      <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18, marginBottom: 10 }}>
        Ajouter des contacts
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: colors.stroke,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: "#151826",
          marginBottom: 10,
        }}
      >
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Rechercher un nom ou un numéro…"
          placeholderTextColor={colors.subtext}
          style={{ flex: 1, color: colors.text, fontWeight: "700" }}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
          <Text style={{ color: colors.subtext, marginTop: 8 }}>Chargement…</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={mapped}
            keyExtractor={(it) => it.id}
            renderItem={({ item }) => {
              const isSel = selected.has(item.id);
              return (
                <TouchableOpacity
                  onPress={() => toggle(item.id)}
                  style={{
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(255,255,255,0.06)",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  activeOpacity={0.9}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.text, fontWeight: "800" }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={{ color: colors.subtext }} numberOfLines={1}>
                      {item.phone}
                    </Text>
                  </View>
                  <Text style={{ color: isSel ? colors.mint : colors.subtext, fontWeight: "900", fontSize: 18 }}>
                    {isSel ? "✓" : "＋"}
                  </Text>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={{ paddingTop: 20 }}>
                <Text style={{ color: colors.subtext }}>
                  Aucun contact avec numéro trouvé (ou permission refusée).
                </Text>
              </View>
            }
          />

          <TouchableOpacity
            onPress={save}
            disabled={saving}
            style={{
              backgroundColor: colors.mint,
              paddingVertical: 14,
              borderRadius: 12,
              marginTop: 10,
              opacity: saving ? 0.7 : 1,
            }}
            activeOpacity={0.9}
          >
            {saving ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={{ color: colors.bg, textAlign: "center", fontWeight: "900" }}>
                Inviter / Ajouter au cercle
              </Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
