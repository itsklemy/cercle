// src/screens/MembersScreen.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  FlatList,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import * as Linking from "expo-linking";

import { colors } from "../theme/colors";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import { inviteContactToCircle } from "../utils/invite";

export default function MembersScreen({ route, navigation }) {
  const circleId = route?.params?.circleId ? String(route.params.circleId) : null;

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("members"); // members | add

  const [members, setMembers] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [q, setQ] = useState("");
  const [inviting, setInviting] = useState(null); // phone string

  const [meId, setMeId] = useState(null);

  // ---------- helpers ----------
  const normalizePhone = (s = "") =>
    String(s)
      .replace(/[^\d+]/g, "")
      .replace(/^00/, "+");

  const pickFirstPhone = (contact) => {
    const arr = contact?.phoneNumbers || [];
    const raw = arr?.[0]?.number || "";
    const phone = normalizePhone(raw);
    return phone || null;
  };

  // ---------- load current user + members ----------
  const loadMembers = useCallback(async () => {
    if (!circleId) {
      setLoading(false);
      Alert.alert("Membres", "circleId manquant.");
      navigation.goBack();
      return;
    }
    if (!hasSupabaseConfig()) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const user = u?.user;
      setMeId(user?.id || null);

      // 1) récupère les user_id dans circle_members
      const memRes = await supabase
        .from("circle_members")
        .select("user_id")
        .eq("circle_id", circleId);

      if (memRes.error) throw memRes.error;

      const ids = (memRes.data || []).map((x) => x.user_id).filter(Boolean);
      if (!ids.length) {
        setMembers([]);
        return;
      }

      // 2) récupère les profils
      const profRes = await supabase
        .from("profiles")
        .select("id, public_name")
        .in("id", ids);

      if (profRes.error) throw profRes.error;

      const map = new Map((profRes.data || []).map((p) => [String(p.id), p]));
      const list = ids
        .map((id) => map.get(String(id)) || { id, public_name: "Membre" })
        .sort((a, b) => String(a.public_name || "").localeCompare(String(b.public_name || "")));

      setMembers(list);
    } catch (e) {
      console.log("[MembersScreen] loadMembers error:", e?.message || e);
      Alert.alert("Membres", e?.message || "Impossible de charger les membres.");
    } finally {
      setLoading(false);
    }
  }, [circleId, navigation]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // ---------- contacts permission + load ----------
  const openContactsOrSettings = useCallback(async () => {
    setContactsLoading(true);
    try {
      const perm = await Contacts.getPermissionsAsync();

      // Déjà accordé
      if (perm.status === "granted") {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
          sort: Contacts.SortTypes.FirstName,
          pageSize: 2000,
        });
        setContacts(data || []);
        setTab("add");
        return;
      }

      // On peut encore demander
      if (perm.canAskAgain) {
        const req = await Contacts.requestPermissionsAsync();
        if (req.status === "granted") {
          const { data } = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
            sort: Contacts.SortTypes.FirstName,
            pageSize: 2000,
          });
          setContacts(data || []);
          setTab("add");
          return;
        }
      }

      // Refus définitif -> réglages
      Alert.alert(
        "Accès aux contacts",
        "Tu as refusé l'accès aux contacts. Active Contacts dans Réglages pour ajouter un membre.",
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
    } catch (e) {
      console.log("[MembersScreen] contacts error:", e?.message || e);
      Alert.alert("Contacts", "Impossible d’accéder aux contacts.");
    } finally {
      setContactsLoading(false);
    }
  }, []);

  // ---------- invite ----------
  const inviteOne = useCallback(
    async (contact) => {
      if (!circleId) return;

      const phone = pickFirstPhone(contact);
      const name = contact?.name || contact?.firstName || "toi";

      if (!phone) {
        Alert.alert("Invitation", "Ce contact n’a pas de numéro de téléphone.");
        return;
      }

      setInviting(phone);
      try {
        await inviteContactToCircle({
          circleId,
          name,
          phone,
        });

        Alert.alert("Invitation envoyée", `Invitation envoyée à ${name}.`);
      } catch (e) {
        console.log("[MembersScreen] invite error:", e?.message || e);
        Alert.alert("Invitation", e?.message || "Impossible d’envoyer l’invitation.");
      } finally {
        setInviting(null);
      }
    },
    [circleId]
  );

  const filteredContacts = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return contacts;

    return (contacts || []).filter((c) => {
      const name = String(c?.name || "").toLowerCase();
      const p = normalizePhone(c?.phoneNumbers?.[0]?.number || "");
      return name.includes(qq) || p.includes(qq);
    });
  }, [contacts, q]);

  // ---------- UI ----------
  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.mint} />
          <Text style={styles.sub}>Chargement…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.9}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.h1}>Membres</Text>
          <Text style={styles.sub} numberOfLines={1}>
            Cercle : {circleId ? circleId.slice(0, 8) + "…" : "—"}
          </Text>
        </View>

        <TouchableOpacity
          onPress={openContactsOrSettings}
          style={[styles.addBtn, contactsLoading && { opacity: 0.7 }]}
          activeOpacity={0.9}
          disabled={contactsLoading}
        >
          {contactsLoading ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <>
              <MaterialCommunityIcons name="account-plus-outline" size={18} color={colors.bg} />
              <Text style={styles.addTxt}>Ajouter</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Tabs */}
     <View style={styles.tabs}>
  <TouchableOpacity
    onPress={() => setTab("members")}
    style={[styles.tab, tab === "members" && styles.tabActive]}
    activeOpacity={0.9}
  >
    <Text style={[styles.tabTxt, tab === "members" && styles.tabTxtActive]}>Membres</Text>
  </TouchableOpacity>

  <TouchableOpacity
    onPress={() => setTab("add")}
    style={[styles.tab, tab === "add" && styles.tabActive]}
    activeOpacity={0.9}
  >
    <Text style={[styles.tabTxt, tab === "add" && styles.tabTxtActive]}>Contacts</Text>
  </TouchableOpacity>

  <TouchableOpacity
    onPress={() => setTab("code")}
    style={[styles.tab, tab === "code" && styles.tabActive]}
    activeOpacity={0.9}
  >
    <Text style={[styles.tabTxt, tab === "code" && styles.tabTxtActive]}>Code</Text>
  </TouchableOpacity>
