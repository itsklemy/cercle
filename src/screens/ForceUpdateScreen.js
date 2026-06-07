import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from "react-native";

const BG = "#07090F";
const TEXT = "#F0F2F7";
const SUBTEXT = "#5A6478";
const MINT = "#1DFFC2";
const STROKE = "rgba(255,255,255,0.08)";

export default function ForceUpdateScreen({ route }) {
  const message =
    route?.params?.message || "Une mise à jour est nécessaire pour continuer.";

  const iosUrl = route?.params?.ios_store_url;
  const androidUrl = route?.params?.android_store_url;

  const storeUrl = Platform.OS === "ios" ? iosUrl : androidUrl;

  const openStore = async () => {
    if (!storeUrl) return;
    try {
      await Linking.openURL(storeUrl);
    } catch {}
  };

  return (
    <View style={S.overlay}>
      <View style={S.card}>
        <Text style={S.title}>Mise à jour requise</Text>
        <Text style={S.text}>{message}</Text>

        <TouchableOpacity style={S.button} onPress={openStore} activeOpacity={0.88}>
          <Text style={S.buttonText}>Mettre à jour</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(7,9,15,0.96)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: STROKE,
    borderRadius: 22,
    padding: 22,
  },
  title: {
    color: TEXT,
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 10,
  },
  text: {
    color: SUBTEXT,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  button: {
    height: 52,
    borderRadius: 14,
    backgroundColor: MINT,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: BG,
    fontSize: 15,
    fontWeight: "900",
  },
});