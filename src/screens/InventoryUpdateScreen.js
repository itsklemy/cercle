import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

/**
 * ✅ Mets ici ton vert officiel (ou importe-le depuis ton theme)
 */
const OFFICIAL_GREEN = "#1DFFC2";

const colors = {
  bg: "#0B0E14",
  card: "rgba(255,255,255,0.05)",
  card2: "rgba(255,255,255,0.08)",
  text: "#F3F4F6",
  subtext: "#9AA3B2",
  stroke: "rgba(255,255,255,0.10)",
  brand: OFFICIAL_GREEN,
  danger: "#F87171",
  warn: "#F59E0B",
};

const normalizeKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ");

const titlePretty = (s) => {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
};

async function getUserOrAlert() {
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;
  if (error || !user) {
    Alert.alert("Auth", "Connecte-toi d’abord.");
    return null;
  }
  return user;
}

const parseMoney = (s) => {
  const n = Number(String(s || "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * ✅ Catégories + dots toutes différentes
 */
const CATEGORIES = [
  { key: "maison", label: "Maison", dot: "#A3A3A3", icon: "home-outline" },
  { key: "cuisine", label: "Cuisine", dot: "#F59E0B", icon: "silverware-fork-knife" },
  { key: "bricolage", label: "Bricolage", dot: "#FB7185", icon: "tools" },
  { key: "travaux", label: "Travaux", dot: "#F97316", icon: "excavator" },
  { key: "jardin", label: "Jardin", dot: "#34D399", icon: "sprout" },
  { key: "outdoor", label: "Outdoor", dot: "#22C55E", icon: "pine-tree" },
  { key: "sport", label: "Sport", dot: "#60A5FA", icon: "dumbbell" },
  { key: "media", label: "Média & TV", dot: "#A78BFA", icon: "television" },
  { key: "transport", label: "Transport", dot: "#38BDF8", icon: "car-multiple" },
  { key: "enfants", label: "Enfants", dot: "#F472B6", icon: "baby-face-outline" },
  { key: "animaux", label: "Animaux", dot: "#F87171", icon: "paw-outline" },
  { key: "services", label: "Services", dot: "#22D3EE", icon: "account-heart-outline" },
  { key: "informatique", label: "Informatique", dot: "#EAB308", icon: "laptop" },
  { key: "autre", label: "Autre", dot: "#94A3B8", icon: "dots-horizontal" },
];

const PRESETS = {
  maison: [
    "Escabeau",
    "Echelle",
    "Aspirateur",
    "Balai vapeur",
    "Nettoyeur vapeur",
    "Shampouineuse",
    "Nettoyeur de vitres",
    "Fer a repasser",
    "Centrale vapeur",
    "Table a repasser",
    "Defroisseur vapeur",
    "Rallonge electrique",
    "Multiprise",
    "Lampe torche",
    "Batterie externe",
    "Ventilateur",
    "Chauffage d appoint",
    "Radiateur bain d huile",
    "Climatiseur mobile",
    "Purificateur d air",
    "Deshumidificateur",
    "Humidificateur",
    "Etendoir a linge",
    "Seau et serpilliere",
    "Trousse de premiers secours",
    "Machine a coudre",
    "Boite a couture",
    "Pistolet a colle",
  ],

  cuisine: [
    "Appareil a raclette",
    "Appareil a fondue",
    "Plancha",
    "Crepiere",
    "Gaufrier",
    "Croque monsieur",
    "Barbecue electrique",
    "Robot de cuisine",
    "Robot patissier",
    "Mixeur",
    "Blender",
    "Pied mixeur",
    "Machine a cafe",
    "Bouilloire",
    "Grille pain",
    "Friteuse",
    "Airfryer",
    "Autocuiseur",
    "Cuiseur vapeur",
    "Cuiseur a riz",
    "Mijoteuse",
    "Machine a pain",
    "Machine a pates",
    "Sorbetiere",
    "Machine a glacons",
    "Balance de cuisine",
    "Thermometre de cuisson",
    "Mandoline",
    "Machine sous vide",
    "Moules a gateaux",
    "Grand plat a gratin",
    "Glaciere electrique",
  ],

  bricolage: [
    "Perceuse",
    "Visseuse",
    "Perforateur",
    "Ponceuse",
    "Scie sauteuse",
    "Meuleuse",
    "Dremel",
    "Aspirateur de chantier",
    "Boite a outils",
    "Tournevis",
    "Marteau",
    "Cle a molette",
    "Jeu de cles Allen",
    "Set de douilles",
    "Pince multiprise",
    "Pince coupante",
    "Pince a denuder",
    "Cutter",
    "Mètre ruban",
    "Niveau",
    "Equerre",
    "Serre joints",
    "Pistolet a silicone",
    "Agrafeuse murale",
    "Decapeur thermique",
  ],

  travaux: [
    "Betonniere",
    "Marteau piqueur",
    "Burineur",
    "Perforateur SDS",
    "Scie circulaire",
    "Scie a onglet",
    "Scie sur table",
    "Ponceuse girafe",
    "Niveau laser",
    "Compresseur",
    "Poste a souder",
    "Echafaudage",
    "Echelle coulissante",
    "Tretaux",
    "Table de chantier",
    "Diable",
    "Chariot de manutention",
    "Sangles d arrimage",
  ],

  jardin: [
    "Tondeuse",
    "Coupe bordures",
    "Debroussailleuse",
    "Taille haie",
    "Tronconneuse",
    "Souffleur",
    "Scarificateur",
    "Motobineuse",
    "Pulverisateur",
    "Tuyau d arrosage",
    "Enrouleur de tuyau",
    "Arroseur",
    "Programmateur d arrosage",
    "Sécateur",
    "Cisaille",
    "Ebrancheur",
    "Bêche",
    "Pelle",
    "Rateau",
    "Brouette",
    "Karcher",
  ],

  outdoor: [
    "Tente",
    "Sac de couchage",
    "Matelas gonflable",
    "Lampe camping",
    "Lampe frontale",
    "Rechaud",
    "Popote",
    "Glaciere",
    "Table pliante",
    "Chaise pliante",
    "Hamac",
    "Sac a dos rando",
    "Batons de marche",
    "Gourde",
    "Jerrican d eau",
    "Masque et tuba",
    "Serviette de plage",
    "Parasol",
    "Jeu de petanque",
    "Molkky",
  ],

  sport: [
    "Velo",
    "Casque velo",
    "Antivol velo",
    "Trottinette",
    "Roller",
    "Skateboard",
    "Longboard",
    "Raquettes de tennis",
    "Raquettes de badminton",
    "Balles de tennis",
    "Volants badminton",
    "Tapis de yoga",
    "Elastiques de musculation",
    "Halteres",
    "Kettlebell",
    "Corde a sauter",
    "Rouleau de massage",
    "Gants de boxe",
    "Paddle gonflable",
    "Pompe paddle",
    "Planche de surf",
    "Combinaison neoprene",
    "Palmes",
    "Raquettes a neige",
    "Skis",
    "Snowboard",
    "Masque de ski",
    "Casque ski",
  ],

  media: [
    "Chromecast",
    "Apple TV",
    "Projecteur",
    "Ecran de projection",
    "Barre de son",
    "Enceinte Bluetooth",
    "Micro",
    "Casque audio",
    "Casque gaming",
    "Manette",
    "GoPro",
    "Treppied",
    "Ring light",
  ],

  transport: [
    "Remorque",
    "Porte velos",
    "Barres de toit",
    "Coffre de toit",
    "Porte skis",
    "Chaines neige",
    "Chaussettes neige",
    "Cables de demarrage",
    "Booster de demarrage",
    "Compresseur portable",
    "Pompe a velo",
    "Sangles d arrimage",
    "Filet de coffre",
  ],

  transport_auto_moto: [
    "Moto",
    "Scooter",
    "Sidecar",
    "Casque moto",
    "Gants moto",
    "Veste moto",
    "Bloque disque",
    "Antivol U moto",
    "Support telephone moto",
    "Chargeur batterie voiture",
    "Cables de demarrage",
    "Booster de demarrage",
    "Compresseur portable",
    "Crick",
    "Chandelles",
    "Cles de roue",
    "Coffre de toit",
    "Barres de toit",
    "Porte velos",
    "Porte skis",
    "Remorque",
    "Sangles d arrimage",
  ],

  enfants: [
    "Poussette",
    "Poussette canne",
    "Porte bebe",
    "Echarpe de portage",
    "Lit parapluie",
    "Chaise haute",
    "Rehausseur de chaise",
    "Siege auto",
    "Rehausseur auto",
    "Transat",
    "Tapis d eveil",
    "Parc",
    "Baignoire bebe",
    "Babyphone",
    "Veilleuse",
    "Draisienne",
    "Trottinette enfant",
  ],

  animaux: [
    "Cage de transport",
    "Sac de transport",
    "Laisse",
    "Harnais",
    "Collier",
    "Museliere",
    "Brosse",
    "Panier",
    "Gamelles",
    "Fontaine a eau",
    "Ceinture de securite chien",
    "Barriere",
  ],

  services: [
    "Aide demenagement",
    "Coup de main montage meubles",
    "Coup de main peinture",
    "Arrosage plantes",
    "Garde d animaux",
    "Covoiturage",
    "Garde d enfants",
    "Service courses",
  ],

  informatique: [
    "Ecran",
    "Webcam",
    "Micro USB",
    "Clavier",
    "Souris",
    "Casque",
    "Chargeur USB C",
    "Chargeur ordinateur",
    "Hub USB C",
    "Adaptateur USB C HDMI",
    "Cable Ethernet",
    "Repeteur Wi Fi",
    "Disque dur externe",
    "SSD externe",
    "Cle USB",
    "Lecteur carte SD",
  ],

  autre: [],
};


export default function InventoryUpdateScreen({ navigation, route }) {
  // ✅ on garde le param si tu veux présélectionner un cercle
  const activeCircleIdParam = route?.params?.activeCircleId || route?.params?.circleId || null;

  // ✅ existingItems peut venir en param (optionnel)
  const existingItems = route?.params?.existingItems || [];

  // ✅ FIX: on ne dépend plus de route.params.circles => on fetch depuis Supabase
  const [circles, setCircles] = useState([]);
  const [loadingCircles, setLoadingCircles] = useState(true);

  const [category, setCategory] = useState("maison");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // destination circles
  const [selectedCircleIds, setSelectedCircleIds] = useState(new Set());

  // selected items
  const [sel, setSel] = useState(new Set());

  // custom
  const [customTitle, setCustomTitle] = useState("");

  // pricing
  const [isFree, setIsFree] = useState(true);
  const [priceAmount, setPriceAmount] = useState("");
  const [priceNote, setPriceNote] = useState("");

  // ✅ charge les cercles créés (et gère les cas RLS/owner_id)
  useEffect(() => {
    (async () => {
      const user = await getUserOrAlert();
      if (!user) return;

      setLoadingCircles(true);

      // 1) tente avec owner_id (cas le plus courant)
      let { data, error } = await supabase
        .from("circles")
        .select("id, name")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      // 2) si ça plante (colonne owner_id absente), on retente sans filtre
      if (error && /column .* (does not exist|unknown)/i.test(error.message || "")) {
        const r2 = await supabase.from("circles").select("id, name").order("created_at", { ascending: false });
        data = r2.data;
        error = r2.error;
      }

      if (error) {
        Alert.alert("Cercles", error.message || "Impossible de charger tes cercles.");
        setCircles([]);
      } else {
        setCircles(data || []);
      }

      setLoadingCircles(false);
    })();
  }, []);

  // init circle selection (après chargement circles)
  useEffect(() => {
    if (!circles?.length) return;
    if (selectedCircleIds.size > 0) return;

    const first = String(activeCircleIdParam || circles?.[0]?.id || "");
    if (first) setSelectedCircleIds(new Set([first]));
  }, [circles, activeCircleIdParam, selectedCircleIds.size]);

  const existingKeysByCircle = useMemo(() => {
    const map = new Map();
    (existingItems || []).forEach((it) => {
      const cId = String(it.circle_id || it.circleId || "");
      const t = it.title;
      if (!cId || !t) return;
      if (!map.has(cId)) map.set(cId, new Set());
      map.get(cId).add(normalizeKey(t));
    });
    return map;
  }, [existingItems]);

  const toggleCircle = useCallback((id) => {
    const sid = String(id);
    setSelectedCircleIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }, []);

  const toggleItem = useCallback((title) => {
    const k = normalizeKey(title);
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const countSelectedItems = sel.size + (customTitle.trim() ? 1 : 0);
  const countSelectedCircles = selectedCircleIds.size;
  const canSubmit = countSelectedItems > 0 && countSelectedCircles > 0 && !saving;

  const buildDescription = () => {
    if (isFree) return "";
    const amount = parseMoney(priceAmount);
    const note = String(priceNote || "").trim();
    if (!amount && !note) return "";
    if (amount && note) return `Participation: ${amount}€ ${note}`;
    if (amount) return `Participation: ${amount}€`;
    return `Participation: ${note}`;
  };

  /**
   * ✅ Recherche “smart”
   * - Si query vide : liste de la catégorie
   * - Si query non vide : on cherche dans la catégorie + on propose aussi dans les autres catégories
   */
  const localList = useMemo(() => PRESETS[category] || [], [category]);

  const localResults = useMemo(() => {
    const q = normalizeKey(query);
    if (!q) return localList;
    return localList.filter((t) => normalizeKey(t).includes(q));
  }, [localList, query]);

  const globalSuggestions = useMemo(() => {
    const q = normalizeKey(query);
    if (!q) return [];
    const out = [];
    for (const cat of CATEGORIES) {
      const arr = PRESETS[cat.key] || [];
      for (const t of arr) {
        if (normalizeKey(t).includes(q)) {
          if (cat.key === category) continue;
          out.push({ categoryKey: cat.key, categoryLabel: cat.label, title: t });
        }
      }
    }
    return out.slice(0, 12);
  }, [query, category]);

  const clearAll = useCallback(() => {
    setSel(new Set());
    setCustomTitle("");
  }, []);

  const save = useCallback(async () => {
    if (!canSubmit) {
      if (countSelectedCircles === 0) Alert.alert("Destination", "Choisis au moins un cercle.");
      else if (countSelectedItems === 0) Alert.alert("Objets", "Choisis au moins un objet.");
      return;
    }

    const user = await getUserOrAlert();
    if (!user) return;

    setSaving(true);
    try {
      const desc = buildDescription();

      const titles = [];
      sel.forEach((k) => {
        const label = (PRESETS[category] || []).find((t) => normalizeKey(t) === k) || k;
        titles.push(titlePretty(label));
      });
      if (customTitle.trim()) titles.push(titlePretty(customTitle.trim()));

      const cleaned = titles.map((t) => String(t || "").trim()).filter(Boolean);

      const payload = [];
      const circlesArr = Array.from(selectedCircleIds);

      for (const circleId of circlesArr) {
        const existingSet = existingKeysByCircle.get(String(circleId)) || new Set();
        const seen = new Set();

        for (const t of cleaned) {
          const k = normalizeKey(t);
          if (seen.has(k)) continue;
          seen.add(k);
          if (existingSet.has(k)) continue;

          payload.push({
            owner_id: user.id,
            circle_id: circleId,
            title: t,
            description: desc,
            category: category || "autre",
            photo: null,
            is_free: !!isFree,
            price_amount: isFree ? 0 : parseMoney(priceAmount),
            price_note: isFree ? null : String(priceNote || "").trim() || null,
          });
        }
      }

      if (!payload.length) {
        Alert.alert("Inventaire", "Rien à ajouter (déjà présent dans les cercles choisis).");
        navigation.goBack();
        return;
      }

      let { error } = await supabase.from("items").insert(payload);

      if (error && /column .* (does not exist|unknown)/i.test(error.message || "")) {
        const legacy = payload.map((p) => ({
          owner_id: p.owner_id,
          circle_id: p.circle_id,
          title: p.title,
          description: p.description,
          category: p.category,
          photo: null,
        }));
        const r2 = await supabase.from("items").insert(legacy);
        error = r2.error;
      }

      if (error) throw error;

      Alert.alert("Inventaire", "Ajouté ✅");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Inventaire", e?.message || "Ajout impossible.");
    } finally {
      setSaving(false);
    }
  }, [
    canSubmit,
    countSelectedCircles,
    countSelectedItems,
    sel,
    customTitle,
    category,
    isFree,
    priceAmount,
    priceNote,
    selectedCircleIds,
    existingKeysByCircle,
    navigation,
  ]);

  const destinationLabel = useMemo(() => {
    if (loadingCircles) return "Chargement des cercles…";
    if (!circles?.length) return "Choisis au moins un cercle";
    if (countSelectedCircles === 0) return "Choisis tes cercles de destination";
    if (countSelectedCircles === 1) {
      const one = Array.from(selectedCircleIds)[0];
      const c = circles.find((x) => String(x.id) === String(one));
      return c?.name ? `Destination : ${c.name}` : "Destination : 1 cercle";
    }
    return `Destination : ${countSelectedCircles} cercles`;
  }, [circles, loadingCircles, countSelectedCircles, selectedCircleIds]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={S.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={S.iconBtn} activeOpacity={0.9}>
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.text} />
          </TouchableOpacity>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={S.hTitle} numberOfLines={1}>
              Mettre à jour
            </Text>
            <Text style={S.hSub} numberOfLines={1}>
              {destinationLabel}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
          {/* Destination */}
          <View style={S.card}>
            <Text style={S.cardTitle}>Cercles de destination</Text>

            {loadingCircles ? (
              <View style={S.infoBox}>
                <ActivityIndicator color={colors.subtext} />
                <Text style={S.infoTxt}>Chargement des cercles…</Text>
              </View>
            ) : !circles?.length ? (
              <View style={S.infoBox}>
                <MaterialCommunityIcons name="information-outline" size={18} color={colors.subtext} />
                <Text style={S.infoTxt}>Aucun cercle trouvé. Crée un cercle puis reviens.</Text>
              </View>
            ) : (
              <View style={S.wrapRow}>
                {circles.map((c) => {
                  const selected = selectedCircleIds.has(String(c.id));
                  return (
                    <TouchableOpacity
                      key={String(c.id)}
                      onPress={() => toggleCircle(c.id)}
                      style={[S.circleChip, selected && S.circleChipActive]}
                      activeOpacity={0.9}
                    >
                      <MaterialCommunityIcons
                        name={selected ? "check-circle" : "checkbox-blank-circle-outline"}
                        size={18}
                        color={selected ? colors.brand : colors.subtext}
                      />
                      <Text style={[S.circleChipTxt, selected && S.circleChipTxtActive]} numberOfLines={1}>
                        {c.name || "Cercle"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Tarif */}
          <View style={S.card}>
            <Text style={S.cardTitle}>Tarif</Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                onPress={() => setIsFree(true)}
                style={[S.pillBtn, isFree && S.pillBtnActive]}
                activeOpacity={0.9}
              >
                <MaterialCommunityIcons name="gift-outline" size={18} color={isFree ? colors.bg : colors.text} />
                <Text style={[S.pillBtnTxt, isFree && S.pillBtnTxtActive]}>Gratuit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setIsFree(false)}
                style={[S.pillBtn, !isFree && S.pillBtnActive]}
                activeOpacity={0.9}
              >
                <MaterialCommunityIcons name="cash-multiple" size={18} color={!isFree ? colors.bg : colors.text} />
                <Text style={[S.pillBtnTxt, !isFree && S.pillBtnTxtActive]}>Payant</Text>
              </TouchableOpacity>
            </View>

            {!isFree ? (
              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                <TextInput
                  value={priceAmount}
                  onChangeText={setPriceAmount}
                  placeholder="Montant (ex: 5)"
                  placeholderTextColor={colors.subtext}
                  keyboardType="decimal-pad"
                  style={[S.input, { flex: 1 }]}
                />
                <TextInput
                  value={priceNote}
                  onChangeText={setPriceNote}
                  placeholder="Note (ex: /jour)"
                  placeholderTextColor={colors.subtext}
                  style={[S.input, { flex: 1 }]}
                />
              </View>
            ) : null}
          </View>

          {/* Catégories */}
          <View style={S.card}>
            <View style={S.rowBetween}>
              <Text style={S.cardTitle}>Catégorie</Text>
              <TouchableOpacity onPress={clearAll} activeOpacity={0.9} style={S.ghostBtn}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.danger} />
                <Text style={S.ghostTxt}>Vider</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 10 }}>
              {CATEGORIES.map((c) => {
                const active = category === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    onPress={() => setCategory(c.key)}
                    style={[S.catChip, active && S.catChipActive]}
                    activeOpacity={0.9}
                  >
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.dot }} />
                    <MaterialCommunityIcons name={c.icon} size={16} color={active ? colors.brand : colors.text} />
                    <Text style={[S.catChipTxt, active && S.catChipTxtActive]} numberOfLines={1}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Recherche */}
          <View style={S.card}>
            <Text style={S.cardTitle}>Ajoute des objets</Text>

            <View style={S.searchRow}>
              <MaterialCommunityIcons name="magnify" size={18} color={colors.subtext} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Rechercher un objet…"
                placeholderTextColor={colors.subtext}
                style={{ flex: 1, color: colors.text, paddingVertical: 10 }}
                returnKeyType="search"
              />
              {!!query && (
                <TouchableOpacity onPress={() => setQuery("")} activeOpacity={0.9}>
                  <MaterialCommunityIcons name="close-circle" size={18} color={colors.subtext} />
                </TouchableOpacity>
              )}
            </View>

            {/* Résultats catégorie courante */}
            <View style={{ marginTop: 12 }}>
              {localResults.map((t) => {
                const k = normalizeKey(t);
                const checked = sel.has(k);

                return (
                  <TouchableOpacity key={`${category}-${k}`} onPress={() => toggleItem(t)} style={S.itemRow} activeOpacity={0.88}>
                    <MaterialCommunityIcons
                      name={checked ? "checkbox-marked-outline" : "checkbox-blank-outline"}
                      size={20}
                      color={checked ? colors.brand : colors.text}
                    />
                    <Text style={S.itemRowTxt} numberOfLines={1}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Si rien dans la catégorie, on propose ailleurs */}
              {query && localResults.length === 0 ? (
                globalSuggestions.length === 0 ? (
                  <View style={S.infoBox}>
                    <MaterialCommunityIcons name="magnify" size={18} color={colors.subtext} />
                    <Text style={S.infoTxt}>Aucun résultat. Ajoute-le en personnalisé.</Text>
                  </View>
                ) : (
                  <View style={{ marginTop: 6 }}>
                    <Text style={S.smallTitle}>Trouvé dans d’autres catégories</Text>
                    {globalSuggestions.map((sug) => (
                      <TouchableOpacity
                        key={`${sug.categoryKey}-${normalizeKey(sug.title)}`}
                        onPress={() => {
                          setCategory(sug.categoryKey);
                          toggleItem(sug.title);
                        }}
                        style={[S.itemRow, { backgroundColor: "rgba(255,255,255,0.035)" }]}
                        activeOpacity={0.88}
                      >
                        <MaterialCommunityIcons name="sparkles" size={18} color={colors.brand} />
                        <Text style={S.itemRowTxt} numberOfLines={1}>
                          {sug.title}
                        </Text>
                        <Text style={S.badgeMini}>{sug.categoryLabel}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )
              ) : null}
            </View>

            {/* Personnalisé */}
            <View style={{ marginTop: 14 }}>
              <Text style={S.smallTitle}>Objet personnalisé</Text>
              <TextInput
                value={customTitle}
                onChangeText={setCustomTitle}
                placeholder="Ex: Console, Paddle, Trépied…"
                placeholderTextColor={colors.subtext}
                style={S.input}
              />
            </View>
          </View>
        </ScrollView>

        {/* Footer CTA */}
        <View style={S.stickyFooter}>
          <TouchableOpacity
            disabled={!canSubmit}
            onPress={save}
            style={[S.cta, { opacity: canSubmit ? 1 : 0.45 }]}
            activeOpacity={0.92}
          >
            {saving ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <>
                <MaterialCommunityIcons name="plus" size={18} color={colors.bg} />
                <Text style={S.ctaTxt}>Ajouter</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.stroke,
    backgroundColor: "rgba(11,14,20,0.92)",
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  hTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  hSub: { color: colors.subtext, fontWeight: "800", fontSize: 12, marginTop: 2 },

  card: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
  },
  cardTitle: { color: colors.text, fontWeight: "900", fontSize: 14 },

  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },

  circleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: "rgba(255,255,255,0.03)",
    maxWidth: "100%",
  },
  circleChipActive: { borderColor: "rgba(29,255,194,0.35)", backgroundColor: "rgba(29,255,194,0.12)" },
  circleChipTxt: { color: colors.text, fontWeight: "900", maxWidth: 220 },
  circleChipTxtActive: { color: colors.brand },

  pillBtn: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  pillBtnActive: { borderColor: "rgba(29,255,194,0.35)", backgroundColor: colors.brand },
  pillBtnTxt: { color: colors.text, fontWeight: "900" },
  pillBtnTxtActive: { color: colors.bg },

  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  catChipActive: { borderColor: "rgba(29,255,194,0.35)", backgroundColor: "rgba(29,255,194,0.12)" },
  catChipTxt: { color: colors.text, fontWeight: "900" },
  catChipTxtActive: { color: colors.brand },

  searchRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 14,
    paddingHorizontal: 10,
    backgroundColor: "rgba(0,0,0,0.15)",
  },

  input: {
    marginTop: 10,
    backgroundColor: "rgba(0,0,0,0.15)",
    color: colors.text,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
  },

  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: "rgba(255,255,255,0.03)",
    marginBottom: 10,
  },
  itemRowTxt: { color: colors.text, fontWeight: "800", flex: 1 },

  ghostBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 },
  ghostTxt: { color: colors.danger, fontWeight: "900" },

  smallTitle: { color: colors.subtext, fontWeight: "900", marginTop: 8, marginBottom: 8 },

  badgeMini: {
    color: colors.subtext,
    fontWeight: "900",
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.stroke,
  },

  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: "rgba(255,255,255,0.03)",
    marginTop: 10,
  },
  infoTxt: { color: colors.subtext, fontWeight: "800", flex: 1 },

  stickyFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.stroke,
    backgroundColor: "rgba(11,14,20,0.94)",
  },
  cta: {
    height: 50,
    borderRadius: 16,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ctaTxt: { color: colors.bg, fontWeight: "900", fontSize: 16 },
});