</View>

      {/* Members list */}
      {tab === "members" ? (
        <FlatList
          data={members}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          renderItem={({ item }) => {
            const mine = meId && String(item.id) === String(meId);
            return (
              <View style={styles.cardRow}>
                <MaterialCommunityIcons name="account-circle-outline" size={26} color={colors.mint} />
                <View style={{ marginLeft: 10, flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.public_name || "Membre"}
                    {mine ? " (moi)" : ""}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {String(item.id).slice(0, 8)}…
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.sub}>Aucun membre.</Text>
            </View>
          }
        />
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.searchWrap}>
            <MaterialCommunityIcons name="magnify" size={18} color={colors.subtext} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Rechercher un contact ou un numéro…"
              placeholderTextColor={colors.subtext}
              style={styles.search}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          <FlatList
            data={filteredContacts}
            keyExtractor={(c) => String(c.id)}
            contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
            renderItem={({ item }) => {
              const phone = pickFirstPhone(item);
              return (
                <TouchableOpacity
                  onPress={() => inviteOne(item)}
                  style={styles.contactRow}
                  activeOpacity={0.9}
                  disabled={!phone || inviting === phone}
                >
                  <MaterialCommunityIcons name="account-outline" size={22} color={colors.text} />
                  <View style={{ marginLeft: 10, flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name || "Sans nom"}
                    </Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {phone ? phone : "Pas de numéro"}
                    </Text>
                  </View>

                  <View style={styles.invitePill}>
                    {inviting === phone ? (
                      <ActivityIndicator color={colors.bg} />
                    ) : (
                      <Text style={styles.invitePillTxt}>Inviter</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.sub}>
                  {contacts?.length
                    ? "Aucun résultat."
                    : "Clique sur “Ajouter” en haut pour charger tes contacts."}
                </Text>
              </View>
            }
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  h1: { color: colors.text, fontWeight: "900", fontSize: 18 },
  sub: { color: colors.subtext, fontWeight: "700", marginTop: 2 },

  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.mint,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
  addTxt: { color: colors.bg, fontWeight: "900" },

  tabs: {
    flexDirection: "row",
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  tabActive: { backgroundColor: "rgba(29,255,194,0.12)", borderColor: "rgba(29,255,194,0.30)" },
  tabTxt: { color: colors.subtext, fontWeight: "900" },
  tabTxtActive: { color: colors.mint },

  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: 10,
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  search: { flex: 1, color: colors.text, fontWeight: "700" },

  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: 10,
    gap: 8,
  },
  name: { color: colors.text, fontWeight: "900" },

  invitePill: {
    backgroundColor: colors.mint,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  invitePillTxt: { color: colors.bg, fontWeight: "900" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
});
